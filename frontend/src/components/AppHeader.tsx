import type { MethodType } from "@/lib/methods";

/**
 * Props верхней панели приложения.
 */
export type AppHeaderProps = {
  /** Текущий выбранный метод обучения. */
  method: MethodType;
  /** Блокирует загрузку файла и смену метода во время долгих операций. */
  busy: boolean;
  /** Обработчик выбора файла пользователем. */
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Обработчик смены метода обучения. */
  onMethodChange: (method: MethodType) => void;
};

/**
 * Верхняя панель приложения: название, загрузка файла и выбор метода обучения.
 *
 * Компонент не хранит бизнес-состояние и не загружает файл сам: он только
 * передает события родителю через `onFileSelect` и `onMethodChange`.
 */
export function AppHeader({ method, busy, onFileSelect, onMethodChange }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-line bg-[#f6f7f3]/90 backdrop-blur-md">
      <div>
        <p className="text-accent text-xs font-extrabold uppercase tracking-wide mb-1">MVP</p>
        <h1 className="text-2xl font-bold m-0">Learn Helper</h1>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex items-center justify-center h-10 px-4 border border-line rounded-lg bg-surface cursor-pointer hover:border-accent">
          <input type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={onFileSelect} disabled={busy} />
          Загрузить файл
        </label>
        <select
          className="h-10 px-3 border border-line rounded-lg bg-surface"
          value={method}
          onChange={(event) => onMethodChange(event.target.value as MethodType)}
          disabled={busy}
        >
          <option value="sq3r">SQ3R</option>
          <option value="notes">Конспектирование</option>
          <option value="feynman">Метод Фейнмана</option>
        </select>
      </div>
    </header>
  );
}
