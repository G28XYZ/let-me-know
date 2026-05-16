import type { ChunkMeta } from "@/types/reader";

export type TopicCardsPanelProps = {
  fileName: string;
  chunks: string[];
  chunkMeta: ChunkMeta[];
  onSelectTopic: (index: number) => void;
};

export function TopicCardsPanel({ fileName, chunks, chunkMeta, onSelectTopic }: TopicCardsPanelProps) {
  const topics = chunkMeta
    .map((meta, index) => ({ meta, index, words: countWords(chunks[index] || "") }))
    .filter((item) => !item.meta.skippable && chunks[item.index]);

  return (
    <section className="flex flex-col border border-line rounded-lg bg-surface shadow-sm min-h-0">
      <header className="p-4 border-b border-line">
        <p className="text-sm text-muted">Обзор тем и концепций</p>
        <h2 className="text-base font-bold">{fileName || "Материал"}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {topics.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-muted">
            <p>После подготовки документа здесь появятся карточки тем.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {topics.map(({ meta, index, words }) => (
              <button
                key={`${index}-${meta.title}`}
                type="button"
                onClick={() => onSelectTopic(index)}
                className="rounded-lg border border-line bg-surface-strong p-4 text-left hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold leading-snug">{meta.title || `Тема ${index + 1}`}</h3>
                  <span className="shrink-0 text-xs text-muted">{words ? `~${Math.max(1, Math.ceil(words / 200))} мин` : ""}</span>
                </div>
                {meta.summary && <p className="mt-2 text-sm text-muted">{meta.summary}</p>}
                {meta.concepts && meta.concepts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {meta.concepts.slice(0, 6).map((concept) => (
                      <span key={concept} className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-muted">
                        {concept}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted">
                  Стр. {meta.pageStart || "?"}-{meta.pageEnd || "?"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function countWords(text: string) {
  return String(text || "").split(/\s+/).filter((word) => /[a-zA-Zа-яА-ЯёЁ0-9]/.test(word)).length;
}
