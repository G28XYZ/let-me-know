import { Router } from "express";
import { BookService } from "../services/bookService";
import { resolveSourceFile } from "../services/sourceStore";
import path from "path";
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

// Serve generated books
booksRouter.use("/view/:bookId", async (req, res, next) => {
    const { bookId } = req.params;
    const bookPath = BookService.getBookPath(bookId);
    express.static(bookPath)(req, res, next);
});
