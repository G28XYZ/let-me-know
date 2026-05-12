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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f6f7f3]/70 backdrop-blur-sm p-6">
      <div className="w-full max-w-md p-6 bg-surface border border-line rounded-lg shadow-xl text-center">
        <div className="spinner" />
        <strong className="block text-lg">{title}</strong>
        <p className="mt-2 text-muted">{text}</p>
      </div>
    </div>
  );
}
