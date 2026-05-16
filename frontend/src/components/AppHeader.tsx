import type { ChangeEvent } from "react";

/**
 * Props верхней панели приложения.
 */
export type AppHeaderProps = {
  /** Блокирует загрузку файла и смену метода во время долгих операций. */
  busy: boolean;
  /** Обработчик выбора файла пользователем. */
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Обработчик генерации mdBook. */
  onGenerateBook?: () => void;
  /** Есть ли выбранный файл для генерации. */
  hasFile?: boolean;
};

/**
 * Верхняя панель приложения: название, загрузка файла и запуск генерации книги.
 *
 * Компонент не хранит бизнес-состояние и не загружает файл сам: он только
 * передает события родителю через props.
 */
export function AppHeader({ busy, onFileSelect, onGenerateBook, hasFile }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-line bg-[#f6f7f3]/90 backdrop-blur-md">
      <div>
        <h1 className="text-2xl font-bold m-0">Learn Helper</h1>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        {hasFile && onGenerateBook && (
          <button
            onClick={onGenerateBook}
            disabled={busy}
            className="h-10 px-4 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            Сгенерировать mdBook
          </button>
        )}
        <label className="flex items-center justify-center h-10 px-4 border border-line rounded-lg bg-surface cursor-pointer hover:border-accent">
          <input type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={onFileSelect} disabled={busy} />
          Загрузить файл
        </label>
      </div>
    </header>
  );
}
