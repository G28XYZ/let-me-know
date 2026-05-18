import { Router } from "express";
import { config } from "../config";
import { completeJson } from "../services/aiService";
import { BookService } from "../services/bookService";
import { roughSplitText, parseJsonOrFallback, asArray, extractPageRange } from "../utils/text";
import { PreparePayload, AnalysisPayload, QuestionsPayload, ChatPayload, GenerateQuestionsPayload, SummarizeSectionPayload } from "../types";

export const aiRouter = Router();

aiRouter.post("/prepare", async (req, res) => {
  const payload = req.body as PreparePayload;
  const provider = normalizeProvider(payload.provider);

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
  const provider = normalizeProvider(payload.provider);

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

aiRouter.post("/questions", async (req, res) => {
  const payload = req.body as QuestionsPayload;
  const provider = normalizeProvider(payload.provider);

  if (payload.featureEnabled === false) {
    res.status(200).json({ featureEnabled: false, hasQuestions: false, question: "", quiz: [], practicalTask: "" });
    return;
  }

  if (provider === "openai-compatible" && config.isOpenAiCloud && !config.apiKey) {
    res.status(500).json({
      error: "OPENAI_API_KEY is not set.",
    });
    return;
  }

  try {
    const text = await completeJson(
      "Ты компонент вопросов в сервисе изучающего чтения. Твоя зона ответственности - только вопросы на паузе повторения. Верни JSON-объект: {\"hasQuestions\": boolean, \"question\": \"string\", \"quiz\": [{\"question\":\"string\",\"options\":[\"string\"],\"correctAnswer\":\"string\"}], \"practicalTask\": \"string\"}. Если по отрывку нечего спрашивать, верни hasQuestions=false и пустые поля.",
      buildQuestionsPrompt(payload),
      800,
      provider
    );
    const questions = parseQuestions(text);
    res.status(200).json({ featureEnabled: true, ...questions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

aiRouter.post("/evaluate", async (req, res) => {
  const payload = req.body as import("../types").EvaluatePayload;
  const provider = normalizeProvider(payload.provider);

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

aiRouter.post("/chat", async (req, res) => {
  const payload = req.body as ChatPayload;
  const provider = normalizeProvider(payload.provider);

  try {
    const system = "Ты AI-помощник в приложении Learn Helper. Помогаешь студенту изучать материал. Отвечай кратко и по делу.";
    const context = payload.context ? `Контекст изучаемого материала:\n${payload.context}\n\n` : "";
    const history = payload.messages.map((m) => `${m.role === "user" ? "Ученик" : "Ассистент"}: ${m.text}`).join("\n");
    const userPrompt = `${context}История переписки:\n${history}\n\nАссистент:`;

    const response = await completeJson(system, userPrompt, 1000, provider);
    
    // completeJson assumes it should return JSON, but for chat we might want plain text
    // However, completeJson uses extractChatText which returns content directly.
    // If provider is gemini-cli, it returns output directly.
    res.status(200).json({ text: response.replace(/^"|"$/g, "").trim() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

aiRouter.post("/generate-questions", async (req, res) => {
  const payload = req.body as GenerateQuestionsPayload;
  const provider = normalizeProvider(payload.provider);

  try {
    const sections = normalizeQuestionSections(payload.sections);
    if (!sections.length) {
      res.status(400).json({ error: "Sections with text are required." });
      return;
    }

    const context = sections.map((section, index) => [
      `Фрагмент ${index + 1}: ${section.title}`,
      section.text,
    ].join("\n")).join("\n\n---\n\n");
    const system = "Ты AI-преподаватель. Сформируй структурированный тренажер для самопроверки по предоставленному учебному материалу. Отвечай только валидным JSON-объектом без markdown.";
    const userPrompt = `Материал может быть одним разделом или целой главой с несколькими подразделами. Используй весь предоставленный материал, не ограничивайся первыми фрагментами и не составляй вопросы по служебным заголовкам.

Материал:
${context}

Твоя задача - составить ровно 3 тестовых вопроса с вариантами ответов (quizzes), 1 практическое задание (practicalTask) и 1 открытый вопрос для размышления (openQuestion). Для каждого задания обязательно напиши короткую подсказку (hint), которая поможет ученику, если он ошибется или затруднится ответить.
Верни строго JSON-объект по схеме:
{
  "quizzes": [
    {
      "question": "Текст вопроса",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"],
      "correctAnswer": "Правильный вариант (должен точно совпадать с одним из options)",
      "hint": "Подсказка"
    }
  ],
  "practicalTask": {
    "task": "Текст практического задания",
    "hint": "Подсказка"
  },
  "openQuestion": {
    "question": "Текст открытого вопроса",
    "hint": "Подсказка"
  }
}`;

    const text = await completeJson(system, userPrompt, 3500, provider);
    const data = normalizeGeneratedQuestions(parseJsonOrFallback(text, { quizzes: [], practicalTask: null, openQuestion: null }));
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

aiRouter.post("/summarize-section", async (req, res) => {
  const payload = req.body as SummarizeSectionPayload;
  const provider = normalizeProvider(payload.provider);
  const text = String(payload.text || "").replace(/\r\n?/g, "\n").trim();
  const title = String(payload.title || "Текущий раздел").trim();
  const bookId = String(payload.bookId || "").trim();
  const sectionPath = String(payload.sectionPath || "").trim();

  if (provider === "openai-compatible" && config.isOpenAiCloud && !config.apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set." });
    return;
  }

  if (!text) {
    res.status(400).json({ error: "Section text is empty." });
    return;
  }

  try {
    if (bookId && sectionPath && BookService.hasGeneratedBook(bookId)) {
      const cachedSummary = await BookService.getCachedSectionSummary(bookId, sectionPath, text);
      if (cachedSummary) {
        res.status(200).json({ ...cachedSummary, cached: true });
        return;
      }
    }

    const clippedText = clipSectionText(text);
    const system = "Ты помощник по обучающему чтению. Составь краткий конспект текущего раздела. Отвечай только валидным JSON-объектом без markdown.";
    const userPrompt = JSON.stringify({
      title,
      text: clippedText,
      task: [
        "Сделай конспект, который помогает повторить раздел после чтения, но не заменяет исходный текст.",
        "Пиши по-русски, простыми формулировками.",
        "Не добавляй факты, которых нет в тексте.",
        "summary - 2-4 предложения.",
        "keyPoints - 4-7 коротких тезисов.",
        "terms - до 6 важных понятий с коротким объяснением, если они есть.",
        "Верни строго JSON: {\"summary\":\"string\",\"keyPoints\":[\"string\"],\"terms\":[{\"term\":\"string\",\"definition\":\"string\"}]}",
      ].join(" "),
    }, null, 2);

    const responseText = await completeJson(system, userPrompt, 1800, provider);
    const summary = normalizeSectionSummary(parseJsonOrFallback(responseText, {}));
    if (bookId && sectionPath && BookService.hasGeneratedBook(bookId)) {
      await BookService.saveSectionSummary(bookId, sectionPath, text, summary);
    }

    res.status(200).json({ ...summary, cached: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function normalizeProvider(value?: string) {
  const provider = String(value || config.defaultProvider || "").trim();
  if (provider === "gemini-cli") return "gemini-cli";
  if (provider === "openai-compatible") return "openai-compatible";
  return config.defaultProvider === "gemini-cli" ? "gemini-cli" : "openai-compatible";
}

function normalizeQuestionSections(sections: GenerateQuestionsPayload["sections"]) {
  return (Array.isArray(sections) ? sections : [])
    .map((section, index) => ({
      title: String(section?.title || `Раздел ${index + 1}`).trim() || `Раздел ${index + 1}`,
      text: String(section?.text || "").replace(/\r\n?/g, "\n").trim(),
    }))
    .filter((section) => section.text);
}

function normalizeGeneratedQuestions(data: any) {
  const sourceQuizzes = Array.isArray(data?.quizzes)
    ? data.quizzes
    : Array.isArray(data?.quiz)
      ? data.quiz
      : [];
  const quizzes = sourceQuizzes
    .map(normalizeGeneratedQuiz)
    .filter((quiz: any) => quiz.question && quiz.options.length >= 2 && quiz.correctAnswer)
    .slice(0, 3);

  const practicalTask = normalizeGeneratedTask(data?.practicalTask, "task");
  const openQuestion = normalizeGeneratedTask(data?.openQuestion, "question");

  return {
    quizzes,
    practicalTask,
    openQuestion,
  };
}

function clipSectionText(text: string) {
  const maxChars = 24000;
  if (text.length <= maxChars) return text;

  const head = text.slice(0, Math.floor(maxChars * 0.68));
  const tail = text.slice(-Math.floor(maxChars * 0.28));
  return `${head}\n\n[...середина раздела сокращена из-за длины...]\n\n${tail}`;
}

function normalizeSectionSummary(data: any) {
  const summary = String(data?.summary || data?.shortSummary || "").trim();
  const keyPoints = dedupeStrings(asArray(data?.keyPoints || data?.points || data?.bullets)
    .map((item) => String(item).trim())
    .filter(Boolean))
    .slice(0, 7);
  const terms = (Array.isArray(data?.terms) ? data.terms : [])
    .map((item: any) => ({
      term: String(item?.term || item?.name || "").trim(),
      definition: String(item?.definition || item?.description || item?.meaning || "").trim(),
    }))
    .filter((item: any) => item.term && item.definition)
    .slice(0, 6);

  return {
    summary: summary || keyPoints.join(" "),
    keyPoints,
    terms,
  };
}

function normalizeGeneratedQuiz(value: any) {
  const question = String(value?.question || value?.title || "").trim();
  const rawOptions = Array.isArray(value?.options)
    ? value.options
    : Array.isArray(value?.answers)
      ? value.answers
      : [];
  const options = dedupeStrings(rawOptions.map((option: any) => String(option).trim()).filter(Boolean)).slice(0, 4);
  let correctAnswer = String(value?.correctAnswer || value?.answer || value?.correct || "").trim();

  if (correctAnswer && !options.includes(correctAnswer)) {
    if (options.length < 4) {
      options.push(correctAnswer);
    } else {
      options[options.length - 1] = correctAnswer;
    }
  }

  if (!correctAnswer && options.length > 0) {
    correctAnswer = options[0];
  }

  return {
    question,
    options,
    correctAnswer,
    hint: String(value?.hint || value?.explanation || "Вернитесь к соответствующему фрагменту материала.").trim(),
  };
}

function normalizeGeneratedTask(value: any, field: "task" | "question") {
  if (!value) return null;

  const text = typeof value === "string"
    ? value
    : String(value?.[field] || value?.text || value?.question || value?.task || "").trim();
  if (!text) return null;

  return {
    [field]: text,
    hint: typeof value === "string"
      ? "Сверьте ответ с ключевыми понятиями из материала."
      : String(value?.hint || value?.answer || value?.explanation || "Сверьте ответ с ключевыми понятиями из материала.").trim(),
  };
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });

  return result;
}

async function prepareBatch(batch: string[], payload: PreparePayload, globalStart: number, provider: string) {
  const targetChunks = Number.isFinite(payload.targetChunks) && Number(payload.targetChunks) > 0
    ? Math.max(1, Math.floor(Number(payload.targetChunks)))
    : 3;

  const prompt = JSON.stringify(
    {
      fileName: payload.fileName || "",
      method: payload.methodTitle || payload.method || "",
      targetChunks,
      candidates: batch.map((text, offset) => ({
        id: globalStart + offset,
        text,
      })),
      task: [
        "Сначала определи, на какие смысловые учебные темы можно разделить материал.",
        "Для каждой темы создай карточку учебного блока: title, summary, concepts и candidateIds.",
        "targetChunks - это только ориентир интерфейса, не дели цельную тему искусственно ради этого числа.",
        "candidateIds - это единственный источник текста блока. Не пересказывай и не возвращай сам текст.",
        "Границы блока должны проходить только между завершенными смысловыми частями. Нельзя заканчивать блок посреди предложения, абзаца, перечисления или примера.",
        "Не ограничивай блоки по времени чтения. Большой объем допустим, если тема цельная.",
        "После каждого блока ученик будет отвечать на вопросы по исходному тексту этого блока.",
        "Служебный материал не включай в учебные блоки: титульные листы, оглавление, содержание, выходные данные, пустые страницы, повторяющиеся колонтитулы.",
        "Не создавай отдельные skippable-фрагменты для служебной информации: просто исключи ее candidateIds из chunks.",
        "candidateIds внутри блока должны быть отсортированы и, как правило, идти подряд. Не пропускай учебный candidate внутри темы.",
        "Если учебного материала мало, верни один блок. Если весь материал - одна цельная тема, верни один блок.",
        "Верни строго JSON: {\"overview\":\"string\",\"chunks\":[{\"candidateIds\":[number],\"title\":\"название темы\",\"type\":\"study\",\"skippable\":false,\"summary\":\"что нужно понять перед вопросами\",\"concepts\":[\"ключевая концепция\"]}]}",
      ].join(" "),
    },
    null,
    2
  );
  
  const text = await completeJson(
    "Ты ассистент по подготовке материалов для изучающего чтения. Твоя задача - создать карточки смысловых учебных блоков и указать candidateIds для каждого блока. Не возвращай текст блока, только план разбиения. Верни только валидный JSON.",
    prompt,
    6000,
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

      const originalText = validIds
        .map((id: number) => candidates[id])
        .join("\n\n")
        .trim();

      const pageRange = extractPageRange(originalText);
      const readableText = formatSourceTextBlock(cleanChunkText(originalText), chunk.title);

      if (!readableText) return;

      result.push({
        text: readableText,
        title: String(chunk.title || `Фрагмент ${result.length + 1}`),
        type: normalizeChunkType(chunk.type),
        skippable: Boolean(chunk.skippable),
        reason: String(chunk.reason || ""),
        summary: String(chunk.summary || ""),
        concepts: asArray(chunk.concepts || chunk.keyConcepts || chunk.keywords),
        pageStart: pageRange?.start || null,
        pageEnd: pageRange?.end || null,
      });
    });
  }

  // Handle study leftovers that were not assigned to any card. Service candidates stay skipped.
  candidates.forEach((text, id) => {
    if (used.has(id)) return;
    if (detectCandidateType(text, id) !== "study") return;

    const pageRange = extractPageRange(text);
    const cleanedText = formatSourceTextBlock(cleanChunkText(text), `Фрагмент ${result.length + 1}`);

    if (!cleanedText) return;

    result.push({
      text: cleanedText,
      title: `Фрагмент ${result.length + 1}`,
      type: "study",
      skippable: false,
      reason: "",
      summary: "",
      concepts: [],
      pageStart: pageRange?.start || null,
      pageEnd: pageRange?.end || null,
    });
  });

  return mergeIncompleteStudyChunks(result).map((chunk) => {
    const isService = chunk.type === "toc" || chunk.type === "introduction";
    return {
      ...chunk,
      skippable: isService,
      reason: chunk.reason || (isService ? "ИИ определил этот фрагмент как служебный." : ""),
    };
  });
}

function cleanChunkText(text: string) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/^Страница\s+\d+\s*/gim, "")
    .replace(/^\s*\d{1,4}\s*$/gm, "")
    .replace(/([a-zA-Zа-яА-ЯёЁ])-\s*\n\s*([a-zA-Zа-яА-ЯёЁ])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSourceTextBlock(text: string, title?: string) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const formatted: string[] = [];
  if (title) formatted.push(`# ${String(title).trim()}`);

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    formatted.push(paragraph.join(" "));
    paragraph = [];
  };

  lines.forEach((line) => {
    if (isLikelyHeading(line)) {
      flushParagraph();
      formatted.push(`## ${line}`);
      return;
    }

    const listItem = normalizeListItem(line);
    if (listItem) {
      flushParagraph();
      formatted.push(listItem);
      return;
    }

    paragraph.push(line);
    if (line.length > 150 || /[.!?;:]$/.test(line)) flushParagraph();
  });

  flushParagraph();
  return formatted.join("\n\n").trim();
}

function isLikelyHeading(line: string) {
  return line.length <= 100
    && (/^\d+(\.\d+)*\.?\s+\S+/.test(line) || /^[А-ЯA-ZЁ][А-ЯA-ZЁа-яa-zё\s,-]{6,}$/.test(line))
    && !/[.!?;:]$/.test(line);
}

function normalizeListItem(line: string) {
  const bullet = line.match(/^[–—\-*•]\s+(.+)$/);
  if (bullet) return `- ${bullet[1].trim()}`;

  const parameter = line.match(/^([^:]{3,80}):\s+(.+)$/);
  if (parameter) return `- ${parameter[1].trim()}: ${parameter[2].trim()}`;

  return "";
}

function mergeIncompleteStudyChunks(chunks: any[]) {
  const merged: any[] = [];

  chunks.forEach((chunk) => {
    const previous = merged[merged.length - 1];
    if (
      previous
      && !previous.skippable
      && !chunk.skippable
      && previous.type === "study"
      && chunk.type === "study"
      && isIncompleteEnding(previous.text)
    ) {
      previous.text = `${previous.text.trim()}\n\n${chunk.text.trim()}`.trim();
      previous.title = previous.title || chunk.title;
      previous.summary = [previous.summary, chunk.summary].filter(Boolean).join(" ");
      previous.pageEnd = chunk.pageEnd ?? previous.pageEnd;
      return;
    }

    merged.push({ ...chunk });
  });

  return merged;
}

function isIncompleteEnding(text: string) {
  const normalized = stripMarkup(String(text || ""))
    .replace(/^\s*\d{1,4}\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  const tail = normalized.slice(-120).trim();
  if (/[.!?…)"»\]]$/.test(tail)) return false;
  if (/[,:;—-]$/.test(tail)) return true;

  return /\b(и|или|а|но|что|как|который|которая|которое|которые|иной|другой|каждый|при|для|в|на|с|по|из|от|до|за|без)$/i.test(tail);
}

function normalizeReadableText(value: any, fallback: string) {
  const text = cleanChunkText(String(value || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```$/i, ""));
  if (!text) return fallback;

  const fallbackWords = countMeaningfulWords(fallback);
  const textWords = countMeaningfulWords(stripMarkup(text));
  if (fallbackWords >= 40 && (textWords < fallbackWords * 0.65 || textWords > fallbackWords * 1.35)) {
    return fallback;
  }

  return text;
}

function stripMarkup(text: string) {
  return String(text || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "");
}

function countMeaningfulWords(text: string) {
  return String(text || "").split(/\s+/).filter((word) => /[a-zA-Zа-яА-ЯёЁ0-9]/.test(word)).length;
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

function buildQuestionsPrompt(payload: QuestionsPayload) {
  return JSON.stringify(
    {
      method: payload.methodTitle || payload.method,
      progress: payload.progress,
      currentText: payload.currentText,
      segmentTextSincePreviousQuestion: payload.segmentText,
      previousContext: payload.previousContext || "",
      task: "Сформируй короткую паузу повторения по segmentTextSincePreviousQuestion. previousContext можно использовать только если он явно связан ...",
    },
    null,
    2
  );
}

function parseQuestions(text: string) {
  if (!text) {
    return { hasQuestions: false, question: "", quiz: [], practicalTask: "" };
  }

  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const data = parseJsonOrFallback(withoutThinking, { hasQuestions: false, question: "", quiz: [], practicalTask: "" });
  const quiz = Array.isArray(data.quiz)
    ? data.quiz
        .map((item: any) => ({
          question: String(item?.question || "").trim(),
          options: Array.isArray(item?.options) ? item.options.map((option: any) => String(option).trim()).filter(Boolean) : [],
          correctAnswer: String(item?.correctAnswer || "").trim(),
        }))
        .filter((item: any) => item.question && item.options.length > 0 && item.correctAnswer)
    : [];

  const question = String(data.question || "").trim();
  const practicalTask = String(data.practicalTask || "").trim();
  const hasQuestions = Boolean(data.hasQuestions) && (Boolean(question) || quiz.length > 0 || Boolean(practicalTask));

  return {
    hasQuestions,
    question,
    quiz,
    practicalTask,
  };
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
