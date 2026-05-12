import { spawn } from "node:child_process";
import { config } from "../config";

const geminiConsole: any[] = [];

export function getGeminiConsole() {
  return geminiConsole;
}

export function appendGeminiConsole(entry: any) {
  const metadata = buildGeminiInvocationMetadata(entry.args);
  geminiConsole.push({
    ...entry,
    metadata,
    args: entry.args.map((arg: string) => (arg.length > 220 ? `${arg.slice(0, 220)}...` : arg)),
  });
  if (geminiConsole.length > 30) geminiConsole.shift();
}

export function buildGeminiInvocationMetadata(args: string[]) {
  const model = getArgValue(args, "--model") || getArgValue(args, "-m") || "";
  const prompt = getArgValue(args, "--prompt") || getArgValue(args, "-p") || "";
  const outputFormat = getArgValue(args, "--output-format") || getArgValue(args, "-o") || "";

  return {
    model: model || null,
    modelSource: model ? "argument" : "cli-default",
    promptChars: prompt.length,
    promptPreview: prompt ? compactPreview(prompt, 500) : "",
    outputFormat: outputFormat || null,
    skipTrust: args.includes("--skip-trust"),
    headless: args.includes("--prompt") || args.includes("-p"),
  };
}

function getArgValue(args: string[], longName: string, shortName?: string) {
  const names = shortName ? [longName, shortName] : [longName];
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0 && index < args.length - 1) return String(args[index + 1] || "");
  }
  return "";
}

function compactPreview(value: string, limit: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export function runGemini(args: string[], timeoutMs: number): Promise<{ code: number; output: string; error?: string }> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(config.geminiBin, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    
    child.on("error", (error) => {
      clearTimeout(timer);
      const output = error.message || "Failed to start Gemini CLI.";
      appendGeminiConsole({ startedAt, args, code: 1, output });
      resolve({ code: 1, output, error: output });
    });
    
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      appendGeminiConsole({ startedAt, args, code, output });
      resolve({ code: code ?? 1, output });
    });
  });
}
