"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthScreen } from "@/components/AuthScreen";
import { BookLibraryModal } from "@/components/BookLibraryModal";
import { BusyOverlay } from "@/components/BusyOverlay";
import { StudyAssistantWidget } from "@/components/StudyAssistantWidget";
import type { BookGenerationResponse, SourceFilesResponse, SourceFileSummary } from "@/types/reader";

const mdBookThemes = ["light", "rust", "coal", "navy", "ayu"] as const;
type MdBookTheme = (typeof mdBookThemes)[number];

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<SourceFileSummary | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [sourceFiles, setSourceFiles] = useState<SourceFileSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyTitle, setBusyTitle] = useState("");
  const [busyText, setBusyText] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setIsAuthenticated(Boolean(localStorage.getItem("auth_token")));
    });
  }, []);

  useEffect(() => {
    const applyMdBookTheme = () => {
      const savedTheme = localStorage.getItem("mdbook-theme");
      const theme: MdBookTheme = mdBookThemes.includes(savedTheme as MdBookTheme)
        ? savedTheme as MdBookTheme
        : "light";

      document.documentElement.classList.remove(...mdBookThemes);
      document.documentElement.classList.add(theme);
    };

    applyMdBookTheme();
    window.addEventListener("storage", applyMdBookTheme);
    const themeSync = window.setInterval(applyMdBookTheme, 500);

    return () => {
      window.removeEventListener("storage", applyMdBookTheme);
      window.clearInterval(themeSync);
    };
  }, []);

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("auth_token");
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }, []);

  const loadSourceFiles = useCallback(async () => {
    setLibraryLoading(true);

    try {
      const response = await fetchWithAuth("/api/sources");
      if (!response.ok) throw new Error("Ошибка загрузки библиотеки");

      const data = await response.json() as SourceFilesResponse;
      setSourceFiles(data.sources || []);
    } catch {
      setSourceFiles([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [fetchWithAuth]);

  const handleLibraryOpen = useCallback(() => {
    setLibraryOpen(true);
    void loadSourceFiles();
  }, [loadSourceFiles]);

  const openBook = useCallback(async (source: SourceFileSummary) => {
    setBusyTitle("Открываем книгу");
    setBusyText(`Проверяем собранный mdBook для ${source.name}...`);

    const response = await fetchWithAuth("/api/books/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Ошибка при открытии книги" }));
      throw new Error(error.error || "Ошибка при открытии книги");
    }

    const data = await response.json() as BookGenerationResponse;
    setActiveSource(source);
    setActiveBookId(data.bookId);
  }, [fetchWithAuth]);

  const regenerateBook = useCallback(async (source: SourceFileSummary) => {
    setBusyTitle("Пересборка mdBook");
    setBusyText(`Заново конвертируем и собираем ${source.name}...`);

    const response = await fetchWithAuth("/api/books/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Ошибка при пересборке" }));
      throw new Error(error.error || "Ошибка при пересборке");
    }

    const data = await response.json() as BookGenerationResponse;
    setActiveSource(source);
    setActiveBookId(data.bookId);
  }, [fetchWithAuth]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });

      if (response.ok) {
        localStorage.setItem("auth_token", passwordInput);
        setIsAuthenticated(true);
        return;
      }
      setAuthError("Неверный пароль");
    } catch {
      setAuthError("Ошибка сети");
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setBusyTitle("Загрузка файла");
    setBusyText(`Загружаем ${file.name}...`);

    try {
      const response = await fetchWithAuth("/api/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });

      if (response.ok) {
        const data = await response.json() as { source: SourceFileSummary };
        setActiveBookId(null);
        setActiveSource(null);
        setSourceFiles((previousSources) => [
          data.source,
          ...previousSources.filter((source) => source.id !== data.source.id),
        ]);
        await regenerateBook(data.source);
      } else {
        const error = await response.json().catch(() => ({ error: "Ошибка при загрузке" }));
        alert("Ошибка: " + error.error);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при загрузке");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const handleLibrarySourceOpen = async (source: SourceFileSummary) => {
    setLibraryOpen(false);
    setBusy(true);

    try {
      setActiveBookId(null);
      setActiveSource(null);
      await openBook(source);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при открытии книги");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateActiveBook = async () => {
    if (!activeSource) return;

    setBusy(true);

    try {
      setActiveBookId(null);
      await regenerateBook(activeSource);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при пересборке книги");
    } finally {
      setBusy(false);
    }
  };

  if (isAuthenticated === null) return null;
  if (!isAuthenticated) {
    return (
      <AuthScreen
        passwordInput={passwordInput}
        authError={authError}
        onPasswordChange={setPasswordInput}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <>
      {busy && <BusyOverlay title={busyTitle} text={busyText} />}

      <AppHeader
        busy={busy}
        onLibraryOpen={handleLibraryOpen}
        onRegenerateBook={handleRegenerateActiveBook}
        onFileSelect={handleFileSelect}
        hasActiveBook={!!activeSource && !!activeBookId}
      />

      <BookLibraryModal
        open={libraryOpen}
        sources={sourceFiles}
        loading={libraryLoading}
        busy={busy}
        onClose={() => setLibraryOpen(false)}
        onRefresh={loadSourceFiles}
        onOpenSource={handleLibrarySourceOpen}
      />

      <main className="h-[calc(100vh-var(--menu-bar-height))] overflow-hidden bg-bg">
        {activeBookId ? (
          <iframe
            src={`/api/books/view/${encodeURIComponent(activeBookId)}/index.html`}
            className="h-full w-full border-none"
            title="mdBook"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted">
            <p className="max-w-md text-sm">Загрузите PDF, Markdown или TXT, чтобы собрать mdBook.</p>
          </div>
        )}
      </main>

      <StudyAssistantWidget activeBookId={activeBookId} fetchWithAuth={fetchWithAuth} />
    </>
  );
}
