import { spawn } from "node:child_process";
import { config } from "../config";

const geminiConsole: any[] = [];

export function getGeminiConsole() {
  return geminiConsole;
}

export function appendGeminiConsole(entry: any) {
  geminiConsole.push({
    ...entry,
    args: entry.args.map((arg: string) => (arg.length > 220 ? `${arg.slice(0, 220)}...` : arg)),
  });
  if (geminiConsole.length > 30) geminiConsole.shift();
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
