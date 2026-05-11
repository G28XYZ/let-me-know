import { Router } from "express";
import { config } from "../config";
import { runGemini, getGeminiConsole } from "../services/geminiService";
import { GeminiCommandPayload } from "../types";

export const geminiRouter = Router();

geminiRouter.get("/status", async (req, res) => {
  try {
    const version = await runGemini(["--version"], 15000);
    res.status(200).json({
      available: version.code === 0,
      bin: config.geminiBin,
      model: config.geminiModel || "Gemini CLI default",
      version: version.output.trim(),
      lastOutput: getGeminiConsole().slice(-8),
      commands: [
        { action: "help", label: "gemini --help" },
        { action: "version", label: "gemini --version" },
        { action: "list-sessions", label: "gemini --list-sessions" },
        { action: "prompt", label: "gemini --prompt <text>" },
      ],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

geminiRouter.post("/command", async (req, res) => {
  const payload = req.body as GeminiCommandPayload;
  const action = String(payload.action || "");
  const prompt = String(payload.prompt || "").trim();
  let args: string[] = [];

  if (action === "help") {
    args = ["--help"];
  } else if (action === "version") {
    args = ["--version"];
  } else if (action === "list-sessions") {
    args = ["--list-sessions"];
  } else if (action === "prompt") {
    if (!prompt) {
      res.status(400).json({ error: "Prompt is empty." });
      return;
    }
    args = ["--prompt", prompt, "--output-format", "text", "--skip-trust"];
    if (config.geminiModel) args.unshift("--model", config.geminiModel);
  } else {
    res.status(400).json({
      error: "Unsupported Gemini CLI command.",
      allowed: ["help", "version", "list-sessions", "prompt"],
    });
    return;
  }

  try {
    const timeoutMs = action === "prompt" ? 180000 : 30000;
    const result = await runGemini(args, timeoutMs);
    res.status(result.code === 0 ? 200 : 500).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
