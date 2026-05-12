"use client";

import { useState } from "react";
import type { AnalysisItem, NoteItem } from "@/types/reader";

type GeminiDiagnostics = {
  available?: boolean;
  bin?: string;
  model?: {
    usedModel?: string;
    sentToCli?: boolean;
    cliArgument?: string[] | null;
    modelSource?: string;
    note?: string;
    limits?: {
      label?: string;
      modelCode?: string | null;
      tier?: string;
      inputTokenLimit?: number | null;
      outputTokenLimit?: number | null;
      match?: string;
      note?: string;
    };
  };
  runtimeCommand?: {
    args?: string[];
    timeoutMs?: number;
  };
  appLimits?: {
    backendJsonBodyLimit?: string;
    cliPromptTimeoutMs?: number;
    responseTokenBudgetByTask?: Record<string, number>;
  };
  lastInvocation?: {
    metadata?: {
      promptChars?: number;
      outputFormat?: string | null;
      promptPreview?: string;
    };
  } | null;
  error?: string;
};

/**
 * Props правой панели помощника и настроек.
 */
export type AssistantPanelProps = {
  /** Текущий текстовый статус AI-помощника. */
  assistantStatus: string;
  /** История последних AI-анализов фрагментов. */
  aiHistory: AnalysisItem[];
  /** Заметки конспекта, сформированные по мере чтения. */
  notes: NoteItem[];
  /** Включена ли подсветка текста во время TTS-озвучки. */
  ttsHighlight: boolean;
  /** Включен ли автоскролл к текущему озвучиваемому предложению. */
  ttsAutoScroll: boolean;
  /** Включены ли вопросы на паузах повторения. */
  questionsEnabled: boolean;
  /** Backend endpoint для AI-анализа, например `/api/analyze`. */
  apiEndpoint: string;
  /** Выбранный AI provider, например `openai-compatible` или `gemini-cli`. */
  aiProvider: string;
  /** Обработчик включения/выключения подсветки TTS. */
  onTtsHighlightChange: (value: boolean) => void;
  /** Обработчик включения/выключения автоскролла TTS. */
  onTtsAutoScrollChange: (value: boolean) => void;
  /** Обработчик включения/выключения компонента вопросов. */
  onQuestionsEnabledChange: (value: boolean) => void;
  /** Обработчик изменения backend endpoint. */
  onApiEndpointChange: (value: string) => void;
  /** Обработчик смены AI provider. */
  onAiProviderChange: (value: string) => void;
};

/**
 * Правая панель приложения: статус AI, последние подсказки, конспект и настройки.
 *
 * Компонент не вызывает AI напрямую. Все изменения настроек отдает наружу через
 * callbacks, чтобы родитель или профильные компоненты применяли их сами.
 */
