import { useState } from "react";
import type { MethodType } from "@/lib/methods";
import type { AnalysisItem, ChunkMeta, NoteItem } from "@/types/reader";

export type LockStep = "quiz" | "practical" | "summary" | "none";

export function useReaderState() {
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [text, setText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkMeta, setChunkMeta] = useState<ChunkMeta[]>([]);
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
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [aiHistory, setAiHistory] = useState<AnalysisItem[]>([]);
  const [answers, setAnswers] = useState<unknown[]>([]);
  const [documentOverview, setDocumentOverview] = useState<unknown>(null);
  
  const [sourceCursor, setSourceCursor] = useState(0);
  const [sourceDone, setSourceDone] = useState(false);
  const [preparingMore, setPreparingMore] = useState(false);
  const [lockMinimized, setLockMinimized] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState("Ожидает материал");
  
  const [apiEndpoint, setApiEndpoint] = useState("/api/analyze");
  const [aiProvider, setAiProvider] = useState("geminit-cli");
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
