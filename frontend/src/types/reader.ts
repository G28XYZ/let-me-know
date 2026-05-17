export type SourceFileSummary = {
  id: string;
  name: string;
  root: string;
  relativePath: string;
  size: number;
  updatedAt: string;
  canDelete: boolean;
};

export type SourceFilesResponse = {
  sources: SourceFileSummary[];
};

export type BookGenerationResponse = {
  success: boolean;
  bookId: string;
  cached?: boolean;
};

export type BookSummaryItem = {
  id: string;
  title: string;
  href: string;
  level: number;
};

export type BookSummaryResponse = {
  items: BookSummaryItem[];
};

export type ChatResponse = {
  text: string;
};

export type EvaluateResponse = {
  isCorrect: boolean;
  feedback: string;
};

export type QuestionsResponse = {
  questions: string[];
};

export type ChapterContentResponse = {
  content: string;
};

export type GeneratedQuestionsData = {
  quizzes?: Array<{
    question: string;
    options: string[];
    correctAnswer: string;
    hint: string;
  }>;
  practicalTask?: {
    task: string;
    hint: string;
  } | null;
  openQuestion?: {
    question: string;
    hint: string;
  } | null;
};
