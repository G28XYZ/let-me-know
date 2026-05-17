import { Router } from "express";
import { BookService } from "../services/bookService";
import { resolveSourceFile } from "../services/sourceStore";
import express from "express";

export const booksRouter = Router();

booksRouter.post("/generate", async (req, res) => {
  const { sourceId } = req.body;
  if (!sourceId) {
    return res.status(400).json({ error: "sourceId is required" });
  }

  const source = resolveSourceFile(sourceId);
  if (!source) {
    return res.status(404).json({ error: "Source not found" });
  }

  try {
    const bookId = sourceId;
    await BookService.generateBook(source.absolutePath, bookId, source.fileName);
    res.json({ success: true, bookId });
  } catch (error: any) {
    console.error("Book generation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

booksRouter.post("/open", async (req, res) => {
  const { sourceId } = req.body;
  if (!sourceId) {
    return res.status(400).json({ error: "sourceId is required" });
  }

  const source = resolveSourceFile(sourceId);
  if (!source) {
    return res.status(404).json({ error: "Source not found" });
  }

  try {
    const bookId = sourceId;
    const cached = BookService.hasGeneratedBook(bookId);

    if (!cached) {
      await BookService.generateBook(source.absolutePath, bookId, source.fileName);
    }

    res.json({ success: true, bookId, cached });
  } catch (error: any) {
    console.error("Book open failed:", error);
    res.status(500).json({ error: error.message });
  }
});

booksRouter.get("/:bookId/summary", async (req, res) => {
  const { bookId } = req.params;

  try {
    if (!BookService.hasGeneratedBook(bookId)) {
      return res.status(404).json({ error: "Generated book not found" });
    }

    const items = await BookService.getBookSummary(bookId);
    res.json({ items });
  } catch (error: any) {
    console.error("Book summary failed:", error);
    res.status(500).json({ error: error.message });
  }
});

booksRouter.get("/:bookId/chapters/:chapterHref", async (req, res) => {
  const { bookId, chapterHref } = req.params;

  try {
    if (!BookService.hasGeneratedBook(bookId)) {
      return res.status(404).json({ error: "Generated book not found" });
    }

    const content = await BookService.getChapterContent(bookId, chapterHref);
    res.json({ content });
  } catch (error: any) {
    console.error("Fetch chapter failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve generated books
booksRouter.use("/view/:bookId", async (req, res, next) => {
    const { bookId } = req.params;
    const bookPath = BookService.getBookPath(bookId);
    express.static(bookPath)(req, res, next);
});
