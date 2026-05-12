import type { AnalysisItem, NoteItem } from "@/types/reader";

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
          </div>
        </details>
      </section>
    </aside>
  );
}
