import { config } from "../config";
import { runGemini } from "./geminiService";
import { parseJsonOrFallback } from "../utils/text";

export async function completeJson(system: string, user: string, maxTokens: number, provider: string = config.defaultProvider) {
  if (provider === "gemini-cli") {
    return completeWithGeminiCli(system, user, maxTokens);
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: addNoThink(user),
        },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(config.isOllama ? { format: "json" } : {}),
    }),
  });

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI-compatible API error ${response.status}`);
  }

  return extractChatText(data);
}

export function addNoThink(prompt: string) {
  if (config.model.toLowerCase().includes("qwen")) {
    return `${prompt}\n\n/no_think`;
  }
  return prompt;
}

export function extractChatText(data: any) {
  return String(data.choices?.[0]?.message?.content || "").trim();
}

export async function completeWithGeminiCli(system: string, user: string, maxTokens: number) {
  const prompt = [
    system,
    "",
    `Ограничение ответа: не более ${maxTokens} токенов.`,
    "Верни только JSON, если это требуется задачей.",
    "",
    user,
  ].join("\n");
  const args = ["--prompt", prompt, "--output-format", "text", "--skip-trust"];
  if (config.geminiModel) args.unshift("--model", config.geminiModel);

  const result = await runGemini(args, 180000);
  if (result.code !== 0) {
    throw new Error(result.output || "Gemini CLI command failed.");
  }

  return result.output;
}
