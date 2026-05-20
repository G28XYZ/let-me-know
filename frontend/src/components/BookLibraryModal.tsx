import { useMemo, useState } from "react";
import type { SourceFileSummary } from "@/types/reader";

export type BookLibraryModalProps = {
  open: boolean;
  sources: SourceFileSummary[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenSource: (source: SourceFileSummary) => void;
  onDeleteSource: (source: SourceFileSummary) => void;
};

export function BookLibraryModal({
  open,
  sources,
  loading,
  busy,
  onClose,
  onRefresh,
  onOpenSource,
  onDeleteSource,
}: BookLibraryModalProps) {
  const [query, setQuery] = useState("");

  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sources;

    return sources.filter((source) => (
      source.name.toLowerCase().includes(normalizedQuery) ||
      source.relativePath.toLowerCase().includes(normalizedQuery)
    ));
  }, [query, sources]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: "var(--overlay-bg)" }}>
      <section className="library-modal app-panel flex h-[min(760px,calc(100vh-48px))] w-full max-w-6xl flex-col overflow-hidden shadow-custom">
        <header className="library-modal-header flex min-h-[var(--menu-bar-height)] items-center justify-between gap-4 px-4 sm:px-6">
          <h2 className="m-0 truncate text-2xl font-light">Библиотека</h2>
          <div className="flex min-w-0 items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="app-input h-8 w-[min(260px,45vw)] rounded-[16px] px-3 text-sm outline-none focus:border-accent"
              placeholder="Поиск книги..."
              type="search"
            />
            <button type="button" className="app-button px-3 text-sm" onClick={onRefresh} disabled={loading || busy}>
              Обновить
            </button>
            <button type="button" className="app-button px-3 text-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </header>

        <div className="library-nav flex min-h-10 items-center gap-5 px-4 text-sm sm:px-6">
          <span>Все документы</span>
          <span>PDF</span>
          <span>Markdown</span>
          <span>TXT</span>
        </div>

        <div className="library-shelves flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted">Загружаем библиотеку...</div>
          ) : filteredSources.length > 0 ? (
            <div className="library-shelf-grid">
              {filteredSources.map((source, index) => (
                <article key={source.id} className="library-shelf-item">
                  <button
                    type="button"
                    className={`library-book library-book-${index % 6}`}
                    onClick={() => onOpenSource(source)}
                    disabled={busy}
                    title={source.relativePath}
                  >
                    <span className="library-book-extension">{getExtension(source.name)}</span>
                    <strong>{cleanBookTitle(source.name)}</strong>
                    <span>{formatFileSize(source.size)}</span>
                  </button>
                  {source.canDelete && (
                    <button
                      type="button"
                      className="library-delete-button"
                      onClick={() => onDeleteSource(source)}
                      disabled={busy}
                      title={`Удалить ${source.name}`}
                    >
                      Удалить
                    </button>
                  )}
                  <p className="mt-3 truncate text-center text-xs text-muted" title={source.name}>{source.name}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-muted">
              {sources.length === 0 ? "Загруженных документов пока нет." : "Ничего не найдено."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function cleanBookTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || fileName;
}

function getExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension && extension !== fileName.toUpperCase() ? extension : "DOC";
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "размер неизвестен";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}
