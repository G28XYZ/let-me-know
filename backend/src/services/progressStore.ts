import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type StoredChunkRef = {
  index: number;
  title: string;
  type: string;
  skippable: boolean;
  summary: string;
  concepts?: string[];
  pageStart: number | null;
  pageEnd: number | null;
};

export type StoredAnalysis = {
  chunkIndex: number;
  method: string;
  createdAt: string;
  summary: string;
  attention: string[];
  keywords: string[];
  question: string;
  task: string;
  note: string;
  recommendation: string;
  quiz: unknown[];
  practicalTask: string;
  sourceRange: {
    chunkStart: number;
    chunkEnd: number;
    pageStart: number | null;
    pageEnd: number | null;
  };
};

export type StoredQuestionSet = {
  id: string;
  method: string;
  createdAt: string;
  question: string;
  quiz: unknown[];
  practicalTask: string;
  sourceRange: {
    chunkStart: number;
    chunkEnd: number;
    pageStart: number | null;
    pageEnd: number | null;
  };
};

export type StoredDocument = {
  id: string;
  fileName: string;
  fileType: string;
  totalPages: number;
  createdAt: string;
  updatedAt: string;
  method: string;
  currentIndex: number;
  lastPauseIndex: number;
  sourceCursor: number;
  sourceDone: boolean;
  chunks: StoredChunkRef[];
  analyses: StoredAnalysis[];
  questionSets: StoredQuestionSet[];
};

export type StoredDocumentSummary = {
  id: string;
  fileName: string;
  fileType: string;
  totalPages: number;
  updatedAt: string;
  method: string;
  currentIndex: number;
  progressPercent: number;
  chunksCount: number;
  analysesCount: number;
  questionSetsCount: number;
};

type ProgressDb = {
  version: 1;
  documents: Record<string, StoredDocument>;
};

const dbPath = path.resolve(process.cwd(), "data", "progress-db.json");

const emptyDb = (): ProgressDb => ({ version: 1, documents: {} });

async function readDb(): Promise<ProgressDb> {
  try {
    const raw = await readFile(dbPath, "utf8");
    const data = JSON.parse(raw) as ProgressDb;
    return {
      version: 1,
      documents: data.documents && typeof data.documents === "object" ? data.documents : {},
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") return emptyDb();
    throw error;
  }
}

async function writeDb(db: ProgressDb) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

export async function getDocument(id: string) {
  const db = await readDb();
  return db.documents[id] || null;
}

export async function listDocuments(): Promise<StoredDocumentSummary[]> {
  const db = await readDb();
  return Object.values(db.documents)
    .map((document) => {
      const currentChunk = document.chunks.find((chunk) => chunk.index === document.currentIndex);
      const pageEnd = currentChunk?.pageEnd || 0;
      const progressPercent = document.totalPages > 0
        ? Math.min(100, Math.max(0, Math.round((pageEnd / document.totalPages) * 100)))
        : 0;

      return {
        id: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        totalPages: document.totalPages,
        updatedAt: document.updatedAt,
        method: document.method,
        currentIndex: document.currentIndex,
        progressPercent,
        chunksCount: document.chunks.length,
        analysesCount: document.analyses.length,
        questionSetsCount: document.questionSets.length,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertDocument(input: {
  id: string;
  fileName: string;
  fileType?: string;
  totalPages?: number;
  method?: string;
}) {
  const db = await readDb();
  const now = new Date().toISOString();
  const previous = db.documents[input.id];

  const document: StoredDocument = {
    id: input.id,
    fileName: input.fileName,
    fileType: input.fileType || previous?.fileType || "unknown",
    totalPages: Number(input.totalPages ?? previous?.totalPages ?? 0),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    method: input.method || previous?.method || "",
    currentIndex: previous?.currentIndex || 0,
    lastPauseIndex: previous?.lastPauseIndex || 0,
    sourceCursor: previous?.sourceCursor || 0,
    sourceDone: previous?.sourceDone || false,
    chunks: previous?.chunks || [],
    analyses: previous?.analyses || [],
    questionSets: previous?.questionSets || [],
  };

  db.documents[input.id] = document;
  await writeDb(db);
  return document;
}

export async function upsertChunks(documentId: string, chunks: StoredChunkRef[]) {
  const db = await readDb();
  const document = db.documents[documentId];
  if (!document) return null;

  const byIndex = new Map(document.chunks.map((chunk) => [chunk.index, chunk]));
  chunks.forEach((chunk) => byIndex.set(chunk.index, chunk));
  document.chunks = Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
  document.updatedAt = new Date().toISOString();
  await writeDb(db);
  return document;
}

export async function updateReadingState(documentId: string, input: Partial<Pick<StoredDocument, "currentIndex" | "lastPauseIndex" | "sourceCursor" | "sourceDone" | "method">>) {
  const db = await readDb();
  const document = db.documents[documentId];
  if (!document) return null;

  if (typeof input.currentIndex === "number") document.currentIndex = Math.max(0, Math.floor(input.currentIndex));
  if (typeof input.lastPauseIndex === "number") document.lastPauseIndex = Math.max(0, Math.floor(input.lastPauseIndex));
  if (typeof input.sourceCursor === "number") document.sourceCursor = Math.max(0, Math.floor(input.sourceCursor));
  if (typeof input.sourceDone === "boolean") document.sourceDone = input.sourceDone;
  if (typeof input.method === "string") document.method = input.method;
  document.updatedAt = new Date().toISOString();
  await writeDb(db);
  return document;
}

export async function upsertAnalysis(documentId: string, analysis: StoredAnalysis) {
  const db = await readDb();
  const document = db.documents[documentId];
  if (!document) return null;

  document.analyses = [
    analysis,
    ...document.analyses.filter((item) => !(item.chunkIndex === analysis.chunkIndex && item.method === analysis.method)),
  ];
  document.updatedAt = new Date().toISOString();
  await writeDb(db);
  return document;
}

export async function upsertQuestionSet(documentId: string, questionSet: StoredQuestionSet) {
  const db = await readDb();
  const document = db.documents[documentId];
  if (!document) return null;

  document.questionSets = [
    questionSet,
    ...document.questionSets.filter((item) => item.id !== questionSet.id),
  ];
  document.updatedAt = new Date().toISOString();
  await writeDb(db);
  return document;
}
