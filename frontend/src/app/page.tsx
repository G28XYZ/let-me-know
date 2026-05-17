"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthScreen } from "@/components/AuthScreen";
import { BookLibraryModal } from "@/components/BookLibraryModal";
import { BusyOverlay } from "@/components/BusyOverlay";
import { InteractiveQuestionsFlow, StudyAssistantWidget } from "@/components/StudyAssistantWidget";
import type { BookGenerationResponse, GeneratedQuestionsData, SourceFilesResponse, SourceFileSummary } from "@/types/reader";

type WorkspaceTab = "book" | "questions";
type GeneratedQuestionSet = {
  id: string;
  title: string;
  data: GeneratedQuestionsData;
};

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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("book");
  const [questionSets, setQuestionSets] = useState<GeneratedQuestionSet[]>([]);
  const [activeQuestionSetId, setActiveQuestionSetId] = useState("");

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
    setQuestionSets([]);
    setActiveQuestionSetId("");
    setWorkspaceTab("book");
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
    setQuestionSets([]);
    setActiveQuestionSetId("");
    setWorkspaceTab("book");
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

  const handleQuestionsGenerated = useCallback((data: GeneratedQuestionsData, title: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextSet = {
      id,
      title,
      data,
    };

    setQuestionSets((current) => [nextSet, ...current]);
    setActiveQuestionSetId(id);
    setWorkspaceTab("questions");
  }, []);

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

      <main className="app-main">
        <div className="workspace-tabs" role="tablist" aria-label="Рабочие разделы">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "book"}
            className={workspaceTab === "book" ? "workspace-tab is-active" : "workspace-tab"}
            onClick={() => setWorkspaceTab("book")}
          >
            Книга
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "questions"}
            className={workspaceTab === "questions" ? "workspace-tab is-active" : "workspace-tab"}
            onClick={() => setWorkspaceTab("questions")}
          >
            Вопросы
          </button>
        </div>

        <div className="workspace-content">
          <div className={workspaceTab === "book" ? "workspace-pane is-active" : "workspace-pane"}>
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
          </div>

          <div className={workspaceTab === "questions" ? "workspace-pane is-active" : "workspace-pane"}>
            <div className="questions-workspace">
              {questionSets.length === 0 ? (
                <div className="questions-empty">
                  Сформируйте вопросы через помощника.
                </div>
              ) : (
                <>
                  <div className="question-set-tabs" role="tablist" aria-label="Сгенерированные темы">
                    {questionSets.map((set) => (
                      <button
                        key={set.id}
                        type="button"
                        role="tab"
                        aria-selected={activeQuestionSetId === set.id}
                        className={activeQuestionSetId === set.id ? "question-set-tab is-active" : "question-set-tab"}
                        onClick={() => setActiveQuestionSetId(set.id)}
                      >
                        {set.title}
                      </button>
                    ))}
                  </div>
                  <div className="question-set-panels">
                    {questionSets.map((set) => (
                      <section
                        key={set.id}
                        className={activeQuestionSetId === set.id ? "question-set-panel is-active" : "question-set-panel"}
                        aria-hidden={activeQuestionSetId !== set.id}
                      >
                        <InteractiveQuestionsFlow
                          data={set.data}
                          fetchWithAuth={fetchWithAuth}
                          onClose={() => setWorkspaceTab("book")}
                        />
                      </section>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <StudyAssistantWidget
        activeBookId={activeBookId}
        fetchWithAuth={fetchWithAuth}
        onQuestionsGenerated={handleQuestionsGenerated}
      />
    </>
  );
}
