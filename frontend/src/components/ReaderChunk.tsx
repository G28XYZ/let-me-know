import type { RefObject } from "react";
import { escapeHtml } from "@/lib/utils";
import type { ChunkMeta } from "@/types/reader";

/**
 * Timecode одного озвучиваемого текстового сегмента.
 */
export type ReaderChunkTimecode = {
  /** Начало сегмента в секундах. */
  start: number;
  /** Конец сегмента в секундах. */
  end: number;
  /** Текст сегмента, который нужно подсветить. */
  text: string;
};

/**
 * Props компонента отображения одного фрагмента.
 */
export type ReaderChunkProps = {
  /** Текст текущего фрагмента. Если пустой, будет показано стартовое или ошибочное состояние. */
  chunk?: string;
  /** Метаданные текущего фрагмента. */
  meta?: ChunkMeta;
  /** Индекс текущего фрагмента. */
  currentIndex: number;
  /** Имя загруженного файла, используется в пустом состоянии. */
  fileName: string;
  /** Статус AI-помощника, используется для текста ошибки пустого состояния. */
  assistantStatus: string;
  /** URL или data URL TTS-аудио. */
  ttsAudioUrl: string | null;
  /** Timecodes для подсветки озвучиваемых сегментов. */
  ttsTimecodes: ReaderChunkTimecode[];
  /** Текущее время воспроизведения TTS-аудио. */
  ttsCurrentTime: number;
  /** Включена ли подсветка текущего озвучиваемого сегмента. */
  ttsHighlight: boolean;
  /** Идет ли генерация TTS-аудио. */
  isTtsLoading: boolean;
  /** Ref на audio element. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Ref на активный span, который родитель использует для автоскролла. */
  activeSentenceRef: RefObject<HTMLSpanElement | null>;
  /** Запускает генерацию или воспроизведение TTS для текста фрагмента. */
  onPlayTts: (text: string) => void;
  /** Сообщает родителю текущее время воспроизведения. */
  onTtsTimeUpdate: (value: number) => void;
};

/**
 * Отображает один текстовый фрагмент: заголовок, страницы, время чтения,
 * содержимое, TTS-плеер и подсветку озвучиваемого предложения.
 *
 * Компонент не переключает фрагменты и не вызывает AI-анализ.
 */
export function ReaderChunk({
  chunk,
  meta,
  currentIndex,
  fileName,
  assistantStatus,
  ttsAudioUrl,
  ttsTimecodes,
  ttsCurrentTime,
  ttsHighlight,
  isTtsLoading,
  audioRef,
  activeSentenceRef,
  onPlayTts,
  onTtsTimeUpdate,
}: ReaderChunkProps) {
  if (!chunk) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted">
        <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="max-w-xs">
          {fileName
            ? (assistantStatus.includes("Ошибка") || assistantStatus.includes("не смог")
              ? `Ошибка при обработке: ${assistantStatus}`
              : "В документе не найден текст для чтения. Попробуйте другой файл или убедитесь, что это не сканированный PDF.")
            : "Загрузите .txt или .pdf, выберите метод изучения и начните чтение."}
        </p>
      </div>
    );
  }

  if (!meta) return <p className="p-4 text-danger">Ошибка: метаданные фрагмента не найдены.</p>;

  const wordCount = chunk.trim().split(/\s+/).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const activeIdx = ttsTimecodes.length > 0 && ttsAudioUrl
    ? ttsTimecodes.findIndex((timecode) => ttsCurrentTime >= timecode.start && ttsCurrentTime <= timecode.end)
    : -1;

  return (
    <section className={`m-4 border rounded-lg relative ${meta.skippable ? "bg-surface-strong" : "border-accent bg-[#fbfdfb]"}`}>
      <header className={`sticky top-0 z-10 p-4 border-b text-muted text-sm backdrop-blur-md rounded-t-lg ${meta.skippable ? "bg-surface-strong/95 border-line" : "bg-[#fbfdfb]/95 border-accent/20"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span>Фрагмент {currentIndex + 1}</span>
          {meta.pageStart && meta.pageEnd && <span>Стр. {meta.pageStart}-{meta.pageEnd}</span>}
          <span>~{readingTime} мин</span>
          {meta.skippable && <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-strong text-xs font-bold">служебный</span>}
        </div>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h3 className="text-lg text-text">{meta.title || `Фрагмент ${currentIndex + 1}`}</h3>
            {meta.summary && <p className="mt-1 text-sm">{meta.summary}</p>}
          </div>
          <button
            onClick={() => onPlayTts(chunk)}
            disabled={isTtsLoading}
            className="flex-shrink-0 flex items-center justify-center p-2 border border-line rounded bg-surface hover:border-accent disabled:opacity-50 transition-colors"
            title="Озвучить фрагмент"
          >
            {isTtsLoading ? (
              <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
        {ttsAudioUrl && (
          <audio
            ref={audioRef}
            controls
            src={ttsAudioUrl}
            className="w-full mt-3 h-10"
            autoPlay
            onTimeUpdate={(event) => onTtsTimeUpdate(event.currentTarget.currentTime)}
          />
        )}
      </header>
      <div className="p-4">
        {ttsTimecodes.length > 0 && ttsAudioUrl ? (
          <div className="text-lg leading-relaxed">
            {ttsTimecodes.map((timecode, index) => (
              <span
                key={`${timecode.start}-${index}`}
                ref={index === activeIdx ? activeSentenceRef : null}
                className={`transition-colors duration-300 ${ttsHighlight && index === activeIdx ? "bg-accent/20 border-b-2 border-accent" : ""}`}
              >
                {timecode.text}{" "}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-lg leading-relaxed">
            {escapeHtml(chunk).split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, "<br>") }} className="mb-4" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
