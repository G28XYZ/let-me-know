import type { RefObject, ReactNode } from "react";
import { ReaderChunk } from "@/components/ReaderChunk";
import type { ChunkMeta } from "@/types/reader";

/**
 * Timecode одного озвучиваемого текстового сегмента.
 */
export type Timecode = {
  /** Начало сегмента в секундах. */
  start: number;
  /** Конец сегмента в секундах. */
  end: number;
  /** Текст сегмента, который нужно подсветить во время озвучки. */
  text: string;
};

/**
 * Props центральной панели чтения.
 */
export type ReaderPanelProps = {
  /** Имя текущего материала. */
  fileName: string;
  /** Подготовленные текстовые фрагменты. */
  chunks: string[];
  /** Метаданные для каждого фрагмента из `chunks`. */
  chunkMeta: ChunkMeta[];
  /** Индекс текущего фрагмента. */
  currentIndex: number;
  /** Общий флаг занятости приложения. */
  busy: boolean;
  /** Идет ли AI-анализ текущего фрагмента. */
  isAnalyzing: boolean;
  /** Заблокирована ли навигация из-за активной паузы повторения. */
  locked: boolean;
  /** Индекс, за который нельзя перейти до завершения активной паузы. */
  pendingNextIndex: number | null;
  /** Подготовлен ли исходный документ до конца. */
  sourceDone: boolean;
  /** Идет ли фоновая подготовка следующих фрагментов. */
  preparingMore: boolean;
  /** Статус AI-помощника, нужен для пустого/ошибочного состояния `ReaderChunk`. */
  assistantStatus: string;
  /** Будет ли следующий клик вперед открывать паузу повторения. */
  willPauseNext: boolean;
  /** URL или data URL аудио текущей TTS-озвучки. */
  ttsAudioUrl: string | null;
  /** Timecodes для подсветки текста во время озвучки. */
  ttsTimecodes: Timecode[];
  /** Текущее время воспроизведения TTS-аудио. */
  ttsCurrentTime: number;
  /** Включена ли подсветка текущего озвучиваемого сегмента. */
  ttsHighlight: boolean;
  /** Идет ли генерация TTS-аудио. */
  isTtsLoading: boolean;
  /** Ref на audio element, чтобы родитель мог синхронизировать TTS. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Ref на активный озвучиваемый span для автоскролла. */
  activeSentenceRef: RefObject<HTMLSpanElement | null>;
  /** Ref на область текста ридера. */
  readerTextRef: RefObject<HTMLElement | null>;
  /** Слот для компонента вопросов или другого блока, который показывается под текстом. */
  reviewSlot: ReactNode;
  /** Переход к предыдущему фрагменту. */
  onPrev: () => void;
  /** Переход к следующему фрагменту или запуск паузы повторения. */
  onNext: () => void;
  /** Пропуск служебного фрагмента. */
  onSkipService: () => void;
  /** Запуск TTS для переданного текста. */
  onPlayTts: (text: string) => void;
  /** Обновление текущего времени TTS-аудио. */
  onTtsTimeUpdate: (value: number) => void;
};

/**
 * Центральная панель чтения с навигацией, текущим фрагментом и слотом паузы.
 *
 * Компонент не принимает решений об AI-анализе и вопросах: он только вызывает
 * обработчики `onPrev`, `onNext`, `onSkipService` и размещает `reviewSlot`.
 */
export function ReaderPanel({
  fileName,
  chunks,
  chunkMeta,
  currentIndex,
  busy,
  isAnalyzing,
  locked,
  pendingNextIndex,
  sourceDone,
  preparingMore,
  assistantStatus,
  willPauseNext,
  ttsAudioUrl,
  ttsTimecodes,
  ttsCurrentTime,
  ttsHighlight,
  isTtsLoading,
  audioRef,
  activeSentenceRef,
  readerTextRef,
  reviewSlot,
  onPrev,
  onNext,
  onSkipService,
  onPlayTts,
  onTtsTimeUpdate,
}: ReaderPanelProps) {
  const currentMeta = chunkMeta[currentIndex];
  const atLastLoadedChunk = currentIndex >= chunks.length - 1;
  const blockedByReview = locked && (pendingNextIndex === null || currentIndex + 1 >= pendingNextIndex);
  const nextDisabled = busy || isAnalyzing || (atLastLoadedChunk && sourceDone) || blockedByReview || chunks.length === 0;
  const previousDisabled = busy || isAnalyzing || currentIndex === 0 || chunks.length === 0;

  return (
    <section className="flex flex-col border border-line rounded-lg bg-surface shadow-sm min-h-0">
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-4 p-4 border-b border-line">
        <button onClick={onPrev} disabled={previousDisabled} className="h-11 flex items-center justify-center border border-line rounded-lg hover:border-accent disabled:opacity-50">←</button>
        <div>
          <p className="text-sm text-muted">
            {chunks.length > 0 ? `Фрагмент ${currentIndex + 1} из ${chunks.length}` : "Фрагмент 0 из 0"}
            {preparingMore && <span className="ml-2 text-accent animate-pulse">...</span>}
          </p>
          <h2 className="text-base font-bold">{fileName || "Загрузите материал"}</h2>
        </div>
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className={`h-11 flex items-center justify-center border rounded-lg disabled:opacity-50 transition-colors ${willPauseNext ? "bg-warning-soft border-warning text-warning hover:bg-warning hover:text-white hover:border-warning" : "border-line hover:border-accent"}`}
          title={willPauseNext ? "Впереди вопрос или задание на закрепление" : (atLastLoadedChunk && !sourceDone ? "Загрузить продолжение" : "Следующий фрагмент")}
        >
          {isAnalyzing ? (
            <svg className="animate-spin h-5 w-5 opacity-70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : "→"}
        </button>
      </div>

      {currentMeta?.skippable && !locked && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 border-b border-line bg-accent-soft">
          <div>
            <strong className="text-sm">{currentMeta.type === "toc" ? "Оглавление" : "Введение"}</strong>
            <p className="text-xs text-muted mt-1">{currentMeta.reason}</p>
          </div>
          <button onClick={onSkipService} disabled={busy || isAnalyzing} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm disabled:opacity-50">Пропустить</button>
        </div>
      )}

      <article ref={readerTextRef} className="flex-1 overflow-y-auto text-lg leading-relaxed">
        <ReaderChunk
          chunk={chunks[currentIndex]}
          meta={currentMeta}
          currentIndex={currentIndex}
          fileName={fileName}
          assistantStatus={assistantStatus}
          ttsAudioUrl={ttsAudioUrl}
          ttsTimecodes={ttsTimecodes}
          ttsCurrentTime={ttsCurrentTime}
          ttsHighlight={ttsHighlight}
          isTtsLoading={isTtsLoading}
          audioRef={audioRef}
          activeSentenceRef={activeSentenceRef}
          onPlayTts={onPlayTts}
          onTtsTimeUpdate={onTtsTimeUpdate}
        />
      </article>

      {reviewSlot}
    </section>
  );
}
