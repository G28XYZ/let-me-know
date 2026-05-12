import { methodContent, type MethodType } from "@/lib/methods";
import type { ChunkMeta } from "@/types/reader";

/**
 * Props левой панели материала.
 */
export type SourcePanelProps = {
  /** Имя загруженного файла. Пустая строка означает, что файл еще не выбран. */
  fileName: string;
  /** Object URL исходного PDF для iframe-просмотра. */
  pdfUrl: string;
  /** Количество подготовленных и доступных для чтения фрагментов. */
  chunksLoaded: number;
  /** Общее количество страниц исходного документа. */
  totalPages: number;
  /** Метаданные текущего фрагмента, нужны для прогресса по страницам. */
  currentMeta?: ChunkMeta;
  /** Загружен ли исходный документ полностью. */
  sourceDone: boolean;
  /** Идет ли фоновая подготовка следующих частей документа. */
  preparingMore: boolean;
  /** Текущий метод обучения, описание которого нужно показать. */
  method: MethodType;
};

/**
 * Левая панель с информацией о материале, прогрессе чтения, методе обучения
 * и PDF-референсом.
 *
 * Компонент получает уже подготовленные данные и не вызывает API.
 */
export function SourcePanel({
  fileName,
  pdfUrl,
  chunksLoaded,
  totalPages,
  currentMeta,
  sourceDone,
  preparingMore,
  method,
}: SourcePanelProps) {
  const progress = totalPages ? Math.round(((currentMeta?.pageEnd || 0) / totalPages) * 100) : 0;

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <h2 className="text-base font-bold mb-2">Материал</h2>
        <div className="text-sm text-muted">
          {fileName ? (
            <>
              <strong>{fileName}</strong>
              <br />
              <span>{chunksLoaded} фрагментов загружено</span>
              {!sourceDone && (
                <span className="block mt-1 text-accent animate-pulse">
                  {preparingMore ? "ИИ готовит продолжение..." : "Частичная загрузка"}
                </span>
              )}
              {sourceDone && <span className="block mt-1 text-accent">Загружен полностью</span>}
            </>
          ) : (
            "Файл еще не загружен"
          )}
        </div>
        <div className="overflow-hidden h-2 mt-4 rounded-full bg-surface-strong">
          <div className="h-full bg-accent transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-muted mt-2">{progress}% прочитано</p>
      </section>

      <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
        <h2 className="text-base font-bold mb-2">Метод</h2>
        <div className="text-sm text-muted">
          <strong>{methodContent[method].title}</strong>
          <ul className="list-disc pl-5 mt-2">
            {methodContent[method].guide.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {pdfUrl && (
        <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
          <h2 className="text-base font-bold mb-2">PDF-референс</h2>
          <iframe src={pdfUrl} className="w-full h-64 border border-line rounded-lg bg-surface-strong" />
        </section>
      )}
    </aside>
  );
}
