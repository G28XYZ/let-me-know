import { execFile } from "child_process";
import { existsSync } from "fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
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

  const textResult = await tryPdfToText(sourcePath, path.join(workDir, "pdftotext"));
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

async function tryPdfToText(sourcePath: string, outputDir: string): Promise<MarkdownConversionResult | null> {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "source.txt");

  try {
    await execFileAsync("pdftotext", ["-layout", sourcePath, outputPath], { maxBuffer: 1024 * 1024 * 64 });
  } catch {
    return null;
  }

  const text = await readFile(outputPath, "utf8").catch(() => "");
  if (!text.trim()) return null;

  const markdown = pdfTextToMarkdown(text, path.basename(sourcePath, path.extname(sourcePath)));

  const pandocMarkdown = await tryPandocNormalizeMarkdown(
    markdown,
    path.join(outputDir, "pandoc-input.md"),
    path.join(outputDir, "pandoc-output.md"),
  );

  return pandocMarkdown
    ? { markdown: pandocMarkdown, converter: "pdftotext+pandoc" }
    : { markdown, converter: "pdftotext" };
}

async function tryPandocNormalizeMarkdown(markdown: string, inputPath: string, outputPath: string) {
  await writeFile(inputPath, markdown);

  try {
    await execFileAsync("pandoc", [inputPath, "-f", "markdown", "-t", "gfm", "-o", outputPath], { maxBuffer: 1024 * 1024 * 64 });
  } catch {
    return null;
  }

  const normalized = await readFile(outputPath, "utf8").catch(() => "");
  return normalized.trim() ? normalized : null;
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

function pdfTextToMarkdown(text: string, title: string) {
  const pages = text.replace(/\r\n?/g, "\n").split("\f");
  const markdownLines: string[] = [`# ${title}`, ""];
  let paragraph: string[] = [];
  let pendingChapterNumber = "";
  let currentHeading = "";

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    markdownLines.push(joinParagraphLines(paragraph), "");
    paragraph = [];
  };

  const addHeading = (level: number, value: string) => {
    const heading = cleanPdfHeading(value);
    if (!heading || heading === currentHeading) return;
    flushParagraph();
    currentHeading = heading;
    markdownLines.push(`${"#".repeat(level)} ${heading}`, "");
  };

  for (const page of pages) {
    const rawLines = page.split("\n");
    const meaningfulLines = rawLines
      .map((line) => line.trim())
      .filter(Boolean);

    if (meaningfulLines.length === 0 || isTableOfContentsPage(meaningfulLines)) continue;

    let seenContentOnPage = false;

    for (const rawLine of rawLines) {
      const line = normalizePdfLine(rawLine);
      if (!line) {
        flushParagraph();
        continue;
      }

      if (isStandalonePageNumber(line)) continue;
      if (!seenContentOnPage && line === currentHeading) continue;

      seenContentOnPage = true;

      const chapterNumber = line.match(/^Глава\s+(\d+)$/i);
      if (chapterNumber) {
        pendingChapterNumber = chapterNumber[1];
        flushParagraph();
        continue;
      }

      if (pendingChapterNumber) {
        addHeading(1, `Глава ${pendingChapterNumber}. ${line}`);
        pendingChapterNumber = "";
        continue;
      }

      const sectionHeading = line.match(/^(\d+(?:\.\d+)+)\.\s+(.+)$/);
      if (sectionHeading && !looksLikeListItem(line)) {
        addHeading(2, line);
        continue;
      }

      if (line === "Контрольные вопросы и задания") {
        addHeading(2, line);
        continue;
      }

      if (isStandalonePdfHeading(line)) {
        addHeading(1, line);
        continue;
      }

      paragraph.push(line);
    }

    flushParagraph();
  }

  return `${markdownLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function normalizePdfLine(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function cleanPdfHeading(value: string) {
  return value
    .replace(/\s+\d+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function joinParagraphLines(lines: string[]) {
  return lines.reduce((result, line) => {
    if (!result) return line;
    if (/[A-Za-zА-Яа-яЁё]-$/.test(result) && /^[a-zа-яё]/.test(line)) {
      return `${result.slice(0, -1)}${line}`;
    }
    return `${result} ${line}`;
  }, "");
}

function isStandalonePageNumber(line: string) {
  return /^\d+$/.test(line);
}

function isTableOfContentsPage(lines: string[]) {
  const first = lines[0]?.toLowerCase() || "";
  return first === "оглавление";
}

function isStandalonePdfHeading(line: string) {
  return [
    "Предисловие автора",
    "Введение",
    "Заключение",
    "Рекомендуемые источники",
    "Предметный указатель",
  ].includes(line);
}

function looksLikeListItem(line: string) {
  return /^\d+\.\s/.test(line);
}
