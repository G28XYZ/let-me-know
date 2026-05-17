import type { ChangeEvent } from "react";

/**
 * Props верхней панели приложения.
 */
export type AppHeaderProps = {
  /** Блокирует загрузку файла и смену метода во время долгих операций. */
  busy: boolean;
  /** Открывает библиотеку уже загруженных документов. */
  onLibraryOpen: () => void;
  /** Принудительно пересобирает открытую книгу. */
  onRegenerateBook: () => void;
  /** Обработчик выбора файла пользователем. */
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Есть ли сейчас открытая книга. */
  hasActiveBook: boolean;
};

/**
 * Верхняя панель приложения: название и загрузка исходника.
 *
 * После загрузки родитель сам запускает конвертацию PDF/Markdown/TXT в mdBook.
 */
export function AppHeader({
  busy,
  onLibraryOpen,
  onRegenerateBook,
  onFileSelect,
  hasActiveBook,
}: AppHeaderProps) {
  return (
    <header className="app-header sticky top-0 z-10 flex items-center justify-between px-[15px]">
      <div className="min-w-0">
        <h1 className="app-title m-0 truncate">Learn Helper</h1>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="app-button px-3 text-sm" onClick={onLibraryOpen} disabled={busy}>
          Библиотека
        </button>
        {hasActiveBook && (
          <button type="button" className="app-button px-3 text-sm" onClick={onRegenerateBook} disabled={busy}>
            Пересобрать
          </button>
        )}
        <label className="app-button flex cursor-pointer items-center justify-center px-3 text-sm">
          <input type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" className="hidden" onChange={onFileSelect} disabled={busy} />
          Загрузить файл
        </label>
      </div>
    </header>
  );
}
