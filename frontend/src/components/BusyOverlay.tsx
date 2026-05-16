/**
 * Props глобального overlay для долгой операции.
 */
export type BusyOverlayProps = {
  /** Заголовок текущего процесса. */
  title: string;
  /** Дополнительное пояснение, что сейчас происходит. */
  text: string;
};

/**
 * Полноэкранный индикатор занятости приложения.
 *
 * Используется во время загрузки файла, подготовки документа, анализа фрагмента
 * и догрузки продолжения. Не хранит состояние и не запускает операции.
 */
export function BusyOverlay({ title, text }: BusyOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm" style={{ backgroundColor: "var(--overlay-bg)" }}>
      <div className="app-panel w-full max-w-md p-6 text-center shadow-custom">
        <div className="spinner" />
        <strong className="block text-lg font-semibold">{title}</strong>
        <p className="mt-2 text-muted">{text}</p>
      </div>
    </div>
  );
}
