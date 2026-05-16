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
