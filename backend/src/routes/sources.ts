import { raw, Router } from "express";
import { deleteSourceFile, getSourceRoots, listSourceFiles, resolveSourceFile, saveSourceFile } from "../services/sourceStore";

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req, res) => {
  const sources = await listSourceFiles();
  res.json({ sources, roots: getSourceRoots() });
});

sourcesRouter.post("/", raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res) => {
  const encodedFileName = String(req.headers["x-file-name"] || "");
  const fileName = encodedFileName ? decodeURIComponent(encodedFileName) : "";
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!fileName || body.length === 0) {
    res.status(400).json({ error: "File name and non-empty body are required." });
    return;
  }

  try {
    const source = await saveSourceFile(fileName, body);
    res.status(201).json({ source });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Could not save source file." });
  }
});

sourcesRouter.get("/:id", async (req, res) => {
  const source = resolveSourceFile(req.params.id);
  if (!source) {
    res.status(404).json({ error: "Source file not found." });
    return;
  }

  res.download(source.absolutePath, source.fileName);
});

sourcesRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteSourceFile(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Source file not found." });
    return;
  }

  res.status(200).json({ deleted: true });
});
