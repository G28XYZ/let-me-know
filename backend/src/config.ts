import dotenv from "dotenv";

dotenv.config();

export const config = {
  baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  isOpenAiCloud: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") === "https://api.openai.com/v1",
  isOllama: (process.env.OPENAI_BASE_URL || "").includes("11434"),
  model: process.env.OPENAI_MODEL || ((process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") === "https://api.openai.com/v1" ? "gpt-4o-mini" : "qwen3:8b"),
  apiKey: process.env.OPENAI_API_KEY || process.env.LOCAL_OPENAI_API_KEY || "",
  defaultProvider: process.env.AI_PROVIDER || "openai-compatible",
  geminiBin: process.env.GEMINI_BIN || "gemini",
  geminiModel: process.env.GEMINI_MODEL || "",
  mdbookBin: process.env.MDBOOK_BIN || "",
};

function normalizeBaseUrl(value: string) {
  return String(value || "").replace(/\/+$/, "");
}
