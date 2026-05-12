"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AuthScreen } from "@/components/AuthScreen";
import { BusyOverlay } from "@/components/BusyOverlay";
import { ReaderPanel } from "@/components/ReaderPanel";
import { ReviewGate, type ReviewGateHandle } from "@/components/ReviewGate";
import { SourcePanel } from "@/components/SourcePanel";
import { useReaderState } from "@/hooks/useReaderState";
import { methodContent, type MethodType } from "@/lib/methods";
import { paginateText } from "@/lib/utils";
import type { AnalysisItem, ChunkMeta, NoteItem } from "@/types/reader";

type PdfTextItem = { str?: string };
type PdfTextContent = { items: PdfTextItem[] };
type PdfPage = { getTextContent: () => Promise<PdfTextContent> };
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
};

type PreparedDocument = {
  chunks: string[];
  metas: ChunkMeta[];
  newCursor: number;
  isDone: boolean;
  overview: unknown;
};

type PreparedApiChunk = Partial<ChunkMeta> & { text?: string };
type PreparedApiResponse = {
  chunks?: PreparedApiChunk[];
  overview?: unknown;
};
type AnalysisApiResponse = Partial<Omit<AnalysisItem, "chunkIndex" | "method" | "createdAt">>;

export default function Home() {
  const { state, actions } = useReaderState();
  const readerTextRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeSentenceRef = useRef<HTMLSpanElement>(null);
  const reviewGateRef = useRef<ReviewGateHandle>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(() => (
    typeof window !== "undefined" && Boolean(localStorage.getItem("auth_token"))
  ));
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [questionsEnabled, setQuestionsEnabled] = useState(true);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsTimecodes, setTtsTimecodes] = useState<{ start: number; end: number; text: string }[]>([]);
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("auth_token");
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });

      if (response.ok) {
        localStorage.setItem("auth_token", passwordInput);
        setIsAuthenticated(true);
        return;
      }

      const errorData = await response.json().catch(() => ({})) as { error?: string };
      setAuthError(errorData.error || "Неверный пароль");
    } catch {
      setAuthError("Ошибка сети или сервер недоступен");
    }
  };

  const getPdfJs = () => (window as Window & { pdfjsLib?: PdfJs }).pdfjsLib;

  const setupPdfJs = (pdfjsLib?: PdfJs) => {
    if (!pdfjsLib) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  };

  const waitForPdfJs = async () => {
    const existing = getPdfJs();
    if (existing) {
      setupPdfJs(existing);
      return existing;
    }

    const script = document.querySelector<HTMLScriptElement>('script[src*="pdf.min.js"]');
    if (script) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("PDF.js не загрузился. Проверьте интернет или обновите страницу.")), 8000);
        script.addEventListener("load", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
        script.addEventListener("error", () => {
          window.clearTimeout(timeout);
          reject(new Error("Не удалось загрузить PDF.js для чтения PDF."));
        }, { once: true });
      });
    }

    const pdfjsLib = getPdfJs();
    if (!pdfjsLib) throw new Error("PDF.js не загрузился. Попробуйте обновить страницу.");
    setupPdfJs(pdfjsLib);
    return pdfjsLib;
  };

  const cleanPageText = (value: string) => String(value || "")
    .replace(/^Страница\s+\d+\s*/gim, "")
    .replace(/\r/g, "")
    .replace(/([a-zA-Zа-яА-ЯёЁ])-\s*\n\s*([a-zA-Zа-яА-ЯёЁ])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const buildFallbackPrepared = (pages: string[], end = pages.length): PreparedDocument => {
    const chunks: string[] = [];
    const metas: ChunkMeta[] = [];

    pages.slice(0, end).forEach((page, index) => {
      const text = cleanPageText(page);
      if (!text) return;
      chunks.push(text);
      metas.push({
        type: "study",
        skippable: false,
        reason: "",
        title: `Страница ${index + 1}`,
        summary: "",
        pageStart: index + 1,
        pageEnd: index + 1,
      });
    });

    return {
      chunks,
      metas,
      newCursor: Math.min(end, pages.length),
      isDone: end >= pages.length,
      overview: null,
    };
  };

  const resetDocumentState = (file: File) => {
    actions.setFileName(file.name);
    actions.setFileType(file.type || "unknown");
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    actions.setPdfUrl("");
    actions.setText("");
    actions.setPages([]);
    actions.setTotalPages(0);
    actions.setChunks([]);
    actions.setChunkMeta([]);
    actions.setCurrentIndex(0);
    actions.setLocked(false);
    actions.setLockStep("none");
    actions.setPendingNextIndex(null);
    actions.setLastPauseIndex(0);
    actions.setNotes([]);
    actions.setAiHistory([]);
    actions.setAnswers([]);
    actions.setDocumentOverview(null);
    actions.setSourceCursor(0);
    actions.setSourceDone(false);
    actions.setPreparingMore(false);
    reviewGateRef.current?.reset();
  };

  const extractPagesFromFile = async (file: File) => {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const url = URL.createObjectURL(file);
      actions.setPdfUrl(url);

      const pdfjsLib = await waitForPdfJs();
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pagesArray: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str || "").join(" ").trim();
        pagesArray.push(`Страница ${pageNumber}\n${pageText}`);
      }

      return pagesArray;
    }

    const text = await file.text();
    const normalized = text
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return paginateText(normalized).map((pageText, index) => `Страница ${index + 1}\n${pageText}`);
  };

  const normalizePreparedPages = (pages: string[]) => pages.map((page, index) => {
    const text = String(page || "").trim();
    return /^Страница\s+\d+/i.test(text) ? text : `Страница ${index + 1}\n${text}`;
  });

  const getErrorMessage = (error: unknown, fallback: string) => (
    error instanceof Error ? error.message : fallback
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    let extractedTextLoaded = false;
    resetDocumentState(file);
    actions.setBusyTitle("Подготовка материала");
    actions.setBusyText("Извлекаю текст из файла...");
    actions.setBusy(true);

    try {
      const preparedPages = normalizePreparedPages(await extractPagesFromFile(file));
      const totalContentLength = preparedPages.reduce((acc, page) => acc + page.length, 0);

      actions.setPages(preparedPages);
      actions.setTotalPages(preparedPages.length);
      actions.setText(preparedPages.join("\n\n"));
      extractedTextLoaded = true;

      const fallback = buildFallbackPrepared(preparedPages);
      actions.setSourceCursor(fallback.newCursor);
      actions.setSourceDone(fallback.isDone);
      actions.setChunks(fallback.chunks);
      actions.setChunkMeta(fallback.metas);
      actions.setDocumentOverview(fallback.overview);
      actions.setAssistantStatus(fallback.chunks.length
        ? "Материал загружен. Готовлю ИИ-разбиение..."
        : "В документе не найден текст для чтения.");

      if (totalContentLength < 50 || fallback.chunks.length === 0) {
        throw new Error("В документе не найден текст для чтения. Если это сканированный PDF, нужен файл с распознанным текстом.");
      }

      actions.setBusyTitle("ИИ готовит начало документа");
      actions.setBusyText("Загружаю первую часть, разбиваю ее на фрагменты...");
      await ensureAiReady();

      const prepared = await prepareInitialPart(preparedPages, file.name);
      const { chunks, metas, newCursor, isDone, overview } = prepared.chunks.length ? prepared : fallback;

      actions.setSourceCursor(newCursor);
      actions.setSourceDone(isDone);
      actions.setChunks(chunks);
      actions.setChunkMeta(metas);
      actions.setDocumentOverview(overview);

      const firstStudy = findNextStudyIndex(metas, -1);
      actions.setLastPauseIndex(firstStudy);
      actions.setCurrentIndex(0);

      actions.setBusyTitle("ИИ анализирует фрагмент");
      actions.setBusyText("Готовлю первую подсказку и конспект...");
      await analyzeTargetChunk(0, chunks, metas, firstStudy, overview);
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Не удалось загрузить материал.");
      actions.setAssistantStatus(message);
      if (!extractedTextLoaded) alert("Ошибка при загрузке: " + message);
    } finally {
      actions.setBusy(false);
      event.target.value = "";
    }
  };

  const prepareInitialPart = async (pages: string[], filename: string): Promise<PreparedDocument> => {
    const end = Math.min(pages.length, 30);
    const textPart = pages.slice(0, end).join("\n\n").trim();
    const data = await requestPreparedDocument(textPart, filename, 0, end, pages.length);

    return {
      ...data,
      newCursor: end,
      isDone: end >= pages.length,
    };
  };

  const requestPreparedDocument = async (textPart: string, filename: string, start: number, end: number, totalPages: number): Promise<PreparedDocument> => {
    const response = await fetchWithAuth(state.apiEndpoint.replace("/analyze", "/prepare"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: filename,
        provider: state.aiProvider,
        method: state.method,
        methodTitle: methodContent[state.method].title,
        text: textPart,
        offset: start,
        pageStart: start + 1,
        pageEnd: end,
        totalPages,
        partial: end < totalPages,
      }),
    });

    if (!response.ok) throw new Error("ИИ не смог подготовить документ");
    const data = await response.json() as PreparedApiResponse;
    const preparedChunks = (data.chunks || []).map((chunk) => ({
      text: String(chunk.text || "").trim(),
      meta: {
        type: chunk.type || "study",
        skippable: Boolean(chunk.skippable),
        reason: chunk.reason || "",
        title: chunk.title || "",
        summary: chunk.summary || "",
        pageStart: chunk.pageStart ?? null,
        pageEnd: chunk.pageEnd ?? null,
      } satisfies ChunkMeta,
    }));

    return {
      chunks: preparedChunks.map((chunk) => chunk.text),
      metas: preparedChunks.map((chunk) => chunk.meta),
      newCursor: end,
      isDone: end >= totalPages,
      overview: data.overview,
    };
  };

  const ensureAiReady = async () => {
    if (state.aiReady) return;
    const healthEndpoint = state.apiEndpoint.replace("/analyze", "/health") + `?provider=${encodeURIComponent(state.aiProvider)}`;
    const response = await fetchWithAuth(healthEndpoint);
    if (!response.ok) throw new Error("ИИ endpoint недоступен");

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "ИИ endpoint не подтвердил готовность.");

    actions.setAiReady(true);
    actions.setAssistantStatus("ИИ подключен и готов к обработке материала.");
  };

  const analyzeTargetChunk = async (index: number, chunks: string[], metas: ChunkMeta[], lastPause: number, overview: unknown) => {
    if (!chunks.length) return;
    if (metas[index]?.skippable) {
      actions.setAssistantStatus("ИИ уже обработал оглавление или введение на этапе подготовки документа.");
      return;
    }

    actions.setAssistantStatus("Анализирую текущий фрагмент...");
    actions.setIsAnalyzing(true);

    try {
      const segmentText = chunks.slice(Math.max(0, lastPause), index + 1).join("\n\n");
      const response = await fetchWithAuth(state.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: state.method,
          provider: state.aiProvider,
          methodTitle: methodContent[state.method].title,
          currentText: chunks[index],
          segmentText,
          documentOverview: overview,
          progress: {
            currentIndex: index,
            totalChunks: chunks.length,
          },
        }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json() as AnalysisApiResponse;
      const newAnalysis: AnalysisItem = {
        summary: String(data.summary || ""),
        attention: Array.isArray(data.attention) ? data.attention : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        question: String(data.question || ""),
        task: String(data.task || ""),
        note: String(data.note || ""),
        recommendation: String(data.recommendation || ""),
        quiz: Array.isArray(data.quiz) ? data.quiz : [],
        practicalTask: String(data.practicalTask || ""),
        chunkIndex: index,
        method: state.method,
        createdAt: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      };

      actions.setAiHistory((previous: AnalysisItem[]) => [
        newAnalysis,
        ...previous.filter((item) => !(item.chunkIndex === index && item.method === state.method)),
      ]);
      actions.setNotes((previous: NoteItem[]) => [{ chunkIndex: index, method: methodContent[state.method].title, text: newAnalysis.note }, ...previous]);
      actions.setAssistantStatus("Готово");
    } catch (error: unknown) {
      actions.setAssistantStatus(getErrorMessage(error, "Не удалось проанализировать фрагмент."));
    } finally {
      actions.setIsAnalyzing(false);
    }
  };

  const prepareMoreParts = async () => {
    if (state.sourceDone || state.preparingMore || !state.pages.length) return { newChunks: [], newMetas: [] as ChunkMeta[] };

    actions.setPreparingMore(true);
    try {
      const start = state.sourceCursor;
      const end = Math.min(state.pages.length, start + 30);
      const textPart = state.pages.slice(start, end).join("\n\n").trim();
      const data = await requestPreparedDocument(textPart, state.fileName, start, end, state.pages.length);

      actions.setChunks((previous: string[]) => [...previous, ...data.chunks]);
      actions.setChunkMeta((previous: ChunkMeta[]) => [...previous, ...data.metas]);
      actions.setSourceCursor(end);
      actions.setSourceDone(end >= state.pages.length);

      return { newChunks: data.chunks, newMetas: data.metas };
    } catch (error) {
      console.error("Background loading error:", error);
      return { newChunks: [], newMetas: [] as ChunkMeta[] };
    } finally {
      actions.setPreparingMore(false);
    }
  };

  useEffect(() => {
    setupPdfJs(getPdfJs());
  }, []);

  useEffect(() => {
    if (state.ttsAutoScroll && activeSentenceRef.current && readerTextRef.current) {
      activeSentenceRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [ttsCurrentTime, ttsTimecodes, state.ttsAutoScroll]);

  useEffect(() => {
    queueMicrotask(() => {
      setTtsAudioUrl(null);
      setTtsTimecodes([]);
      setTtsCurrentTime(0);
      setIsTtsLoading(false);
    });
  }, [state.currentIndex]);

  useEffect(() => () => {
    if (ttsAudioUrl && !ttsAudioUrl.startsWith("data:")) {
      URL.revokeObjectURL(ttsAudioUrl);
    }
  }, [ttsAudioUrl]);

  useEffect(() => {
    if (!state.sourceDone && !state.preparingMore && state.chunks.length > 0) {
      const threshold = Math.floor(state.chunks.length * 0.5);
      if (state.currentIndex >= threshold) {
        prepareMoreParts();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentIndex, state.chunks.length, state.sourceDone, state.preparingMore]);

  const findNextStudyIndex = (metas: ChunkMeta[], fromIndex: number) => {
    for (let index = fromIndex + 1; index < metas.length; index += 1) {
      if (metas[index]?.type === "study" || !metas[index]?.skippable) return index;
    }
    return 0;
  };

  const moveToIndex = async (nextIndex: number, chunks: string[], metas: ChunkMeta[], lastPause: number) => {
    actions.setCurrentIndex(nextIndex);
    await analyzeTargetChunk(nextIndex, chunks, metas, lastPause, state.documentOverview);
  };

  const completeReviewAndMove = async () => {
    const nextIndex = state.pendingNextIndex ?? state.currentIndex;
    actions.setLocked(false);
    actions.setPendingNextIndex(null);
    actions.setLastPauseIndex(nextIndex);
    await moveToIndex(nextIndex, state.chunks, state.chunkMeta, nextIndex);
  };

  const handleNext = async () => {
    if (state.busy) return;

    const nextIndex = state.currentIndex + 1;
    let currentChunks = state.chunks;
    let currentMetas = state.chunkMeta as ChunkMeta[];

    if (nextIndex >= currentChunks.length) {
      if (state.sourceDone) return;

      actions.setBusyTitle("Загрузка продолжения");
      actions.setBusyText("Пожалуйста, подождите, ИИ подготавливает следующую часть материала...");
      actions.setBusy(true);

      try {
        const { newChunks, newMetas } = await prepareMoreParts();
        currentChunks = [...currentChunks, ...newChunks];
        currentMetas = [...currentMetas, ...newMetas];
        if (nextIndex >= currentChunks.length) return;
      } finally {
        actions.setBusy(false);
      }
    }

    const currentMeta = currentMetas[state.currentIndex];
    const nextMeta = currentMetas[nextIndex];
    const shouldPause = !nextMeta?.skippable && !currentMeta?.skippable && (nextIndex - state.lastPauseIndex >= state.pauseEvery);

    if (shouldPause && !state.locked) {
      const segmentText = currentChunks.slice(Math.max(0, state.lastPauseIndex), state.currentIndex + 1).join("\n\n");
      const previousContext = currentChunks.slice(Math.max(0, state.lastPauseIndex - 4), state.lastPauseIndex).join("\n\n");
      const opened = await reviewGateRef.current?.openForSegment({
        currentText: currentChunks[state.currentIndex],
        segmentText,
        previousContext,
        currentIndex: state.currentIndex,
        totalChunks: currentChunks.length,
      });

      if (opened) {
        actions.setLocked(true);
        actions.setPendingNextIndex(nextIndex);
        return;
      }

      actions.setLastPauseIndex(nextIndex);
    }

    await moveToIndex(nextIndex, currentChunks, currentMetas, shouldPause ? nextIndex : state.lastPauseIndex);
  };

  const handlePrev = () => {
    if (state.busy || state.currentIndex === 0 || state.locked) return;
    actions.setCurrentIndex(state.currentIndex - 1);
  };

  const skipService = () => {
    const targetIndex = findNextStudyIndex(state.chunkMeta as ChunkMeta[], state.currentIndex);
    if (targetIndex === 0 && state.currentIndex !== 0) return;

    actions.setLocked(false);
    actions.setPendingNextIndex(null);
    actions.setCurrentIndex(targetIndex);
    actions.setLastPauseIndex(targetIndex);
    actions.setAssistantStatus("Служебный фрагмент пропущен.");
    analyzeTargetChunk(targetIndex, state.chunks, state.chunkMeta, targetIndex, state.documentOverview);
  };

  const handlePlayTts = async (text: string) => {
    if (!text || isTtsLoading) return;
    setIsTtsLoading(true);
    setTtsAudioUrl(null);
    setTtsTimecodes([]);
    setTtsCurrentTime(0);

    try {
      const response = await fetchWithAuth("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("TTS generation failed");
      const data = await response.json();
      setTtsAudioUrl(data.audio);
      setTtsTimecodes(data.timecodes || []);
    } catch (error) {
      console.error(error);
      alert("Не удалось сгенерировать озвучку. Убедитесь, что TTS сервис запущен.");
    } finally {
      setIsTtsLoading(false);
    }
  };

  const nextIndexPreview = state.currentIndex + 1;
  const isSkipCurrentPreview = state.chunkMeta[state.currentIndex]?.skippable;
  const isSkipNextPreview = state.chunkMeta[nextIndexPreview]?.skippable;
  const willPauseNext = questionsEnabled
    && nextIndexPreview < state.chunks.length
    && !isSkipNextPreview
    && !isSkipCurrentPreview
    && (nextIndexPreview - state.lastPauseIndex >= state.pauseEvery);

  if (!isAuthenticated) {
    return (
      <AuthScreen
        passwordInput={passwordInput}
        authError={authError}
        onPasswordChange={setPasswordInput}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <>
      {state.busy && <BusyOverlay title={state.busyTitle} text={state.busyText} />}

      <AppHeader
        method={state.method}
        busy={state.busy}
        onFileSelect={handleFileSelect}
        onMethodChange={(method: MethodType) => actions.setMethod(method)}
      />

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr_340px] gap-5 p-4 h-[calc(100vh-73px)] overflow-hidden">
        <SourcePanel
          fileName={state.fileName}
          pdfUrl={state.pdfUrl}
          chunksLoaded={state.chunks.length}
          totalPages={state.totalPages}
          currentMeta={state.chunkMeta[state.currentIndex]}
          sourceDone={state.sourceDone}
          preparingMore={state.preparingMore}
          method={state.method}
        />

        <ReaderPanel
          fileName={state.fileName}
          chunks={state.chunks}
          chunkMeta={state.chunkMeta}
          currentIndex={state.currentIndex}
          busy={state.busy}
          isAnalyzing={state.isAnalyzing}
          locked={state.locked}
          sourceDone={state.sourceDone}
          preparingMore={state.preparingMore}
          assistantStatus={state.assistantStatus}
          willPauseNext={willPauseNext}
          ttsAudioUrl={ttsAudioUrl}
          ttsTimecodes={ttsTimecodes}
          ttsCurrentTime={ttsCurrentTime}
          ttsHighlight={state.ttsHighlight}
          isTtsLoading={isTtsLoading}
          audioRef={audioRef}
          activeSentenceRef={activeSentenceRef}
          readerTextRef={readerTextRef}
          onPrev={handlePrev}
          onNext={handleNext}
          onSkipService={skipService}
          onPlayTts={handlePlayTts}
          onTtsTimeUpdate={setTtsCurrentTime}
          reviewSlot={
            <ReviewGate
              ref={reviewGateRef}
              enabled={questionsEnabled}
              method={state.method}
              provider={state.aiProvider}
              apiEndpoint={state.apiEndpoint}
              fetchWithAuth={fetchWithAuth}
              contextText={state.chunks[state.currentIndex] || ""}
              onComplete={completeReviewAndMove}
            />
          }
        />

        <AssistantPanel
          assistantStatus={state.assistantStatus}
          aiHistory={state.aiHistory}
          notes={state.notes}
          ttsHighlight={state.ttsHighlight}
          ttsAutoScroll={state.ttsAutoScroll}
          questionsEnabled={questionsEnabled}
          apiEndpoint={state.apiEndpoint}
          aiProvider={state.aiProvider}
          onTtsHighlightChange={actions.setTtsHighlight}
          onTtsAutoScrollChange={actions.setTtsAutoScroll}
          onQuestionsEnabledChange={setQuestionsEnabled}
          onApiEndpointChange={actions.setApiEndpoint}
          onAiProviderChange={actions.setAiProvider}
        />
      </main>
    </>
  );
}
