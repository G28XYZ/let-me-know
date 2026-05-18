import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { promisify } from "util";
import { convertSourceToMarkdown, copyMarkdownAssets } from "./markdownConverter";
import { config } from "../config";

const execFileAsync = promisify(execFile);

type BookChapter = {
  title: string;
  fileName: string;
  content: string;
  level: number;
};

export type BookSummaryItem = {
  id: string;
  title: string;
  href: string;
  level: number;
};

export type SectionSummaryCacheData = {
  summary: string;
  keyPoints: string[];
  terms: Array<{ term: string; definition: string }>;
};

export class BookService {
  private static backendRoot = resolveBackendRoot();
  private static booksDir = path.resolve(BookService.backendRoot, "data", "books");

  static async init() {
    if (!existsSync(this.booksDir)) {
      await fs.mkdir(this.booksDir, { recursive: true });
    }
  }

  static async generateBook(sourcePath: string, bookId: string, title = "Generated Book"): Promise<string> {
    const bookPath = this.getBookRoot(bookId);
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
    await writeSectionSummaryAssets(bookPath);

    const bookToml = `[book]\ntitle = ${JSON.stringify(title)}\nauthors = ["Learn Helper"]\nlanguage = "ru"\n\n[output.html]\nadditional-css = ["learn-helper-summary.css"]\nadditional-js = ["learn-helper-summary.js"]\n`;
    await fs.writeFile(path.join(bookPath, "book.toml"), bookToml);

    await buildMdbook(bookPath);

    return path.join(bookPath, "book");
  }

  static getBookPath(bookId: string) {
    return path.join(this.getBookRoot(bookId), "book");
  }

  static hasGeneratedBook(bookId: string) {
    return existsSync(path.join(this.getBookPath(bookId), "index.html"));
  }

  static async ensureSectionSummaryEnabled(bookId: string) {
    const bookRoot = this.getBookRoot(bookId);
    const indexPath = path.join(this.getBookPath(bookId), "index.html");
    const indexHtml = await fs.readFile(indexPath, "utf8").catch(() => "");
    const helperScript = await fs.readFile(path.join(bookRoot, "learn-helper-summary.js"), "utf8").catch(() => "");
    if (indexHtml.includes("learn-helper-summary.js") && helperScript.includes("learn-helper-tts__speed")) return;

    await writeSectionSummaryAssets(bookRoot);
    await ensureBookTomlSummaryAssets(path.join(bookRoot, "book.toml"));
    await buildMdbook(bookRoot);
  }

  static async getBookSummary(bookId: string): Promise<BookSummaryItem[]> {
    const summaryPath = path.join(this.getBookRoot(bookId), "src", "SUMMARY.md");
    const summary = await fs.readFile(summaryPath, "utf8");

    return summary
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(parseSummaryLine)
      .filter((item): item is BookSummaryItem => Boolean(item));
  }

  static async getChapterContent(bookId: string, chapterHref: string): Promise<string> {
    const chapterPath = path.join(this.getBookRoot(bookId), "src", chapterHref);
    const root = this.getBookRoot(bookId);

    if (!chapterPath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid chapter path.");
    }

    return fs.readFile(chapterPath, "utf8");
  }

  static async getCachedSectionSummary(bookId: string, sectionPath: string, text: string): Promise<SectionSummaryCacheData | null> {
    const cachePath = this.getSectionSummaryCachePath(bookId, sectionPath, text);
    const raw = await fs.readFile(cachePath, "utf8").catch(() => "");
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;

      return {
        summary: String(parsed.summary || ""),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).filter(Boolean) : [],
        terms: Array.isArray(parsed.terms)
          ? parsed.terms
            .map((item: any) => ({
              term: String(item?.term || "").trim(),
              definition: String(item?.definition || "").trim(),
            }))
            .filter((item: any) => item.term && item.definition)
          : [],
      };
    } catch {
      return null;
    }
  }

  static async saveSectionSummary(bookId: string, sectionPath: string, text: string, summary: SectionSummaryCacheData) {
    const cachePath = this.getSectionSummaryCachePath(bookId, sectionPath, text);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({
      ...summary,
      cachedAt: new Date().toISOString(),
    }, null, 2));
  }

  private static getBookRoot(bookId: string) {
    const bookRoot = path.resolve(this.booksDir, bookId);
    if (!bookRoot.startsWith(`${this.booksDir}${path.sep}`) && bookRoot !== this.booksDir) {
      throw new Error("Invalid book id.");
    }
    return bookRoot;
  }

  private static getSectionSummaryCachePath(bookId: string, sectionPath: string, text: string) {
    const bookRoot = this.getBookRoot(bookId);
    const key = crypto
      .createHash("sha256")
      .update([String(sectionPath || ""), normalizeCacheText(text)].join("\n---\n"))
      .digest("hex");

    return path.join(bookRoot, "cache", "section-summaries", `${key}.json`);
  }
}

