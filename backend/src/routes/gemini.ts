import { Router } from "express";
import { config } from "../config";
import { runGemini, getGeminiConsole } from "../services/geminiService";
import { GeminiCommandPayload } from "../types";

export const geminiRouter = Router();

geminiRouter.get("/status", async (req, res) => {
  try {
    const version = await runGemini(["--version"], 15000);
    const diagnostics = buildGeminiDiagnostics(version.output.trim());
    res.status(200).json({
      available: version.code === 0,
      bin: config.geminiBin,
      model: config.geminiModel || "Gemini CLI default",
      version: version.output.trim(),
      diagnostics,
      lastOutput: getGeminiConsole().slice(-8),
      commands: [
        { action: "help", label: "gemini --help" },
        { action: "version", label: "gemini --version" },
        { action: "list-sessions", label: "gemini --list-sessions" },
        { action: "diagnostics", label: "gemini diagnostics helper" },
        { action: "prompt", label: "gemini --prompt <text>" },
      ],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

geminiRouter.get("/diagnostics", async (req, res) => {
  try {
    const version = await runGemini(["--version"], 15000);
    const diagnostics = buildGeminiDiagnostics(version.output.trim());
    res.status(version.code === 0 ? 200 : 500).json(diagnostics);
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
  } else if (action === "diagnostics") {
    try {
      const version = await runGemini(["--version"], 15000);
      const diagnostics = buildGeminiDiagnostics(version.output.trim());
      res.status(version.code === 0 ? 200 : 500).json(diagnostics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
    return;
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
      allowed: ["help", "version", "list-sessions", "diagnostics", "prompt"],
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

function buildGeminiDiagnostics(versionOutput: string) {
  const lastOutput = getGeminiConsole().slice(-8);
  const lastInvocation = [...lastOutput]
    .reverse()
    .find((entry) => entry.metadata?.headless) || null;
  const configuredModel = config.geminiModel || "";
  const lastModel = String(lastInvocation?.metadata?.model || "");
  const effectiveModel = configuredModel || lastModel;
  const modelLimits = resolveGeminiModelLimits(effectiveModel);

  const diagnostics: any = {
    available: Boolean(versionOutput),
    bin: config.geminiBin,
    model: {
      usedModel: effectiveModel || "CLI default",
      sentToCli: Boolean(configuredModel),
      cliArgument: configuredModel ? ["--model", configuredModel] : null,
      modelSource: configuredModel ? "GEMINI_MODEL" : "CLI default",
      note: configuredModel
        ? "Backend передает эту модель в gemini --model."
        : "GEMINI_MODEL не задан, поэтому backend не передает --model, а фактическую default-модель выбирает сам Gemini CLI.",
      limits: modelLimits,
    },
    knownModels: getKnownGeminiModels(),
    configured: {
      env: {
        GEMINI_BIN: config.geminiBin,
        GEMINI_MODEL: configuredModel || null,
      },
    },
    runtimeCommand: {
      description: "Команда, которой backend отправляет текст в Gemini CLI.",
      args: buildRuntimeArgs("<prompt>"),
      timeoutMs: 180000,
    },
    appLimits: {
      backendJsonBodyLimit: "10mb",
      cliPromptTimeoutMs: 180000,
      responseTokenBudgetByTask: {
        prepareDocument: 6000,
        analyzeChunk: 900,
        reviewQuestions: 800,
        evaluateAnswer: 500,
      },
      note: "Это лимиты приложения. Реальные лимиты модели Gemini CLI не публикует через --help.",
    },
    cliCapabilitiesFromHelp: {
      outputFormats: ["text", "json", "stream-json"],
      modelFlag: "--model <model>",
      promptFlag: "--prompt <text>",
      observedCommands: ["mcp", "extensions", "skills", "hooks", "gemma", "interactive query"],
    },
    lastInvocation: lastInvocation ? {
      startedAt: lastInvocation.startedAt,
      code: lastInvocation.code,
      args: lastInvocation.args,
      metadata: lastInvocation.metadata,
    } : null,
    recentRuns: lastOutput,
  };

  return diagnostics;
}

function resolveGeminiModelLimits(model: string) {
  const normalized = normalizeModelCode(model);
  const exact = getKnownGeminiModels().find((item) => item.modelCode === normalized);
  if (exact) return { ...exact, match: "exact" };

  const family = [...getKnownGeminiModels()]
    .sort((a, b) => b.familyHint.length - a.familyHint.length)
    .find((item) => normalized && normalized.includes(item.familyHint));
  if (family) {
    return {
      ...family,
      match: "family",
      note: `Точного совпадения для "${model}" нет, показаны лимиты ближайшего семейства ${family.modelCode}.`,
    };
  }

  return {
    modelCode: model || null,
    match: "unknown",
    inputTokenLimit: null,
    outputTokenLimit: null,
    source: "Gemini CLI default is not exposed by --help",
    note: "Не удалось определить лимиты. Задайте GEMINI_MODEL одним из известных model code, например gemini-2.5-pro, gemini-2.5-flash или gemini-2.5-flash-lite.",
  };
}

function getKnownGeminiModels() {
  return [
    {
      label: "Gemini 3 Pro Preview",
      modelCode: "gemini-3-pro-preview",
      familyHint: "3-pro",
      tier: "pro",
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
    {
      label: "Gemini 2.5 Pro",
      modelCode: "gemini-2.5-pro",
      familyHint: "2.5-pro",
      tier: "pro",
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
    {
      label: "Gemini 2.5 Flash",
      modelCode: "gemini-2.5-flash",
      familyHint: "2.5-flash",
      tier: "flash",
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
    {
      label: "Gemini 2.5 Flash-Lite",
      modelCode: "gemini-2.5-flash-lite",
      familyHint: "2.5-flash-lite",
      tier: "lite",
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
    {
      label: "Gemini 2.0 Flash",
      modelCode: "gemini-2.0-flash",
      familyHint: "2.0-flash",
      tier: "flash",
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
    {
      label: "Gemini 2.0 Flash-Lite",
      modelCode: "gemini-2.0-flash-lite",
      familyHint: "2.0-flash-lite",
      tier: "lite",
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      source: "https://ai.google.dev/gemini-api/docs/models/gemini",
    },
  ];
}

function normalizeModelCode(model: string) {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "");
}

function buildRuntimeArgs(prompt: string) {
  const args = ["--prompt", prompt, "--output-format", "text", "--skip-trust"];
  if (config.geminiModel) args.unshift("--model", config.geminiModel);
  return [config.geminiBin, ...args];
}
