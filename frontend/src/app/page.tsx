"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthScreen } from "@/components/AuthScreen";
import { BusyOverlay } from "@/components/BusyOverlay";
import { SourcePanel } from "@/components/SourcePanel";
import type { BookGenerationResponse, SourceFileSummary, SourceFilesResponse } from "@/types/reader";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [sourceFiles, setSourceFiles] = useState<SourceFileSummary[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState("");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyTitle, setBusyTitle] = useState("");
  const [busyText, setBusyText] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setIsAuthenticated(Boolean(localStorage.getItem("auth_token")));
    });
  }, []);

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("auth_token");
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }, []);

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

  const loadSourceFiles = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/sources");
      if (!response.ok) return;
      const data = await response.json() as SourceFilesResponse;
      setSourceFiles(data.sources || []);
    } catch {
      setSourceFiles([]);
    }
  }, [fetchWithAuth]);

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
        setActiveSourceId(data.source.id);
        setActiveFileName(data.source.name);
        setActiveBookId(null);
        await loadSourceFiles();
      }
    } catch {
      alert("Ошибка при загрузке");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const handleGenerateBook = async () => {
    if (!activeSourceId) return;

    setBusy(true);
    setBusyTitle("Генерация mdBook");
    setBusyText("Конвертируем исходник в Markdown и собираем книгу...");

    try {
      const response = await fetchWithAuth("/api/books/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: activeSourceId }),
      });

      if (response.ok) {
        const data = await response.json() as BookGenerationResponse;
        setActiveBookId(data.bookId);
      } else {
          const err = await response.json();
          alert("Ошибка: " + err.error);
      }
    } catch {
      alert("Ошибка при генерации");
    } finally {
      setBusy(false);
    }
  };

  const handleSourceOpen = async (source: SourceFileSummary) => {
      setActiveSourceId(source.id);
      setActiveFileName(source.name);
      setActiveBookId(null);
  };

  const handleSourceDelete = async (source: SourceFileSummary) => {
    try {
      const response = await fetchWithAuth(`/api/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
      if (!response.ok) return;
      if (activeSourceId === source.id) {
        setActiveSourceId(null);
        setActiveFileName("");
        setActiveBookId(null);
      }
      await loadSourceFiles();
    } catch {
      alert("Ошибка при удалении");
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      queueMicrotask(() => {
        void loadSourceFiles();
      });
    }
  }, [isAuthenticated, loadSourceFiles]);

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
        onFileSelect={handleFileSelect}
        onGenerateBook={handleGenerateBook}
        hasFile={!!activeSourceId}
      />

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 p-4 h-[calc(100vh-73px)] overflow-hidden">
        <SourcePanel
          sourceFiles={sourceFiles}
          fileName={activeFileName}
          activeSourceId={activeSourceId}
          activeBookId={activeBookId}
          onSourceOpen={handleSourceOpen}
          onSourcesRefresh={loadSourceFiles}
          onSourceDelete={handleSourceDelete}
        />

        <div className="bg-surface border border-line rounded-xl overflow-hidden flex flex-col">
          {activeBookId ? (
            <iframe
              src={`/api/books/view/${encodeURIComponent(activeBookId)}/index.html`}
              className="w-full h-full border-none"
              title="mdBook View"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-secondary">
              {activeSourceId
                ? "Нажмите «Сгенерировать mdBook» для начала чтения"
                : "Выберите или загрузите файл"}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
