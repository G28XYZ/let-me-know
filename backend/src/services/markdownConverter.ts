import { execFile } from "child_process";
import { existsSync } from "fs";
import { copyFile, mkdir, readFile, readdir, rm } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type MarkdownConversionResult = {
  markdown: string;
  assetsDir?: string;
  converter: string;
};

export async function convertSourceToMarkdown(sourcePath: string, workDir: string): Promise<MarkdownConversionResult> {
  const extension = path.extname(sourcePath).toLowerCase();

  if (extension === ".md" || extension === ".markdown") {
    return {
      markdown: await readFile(sourcePath, "utf8"),
      converter: "markdown",
    };
  }

  if (extension === ".txt") {
    return {
      markdown: textToMarkdown(await readFile(sourcePath, "utf8"), path.basename(sourcePath)),
      converter: "text",
    };
  }

  if (extension === ".pdf") {
    return convertPdfToMarkdown(sourcePath, workDir);
  }

  throw new Error(`Unsupported source type: ${extension || "unknown"}`);
}

async function convertPdfToMarkdown(sourcePath: string, workDir: string): Promise<MarkdownConversionResult> {
  const pdf2mdResult = await tryPdf2Md(sourcePath, path.join(workDir, "pdf2md"));
  if (pdf2mdResult) return pdf2mdResult;

  const textResult = await tryPdfToText(sourcePath, path.join(workDir, "pdftotext.txt"));
  if (textResult) return textResult;

  throw new Error("PDF conversion failed. Install pdf2md or poppler-utils (pdftotext). OCR for scanned PDFs is not implemented yet.");
}

async function tryPdf2Md(sourcePath: string, projectDir: string): Promise<MarkdownConversionResult | null> {
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(projectDir, { recursive: true });

  try {
    await execFileAsync("pdf2md", [sourcePath, projectDir], { maxBuffer: 1024 * 1024 * 64 });
  } catch {
    return null;
  }

  const markdownPath = await findFirstMarkdown(projectDir);
  if (!markdownPath) return null;

  const imagesDir = path.join(path.dirname(markdownPath), "images");
  return {
    markdown: await readFile(markdownPath, "utf8"),
    assetsDir: existsSync(imagesDir) ? imagesDir : undefined,
    converter: "pdf2md",
  };
}

async function tryPdfToText(sourcePath: string, outputPath: string): Promise<MarkdownConversionResult | null> {
  try {
    await execFileAsync("pdftotext", ["-layout", sourcePath, outputPath], { maxBuffer: 1024 * 1024 * 64 });
  } catch {
    return null;
  }

  const text = await readFile(outputPath, "utf8").catch(() => "");
  const markdown = textToMarkdown(text, path.basename(sourcePath, path.extname(sourcePath)));
  return markdown.trim() ? { markdown, converter: "pdftotext" } : null;
}

export async function copyMarkdownAssets(assetsDir: string | undefined, destinationDir: string) {
  if (!assetsDir || !existsSync(assetsDir)) return;
  await mkdir(destinationDir, { recursive: true });
  await copyDirectoryContents(assetsDir, destinationDir);
}

async function copyDirectoryContents(fromDir: string, toDir: string) {
  const entries = await readdir(fromDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyDirectoryContents(from, to);
      return;
    }

    if (entry.isFile()) {
      await copyFile(from, to);
    }
  }));
}

async function findFirstMarkdown(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") return absolutePath;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = await findFirstMarkdown(path.join(dir, entry.name));
    if (nested) return nested;
  }

  return null;
}

function textToMarkdown(text: string, title: string) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  return `# ${title}\n\n${normalized}\n`;
}
