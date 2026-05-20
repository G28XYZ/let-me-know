import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type SourceFile = {
  id: string;
  name: string;
  root: string;
  relativePath: string;
  size: number;
  updatedAt: string;
  canDelete: boolean;
};

export type SourceRootInfo = {
  key: string;
  label: string;
  dir: string;
};

const backendRoot = resolveBackendRoot();
const projectRoot = path.dirname(backendRoot);

const sourceRoots: SourceRootInfo[] = [
  {
    key: "examples",
    label: "example-docs",
    dir: path.resolve(projectRoot, "example-docs"),
  },
  {
    key: "library",
    label: "backend/data/sources",
    dir: path.resolve(backendRoot, "data", "sources"),
  },
];

const allowedExtensions = new Set([".pdf", ".txt", ".md", ".markdown"]);

export async function listSourceFiles(): Promise<SourceFile[]> {
  await mkdir(sourceRoots[1].dir, { recursive: true });
  const groups = await Promise.all(sourceRoots.map(async (root) => {
    const files = await walkRoot(root.dir).catch(() => []);
    return files.map((file) => ({
      id: encodeSourceId(root.key, file.relativePath),
      name: path.basename(file.relativePath),
      root: root.label,
      relativePath: file.relativePath,
      size: file.size,
      updatedAt: file.updatedAt,
      canDelete: root.key === "library",
    }));
  }));

  return groups
    .flat()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSourceRoots() {
  return sourceRoots.map((root) => ({
    key: root.key,
    label: root.label,
    dir: root.dir,
    exists: existsSync(root.dir),
  }));
}

export function resolveSourceFile(id: string) {
  const decoded = decodeSourceId(id);
  if (!decoded) return null;

  const root = sourceRoots.find((item) => item.key === decoded.rootKey);
  if (!root) return null;

  const absolutePath = path.resolve(root.dir, decoded.relativePath);
  if (!absolutePath.startsWith(`${root.dir}${path.sep}`) && absolutePath !== root.dir) return null;

  return {
    absolutePath,
    fileName: path.basename(decoded.relativePath),
  };
}

export async function deleteSourceFile(id: string) {
  const decoded = decodeSourceId(id);
  if (!decoded || decoded.rootKey !== "library") return false;

  const source = resolveSourceFile(id);
  if (!source) return false;

  await unlink(source.absolutePath);
  return true;
}

export async function saveSourceFile(fileName: string, content: Buffer): Promise<SourceFile> {
  const libraryRoot = sourceRoots.find((root) => root.key === "library");
  if (!libraryRoot) throw new Error("Source library root is not configured.");

  const safeName = sanitizeFileName(fileName);
  const extension = path.extname(safeName).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Only .pdf, .txt, .md and .markdown sources are supported.");
  }

  await mkdir(libraryRoot.dir, { recursive: true });
  const absolutePath = path.join(libraryRoot.dir, safeName);
  await writeFile(absolutePath, content);

  const info = await stat(absolutePath);
  return {
    id: encodeSourceId(libraryRoot.key, safeName),
    name: safeName,
    root: libraryRoot.label,
    relativePath: safeName,
    size: info.size,
    updatedAt: info.mtime.toISOString(),
    canDelete: true,
  };
}

async function walkRoot(rootDir: string, relativeDir = ""): Promise<Array<{ relativePath: string; size: number; updatedAt: string }>> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(rootDir, relativePath);

    if (entry.isDirectory()) return walkRoot(rootDir, relativePath);
    if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) return [];

    const info = await stat(absolutePath);
    return [{
      relativePath,
      size: info.size,
      updatedAt: info.mtime.toISOString(),
    }];
  }));

  return files.flat();
}

function encodeSourceId(rootKey: string, relativePath: string) {
  return Buffer.from(`${rootKey}:${relativePath}`, "utf8").toString("base64url");
}

function sanitizeFileName(value: string) {
  const baseName = path.basename(String(value || "").trim())
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return baseName || `source-${Date.now()}.txt`;
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

function decodeSourceId(id: string) {
  try {
    const value = Buffer.from(id, "base64url").toString("utf8");
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0) return null;
    const rootKey = value.slice(0, separatorIndex);
    const relativePath = value.slice(separatorIndex + 1);
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) return null;
    return { rootKey, relativePath };
  } catch {
    return null;
  }
}