function normalizeCacheText(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

async function buildMdbook(bookPath: string) {
  const mdbookBin = resolveMdbookBin();

  try {
    await execFileAsync(mdbookBin, ["build", bookPath], { maxBuffer: 1024 * 1024 * 64 });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new Error(`mdBook binary not found. Install mdbook or set MDBOOK_BIN to the full path. Tried: ${mdbookBin}`);
    }

    throw error;
  }
}

function resolveMdbookBin() {
  if (config.mdbookBin) return config.mdbookBin;

  const candidates = [
    path.resolve(process.env.HOME || "", ".cargo", "bin", "mdbook"),
    "/home/aleksandr/.cargo/bin/mdbook",
    "/usr/local/bin/mdbook",
    "/usr/bin/mdbook",
  ];

  return candidates.find((candidate) => candidate && existsSync(candidate)) || "mdbook";
}

async function writeSectionSummaryAssets(bookPath: string) {
  await Promise.all([
    fs.writeFile(path.join(bookPath, "learn-helper-summary.css"), renderSectionSummaryCss()),
    fs.writeFile(path.join(bookPath, "learn-helper-summary.js"), renderSectionSummaryScript()),
  ]);
}

async function ensureBookTomlSummaryAssets(bookTomlPath: string) {
  const current = await fs.readFile(bookTomlPath, "utf8").catch(() => "");
  if (!current.trim()) {
    await fs.writeFile(bookTomlPath, "[book]\ntitle = \"Generated Book\"\nauthors = [\"Learn Helper\"]\nlanguage = \"ru\"\n\n[output.html]\nadditional-css = [\"learn-helper-summary.css\"]\nadditional-js = [\"learn-helper-summary.js\"]\n");
    return;
  }

  let next = current;
  if (!/\[output\.html]/.test(next)) {
    next = `${next.trimEnd()}\n\n[output.html]\n`;
  }

  next = upsertTomlAssetList(next, "additional-css", "learn-helper-summary.css");
  next = upsertTomlAssetList(next, "additional-js", "learn-helper-summary.js");

  await fs.writeFile(bookTomlPath, next);
}

function upsertTomlAssetList(content: string, key: "additional-css" | "additional-js", asset: string) {
  const linePattern = new RegExp(`^${key}\\s*=\\s*\\[(.*)]\\s*$`, "m");
  const match = content.match(linePattern);
  if (!match) {
    return content.replace(/\[output\.html]\s*/m, `[output.html]\n${key} = [${JSON.stringify(asset)}]\n`);
  }

  const existing = Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
  const assets = existing.includes(asset) ? existing : [...existing, asset];
  return content.replace(linePattern, `${key} = ${JSON.stringify(assets)}`);
}

function renderSectionSummaryCss() {
  return `
.learn-helper-summary {
  margin-block: 3rem 1.5rem;
  padding-block-start: 1.25rem;
  border-block-start: 1px solid var(--table-border-color);
  color: var(--fg);
}

.learn-helper-summary__inner {
  padding: 1rem 1.15rem;
  border: 1px solid var(--theme-popup-border);
  border-radius: 6px;
  background: var(--quote-bg);
}

.learn-helper-summary__title {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
  line-height: 1.35;
}

.learn-helper-summary__muted {
  margin: 0;
  color: var(--icons);
  font-size: 0.92rem;
}

.learn-helper-summary__text {
  margin: 0 0 0.85rem;
  line-height: 1.6;
}

.learn-helper-summary__list {
  margin-block: 0.75rem 0;
}

.learn-helper-summary__terms {
  margin-block-start: 1rem;
}

.learn-helper-summary__terms dt {
  font-weight: 700;
}

.learn-helper-summary__terms dd {
  margin: 0 0 0.65rem;
}

.learn-helper-tts {
  position: relative;
}

.learn-helper-tts__button {
  min-width: 40px;
  height: var(--menu-bar-height);
  border: 0;
  border-inline-end: 1px solid transparent;
  border-inline-start: 1px solid transparent;
  background: transparent;
  color: var(--icons);
  cursor: pointer;
  font: inherit;
}

.learn-helper-tts__button:hover,
.learn-helper-tts.is-open .learn-helper-tts__button {
  background: var(--theme-hover);
  color: var(--icons-hover);
}

.learn-helper-tts__menu {
  position: absolute;
  top: var(--menu-bar-height);
  left: 0;
  z-index: 20;
  display: none;
  width: 250px;
  border: 1px solid var(--theme-popup-border);
  background: var(--theme-popup-bg);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.18);
}

.learn-helper-tts.is-open .learn-helper-tts__menu {
  display: block;
}

.learn-helper-tts__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  font: inherit;
  padding: 0.7rem 0.8rem;
  text-align: left;
}

.learn-helper-tts__item:hover {
  background: var(--theme-hover);
}

.learn-helper-tts__control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem 0.8rem;
  color: var(--fg);
}

.learn-helper-tts__speed {
  max-width: 5.5rem;
  border: 1px solid var(--theme-popup-border);
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  padding: 0.2rem 0.35rem;
}

.learn-helper-tts__check {
  width: 1rem;
  color: var(--links);
  text-align: center;
}

.learn-helper-tts__status {
  border-block-start: 1px solid var(--theme-popup-border);
  color: var(--icons);
  font-size: 0.82rem;
  line-height: 1.35;
  padding: 0.65rem 0.8rem;
}

.learn-helper-tts-reading {
  background: color-mix(in srgb, var(--links) 16%, transparent);
  border-radius: 4px;
  outline: 2px solid color-mix(in srgb, var(--links) 24%, transparent);
  outline-offset: 3px;
}

.learn-helper-tts-word {
  border-radius: 3px;
}

.learn-helper-tts-word.is-current {
  background: color-mix(in srgb, var(--links) 28%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--links) 18%, transparent);
}
`.trimStart();
}

