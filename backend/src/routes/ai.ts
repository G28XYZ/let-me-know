import { Router } from "express";
import { config } from "../config";
import { completeJson } from "../services/aiService";
import { roughSplitText, parseJsonOrFallback, asArray, extractPageRange } from "../utils/text";
import { PreparePayload, AnalysisPayload } from "../types";

export const aiRouter = Router();

aiRouter.post("/prepare", async (req, res) => {
  const payload = req.body as PreparePayload;
  const provider = payload.provider || config.defaultProvider;

  const text = String(payload.text || "").trim();
  console.log(`>>> [/prepare] Received text from "${payload.fileName}". Length: ${text.length} chars.`);

  if (provider === "openai-compatible" && config.isOpenAiCloud && !config.apiKey) {
    console.error(">>> [/prepare] AI endpoint not configured.");
    res.status(500).json({
      error: "AI endpoint is not configured. Set OPENAI_API_KEY or use local OPENAI_BASE_URL.",
    });
    return;
  }

  if (!text) {
    console.warn(">>> [/prepare] Document text is empty.");
    res.status(400).json({ error: "Document text is empty." });
    return;
  }

  try {
    const candidates = roughSplitText(text);
    console.log(`>>> [/prepare] Split into ${candidates.length} rough candidates.`);
    const chunks: any[] = [];
    const overviewParts: string[] = [];

    // Increase batch size or process more carefully for logical completeness
    for (let start = 0; start < candidates.length; start += 20) {
      const batch = candidates.slice(start, start + 20);
      console.log(`>>> [/prepare] Processing batch ${start / 20 + 1}. Size: ${batch.length}`);
      const prepared = await prepareBatch(batch, payload, start, provider);
      console.log(`>>> [/prepare] Batch ${start / 20 + 1} returned ${prepared.chunks?.length || 0} chunks.`);
      chunks.push(...(Array.isArray(prepared.chunks) ? prepared.chunks : []));
      if (prepared.overview) overviewParts.push(prepared.overview);
    }

    const normalizedChunks = normalizePreparedChunks(chunks, candidates);
    console.log(`>>> [/prepare] Finished preparation. Final normalized chunks: ${normalizedChunks.length}.`);

    res.status(200).json({
      chunks: normalizedChunks,
      overview: {
        summary: overviewParts.filter(Boolean).join(" "),
        tocSummary: normalizedChunks
          .filter((chunk: any) => chunk.type === "toc")
          .map((chunk: any) => chunk.summary)
          .filter(Boolean)
          .join(" "),
        introductionSummary: normalizedChunks
          .filter((chunk: any) => chunk.type === "introduction")
          .map((chunk: any) => chunk.summary)
          .filter(Boolean)
          .join(" "),
      },
    });
  } catch (error: any) {
    console.error(">>> [/prepare] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

aiRouter.post("/analyze", async (req, res) => {
  const payload = req.body as AnalysisPayload;
  const provider = payload.provider || config.defaultProvider;

  if (provider === "openai-compatible" && config.isOpenAiCloud && !config.apiKey) {
    res.status(500).json({
      error: "OPENAI_API_KEY is not set. Leave endpoint empty for demo mode, or set OPENAI_BASE_URL for a local OpenAI-compatible server.",
    });
    return;
  }

  try {
    const text = await completeJson(
      "Ты AI-помощник сервиса изучающего чтения. Отвечай только валидным JSON-объектом. Не используй markdown, пояснения, списки вне JSON и markdown code fences. Схема: {\"summary\":\"string\",\"attention\":[\"string\"],\"keywords\":[\"string\"],\"question\":\"string\",\"task\":\"string\",\"note\":\"string\",\"recommendation\":\"string\",\"quiz\":[{\"question\":\"string\",\"options\":[\"string\"],\"correctAnswer\":\"string\"}],\"practicalTask\":\"string\"}.",
      buildPrompt(payload),
      900,
      provider
    );
    const analysis = parseAnalysis(text);
    res.status(200).json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

aiRouter.post("/evaluate", async (req, res) => {
  const payload = req.body as import("../types").EvaluatePayload;
  const provider = payload.provider || config.defaultProvider;

  if (provider === "openai-compatible" && config.isOpenAiCloud && !config.apiKey) {
    res.status(500).json({
      error: "OPENAI_API_KEY is not set.",
    });
    return;
  }

  try {
    const text = await completeJson(
      "Ты AI-преподаватель. Оцени ответ ученика на вопрос. Верни JSON-объект: {\"isCorrect\": boolean, \"feedback\": \"string\"}. feedback должен быть коротким, доброжелательным и по делу (в случае ошибки - с подсказкой).",
      JSON.stringify({
        question: payload.question,
        userAnswer: payload.answer,
        contextText: payload.contextText
      }, null, 2),
      500,
      provider
    );
    const result = parseJsonOrFallback(text, { isCorrect: false, feedback: "Не удалось оценить ответ." });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function prepareBatch(batch: string[], payload: PreparePayload, globalStart: number, provider: string) {
  const prompt = JSON.stringify(
    {
      fileName: payload.fileName || "",
      method: payload.methodTitle || payload.method || "",
      candidates: batch.map((text, offset) => ({
        id: globalStart + offset,
        text,
      })),
      task: "Твоя задача - сгруппировать id кандидатов в КРУПНЫЕ логически завершенные фрагменты. ВАЖНО: не сокращай, не перефразируй и не меняй текст! Каждый фрагмент должен доводить мысль до логического завершения (до точки). Фрагмент должен объединять по 5-10 id. Оглавление и введение помечай skippable=true. Верни строго JSON: {\"overview\":\"string\",\"chunks\":[{\"candidateIds\":[number],\"title\":\"название темы\",\"type\":\"toc|introduction|study\",\"skippable\":boolean,\"summary\":\"краткая тема\"}]}",
    },
    null,
    2
  );
  
  const text = await completeJson(
    "Ты ассистент по подготовке материалов. При подготовке фрагмента не нужно преобразовывать его, делать пересказ и т.д. Нужно соединить страницы исходного текста так, чтобы мысль была доведена до логического завершения (до точки). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО менять исходный текст. Только группировка по ID.",
    prompt,
    1000,
    provider
  );

  return parseJsonOrFallback(text, { overview: "", chunks: [] });
}

function normalizePreparedChunks(aiChunks: any[], candidates: string[]) {
  const result: any[] = [];
  const used = new Set<number>();

  if (Array.isArray(aiChunks) && aiChunks.length > 0) {
    aiChunks.forEach((chunk) => {
      const ids = Array.isArray(chunk.candidateIds) ? chunk.candidateIds : [];
      const validIds = ids
        .map((id: any) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id >= 0 && id < candidates.length && !used.has(id))
        .sort((a: number, b: number) => a - b);

      if (!validIds.length) return;
      validIds.forEach((id: number) => used.add(id));

      // Reconstruct original text from candidates
      let originalText = validIds
        .map((id: number) => candidates[id])
        .join("\n\n")
        .trim();

      const pageRange = extractPageRange(originalText);

      // Clean "extra info" (page markers) from the text after range extraction
      originalText = originalText
        .replace(/^Страница\s+\d+\s*/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (!originalText) return;

      result.push({
        text: originalText,
        title: String(chunk.title || `Фрагмент ${result.length + 1}`),
        type: normalizeChunkType(chunk.type),
        skippable: Boolean(chunk.skippable),
        reason: String(chunk.reason || ""),
        summary: String(chunk.summary || ""),
        pageStart: pageRange?.start || null,
        pageEnd: pageRange?.end || null,
      });
    });
  }

  // Handle leftovers
  candidates.forEach((text, id) => {
    if (used.has(id)) return;
    const pageRange = extractPageRange(text);
    const cleanedText = text
      .replace(/^Страница\s+\d+\s*/gim, "")
      .trim();

    if (!cleanedText) return;

    result.push({
      text: cleanedText,
      title: `Фрагмент ${result.length + 1}`,
      type: "study",
      skippable: false,
      reason: "",
      summary: "",
      pageStart: pageRange?.start || null,
      pageEnd: pageRange?.end || null,
    });
  });

  return result.map((chunk) => {
    const isService = chunk.type === "toc" || chunk.type === "introduction";
    return {
      ...chunk,
      skippable: isService,
      reason: chunk.reason || (isService ? "ИИ определил этот фрагмент как служебный." : ""),
    };
  });
}

function detectCandidateType(text: string, index: number) {
  const head = String(text || "").toLowerCase().slice(0, 300);
  if (index <= 6 && /\b(оглавление|содержание|contents|table of contents)\b/i.test(head)) return "toc";
  if (index <= 8 && /\b(введение|предисловие|introduction|preface)\b/i.test(head)) return "introduction";
  return "study";
}

function normalizeChunkType(value: string) {
  const type = String(value || "").toLowerCase();
  if (type === "toc" || type === "introduction" || type === "study") return type;
  return "study";
}

function buildPrompt(payload: AnalysisPayload) {
  return JSON.stringify(
    {
      method: payload.methodTitle || payload.method,
      progress: payload.progress,
      currentText: payload.currentText,
      segmentText: payload.segmentText,
      task: "Проанализируй currentText для выбранного метода обучения. Учитывай segmentText как отрывок с последней паузы. Ответ должен быть полезен для чтения, конспекта и самопроверки. Верни строго один JSON-объект по указанной схеме.",
    },
    null,
    2
  );
}

function parseAnalysis(text: string) {
  if (!text) {
    throw new Error("AI response did not contain text output.");
  }

  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const data = parseJsonOrFallback(withoutThinking, buildFallbackAnalysis(withoutThinking));

  return {
    summary: String(data.summary || "Резюме не сформировано."),
    attention: asArray(data.attention),
    keywords: asArray(data.keywords),
    question: String(data.question || "Какую главную мысль нужно вынести из этого фрагмента?"),
    task: String(data.task || "Объясните прочитанное своими словами."),
    note: String(data.note || data.summary || "Заметка не сформирована."),
    recommendation: String(data.recommendation || "Продолжайте чтение после фиксации заметки."),
    quiz: Array.isArray(data.quiz) ? data.quiz : [],
    practicalTask: String(data.practicalTask || ""),
  };
}

function buildFallbackAnalysis(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const summary = normalized.slice(0, 700) || "Модель вернула пустой ответ.";

  return {
    summary,
    attention: [
      "Модель вернула неструктурированный ответ, поэтому сервис сохранил его как общий анализ.",
      "Для лучшего результата используйте модель с поддержкой JSON mode или повторите запрос.",
    ],
    keywords: [],
    question: "Какую главную мысль нужно вынести из этого фрагмента?",
    task: "Сформулируйте краткий пересказ фрагмента своими словами.",
    note: summary,
    recommendation: "Можно продолжать чтение, но качество структурированного анализа стоит проверить.",
    quiz: [],
    practicalTask: "",
  };
}
