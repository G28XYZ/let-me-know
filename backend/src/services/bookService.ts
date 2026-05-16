import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { promisify } from "util";
import { convertSourceToMarkdown, copyMarkdownAssets } from "./markdownConverter";

const execFileAsync = promisify(execFile);

type BookChapter = {
  title: string;
  fileName: string;
  content: string;
};

export class BookService {
  private static booksDir = path.resolve(process.cwd(), "data", "books");

  static async init() {
    if (!existsSync(this.booksDir)) {
      await fs.mkdir(this.booksDir, { recursive: true });
    }
  }

  static async generateBook(sourcePath: string, bookId: string, title = "Generated Book"): Promise<string> {
    const bookPath = path.join(this.booksDir, bookId);
    if (existsSync(bookPath)) {
      await fs.rm(bookPath, { recursive: true, force: true });
    }
    await fs.mkdir(bookPath, { recursive: true });

    const conversion = await convertSourceToMarkdown(sourcePath, path.join(bookPath, "conversion"));
    const mdbookSrc = path.join(bookPath, "src");
    await fs.mkdir(mdbookSrc, { recursive: true });
    await copyMarkdownAssets(conversion.assetsDir, path.join(mdbookSrc, "images"));

    const chapters = splitIntoChapters(conversion.markdown, title);
    await Promise.all(chapters.map((chapter) => (
      fs.writeFile(path.join(mdbookSrc, chapter.fileName), chapter.content)
    )));
    await fs.writeFile(path.join(mdbookSrc, "SUMMARY.md"), renderSummary(chapters));

    const bookToml = `[book]\ntitle = ${JSON.stringify(title)}\nauthors = ["Learn Helper"]\nlanguage = "ru"\n\n[output.html]\nadditional-css = []\n`;
    await fs.writeFile(path.join(bookPath, "book.toml"), bookToml);

    await execFileAsync("mdbook", ["build", bookPath], { maxBuffer: 1024 * 1024 * 64 });

    return path.join(bookPath, "book");
  }

  static getBookPath(bookId: string) {
      return path.join(this.booksDir, bookId, "book");
  }
}

function splitIntoChapters(markdown: string, fallbackTitle: string): BookChapter[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const chapters: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^#{1,2}\s+(.+?)\s*$/);
    if (heading) {
      if (current && current.lines.some((item) => item.trim())) chapters.push(current);
      current = { title: cleanTitle(heading[1]) || fallbackTitle, lines: [line] };
      continue;
    }

    if (!current) current = { title: fallbackTitle, lines: [`# ${fallbackTitle}`, ""] };
    current.lines.push(line);
  }

  if (current && current.lines.some((line) => line.trim())) chapters.push(current);

  const normalized = chapters.length > 0 ? chapters : [{ title: fallbackTitle, lines: [`# ${fallbackTitle}`, "", markdown] }];
  return normalized.map((chapter, index) => ({
    title: chapter.title,
    fileName: `${String(index + 1).padStart(2, "0")}-${slugify(chapter.title) || "chapter"}.md`,
    content: `${chapter.lines.join("\n").trim()}\n`,
  }));
}

function renderSummary(chapters: BookChapter[]) {
  return [
    "# Summary",
    "",
    ...chapters.map((chapter) => `- [${escapeSummaryTitle(chapter.title)}](./${chapter.fileName})`),
    "",
  ].join("\n");
}

function cleanTitle(value: string) {
  return value.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/[`*_#]/g, "").trim();
}

function slugify(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeSummaryTitle(value: string) {
  return value.replace(/[[\]]/g, "");
}
