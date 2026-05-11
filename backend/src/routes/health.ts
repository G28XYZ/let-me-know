import { Router } from "express";
import { config } from "../config";
import { runGemini } from "../services/geminiService";
import { completeJson } from "../services/aiService";
import { parseJsonOrFallback } from "../utils/text";

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  const provider = String(req.query.provider || config.defaultProvider) === "gemini-cli" ? "gemini-cli" : "openai-compatible";
  
  if (provider === "gemini-cli") {
    try {
      const result = await runGemini(["--version"], 15000);
      res.status(result.code === 0 ? 200 : 500).json({
        ok: result.code === 0,
        provider,
        model: config.geminiModel || "Gemini CLI default",
        baseUrl: config.geminiBin,
        error: result.code === 0 ? "" : result.output,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
    return;
  }

  if (config.isOpenAiCloud && !config.apiKey) {
    res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set. Set OPENAI_API_KEY for OpenAI cloud or OPENAI_BASE_URL for a local OpenAI-compatible server.",
    });
    return;
  }

  try {
    const text = await completeJson(
      "Верни только JSON: {\"ok\":true}.",
      "Проверь соединение. Ответь строго JSON.",
      80,
      provider
    );
    const data = parseJsonOrFallback(text, { ok: true });
    res.status(200).json({
      ok: Boolean(data.ok),
      baseUrl: config.baseUrl,
      model: config.model,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