function renderSectionSummaryScript() {
  return `
(function () {
  var containerId = "learn-helper-section-summary";
  var minTextLength = 500;

  function getBookId() {
    var match = window.location.pathname.match(/\\/api\\/books\\/view\\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "book";
  }

  function getContentRoot() {
    return document.querySelector("main") || document.querySelector("#content") || document.body;
  }

  function getSectionTitle(root) {
    var heading = root.querySelector("h1, h2");
    return heading ? heading.textContent.trim() : document.title.replace(/ - .*$/, "").trim();
  }

  function getSectionText(root) {
    var previous = document.getElementById(containerId);
    if (previous) previous.remove();

    return root.textContent
      .replace(/\\s+/g, " ")
      .trim();
  }

  function hashText(text) {
    var hash = 0;
    for (var index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function getCacheKey(text) {
    return [
      "learn-helper:section-summary",
      getBookId(),
      window.location.pathname,
      hashText(text)
    ].join(":");
  }

  function createShell(root) {
    var summary = document.createElement("section");
    summary.id = containerId;
    summary.className = "learn-helper-summary";
    summary.setAttribute("aria-live", "polite");
    summary.innerHTML = [
      '<div class="learn-helper-summary__inner">',
      '<h2 class="learn-helper-summary__title">Краткий конспект</h2>',
      '<p class="learn-helper-summary__muted">Готовим конспект раздела...</p>',
      '</div>'
    ].join("");
    root.appendChild(summary);
    return summary;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSummary(shell, data) {
    var keyPoints = Array.isArray(data.keyPoints) ? data.keyPoints.filter(Boolean) : [];
    var terms = Array.isArray(data.terms) ? data.terms.filter(function (item) {
      return item && item.term && item.definition;
    }) : [];

    shell.innerHTML = [
      '<div class="learn-helper-summary__inner">',
      '<h2 class="learn-helper-summary__title">Краткий конспект</h2>',
      data.summary ? '<p class="learn-helper-summary__text">' + escapeHtml(data.summary) + '</p>' : '',
      keyPoints.length ? '<ul class="learn-helper-summary__list">' + keyPoints.map(function (point) {
        return '<li>' + escapeHtml(point) + '</li>';
      }).join("") + '</ul>' : '',
      terms.length ? '<dl class="learn-helper-summary__terms">' + terms.map(function (item) {
        return '<dt>' + escapeHtml(item.term) + '</dt><dd>' + escapeHtml(item.definition) + '</dd>';
      }).join("") + '</dl>' : '',
      '</div>'
    ].join("");
  }

  function renderError(shell) {
    shell.innerHTML = [
      '<div class="learn-helper-summary__inner">',
      '<h2 class="learn-helper-summary__title">Краткий конспект</h2>',
      '<p class="learn-helper-summary__muted">Конспект пока не удалось загрузить.</p>',
      '</div>'
    ].join("");
  }

  function initSummary() {
    var root = getContentRoot();
    var text = getSectionText(root);
    if (text.length < minTextLength) return;

    var title = getSectionTitle(root);
    var cacheKey = getCacheKey(text);
    var shell = createShell(root);
    var cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        renderSummary(shell, JSON.parse(cached));
        return;
      } catch (_error) {
        localStorage.removeItem(cacheKey);
      }
    }

    fetch("/api/summarize-section", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: getBookId(),
        sectionPath: window.location.pathname,
        title: title,
        text: text,
        provider: "gemini-cli"
      })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("summary failed");
        return response.json();
      })
      .then(function (data) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderSummary(shell, data);
      })
      .catch(function () {
        renderError(shell);
      });
  }

  var learnHelperTts = {
    audio: null,
    abortController: null,
    blocks: [],
    chunks: [],
    chunkAudios: [],
    currentChunkIndex: 0,
    playing: false,
    generating: false,
    follow: localStorage.getItem("learn-helper:tts:follow") === "true",
    highlight: localStorage.getItem("learn-helper:tts:highlight") !== "false",
    speed: Number(localStorage.getItem("learn-helper:tts:speed") || "1"),
    statusEl: null,
    menuEl: null,
    routeKey: "",
    currentWordSpans: [],
    currentWordIndex: -1
  };

  function initTts() {
    var leftButtons = document.querySelector(".left-buttons");
    if (!leftButtons || document.querySelector(".learn-helper-tts")) return;

    learnHelperTts.routeKey = getBookId() + ":" + window.location.pathname;
    learnHelperTts.audio = new Audio();
    learnHelperTts.audio.addEventListener("ended", playNextTtsChunk);
    learnHelperTts.audio.addEventListener("timeupdate", updateTtsWordHighlight);
    learnHelperTts.audio.addEventListener("error", function () {
      setTtsStatus("Не удалось воспроизвести аудио.");
      learnHelperTts.playing = false;
    });

    var wrapper = document.createElement("div");
    wrapper.className = "learn-helper-tts";
    wrapper.innerHTML = [
      '<button type="button" class="learn-helper-tts__button" aria-haspopup="true" aria-expanded="false" title="Озвучка">♪</button>',
      '<div class="learn-helper-tts__menu" role="menu">',
      '<button type="button" class="learn-helper-tts__item" data-action="make"><span class="learn-helper-tts__check"></span><span data-role="make-label">Сделать аудио</span></button>',
      '<button type="button" class="learn-helper-tts__item" data-action="stop"><span class="learn-helper-tts__check"></span><span>Остановить аудио</span></button>',
      '<button type="button" class="learn-helper-tts__item" data-action="follow"><span class="learn-helper-tts__check"></span><span>Скролить за читающим</span></button>',
      '<button type="button" class="learn-helper-tts__item" data-action="highlight"><span class="learn-helper-tts__check"></span><span>Выделять текущее чтение</span></button>',
      '<label class="learn-helper-tts__control"><span>Скорость</span><select class="learn-helper-tts__speed" data-role="speed"><option value="0.8">0.8x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="1.75">1.75x</option><option value="2">2x</option></select></label>',
      '<button type="button" class="learn-helper-tts__item" data-action="download"><span class="learn-helper-tts__check"></span><span>Скачать аудио</span></button>',
      '<div class="learn-helper-tts__status">Аудио еще не готовилось.</div>',
      '</div>'
    ].join("");

    leftButtons.appendChild(wrapper);
    learnHelperTts.menuEl = wrapper;
    learnHelperTts.statusEl = wrapper.querySelector(".learn-helper-tts__status");
    var speedSelect = wrapper.querySelector('[data-role="speed"]');
    if (speedSelect) speedSelect.value = String(normalizeTtsSpeed(learnHelperTts.speed));
    updateTtsMenuChecks();

    wrapper.querySelector(".learn-helper-tts__button").addEventListener("click", function (event) {
      event.stopPropagation();
      var isOpen = wrapper.classList.toggle("is-open");
      wrapper.querySelector(".learn-helper-tts__button").setAttribute("aria-expanded", String(isOpen));
    });

    wrapper.addEventListener("click", function (event) {
      var target = event.target.closest("[data-action]");
      if (!target) return;

      var action = target.getAttribute("data-action");
      if (action === "make") {
        startOrResumeTts();
      } else if (action === "stop") {
        if (learnHelperTts.abortController) learnHelperTts.abortController.abort();
        learnHelperTts.generating = false;
        stopTtsPlayback();
      } else if (action === "follow") {
        learnHelperTts.follow = !learnHelperTts.follow;
        localStorage.setItem("learn-helper:tts:follow", String(learnHelperTts.follow));
        updateTtsMenuChecks();
      } else if (action === "highlight") {
        learnHelperTts.highlight = !learnHelperTts.highlight;
        localStorage.setItem("learn-helper:tts:highlight", String(learnHelperTts.highlight));
        updateTtsMenuChecks();
        if (!learnHelperTts.highlight) clearTtsHighlight();
      } else if (action === "download") {
        void downloadTtsAudio();
      }
    });

    wrapper.addEventListener("change", function (event) {
      if (!event.target.matches('[data-role="speed"]')) return;
      learnHelperTts.speed = normalizeTtsSpeed(Number(event.target.value));
      localStorage.setItem("learn-helper:tts:speed", String(learnHelperTts.speed));
      if (learnHelperTts.audio) learnHelperTts.audio.playbackRate = learnHelperTts.speed;
      setTtsStatus("Скорость: " + learnHelperTts.speed + "x.");
    });

    document.addEventListener("click", function (event) {
      if (!wrapper.contains(event.target)) {
        wrapper.classList.remove("is-open");
        wrapper.querySelector(".learn-helper-tts__button").setAttribute("aria-expanded", "false");
      }
    });

    window.addEventListener("pagehide", stopTtsWork);
    window.addEventListener("beforeunload", stopTtsWork);
  }

  function updateTtsMenuChecks() {
    if (!learnHelperTts.menuEl) return;
    var follow = learnHelperTts.menuEl.querySelector('[data-action="follow"] .learn-helper-tts__check');
    var highlight = learnHelperTts.menuEl.querySelector('[data-action="highlight"] .learn-helper-tts__check');
    var makeLabel = learnHelperTts.menuEl.querySelector('[data-role="make-label"]');
    if (follow) follow.textContent = learnHelperTts.follow ? "✓" : "";
    if (highlight) highlight.textContent = learnHelperTts.highlight ? "✓" : "";
    if (makeLabel) {
      makeLabel.textContent = learnHelperTts.playing && learnHelperTts.audio && !learnHelperTts.audio.paused
        ? "Пауза"
        : learnHelperTts.audio && learnHelperTts.audio.src && learnHelperTts.audio.paused
          ? "Продолжить"
          : "Сделать аудио";
    }
  }

  function setTtsStatus(value) {
    if (learnHelperTts.statusEl) learnHelperTts.statusEl.textContent = value;
  }

  function normalizeTtsSpeed(value) {
    var speed = Number(value);
    if (!Number.isFinite(speed)) return 1;
    return Math.min(2, Math.max(0.8, speed));
  }

  function stopTtsWork() {
    if (learnHelperTts.abortController) learnHelperTts.abortController.abort();
    stopTtsPlayback();
    learnHelperTts.generating = false;
  }

  function stopTtsPlayback() {
    if (learnHelperTts.audio) {
      learnHelperTts.audio.pause();
      learnHelperTts.audio.removeAttribute("src");
      learnHelperTts.audio.load();
    }
    learnHelperTts.playing = false;
    learnHelperTts.currentWordIndex = -1;
    clearTtsHighlight();
    updateTtsMenuChecks();
    setTtsStatus("Аудио остановлено.");
  }

  function startOrResumeTts() {
    if (learnHelperTts.playing && learnHelperTts.audio && !learnHelperTts.audio.paused) {
      learnHelperTts.audio.pause();
      learnHelperTts.playing = false;
      setTtsStatus("Пауза. Нажмите снова, чтобы продолжить.");
      updateTtsMenuChecks();
      return;
    }

    if (learnHelperTts.audio && learnHelperTts.audio.src && learnHelperTts.audio.paused) {
      learnHelperTts.playing = true;
      learnHelperTts.audio.playbackRate = learnHelperTts.speed;
      learnHelperTts.audio.play().catch(function () {
        setTtsStatus("Браузер не дал продолжить аудио. Нажмите кнопку еще раз.");
        learnHelperTts.playing = false;
      });
      updateTtsMenuChecks();
      return;
    }

    if (learnHelperTts.chunkAudios.length > learnHelperTts.currentChunkIndex) {
      learnHelperTts.playing = true;
      playTtsChunk(learnHelperTts.currentChunkIndex);
      return;
    }

    prepareTtsBlocks();
    if (!learnHelperTts.chunks.length) {
      setTtsStatus("В этом разделе нет текста для озвучки.");
      return;
    }

    learnHelperTts.playing = true;
    void generateTtsChunks();
  }

  function prepareTtsBlocks() {
    if (learnHelperTts.chunks.length) return;

    var root = getContentRoot();
    var candidates = Array.from(root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote"));
    learnHelperTts.blocks = candidates
      .filter(function (element) {
        return !element.closest(".learn-helper-summary") && normalizeTtsText(element.textContent).length > 20;
      })
      .map(function (element, index) {
        var wordSpans = ensureTtsWordSpans(element);
        return {
          element: element,
          index: index,
          text: normalizeTtsText(element.textContent),
          wordSpans: wordSpans
        };
      });

    learnHelperTts.chunks = splitTtsChunks(learnHelperTts.blocks, 650);
    learnHelperTts.chunkAudios = new Array(learnHelperTts.chunks.length);
    learnHelperTts.currentChunkIndex = Number(localStorage.getItem(getTtsProgressKey()) || "0");
    if (!Number.isFinite(learnHelperTts.currentChunkIndex) || learnHelperTts.currentChunkIndex >= learnHelperTts.chunks.length) {
      learnHelperTts.currentChunkIndex = 0;
    }
  }

  function normalizeTtsText(value) {
    return String(value || "")
      .replace(/\\s+/g, " ")
      .trim();
  }

  function ensureTtsWordSpans(element) {
    if (element.dataset.learnHelperTtsReady === "true") {
      return Array.from(element.querySelectorAll(".learn-helper-tts-word"));
    }

    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return normalizeTtsText(node.nodeValue).length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var fragment = document.createDocumentFragment();
      String(node.nodeValue || "").split(/(\\s+)/).forEach(function (part) {
        if (!part) return;
        if (/\\s+/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }

        var span = document.createElement("span");
        span.className = "learn-helper-tts-word";
        span.textContent = part;
        fragment.appendChild(span);
      });
      node.parentNode.replaceChild(fragment, node);
    });

    element.dataset.learnHelperTtsReady = "true";
    return Array.from(element.querySelectorAll(".learn-helper-tts-word"));
  }

  function splitTtsChunks(blocks, maxChars) {
    var chunks = [];
    var current = [];
    var currentLength = 0;

    blocks.forEach(function (block) {
      if (current.length && currentLength + block.text.length > maxChars) {
        chunks.push({ blocks: current, text: current.map(function (item) { return item.text; }).join(" ") });
        current = [];
        currentLength = 0;
      }

      current.push(block);
      currentLength += block.text.length + 1;
    });

    if (current.length) {
      chunks.push({ blocks: current, text: current.map(function (item) { return item.text; }).join(" ") });
    }

    return chunks;
  }

  function getTtsProgressKey() {
    return "learn-helper:tts:progress:" + learnHelperTts.routeKey;
  }

  function getTtsAudioKey(index, text) {
    return "learn-helper:tts:audio:" + learnHelperTts.routeKey + ":" + index + ":" + hashText(text);
  }

  async function generateTtsChunks() {
    if (learnHelperTts.generating) return;

    learnHelperTts.generating = true;
    learnHelperTts.abortController = new AbortController();

    try {
      for (var index = learnHelperTts.currentChunkIndex; index < learnHelperTts.chunks.length; index += 1) {
        if (learnHelperTts.chunkAudios[index]) continue;

        var chunk = learnHelperTts.chunks[index];
        setTtsStatus("Готовим аудио " + (index + 1) + " из " + learnHelperTts.chunks.length + "...");
        var audioData = await fetchTtsChunkAudio(index, chunk, learnHelperTts.abortController.signal);

        learnHelperTts.chunkAudios[index] = audioData;
        if (learnHelperTts.playing && (!learnHelperTts.audio.src || learnHelperTts.audio.paused)) {
          playTtsChunk(index);
        }
        updateTtsMenuChecks();
      }

      setTtsStatus(learnHelperTts.playing ? "Аудио готово, продолжаем читать." : "Аудио готово.");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setTtsStatus("Не удалось подготовить аудио.");
    } finally {
      learnHelperTts.generating = false;
    }
  }

  async function fetchTtsChunkAudio(index, chunk, signal) {
    var audioData = await loadTtsChunkFromCache(index, chunk.text);
    if (audioData) return audioData;

    var response = await fetch("/api/tts", {
      method: "POST",
      credentials: "same-origin",
      signal: signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunk.text, speaker: "baya" })
    });

    if (!response.ok) throw new Error("tts failed");
    audioData = await response.json();
    await saveTtsChunkToCache(index, chunk.text, audioData);
    return audioData;
  }

  function playTtsChunk(index) {
    var audioData = learnHelperTts.chunkAudios[index];
    if (!audioData || !learnHelperTts.audio) return;

    learnHelperTts.currentChunkIndex = index;
    localStorage.setItem(getTtsProgressKey(), String(index));
    setTtsStatus("Читаем " + (index + 1) + " из " + learnHelperTts.chunks.length + ".");
    markTtsChunk(index);
    learnHelperTts.audio.src = audioData.audio;
    learnHelperTts.audio.playbackRate = learnHelperTts.speed;
    learnHelperTts.audio.play().catch(function () {
      setTtsStatus("Браузер не дал запустить аудио автоматически. Нажмите кнопку еще раз.");
      learnHelperTts.playing = false;
      updateTtsMenuChecks();
    });
    updateTtsMenuChecks();
  }

  function playNextTtsChunk() {
    clearTtsHighlight();
    var nextIndex = learnHelperTts.currentChunkIndex + 1;
    localStorage.setItem(getTtsProgressKey(), String(nextIndex));

    if (nextIndex >= learnHelperTts.chunks.length) {
      learnHelperTts.playing = false;
      setTtsStatus("Раздел дочитан.");
      updateTtsMenuChecks();
      return;
    }

    learnHelperTts.currentChunkIndex = nextIndex;
    if (learnHelperTts.chunkAudios[nextIndex]) {
      playTtsChunk(nextIndex);
      return;
    }

    setTtsStatus("Ждем следующий фрагмент...");
    updateTtsMenuChecks();
  }

  function markTtsChunk(index) {
    clearTtsHighlight();
    var chunk = learnHelperTts.chunks[index];
    if (!chunk || !chunk.blocks.length) return;

    learnHelperTts.currentWordSpans = chunk.blocks.reduce(function (spans, block) {
      return spans.concat(block.wordSpans || []);
    }, []);
    learnHelperTts.currentWordIndex = -1;

    if (learnHelperTts.highlight) {
      chunk.blocks.forEach(function (block) {
        block.element.classList.add("learn-helper-tts-reading");
      });
    }

    if (learnHelperTts.follow) {
      chunk.blocks[0].element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function updateTtsWordHighlight() {
    if (!learnHelperTts.highlight || !learnHelperTts.audio) return;

    var audioData = learnHelperTts.chunkAudios[learnHelperTts.currentChunkIndex];
    var timecodes = audioData && Array.isArray(audioData.timecodes) ? audioData.timecodes : [];
    if (!timecodes.length || !learnHelperTts.currentWordSpans.length) return;

    var currentTime = learnHelperTts.audio.currentTime;
    var wordOffset = 0;
    for (var index = 0; index < timecodes.length; index += 1) {
      var code = timecodes[index];
      var wordsCount = Math.max(1, normalizeTtsText(code.text).split(/\\s+/).filter(Boolean).length);
      if (currentTime >= Number(code.start || 0) && currentTime <= Number(code.end || 0)) {
        highlightTtsWords(wordOffset, wordsCount);
        return;
      }
      wordOffset += wordsCount;
    }
  }

  function highlightTtsWords(start, count) {
    var key = start + ":" + count;
    if (learnHelperTts.currentWordIndex === key) return;

    document.querySelectorAll(".learn-helper-tts-word.is-current").forEach(function (element) {
      element.classList.remove("is-current");
    });

    learnHelperTts.currentWordSpans.slice(start, start + count).forEach(function (span) {
      span.classList.add("is-current");
    });

    learnHelperTts.currentWordIndex = key;
  }

  function clearTtsHighlight() {
    document.querySelectorAll(".learn-helper-tts-reading").forEach(function (element) {
      element.classList.remove("learn-helper-tts-reading");
    });
    document.querySelectorAll(".learn-helper-tts-word.is-current").forEach(function (element) {
      element.classList.remove("is-current");
    });
    learnHelperTts.currentWordSpans = [];
  }

  async function downloadTtsAudio() {
    prepareTtsBlocks();
    if (!learnHelperTts.chunks.length) {
      setTtsStatus("В этом разделе нет текста для скачивания.");
      return;
    }

    var controller = new AbortController();
    try {
      for (var index = 0; index < learnHelperTts.chunks.length; index += 1) {
        if (!learnHelperTts.chunkAudios[index]) {
          setTtsStatus("Готовим файл " + (index + 1) + " из " + learnHelperTts.chunks.length + "...");
          learnHelperTts.chunkAudios[index] = await fetchTtsChunkAudio(index, learnHelperTts.chunks[index], controller.signal);
        }
      }

      var wav = mergeWavDataUrls(learnHelperTts.chunkAudios.map(function (item) { return item.audio; }));
      var link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      link.download = sanitizeFileName(getSectionTitle(getContentRoot()) || "learn-helper-audio") + ".wav";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () {
        URL.revokeObjectURL(link.href);
      }, 1000);
      setTtsStatus("Аудио скачано.");
    } catch (error) {
      setTtsStatus("Не удалось скачать аудио.");
    }
  }

  function mergeWavDataUrls(urls) {
    var parts = urls
      .filter(Boolean)
      .map(decodeDataUrl)
      .filter(function (bytes) { return bytes.length > 44; });
    if (!parts.length) return new Uint8Array();

    var sample = parts[0].slice(0, 44);
    var dataLength = parts.reduce(function (total, bytes) {
      return total + bytes.length - 44;
    }, 0);
    var result = new Uint8Array(44 + dataLength);
    result.set(sample, 0);

    var offset = 44;
    parts.forEach(function (bytes) {
      result.set(bytes.slice(44), offset);
      offset += bytes.length - 44;
    });

    writeUint32(result, 4, result.length - 8);
    writeUint32(result, 40, dataLength);
    return result;
  }

  function decodeDataUrl(url) {
    var base64 = String(url || "").split(",")[1] || "";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function writeUint32(bytes, offset, value) {
    bytes[offset] = value & 255;
    bytes[offset + 1] = (value >> 8) & 255;
    bytes[offset + 2] = (value >> 16) & 255;
    bytes[offset + 3] = (value >> 24) & 255;
  }

  function sanitizeFileName(value) {
    return String(value || "audio")
      .replace(/[\\\\/:*?"<>|]+/g, "-")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 80) || "audio";
  }

  function openTtsDb() {
    return new Promise(function (resolve) {
      var request = indexedDB.open("learn-helper-tts", 1);
      request.onupgradeneeded = function () {
        request.result.createObjectStore("chunks");
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        resolve(null);
      };
    });
  }

  async function loadTtsChunkFromCache(index, text) {
    var db = await openTtsDb();
    if (!db) return null;

    return new Promise(function (resolve) {
      var request = db.transaction("chunks", "readonly").objectStore("chunks").get(getTtsAudioKey(index, text));
      request.onsuccess = function () {
        resolve(request.result || null);
      };
      request.onerror = function () {
        resolve(null);
      };
    });
  }

  async function saveTtsChunkToCache(index, text, audioData) {
    var db = await openTtsDb();
    if (!db) return;

    await new Promise(function (resolve) {
      var request = db.transaction("chunks", "readwrite").objectStore("chunks").put(audioData, getTtsAudioKey(index, text));
      request.onsuccess = function () {
        resolve();
      };
      request.onerror = function () {
        resolve();
      };
    });
  }

  function initLearnHelperFeatures() {
    initSummary();
    initTts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLearnHelperFeatures);
  } else {
    initLearnHelperFeatures();
  }
})();
`.trimStart();
}

