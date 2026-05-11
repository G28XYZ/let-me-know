"use client";

import { useReaderState, methodContent, MethodType } from "../hooks/useReaderState";
import { paginateText, getChunkPageRange, extractKeywords, escapeHtml, escapeRegExp } from "../lib/utils";
import { useEffect, useRef, useState, FormEvent } from "react";

export default function Home() {
  const { state, actions } = useReaderState();
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);
  const readerTextRef = useRef<HTMLElement>(null);
  
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizFeedback, setQuizFeedback] = useState<{ hasErrors: boolean; showHint: boolean } | null>(null);

  const [answerText, setAnswerText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateFeedback, setEvaluateFeedback] = useState<{isCorrect: boolean, feedback: string, showHint: boolean} | null>(null);

  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsTimecodes, setTtsTimecodes] = useState<any[]>([]);
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeSentenceRef = useRef<HTMLSpanElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const auth = localStorage.getItem("auth_token");
    if (auth) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const authEndpoint = state.apiEndpoint.replace("/analyze", "/auth");
      const res = await fetch(authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem("auth_token", passwordInput);
      } else {
        setAuthError("Неверный пароль");
      }
    } catch (e) {
      setAuthError("Ошибка сети или сервер недоступен");
    }
  };

  // Auto-scroll logic when spoken sentence changes
  useEffect(() => {
    if (state.ttsAutoScroll && activeSentenceRef.current && readerTextRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [ttsCurrentTime, ttsTimecodes, state.ttsAutoScroll]);

  const fetchWithAuth = async (url: string, options: any = {}) => {
    const token = localStorage.getItem("auth_token");
    const headers = { ...options.headers };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  };

  // Expose global pdfjsLib if not already in types
  const getPdfJs = () => (window as any).pdfjsLib;

  useEffect(() => {
    const pdfjsLib = getPdfJs();
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }, []);

  useEffect(() => {
    if (ttsAudioUrl && !ttsAudioUrl.startsWith('data:')) {
      URL.revokeObjectURL(ttsAudioUrl);
    }
    setTtsAudioUrl(null);
    setTtsTimecodes([]);
    setTtsCurrentTime(0);
    setIsTtsLoading(false);
  }, [state.currentIndex]);

  const handlePlayTts = async (text: string) => {
    if (!text || isTtsLoading) return;
    setIsTtsLoading(true);
    setTtsAudioUrl(null);
    setTtsTimecodes([]);
    setTtsCurrentTime(0);

    try {
      const response = await fetchWithAuth("http://192.168.0.250:8000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error("TTS generation failed");
      
      const data = await response.json();
      setTtsAudioUrl(data.audio);
      setTtsTimecodes(data.timecodes || []);
    } catch (e) {
      console.error(e);
      alert("Не удалось сгенерировать озвучку. Убедитесь, что TTS сервис запущен.");
    } finally {
      setIsTtsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    actions.setLockMinimized(false);
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
    
    actions.setBusyTitle("Подготовка материала");
    actions.setBusyText("Извлекаю текст из файла...");
    actions.setBusy(true);

    try {
      await ensureAiReady();

      let pagesArray: string[] = [];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const url = URL.createObjectURL(file);
        actions.setPdfUrl(url);
        
        const pdfjsLib = getPdfJs();
        if (!pdfjsLib) {
          throw new Error("PDF.js не загрузился. PDF будет виден как референс, но текст не извлечен.");
        }
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          let pageText = content.items.map((item: any) => item.str).join(" ");
          pagesArray.push(`Страница ${pageNumber}\n${pageText}`);
        }
      } else {
        let text = await file.text();
        const normalized = text
          .replace(/\r/g, "")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        pagesArray = paginateText(normalized).map((pageText, index) => `Страница ${index + 1}\n${pageText}`);
      }

      const preparedPages = pagesArray.map((page, index) => {
        const text = String(page || "").trim();
        return /^Страница\s+\d+/i.test(text) ? text : `Страница ${index + 1}\n${text}`;
      });
      
      actions.setPages(preparedPages);
      actions.setTotalPages(preparedPages.length);
      actions.setText(preparedPages.join("\n\n"));
      
      // Since states are batched, we need to pass the initial source values manually to the next step
      // For simplicity, we just use a small functional approach inside the component.
      
      actions.setBusyTitle("ИИ готовит начало документа");
      actions.setBusyText("Загружаю первую часть, разбиваю ее на фрагменты и анализирую вводные разделы...");
      
      // Simulate `prepareNextDocumentPart` with current variables
      const { chunks, metas, newCursor, isDone, overview } = await prepareInitialPart(preparedPages, file.name);
      
      actions.setSourceCursor(newCursor);
      actions.setSourceDone(isDone);
      actions.setChunks(chunks);
      actions.setChunkMeta(metas);
      actions.setDocumentOverview(overview);
      
      let firstStudy = 0;
      for (let i = 0; i < metas.length; i++) {
        if (metas[i].type === "study" || !metas[i].skippable) {
          firstStudy = i;
          break;
        }
      }
      actions.setLastPauseIndex(firstStudy);
      actions.setCurrentIndex(0);

      actions.setBusyTitle("ИИ анализирует фрагмент");
      actions.setBusyText("Готовлю первую подсказку и конспект...");
      await analyzeTargetChunk(0, chunks, metas, file.name, firstStudy, overview);

    } catch (error: any) {
      actions.setAssistantStatus(error.message || "Не удалось загрузить материал.");
    } finally {
      actions.setBusy(false);
    }
  };

  const prepareInitialPart = async (pages: string[], filename: string) => {
    const end = Math.min(pages.length, 30);
    const textPart = pages.slice(0, end).join("\n\n").trim();
    
    const response = await fetchWithAuth(state.apiEndpoint.replace("/analyze", "/prepare"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: filename,
        provider: state.aiProvider,
        method: state.method,
        methodTitle: methodContent[state.method].title,
        text: textPart,
        offset: 0,
        pageStart: 1,
        pageEnd: end,
        totalPages: pages.length,
        partial: end < pages.length,
      })
    });
    
    if (!response.ok) throw new Error("ИИ не смог подготовить документ");
    const data = await response.json();
    
    const preparedChunks = (data.chunks || []).map((chunk: any) => ({
      text: String(chunk.text || "").trim(),
      meta: {
        type: chunk.type || "study",
        skippable: Boolean(chunk.skippable),
        reason: chunk.reason || "",
        title: chunk.title || "",
        summary: chunk.summary || "",
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
      }
    }));
    
    return {
      chunks: preparedChunks.map((c: any) => c.text),
      metas: preparedChunks.map((c: any) => c.meta),
      newCursor: end,
      isDone: end >= pages.length,
      overview: data.overview
    };
  };

  const analyzeTargetChunk = async (index: number, chunks: string[], metas: any[], filename: string, lastPause: number, overview: any) => {
    if (!chunks.length) return;
    if (metas[index]?.skippable) {
      actions.setAssistantStatus("ИИ уже обработал оглавление или введение на этапе подготовки документа.");
      return;
    }
    
    actions.setAssistantStatus("Анализирую текущий фрагмент...");
    actions.setIsAnalyzing(true);

    try {
      const segmentText = chunks.slice(Math.max(0, lastPause), index + 1).join("\n\n");
      const response = await fetchWithAuth(state.apiEndpoint, {        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: state.method,
          provider: state.aiProvider,
          methodTitle: methodContent[state.method].title,
          currentText: chunks[index],
          segmentText: segmentText,
          progress: {
            currentIndex: index,
            totalChunks: chunks.length,
          }
        })
      });
      
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      
      const newAnalysis = {
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
      
      actions.setAiHistory((prev) => [newAnalysis, ...prev.filter(item => !(item.chunkIndex === index && item.method === state.method))]);
      actions.setNotes((prev) => [{ chunkIndex: index, method: methodContent[state.method].title, text: newAnalysis.note }, ...prev]);
      actions.setAssistantStatus("Готово");
    } catch (e: any) {
      actions.setAssistantStatus(e.message);
    } finally {
      actions.setIsAnalyzing(false);
    }
  };

  const ensureAiReady = async () => {
    if (state.aiReady) return;
    const healthEndpoint = state.apiEndpoint.replace("/analyze", "/health") + `?provider=${encodeURIComponent(state.aiProvider)}`;
    const res = await fetchWithAuth(healthEndpoint);
    if (!res.ok) throw new Error("ИИ endpoint недоступен");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "ИИ endpoint не подтвердил готовность.");
    actions.setAiReady(true);
    actions.setAssistantStatus("ИИ подключен и готов к обработке материала.");
  };

  const prepareMoreParts = async () => {
    if (state.sourceDone || state.preparingMore || !state.pages.length) return { newChunks: [], newMetas: [] };
    
    actions.setPreparingMore(true);
    try {
      const start = state.sourceCursor;
      const end = Math.min(state.pages.length, start + 30);
      const textPart = state.pages.slice(start, end).join("\n\n").trim();
      
      const response = await fetchWithAuth(state.apiEndpoint.replace("/analyze", "/prepare"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: state.fileName,
          provider: state.aiProvider,
          method: state.method,
          methodTitle: methodContent[state.method].title,
          text: textPart,
          offset: start,
          pageStart: start + 1,
          pageEnd: end,
          totalPages: state.pages.length,
          partial: end < state.pages.length,
        })
      });
      
      if (!response.ok) throw new Error("ИИ не смог подготовить дополнительную часть документа");
      const data = await response.json();
      
      const newChunks = (data.chunks || []).map((chunk: any) => String(chunk.text || "").trim());
      const newMetas = (data.chunks || []).map((chunk: any) => ({
        text: String(chunk.text || "").trim(), // Keep original text in meta if needed, but standardizing
        type: chunk.type || "study",
        skippable: Boolean(chunk.skippable),
        reason: chunk.reason || "",
        title: chunk.title || "",
        summary: chunk.summary || "",
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
      }));
      
      actions.setChunks((prev) => [...prev, ...newChunks]);
      actions.setChunkMeta((prev) => [...prev, ...newMetas]);
      actions.setSourceCursor(end);
      actions.setSourceDone(end >= state.pages.length);
      
      return { newChunks, newMetas };
    } catch (e: any) {
      console.error("Background loading error:", e);
      return { newChunks: [], newMetas: [] };
    } finally {
      actions.setPreparingMore(false);
    }
  };

  // Background pre-fetching logic
  useEffect(() => {
    if (!state.sourceDone && !state.preparingMore && state.chunks.length > 0) {
      const threshold = Math.floor(state.chunks.length * 0.5);
      if (state.currentIndex >= threshold) {
        prepareMoreParts();
      }
    }
  }, [state.currentIndex, state.chunks.length, state.sourceDone, state.preparingMore]);

  const handleNext = async () => {
    if (state.busy) return;
    
    let nextIndex = state.currentIndex + 1;
    let currentChunks = state.chunks;
    let currentMetas = state.chunkMeta;
    
    // If we reached the end of currently loaded chunks but more are available in the source
    if (nextIndex >= currentChunks.length) {
      if (state.sourceDone) return;
      
      // Wait for background loading or trigger it if not already running
      actions.setBusyTitle("Загрузка продолжения");
      actions.setBusyText("Пожалуйста, подождите, ИИ подготавливает следующую часть материала...");
      actions.setBusy(true);
      
      try {
        const { newChunks, newMetas } = await prepareMoreParts();
        currentChunks = [...currentChunks, ...newChunks];
        currentMetas = [...currentMetas, ...newMetas];
        
        // After loading, check if we have new chunks
        if (nextIndex < currentChunks.length) {
          // Continue to processing
        } else {
          // If still no new chunks (e.g. error or empty response), stay here
          return;
        }
      } catch (e) {
        return;
      } finally {
        actions.setBusy(false);
      }
    }
    
    // Check lock
    const currentMeta = currentMetas[state.currentIndex];
    const nextMeta = currentMetas[nextIndex];
    const isSkipCurrent = currentMeta?.skippable;
    const isSkipNext = nextMeta?.skippable;
    const shouldPause = !isSkipNext && !isSkipCurrent && (nextIndex - state.lastPauseIndex >= state.pauseEvery);
    
    if (shouldPause && !state.locked) {
      const currentHistory = state.aiHistory.find(h => h.chunkIndex === state.currentIndex && h.method === state.method);
      let step: "quiz" | "practical" | "summary" | "none" = "summary";
      if (currentHistory?.quiz?.length > 0) {
        step = "quiz";
      } else if (currentHistory?.practicalTask) {
        step = "practical";
      }

      actions.setLocked(true);
      actions.setLockStep(step);
      actions.setPendingNextIndex(nextIndex);
      return;
    }
    
    actions.setCurrentIndex(nextIndex);
    await analyzeTargetChunk(nextIndex, currentChunks, currentMetas, state.fileName, state.lastPauseIndex, state.documentOverview);
  };

  const handlePrev = () => {
    if (state.busy || state.currentIndex === 0 || state.locked) return;
    actions.setCurrentIndex(state.currentIndex - 1);
  };

  const skipService = () => {
    let targetIndex = -1;
    for (let i = state.currentIndex + 1; i < state.chunks.length; i++) {
      if (state.chunkMeta[i]?.type === "study" || !state.chunkMeta[i]?.skippable) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex !== -1) {
      actions.setLocked(false);
      actions.setPendingNextIndex(null);
      actions.setCurrentIndex(targetIndex);
      actions.setLastPauseIndex(targetIndex);
      actions.setAssistantStatus("Служебный фрагмент пропущен.");
      analyzeTargetChunk(targetIndex, state.chunks, state.chunkMeta, state.fileName, targetIndex, state.documentOverview);
    }
  };

  const checkAnswer = () => {
    setQuizAnswers({});
    setQuizFeedback(null);
    setAnswerText("");
    setEvaluateFeedback(null);

    const currentHistory = state.aiHistory.find(h => h.chunkIndex === state.currentIndex && h.method === state.method);
    
    if (state.lockStep === "quiz") {
      if (currentHistory?.practicalTask) {
        actions.setLockStep("practical");
      } else {
        actions.setLockStep("summary");
      }
      return;
    }
    
    if (state.lockStep === "practical") {
      actions.setLockStep("summary");
      return;
    }

    // simplified logic for checking answers to unlock
    actions.setLocked(false);
    actions.setLockMinimized(false);
    actions.setLockStep("none");
    actions.setLastPauseIndex(state.pendingNextIndex ?? state.currentIndex);
    if (state.pendingNextIndex !== null) {
      actions.setCurrentIndex(state.pendingNextIndex);
      analyzeTargetChunk(state.pendingNextIndex, state.chunks, state.chunkMeta, state.fileName, state.pendingNextIndex, state.documentOverview);
    }
    actions.setPendingNextIndex(null);
  };

  const handleTextSubmit = async () => {
    if (!answerText.trim() || evaluating) return;

    const currentHistory = state.aiHistory.find(h => h.chunkIndex === state.currentIndex && h.method === state.method);
    const question = state.lockStep === "practical" ? currentHistory?.practicalTask : (currentHistory?.question || methodContent[state.method].task);

    setEvaluating(true);
    setEvaluateFeedback(null);

    try {
      const response = await fetchWithAuth(state.apiEndpoint.replace("/analyze", "/evaluate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: state.aiProvider,
          question: question,
          answer: answerText,
          contextText: state.chunks[state.currentIndex]
        })
      });

      if (!response.ok) throw new Error("Evaluation error");
      const data = await response.json();
      setEvaluateFeedback({ ...data, showHint: false });
    } catch (e) {
      setEvaluateFeedback({ isCorrect: false, feedback: "Произошла ошибка при проверке ответа.", showHint: true });
    } finally {
      setEvaluating(false);
    }
  };

  const handleQuizSubmit = () => {
    const currentHistory = state.aiHistory.find(h => h.chunkIndex === state.currentIndex && h.method === state.method);
    const quiz = currentHistory?.quiz || [];
    
    let hasErrors = false;
    for (let i = 0; i < quiz.length; i++) {
      if (quizAnswers[i] !== quiz[i].correctAnswer) {
        hasErrors = true;
        break;
      }
    }

    if (hasErrors) {
      setQuizFeedback({ hasErrors: true, showHint: false });
    } else {
      checkAnswer();
    }
  };

  const renderLockBox = () => {
    if (!state.locked) return null;

    if (state.lockMinimized) {
      return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button 
            onClick={() => actions.setLockMinimized(false)}
            className="flex items-center gap-2 px-6 py-3 bg-warning text-white font-bold rounded-full shadow-lg hover:bg-warning-strong transition-all animate-bounce"
          >
            <span>📝</span>
            <span>Вернуться к заданию</span>
          </button>
        </div>
      );
    }

    const currentHistory = state.aiHistory.find(h => h.chunkIndex === state.currentIndex && h.method === state.method);

    const commonHeader = (title: string, subtitle: string) => (
      <div className="flex items-start justify-between">
        <div>
          <p className="text-accent text-xs font-bold uppercase tracking-wide">{title}</p>
          <h3 className="text-lg font-bold mt-1">{subtitle}</h3>
        </div>
        <button 
          onClick={() => actions.setLockMinimized(true)}
          className="p-1 hover:bg-black/5 rounded transition-colors"
          title="Свернуть задание, чтобы перечитать текст"
        >
          <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );

    if (state.lockStep === "quiz") {
      const quiz = currentHistory?.quiz || [];
      return (
        <div className="flex flex-col gap-3 p-4 border-t border-line bg-warning-soft">
          {commonHeader("Пауза повторения: Тест", "Проверьте свои знания")}
          {quizFeedback?.hasErrors && !quizFeedback.showHint && (
            <p className="text-danger text-sm font-bold mt-2">Есть ошибки. Попробуйте еще раз или воспользуйтесь подсказкой.</p>
          )}
          <div className="flex flex-col gap-4">
            {quiz.map((q: any, i: number) => {
              const isWrong = quizFeedback?.hasErrors && quizAnswers[i] !== q.correctAnswer;
              const showCorrect = quizFeedback?.showHint;

              return (
                <div key={i} className="text-sm">
                  <p className="font-bold mb-2">{q.question}</p>
                  <div className="flex flex-col gap-1">
                    {q.options.map((opt: string, j: number) => {
                      let labelClass = "flex items-center gap-2 cursor-pointer p-2 border border-line rounded bg-surface hover:border-accent transition-colors";
                      
                      if (quizAnswers[i] === opt) {
                        labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-accent bg-accent-soft";
                      }
                      
                      if (isWrong && quizAnswers[i] === opt) {
                        labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-danger bg-danger/10";
                      }

                      if (showCorrect && q.correctAnswer === opt) {
                        labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-accent bg-accent/20 font-bold";
                      }

                      return (
                        <label key={j} className={labelClass}>
                          <input 
                            type="radio" 
                            name={`q-${i}`} 
                            value={opt} 
                            checked={quizAnswers[i] === opt}
                            onChange={() => setQuizAnswers(prev => ({ ...prev, [i]: opt }))}
                            className="accent-accent" 
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleQuizSubmit} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm">Далее</button>
            {quizFeedback?.hasErrors && !quizFeedback.showHint && (
              <button 
                onClick={() => setQuizFeedback({ hasErrors: true, showHint: true })} 
                className="px-4 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors"
              >
                Подсказка
              </button>
            )}
          </div>
        </div>
      );
    }

    if (state.lockStep === "practical") {
      return (
        <div className="flex flex-col gap-3 p-4 border-t border-line bg-warning-soft">
          {commonHeader("Пауза повторения: Практика", "Практическое задание")}
          <p className="text-sm mt-1">{currentHistory?.practicalTask}</p>
          {evaluateFeedback && (
            <div className={`mt-2 p-3 text-sm rounded-lg ${evaluateFeedback.isCorrect ? 'bg-accent-soft border border-accent text-accent-strong' : 'bg-danger/10 border border-danger text-danger'}`}>
              <strong>{evaluateFeedback.isCorrect ? "Отлично!" : "Попробуйте еще раз:"}</strong>
              {evaluateFeedback.showHint && <p className="mt-1">{evaluateFeedback.feedback}</p>}
            </div>
          )}
          <textarea 
            className="w-full p-3 border border-line rounded-lg text-sm min-h-[100px]" 
            placeholder="Опишите ваше решение..."
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            disabled={evaluating || evaluateFeedback?.isCorrect}
          ></textarea>
          <div className="flex gap-2 mt-2">
            {!evaluateFeedback?.isCorrect ? (
              <>
                <button 
                  onClick={handleTextSubmit} 
                  disabled={evaluating || !answerText.trim()} 
                  className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {evaluating ? "Проверка..." : "Проверить"}
                </button>
                {evaluateFeedback && !evaluateFeedback.showHint && (
                  <button 
                    onClick={() => setEvaluateFeedback({ ...evaluateFeedback, showHint: true })} 
                    className="px-4 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors"
                  >
                    Подсказка
                  </button>
                )}
              </>
            ) : (
              <button onClick={checkAnswer} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm">Далее</button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-4 border-t border-line bg-warning-soft">
        {commonHeader("Пауза повторения: Закрепление", "Ответьте на вопрос")}
        <p className="text-sm mt-1">{currentHistory?.question || methodContent[state.method].task}</p>
        {evaluateFeedback && (
          <div className={`mt-2 p-3 text-sm rounded-lg ${evaluateFeedback.isCorrect ? 'bg-accent-soft border border-accent text-accent-strong' : 'bg-danger/10 border border-danger text-danger'}`}>
            <strong>{evaluateFeedback.isCorrect ? "Отлично!" : "Попробуйте еще раз:"}</strong>
            {evaluateFeedback.showHint && <p className="mt-1">{evaluateFeedback.feedback}</p>}
          </div>
        )}
        <textarea 
          className="w-full p-3 border border-line rounded-lg text-sm min-h-[100px]" 
          placeholder="Введите ответ своими словами"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          disabled={evaluating || evaluateFeedback?.isCorrect}
        ></textarea>
        <div className="flex gap-2 mt-2">
          {!evaluateFeedback?.isCorrect ? (
            <>
              <button 
                onClick={handleTextSubmit} 
                disabled={evaluating || !answerText.trim()} 
                className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {evaluating ? "Проверка..." : "Проверить"}
              </button>
              {evaluateFeedback && !evaluateFeedback.showHint && (
                <button 
                  onClick={() => setEvaluateFeedback({ ...evaluateFeedback, showHint: true })} 
                  className="px-4 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors"
                >
                  Подсказка
                </button>
              )}
            </>
          ) : (
            <button onClick={checkAnswer} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm">Продолжить чтение</button>
          )}
        </div>
      </div>
    );
  };

  const renderChunk = () => {
    const chunk = state.chunks[state.currentIndex];
    const meta = state.chunkMeta[state.currentIndex];
    if (!chunk) return <p>Загрузите `.txt` или `.pdf`, выберите метод изучения и начните чтение.</p>;
    
    const wordCount = chunk.trim().split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Determine current sentence index if timecodes are available
    let activeIdx = -1;
    if (ttsTimecodes.length > 0 && ttsAudioUrl) {
      activeIdx = ttsTimecodes.findIndex(tc => ttsCurrentTime >= tc.start && ttsCurrentTime <= tc.end);
    }

    const renderContent = () => {
      // If we have timecodes, we render segments to allow precision highlighting and scrolling
      if (ttsTimecodes.length > 0 && ttsAudioUrl) {
        return (
          <div className="text-lg leading-relaxed">
            {ttsTimecodes.map((tc, idx) => (
              <span 
                key={idx} 
                ref={idx === activeIdx ? activeSentenceRef : null}
                className={`transition-colors duration-300 ${state.ttsHighlight && idx === activeIdx ? 'bg-accent/20 border-b-2 border-accent' : ''}`}
              >
                {tc.text}{' '}
              </span>
            ))}
          </div>
        );
      }

      // Default: render paragraphs with escapeHtml
      const html = escapeHtml(chunk);
      return (
        <div className="text-lg leading-relaxed">
          {html.split(/\n{2,}/).map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\n/g, "<br>") }} className="mb-4" />
          ))}
        </div>
      );
    };

    return (
      <section className={`m-4 border rounded-lg relative ${meta.skippable ? 'bg-surface-strong' : 'border-accent bg-[#fbfdfb]'}`}>
        <header className={`sticky top-0 z-10 p-4 border-b text-muted text-sm backdrop-blur-md rounded-t-lg ${meta.skippable ? 'bg-surface-strong/95 border-line' : 'bg-[#fbfdfb]/95 border-accent/20'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span>Фрагмент {state.currentIndex + 1}</span>
            {meta.pageStart && meta.pageEnd && <span>• Стр. {meta.pageStart}-{meta.pageEnd}</span>}
            <span>• ~{readingTime} мин</span>
            {meta.skippable && <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-strong text-xs font-bold">служебный</span>}
          </div>
          <div className="flex items-start justify-between gap-4 mt-1">
            <div>
              <h3 className="text-lg text-text">{meta.title || `Фрагмент ${state.currentIndex + 1}`}</h3>
              {meta.summary && <p className="mt-1 text-sm">{meta.summary}</p>}
            </div>
            <button 
              onClick={() => handlePlayTts(chunk)} 
              disabled={isTtsLoading}
              className="flex-shrink-0 flex items-center justify-center p-2 border border-line rounded bg-surface hover:border-accent disabled:opacity-50 transition-colors"
              title="Озвучить фрагмент"
            >
              {isTtsLoading ? (
                <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
              onTimeUpdate={(e) => setTtsCurrentTime(e.currentTarget.currentTime)}
            />
          )}
        </header>
        <div className="p-4">
          {renderContent()}
        </div>
      </section>
    );
  };

  const nextIndexPreview = state.currentIndex + 1;
  const isSkipCurrentPreview = state.chunkMeta[state.currentIndex]?.skippable;
  const isSkipNextPreview = state.chunkMeta[nextIndexPreview]?.skippable;
  const willPauseNext = nextIndexPreview < state.chunks.length && !isSkipNextPreview && !isSkipCurrentPreview && (nextIndexPreview - state.lastPauseIndex >= state.pauseEvery);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f7f3]">
        <div className="p-8 bg-surface border border-line rounded-lg shadow-xl text-center w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6 text-text">Learn Helper</h1>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input 
              type="password" 
              placeholder="Введите пароль" 
              className="p-3 border border-line rounded-lg text-text"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
            />
            {authError && <p className="text-danger text-sm">{authError}</p>}
            <button type="submit" className="px-4 py-3 bg-accent text-white font-bold rounded-lg hover:bg-accent-strong transition-colors">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {state.busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f6f7f3]/70 backdrop-blur-sm p-6">
          <div className="w-full max-w-md p-6 bg-surface border border-line rounded-lg shadow-xl text-center">
            <div className="spinner"></div>
            <strong className="block text-lg">{state.busyTitle}</strong>
            <p className="mt-2 text-muted">{state.busyText}</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-line bg-[#f6f7f3]/90 backdrop-blur-md">
        <div>
          <p className="text-accent text-xs font-extrabold uppercase tracking-wide mb-1">MVP</p>
          <h1 className="text-2xl font-bold m-0">Learn Helper</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex items-center justify-center h-10 px-4 border border-line rounded-lg bg-surface cursor-pointer hover:border-accent">
            <input type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={handleFileSelect} disabled={state.busy} />
            Загрузить файл
          </label>
          <select 
            className="h-10 px-3 border border-line rounded-lg bg-surface"
            value={state.method}
            onChange={(e) => actions.setMethod(e.target.value as MethodType)}
            disabled={state.busy}
          >
            <option value="sq3r">SQ3R</option>
            <option value="notes">Конспектирование</option>
            <option value="feynman">Метод Фейнмана</option>
          </select>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr_340px] gap-5 p-4 h-[calc(100vh-73px)] overflow-hidden">
        
        {/* Source Panel */}
        <aside className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
            <h2 className="text-base font-bold mb-2">Материал</h2>
            <div className="text-sm text-muted">
              {state.fileName ? (
                <>
                  <strong>{state.fileName}</strong>
                  <br/>
                  <span>{state.chunks.length} фрагментов загружено</span>
                  {!state.sourceDone && (
                    <span className="block mt-1 text-accent animate-pulse">
                      {state.preparingMore ? "• ИИ готовит продолжение..." : "• Частичная загрузка"}
                    </span>
                  )}
                  {state.sourceDone && state.fileName && <span className="block mt-1 text-success">✓ Загружен полностью</span>}
                </>
              ) : "Файл еще не загружен"}
            </div>
            <div className="overflow-hidden h-2 mt-4 rounded-full bg-surface-strong">
              <div className="h-full bg-accent transition-all duration-200" style={{ width: `${state.totalPages ? Math.round(((state.chunkMeta[state.currentIndex]?.pageEnd || 0) / state.totalPages) * 100) : 0}%` }}></div>
            </div>
            <p className="text-xs text-muted mt-2">{state.totalPages ? `${Math.round(((state.chunkMeta[state.currentIndex]?.pageEnd || 0) / state.totalPages) * 100)}% прочитано` : '0%'}</p>
          </section>

          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
            <h2 className="text-base font-bold mb-2">Метод</h2>
            <div className="text-sm text-muted">
              <strong>{methodContent[state.method].title}</strong>
              <ul className="list-disc pl-5 mt-2">
                {methodContent[state.method].guide.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          </section>

          {state.pdfUrl && (
            <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
              <h2 className="text-base font-bold mb-2">PDF-референс</h2>
              <iframe src={state.pdfUrl} className="w-full h-64 border border-line rounded-lg bg-surface-strong"></iframe>
            </section>
          )}
        </aside>

        {/* Reader Panel */}
        <section className="flex flex-col border border-line rounded-lg bg-surface shadow-sm min-h-0">
          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-4 p-4 border-b border-line">
            <button onClick={handlePrev} disabled={state.busy || state.isAnalyzing || state.currentIndex === 0 || state.locked || state.chunks.length === 0} className="h-11 flex items-center justify-center border border-line rounded-lg hover:border-accent disabled:opacity-50">←</button>
            <div>
              <p className="text-sm text-muted">
                {state.chunks.length > 0 ? `Фрагмент ${state.currentIndex + 1} из ${state.chunks.length}` : "Фрагмент 0 из 0"}
                {state.preparingMore && <span className="ml-2 text-accent animate-pulse">...</span>}
              </p>
              <h2 className="text-base font-bold">{state.fileName || "Загрузите материал"}</h2>
            </div>
            <button 
              onClick={handleNext} 
              disabled={state.busy || state.isAnalyzing || (state.currentIndex >= state.chunks.length - 1 && state.sourceDone) || state.locked || state.chunks.length === 0} 
              className={`h-11 flex items-center justify-center border rounded-lg disabled:opacity-50 transition-colors ${willPauseNext ? 'bg-warning-soft border-warning text-warning hover:bg-warning hover:text-white hover:border-warning' : 'border-line hover:border-accent'}`}
              title={willPauseNext ? "Впереди вопрос или задание на закрепление" : (state.currentIndex >= state.chunks.length - 1 && !state.sourceDone ? "Загрузить продолжение" : "Следующий фрагмент")}
            >
              {state.isAnalyzing ? (
                <svg className="animate-spin h-5 w-5 opacity-70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : "→"}
            </button>
          </div>
          
          {state.chunkMeta[state.currentIndex]?.skippable && !state.locked && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 border-b border-line bg-accent-soft">
              <div>
                <strong className="text-sm">{state.chunkMeta[state.currentIndex].type === "toc" ? "Оглавление" : "Введение"}</strong>
                <p className="text-xs text-muted mt-1">{state.chunkMeta[state.currentIndex].reason}</p>
              </div>
              <button onClick={skipService} disabled={state.busy || state.isAnalyzing} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm disabled:opacity-50">Пропустить</button>
            </div>
          )}

          <article ref={readerTextRef} className="flex-1 overflow-y-auto text-lg leading-relaxed">
            {renderChunk()}
          </article>

          {renderLockBox()}
        </section>

        {/* Assistant Panel */}
        <aside className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold">AI-помощник</h2>
            </div>
            <div className="text-sm text-muted mb-3">{state.assistantStatus}</div>
            <div className="flex flex-col gap-3">
              {state.aiHistory.length === 0 ? (
                <p className="text-sm text-muted">После загрузки материала здесь появятся подсказки, вопросы и задания.</p>
              ) : (
                state.aiHistory.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="pb-3 border-b border-line last:border-0 text-sm">
                    <h3 className="font-bold mb-1">{item.method} · {item.createdAt}</h3>
                    <p className="mb-1"><strong>Резюме:</strong> {item.summary}</p>
                    <p className="mb-1"><strong>Вопрос:</strong> {item.question}</p>
                    <p><strong>Рекомендация:</strong> {item.recommendation}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm">
            <h2 className="text-base font-bold mb-3">Конспект</h2>
            <div className="flex flex-col gap-3">
              {state.notes.length === 0 ? (
                <p className="text-sm text-muted">Конспект появится по мере чтения.</p>
              ) : (
                state.notes.slice(0, 5).map((note, idx) => (
                  <div key={idx} className="pb-3 border-b border-line last:border-0 text-sm">
                    <strong className="block mb-1">{note.method} · фрагмент {note.chunkIndex + 1}</strong>
                    <p>{note.text}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm text-sm">
            <details open>
              <summary className="font-bold cursor-pointer">Настройки чтения</summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-muted select-none">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 accent-accent" 
                    checked={state.ttsHighlight} 
                    onChange={(e) => actions.setTtsHighlight(e.target.checked)} 
                  />
                  <span>Подсветка при озвучке</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-muted select-none">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 accent-accent" 
                    checked={state.ttsAutoScroll} 
                    onChange={(e) => actions.setTtsAutoScroll(e.target.checked)} 
                  />
                  <span>Автоскролл к тексту</span>
                </label>
              </div>
            </details>
          </section>

          <section className="p-4 border border-line rounded-lg bg-surface shadow-sm text-sm">
            <details>
              <summary className="font-bold cursor-pointer">Настройки API</summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-muted">
                  Backend endpoint
                  <input type="text" className="p-2 border border-line rounded-lg text-text" value={state.apiEndpoint} onChange={e => actions.setApiEndpoint(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-muted">
                  AI provider
                  <select className="p-2 border border-line rounded-lg text-text" value={state.aiProvider} onChange={e => actions.setAiProvider(e.target.value)}>
                    <option value="openai-compatible">OpenAI-compatible</option>
                    <option value="gemini-cli">Gemini CLI</option>
                  </select>
                </label>
              </div>
            </details>
          </section>
        </aside>
      </main>
    </>
  );
}
