import { Router } from "express";
import {
  getDocument,
  listDocuments,
  updateReadingState,
  upsertAnalysis,
  upsertChunks,
  upsertDocument,
  upsertQuestionSet,
  type StoredAnalysis,
  type StoredChunkRef,
  type StoredQuestionSet,
} from "../services/progressStore";

export const progressRouter = Router();

progressRouter.get("/documents", async (_req, res) => {
  const documents = await listDocuments();
  res.json({ documents });
});

progressRouter.get("/documents/:id", async (req, res) => {
  const document = await getDocument(req.params.id);
  if (!document) {
    res.status(404).json({ error: "Document progress not found." });
    return;
  }

  res.json({ document });
});

progressRouter.post("/documents", async (req, res) => {
  const body = req.body || {};
  const id = String(body.id || "").trim();
  const fileName = String(body.fileName || "").trim();

  if (!id || !fileName) {
    res.status(400).json({ error: "id and fileName are required." });
    return;
  }

  const document = await upsertDocument({
    id,
    fileName,
    fileType: String(body.fileType || "unknown"),
    totalPages: Number(body.totalPages || 0),
    method: String(body.method || ""),
  });

  res.status(200).json({ document });
});

progressRouter.put("/documents/:id/chunks", async (req, res) => {
  const chunks = Array.isArray(req.body?.chunks) ? req.body.chunks : [];
  const normalized = chunks
    .map(normalizeChunk)
    .filter((chunk: StoredChunkRef | null): chunk is StoredChunkRef => Boolean(chunk));

  const document = await upsertChunks(req.params.id, normalized);
  if (!document) {
    res.status(404).json({ error: "Document progress not found." });
    return;
  }

  res.status(200).json({ document });
});

progressRouter.patch("/documents/:id/reading", async (req, res) => {
  const document = await updateReadingState(req.params.id, {
    currentIndex: numberOrUndefined(req.body?.currentIndex),
    lastPauseIndex: numberOrUndefined(req.body?.lastPauseIndex),
    sourceCursor: numberOrUndefined(req.body?.sourceCursor),
    sourceDone: typeof req.body?.sourceDone === "boolean" ? req.body.sourceDone : undefined,
    method: typeof req.body?.method === "string" ? req.body.method : undefined,
  });

  if (!document) {
    res.status(404).json({ error: "Document progress not found." });
    return;
  }

  res.status(200).json({ document });
});

progressRouter.put("/documents/:id/analyses", async (req, res) => {
  const analysis = normalizeAnalysis(req.body);
  if (!analysis) {
    res.status(400).json({ error: "Valid analysis is required." });
    return;
  }

  const document = await upsertAnalysis(req.params.id, analysis);
  if (!document) {
    res.status(404).json({ error: "Document progress not found." });
    return;
  }

  res.status(200).json({ document });
});

progressRouter.put("/documents/:id/questions", async (req, res) => {
  const questionSet = normalizeQuestionSet(req.body);
  if (!questionSet) {
    res.status(400).json({ error: "Valid question set is required." });
    return;
  }

  const document = await upsertQuestionSet(req.params.id, questionSet);
  if (!document) {
    res.status(404).json({ error: "Document progress not found." });
    return;
  }

  res.status(200).json({ document });
});

function normalizeChunk(value: any): StoredChunkRef | null {
  const index = numberOrUndefined(value?.index);
  if (index === undefined) return null;

  return {
    index,
    title: String(value?.title || ""),
    type: String(value?.type || "study"),
    skippable: Boolean(value?.skippable),
    summary: String(value?.summary || ""),
    concepts: stringArray(value?.concepts),
    pageStart: nullableNumber(value?.pageStart),
    pageEnd: nullableNumber(value?.pageEnd),
  };
}

function normalizeAnalysis(value: any): StoredAnalysis | null {
  const chunkIndex = numberOrUndefined(value?.chunkIndex);
  const method = String(value?.method || "").trim();
  if (chunkIndex === undefined || !method) return null;

  return {
    chunkIndex,
    method,
    createdAt: String(value?.createdAt || new Date().toISOString()),
    summary: String(value?.summary || ""),
    attention: stringArray(value?.attention),
    keywords: stringArray(value?.keywords),
    question: String(value?.question || ""),
    task: String(value?.task || ""),
    note: String(value?.note || ""),
    recommendation: String(value?.recommendation || ""),
    quiz: Array.isArray(value?.quiz) ? value.quiz : [],
    practicalTask: String(value?.practicalTask || ""),
    sourceRange: normalizeSourceRange(value?.sourceRange, chunkIndex, chunkIndex),
  };
}

function normalizeQuestionSet(value: any): StoredQuestionSet | null {
  const id = String(value?.id || "").trim();
  const method = String(value?.method || "").trim();
  if (!id || !method) return null;

  return {
    id,
    method,
    createdAt: String(value?.createdAt || new Date().toISOString()),
    question: String(value?.question || ""),
    quiz: Array.isArray(value?.quiz) ? value.quiz : [],
    practicalTask: String(value?.practicalTask || ""),
    sourceRange: normalizeSourceRange(value?.sourceRange, 0, 0),
  };
}

function normalizeSourceRange(value: any, fallbackStart: number, fallbackEnd: number) {
  return {
    chunkStart: numberOrUndefined(value?.chunkStart) ?? fallbackStart,
    chunkEnd: numberOrUndefined(value?.chunkEnd) ?? fallbackEnd,
    pageStart: nullableNumber(value?.pageStart),
    pageEnd: nullableNumber(value?.pageEnd),
  };
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : undefined;
}

function nullableNumber(value: unknown) {
  const number = numberOrUndefined(value);
  return number === undefined ? null : number;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