function parseSummaryLine(line: string): BookSummaryItem | null {
  const match = line.match(/^(\s*)-\s+\[([^\]]+)]\(([^)]+)\)\s*$/);
  if (!match) return null;

  const level = Math.floor(match[1].length / 2) + 1;
  const href = match[3].replace(/^\.\//, "");
  const id = href.replace(/\.md(?:#.*)?$/i, "").replace(/[^a-z0-9а-яё_-]+/gi, "-");

  return {
    id,
    title: match[2].trim(),
    href,
    level,
  };
}

function splitIntoChapters(markdown: string, fallbackTitle: string): BookChapter[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const chapters: Array<{ title: string; lines: string[]; level: number }> = [];
  let current: { title: string; lines: string[]; level: number } | null = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      if (current && current.lines.some((item) => item.trim())) chapters.push(current);
      current = {
        title: cleanTitle(heading[2]) || fallbackTitle,
        lines: [line],
        level: Math.min(3, heading[1].length),
      };
      continue;
    }

    if (!current) current = { title: fallbackTitle, lines: [`# ${fallbackTitle}`, ""], level: 1 };
    current.lines.push(line);
  }

  if (current && current.lines.some((line) => line.trim())) chapters.push(current);

  const normalized = chapters.length > 0 ? chapters : [{ title: fallbackTitle, lines: [`# ${fallbackTitle}`, "", markdown], level: 1 }];
  return normalized.map((chapter, index) => ({
    title: chapter.title,
    fileName: `${String(index + 1).padStart(2, "0")}-${slugify(chapter.title) || "chapter"}.md`,
    content: `${chapter.lines.join("\n").trim()}\n`,
    level: chapter.level,
  }));
}

function renderSummary(chapters: BookChapter[]) {
  return [
    "# Summary",
    "",
    ...chapters.map((chapter) => `${"  ".repeat(Math.max(0, chapter.level - 1))}- [${escapeSummaryTitle(chapter.title)}](./${chapter.fileName})`),
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

function resolveBackendRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "backend"),
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", "..", "backend"),
  ];

  const found = candidates.find((candidate) => (
    path.basename(candidate) === "backend" && existsSync(path.join(candidate, "package.json"))
  ));

  return found || path.resolve(process.cwd(), "backend");
}
