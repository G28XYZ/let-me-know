import type { SourceFileSummary } from "@/types/reader";

/**
 * Props левой панели материала.
 */
export type SourcePanelProps = {
  /** Файлы, которые backend нашел в папках исходников. */
  sourceFiles: SourceFileSummary[];
  /** Имя загруженного файла. Пустая строка означает, что файл еще не выбран. */
  fileName: string;
  /** id выбранного исходника. */
  activeSourceId: string | null;
  /** id книги, которую сейчас показываем в mdBook. */
  activeBookId: string | null;
  /** Открывает исходник из серверной папки. */
  onSourceOpen: (source: SourceFileSummary) => void;
  /** Перезагружает список исходников с backend. */
  onSourcesRefresh: () => void;
  /** Удаляет исходник из серверной папки. */
  onSourceDelete: (source: SourceFileSummary) => void;
};

/**
 * Левая панель с исходниками и текущим состоянием генерации mdBook.
 *
 * Компонент получает уже подготовленные данные и не вызывает API.
 */
export function SourcePanel({
  sourceFiles,
  fileName,
  activeSourceId,
  activeBookId,
  onSourceOpen,
  onSourcesRefresh,
  onSourceDelete,
}: SourcePanelProps) {
  return (
    <aside className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">Исходники</h2>
          <button
            type="button"
            onClick={onSourcesRefresh}
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-text transition-colors"
          >
            Обновить
          </button>
        </div>
        {sourceFiles.length > 0 ? (
          <div className="flex flex-col gap-2">
            {sourceFiles.slice(0, 5).map((source) => (
              <article
                key={source.id}
                className={`rounded-lg border p-3 text-sm transition-colors ${source.id === activeSourceId ? "border-accent bg-accent-soft" : "border-line bg-surface-strong"}`}
              >
                <button
                  type="button"
                  onClick={() => onSourceOpen(source)}
                  className="block w-full text-left"
                >
                  <strong className="block truncate text-text" title={source.relativePath}>{source.name}</strong>
                  <span className="mt-1 block text-xs text-muted">
                    {source.root} · {formatFileSize(source.size)}
                  </span>
                </button>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSourceOpen(source)}
                    className="rounded border border-line px-2 py-1 text-xs hover:border-accent transition-colors"
                  >
                    Открыть
                  </button>
                  {source.canDelete && (
                    <button
                      type="button"
                      onClick={() => onSourceDelete(source)}
                      className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger hover:text-white transition-colors"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Пусто</p>
        )}
      </section>

      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <h2 className="text-base font-bold mb-2">Материал</h2>
        <div className="text-sm text-muted">
          {fileName ? (
            <>
              <strong>{fileName}</strong>
              <span className="block mt-2 text-xs">
                {activeBookId ? "Книга собрана и открыта в mdBook" : "Готов к конвертации в Markdown и сборке mdBook"}
              </span>
            </>
          ) : (
            "Выберите исходник или загрузите PDF, Markdown, TXT"
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          OCR для сканов можно будет добавить следующим слоем после базового PDF-парсера.
        </p>
      </section>
    </aside>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "размер неизвестен";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}