export function AssistantPanel({
  assistantStatus,
  aiHistory,
  notes,
  ttsHighlight,
  ttsAutoScroll,
  questionsEnabled,
  apiEndpoint,
  aiProvider,
  onTtsHighlightChange,
  onTtsAutoScrollChange,
  onQuestionsEnabledChange,
  onApiEndpointChange,
  onAiProviderChange,
}: AssistantPanelProps) {
  const [geminiDiagnostics, setGeminiDiagnostics] = useState<GeminiDiagnostics | null>(null);
  const [geminiDiagnosticsLoading, setGeminiDiagnosticsLoading] = useState(false);
  const [geminiDiagnosticsError, setGeminiDiagnosticsError] = useState("");

  const handleGeminiDiagnostics = async () => {
    if (geminiDiagnosticsLoading) return;

    setGeminiDiagnosticsLoading(true);
    setGeminiDiagnosticsError("");
    try {
      const token = localStorage.getItem("auth_token");
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const endpoint = apiEndpoint.replace("/analyze", "/gemini/diagnostics");
      const response = await fetch(endpoint, { headers });
      const data = await response.json().catch(() => ({})) as GeminiDiagnostics;
      if (!response.ok) {
        throw new Error(data.error || "Gemini CLI diagnostics failed.");
      }
      setGeminiDiagnostics(data);
    } catch (error) {
      setGeminiDiagnosticsError(error instanceof Error ? error.message : "Не удалось получить диагностику Gemini CLI.");
    } finally {
      setGeminiDiagnosticsLoading(false);
    }
  };

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">AI-помощник</h2>
        </div>
        <div className="text-sm text-muted mb-3">{assistantStatus}</div>
        <div className="flex flex-col gap-3">
          {aiHistory.length === 0 ? (
            <p className="text-sm text-muted">После загрузки материала здесь появятся подсказки и конспект.</p>
          ) : (
            aiHistory.slice(0, 3).map((item, index) => (
              <div key={`${item.chunkIndex}-${item.method}-${index}`} className="pb-3 border-b border-line last:border-0 text-sm">
                <h3 className="font-bold mb-1">{item.method} · {item.createdAt}</h3>
                <p className="mb-1"><strong>Резюме:</strong> {item.summary}</p>
                <p><strong>Рекомендация:</strong> {item.recommendation}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <h2 className="text-base font-bold mb-3">Конспект</h2>
        <div className="flex flex-col gap-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted">Конспект появится по мере чтения.</p>
          ) : (
            notes.slice(0, 5).map((note, index) => (
              <div key={`${note.chunkIndex}-${index}`} className="pb-3 border-b border-line last:border-0 text-sm">
                <strong className="block mb-1">{note.method} · фрагмент {note.chunkIndex + 1}</strong>
                <p>{note.text}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm text-sm">
        <details open>
          <summary className="font-bold cursor-pointer">Настройки чтения</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-muted select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-accent"
                checked={ttsHighlight}
                onChange={(event) => onTtsHighlightChange(event.target.checked)}
              />
              <span>Подсветка при озвучке</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-muted select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-accent"
                checked={ttsAutoScroll}
                onChange={(event) => onTtsAutoScrollChange(event.target.checked)}
              />
              <span>Автоскролл к тексту</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-muted select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-accent"
                checked={questionsEnabled}
                onChange={(event) => onQuestionsEnabledChange(event.target.checked)}
              />
              <span>Вопросы на паузах</span>
            </label>
          </div>
        </details>
      </section>

      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm text-sm">
        <details>
          <summary className="font-bold cursor-pointer">Настройки API</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-muted">
              Backend endpoint
              <input type="text" className="p-2 border border-line rounded-lg text-text" value={apiEndpoint} onChange={(event) => onApiEndpointChange(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-muted">
              AI provider
              <select className="p-2 border border-line rounded-lg text-text" value={aiProvider} onChange={(event) => onAiProviderChange(event.target.value)}>
                <option value="gemini-cli">Gemini CLI</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            {aiProvider === "gemini-cli" && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleGeminiDiagnostics}
                  disabled={geminiDiagnosticsLoading}
                  className="px-3 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors disabled:opacity-50"
                >
                  {geminiDiagnosticsLoading ? "Проверяю Gemini CLI..." : "Диагностика Gemini CLI"}
                </button>
                {geminiDiagnosticsError && <p className="text-danger text-xs">{geminiDiagnosticsError}</p>}
                {geminiDiagnostics && <GeminiDiagnosticsView diagnostics={geminiDiagnostics} />}
              </div>
            )}
          </div>
        </details>
      </section>
    </aside>
  );
}

function GeminiDiagnosticsView({ diagnostics }: { diagnostics: GeminiDiagnostics }) {
  const model = diagnostics.model;
  const limits = model?.limits;
  const budgets = diagnostics.appLimits?.responseTokenBudgetByTask || {};
  const command = diagnostics.runtimeCommand?.args?.join(" ") || "";
  const lastPromptChars = diagnostics.lastInvocation?.metadata?.promptChars;

  return (
    <div className="rounded border border-line bg-surface-strong p-3 text-xs text-text">
      <div className="grid grid-cols-2 gap-2">
        <InfoRow label="Статус" value={diagnostics.available ? "CLI доступен" : "CLI недоступен"} />
        <InfoRow label="Бинарь" value={diagnostics.bin || "gemini"} />
        <InfoRow label="Модель" value={model?.usedModel || "CLI default"} />
        <InfoRow label="Источник" value={model?.modelSource || "CLI default"} />
        <InfoRow label="Тип" value={limits?.tier || "неизвестно"} />
        <InfoRow label="Совпадение" value={limits?.match || "unknown"} />
        <InfoRow label="Input limit" value={formatTokens(limits?.inputTokenLimit)} />
        <InfoRow label="Output limit" value={formatTokens(limits?.outputTokenLimit)} />
        <InfoRow label="JSON body" value={diagnostics.appLimits?.backendJsonBodyLimit || "10mb"} />
        <InfoRow label="Timeout" value={`${diagnostics.appLimits?.cliPromptTimeoutMs || 180000} ms`} />
      </div>

      {model?.note && <p className="mt-3 text-muted">{model.note}</p>}
      {limits?.note && <p className="mt-2 text-muted">{limits.note}</p>}

      <div className="mt-3 border-t border-line pt-3">
        <strong className="block mb-2">Бюджет ответов приложения</strong>
        <div className="grid grid-cols-2 gap-1 text-muted">
          {Object.entries(budgets).map(([task, value]) => (
            <span key={task}>{task}: {formatTokens(value)}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <strong className="block mb-1">Команда</strong>
        <code className="block break-words text-muted">{command}</code>
      </div>

      {typeof lastPromptChars === "number" && (
        <div className="mt-3 border-t border-line pt-3">
          <strong className="block mb-1">Последний prompt</strong>
          <p className="text-muted">{lastPromptChars} символов · output {diagnostics.lastInvocation?.metadata?.outputFormat || "text"}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-muted">{label}</span>
      <strong className="break-words">{value}</strong>
    </div>
  );
}

function formatTokens(value?: number | null) {
  if (typeof value !== "number") return "неизвестно";
  return new Intl.NumberFormat("ru-RU").format(value);
}
