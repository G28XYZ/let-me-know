export interface AnalysisPayload {
  method: string;
  methodTitle: string;
  provider?: string;
  currentText: string;
  segmentText: string;
  progress: {
    currentIndex: number;
    totalChunks: number;
  };
}

export interface PreparePayload {
  fileName: string;
  provider?: string;
  method: string;
  methodTitle: string;
  text: string;
  targetChunks?: number;
  offset: number;
  pageStart: number;
  pageEnd: number;
  totalPages: number;
  partial: boolean;
}

export interface GeminiCommandPayload {
  action: "help" | "version" | "list-sessions" | "diagnostics" | "prompt";
  prompt?: string;
}

export interface EvaluatePayload {
  provider?: string;
  question: string;
  answer: string;
  contextText: string;
}

export interface QuestionsPayload {
  provider?: string;
  method: string;
  methodTitle: string;
  currentText: string;
  segmentText: string;
  previousContext?: string;
  featureEnabled?: boolean;
  progress: {
    currentIndex: number;
    totalChunks: number;
  };
}
