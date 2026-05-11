import { useState, useRef, useEffect } from "react";

export type MethodType = "sq3r" | "notes" | "feynman";

export interface MethodContent {
  title: string;
  guide: string[];
  task: string;
}

export const methodContent: Record<MethodType, MethodContent> = {
  sq3r: {
    title: "SQ3R",
    guide: [
      "Survey: обзор структуры и ключевых тем.",
      "Question: вопросы к материалу до и во время чтения.",
      "Read: внимательное чтение фрагмента.",
      "Recite: пересказ своими словами на паузах.",
      "Review: повторение и проверка слабых мест.",
    ],
    task: "Перескажите основные идеи отрывка и сформулируйте один вопрос, на который он отвечает.",
  },
  notes: {
    title: "Конспектирование",
    guide: [
      "Не копируйте текст дословно.",
      "Перерабатывайте мысль своими словами.",
      "Фиксируйте тезисы, связи, термины и карточки.",
      "Связывайте новые заметки с уже прочитанным.",
    ],
    task: "Составьте короткий конспект отрывка своими словами: 3 тезиса и 1 связь с прошлым материалом.",
  },
  feynman: {
    title: "Метод Фейнмана",
    guide: [
      "Объясните идею простыми словами.",
      "Найдите места, где объяснение распадается.",
      "Вернитесь к непонятному фрагменту.",
      "Повторите объяснение проще и точнее.",
    ],
    task: "Объясните прочитанный отрывок так, как если бы рассказывали его человеку без подготовки.",
  },
};

export type LockStep = "quiz" | "practical" | "summary" | "none";

export function useReaderState() {
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [text, setText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkMeta, setChunkMeta] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [method, setMethod] = useState<MethodType>("sq3r");
  const [locked, setLocked] = useState(false);
  const [lockStep, setLockStep] = useState<LockStep>("none");
  const [busy, setBusy] = useState(false);
  const [busyTitle, setBusyTitle] = useState("");
  const [busyText, setBusyText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [pendingNextIndex, setPendingNextIndex] = useState<number | null>(null);
  const [lastPauseIndex, setLastPauseIndex] = useState(0);
  const [pauseEvery] = useState(2);
  const [notes, setNotes] = useState<any[]>([]);
  const [aiHistory, setAiHistory] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [documentOverview, setDocumentOverview] = useState<any>(null);
  
  const [sourceCursor, setSourceCursor] = useState(0);
  const [sourceDone, setSourceDone] = useState(false);
  const [preparingMore, setPreparingMore] = useState(false);
  const [lockMinimized, setLockMinimized] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState("Ожидает материал");
  
  const [apiEndpoint, setApiEndpoint] = useState("/api/analyze");
  const [aiProvider, setAiProvider] = useState("openai-compatible");
  const [geminiConsole, setGeminiConsole] = useState<string>("Gemini CLI console output...");

  const [ttsHighlight, setTtsHighlight] = useState(true);
  const [ttsAutoScroll, setTtsAutoScroll] = useState(true);

  return {
    state: {
      fileName, fileType, pdfUrl, text, pages, totalPages, chunks, chunkMeta, currentIndex, method, locked, lockMinimized, lockStep,
      busy, busyTitle, busyText, isAnalyzing, aiReady, pendingNextIndex, lastPauseIndex, pauseEvery, notes, aiHistory, answers,
      documentOverview, sourceCursor, sourceDone, preparingMore, assistantStatus, apiEndpoint, aiProvider, geminiConsole,
      ttsHighlight, ttsAutoScroll
    },
    actions: {
      setFileName, setFileType, setPdfUrl, setText, setPages, setTotalPages, setChunks, setChunkMeta, setCurrentIndex,
      setMethod, setLocked, setLockMinimized, setLockStep, setBusy, setBusyTitle, setBusyText, setIsAnalyzing, setAiReady, setPendingNextIndex, setLastPauseIndex,
      setNotes, setAiHistory, setAnswers, setDocumentOverview, setSourceCursor, setSourceDone, setPreparingMore,
      setAssistantStatus, setApiEndpoint, setAiProvider, setGeminiConsole, setTtsHighlight, setTtsAutoScroll
    }
  };
}
