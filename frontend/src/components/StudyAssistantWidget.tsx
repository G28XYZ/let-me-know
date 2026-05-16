"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookSummaryItem, BookSummaryResponse } from "@/types/reader";

type StudyAssistantMode = "section" | "sections" | "chapter" | "chat";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type StudyAssistantWidgetProps = {
  activeBookId: string | null;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
};

const modes: Array<{ id: StudyAssistantMode; label: string }> = [
  { id: "section", label: "Вопросы для самопроверки раздела" },
  { id: "sections", label: "Вопросы для самопроверки разделов" },
  { id: "chapter", label: "Вопросы для самопроверки всей главы" },
  { id: "chat", label: "Чат" },
];

export function StudyAssistantWidget({ activeBookId, fetchWithAuth }: StudyAssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StudyAssistantMode>("section");
  const [summaryBookId, setSummaryBookId] = useState<string | null>(null);
  const [summaryItems, setSummaryItems] = useState<BookSummaryItem[]>([]);
  const [summaryLoadingBookId, setSummaryLoadingBookId] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [resultText, setResultText] = useState("");

  const summaryLoading = summaryLoadingBookId === activeBookId;
  const activeSummaryItems = useMemo(() => (
    activeBookId === summaryBookId ? summaryItems : []
  ), [activeBookId, summaryBookId, summaryItems]);

  const loadSummary = useCallback((bookId: string) => {
    setSummaryLoadingBookId(bookId);
    setSummaryError("");

    fetchWithAuth(`/api/books/${encodeURIComponent(bookId)}/summary`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить структуру книги");
        return response.json() as Promise<BookSummaryResponse>;
      })
      .then((data) => {
        setSummaryBookId(bookId);
        setSummaryItems(data.items || []);
      })
      .catch((error: unknown) => {
        setSummaryBookId(bookId);
        setSummaryItems([]);
        setSummaryError(error instanceof Error ? error.message : "Не удалось загрузить структуру книги");
      })
      .finally(() => {
        setSummaryLoadingBookId((current) => (current === bookId ? null : current));
      });
  }, [fetchWithAuth]);

  useEffect(() => {
    if (!open || !activeBookId || summaryBookId === activeBookId || summaryLoadingBookId === activeBookId) return;
    queueMicrotask(() => loadSummary(activeBookId));
  }, [activeBookId, loadSummary, open, summaryBookId, summaryLoadingBookId]);

  const sectionItems = useMemo(() => {
    const nestedItems = activeSummaryItems.filter((item) => item.level > 1);
    return nestedItems.length > 0 ? nestedItems : activeSummaryItems;
  }, [activeSummaryItems]);

  const chapterItems = useMemo(() => {
    const rootItems = activeSummaryItems.filter((item) => item.level === 1);
    const chapterLikeItems = rootItems.filter((item) => /^глава/i.test(item.title));
    if (chapterLikeItems.length > 0) return chapterLikeItems;
    return rootItems.length > 0 ? rootItems : activeSummaryItems;
  }, [activeSummaryItems]);

  const effectiveSelectedSectionId = sectionItems.some((item) => item.id === selectedSectionId)
    ? selectedSectionId
    : sectionItems[0]?.id || "";
  const effectiveSelectedChapterId = chapterItems.some((item) => item.id === selectedChapterId)
    ? selectedChapterId
    : chapterItems[0]?.id || "";

  const toggleSection = useCallback((sectionId: string) => {
    setSelectedSectionIds((current) => (
      current.includes(sectionId)
        ? current.filter((item) => item !== sectionId)
        : [...current, sectionId]
    ));
  }, []);

  const handleCreateQuestions = useCallback(() => {
    const selectedItems = mode === "chapter"
      ? chapterItems.filter((item) => item.id === effectiveSelectedChapterId)
      : mode === "section"
        ? sectionItems.filter((item) => item.id === effectiveSelectedSectionId)
        : sectionItems.filter((item) => selectedSectionIds.includes(item.id));

    const titles = selectedItems.map((item) => item.title).join(", ");
    setResultText(titles ? `Контекст выбран: ${titles}` : "Выберите хотя бы один пункт.");
  }, [chapterItems, effectiveSelectedChapterId, effectiveSelectedSectionId, mode, sectionItems, selectedSectionIds]);

  const handleSendMessage = useCallback(() => {
    const message = draftMessage.trim();
    if (!message) return;

    setChatMessages((current) => [
      ...current,
      { role: "user", text: message },
      { role: "assistant", text: "Принял контекст текущей книги. Ответ подключим через AI endpoint." },
    ]);
    setDraftMessage("");
  }, [draftMessage]);

  return (
    <div className="assistant-widget">
      {open && (
        <section className="assistant-panel app-panel shadow-custom" aria-label="Помощник">
          <header className="assistant-header">
            <strong>Помощник</strong>
            <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Закрыть помощника">
              x
            </button>
          </header>

          {!activeBookId ? (
            <div className="assistant-empty">Откройте книгу из библиотеки или загрузите PDF.</div>
          ) : (
            <>
              <div className="assistant-mode-list">
                {modes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={mode === item.id ? "assistant-mode is-active" : "assistant-mode"}
                    onClick={() => {
                      setMode(item.id);
                      setResultText("");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="assistant-content">
                {summaryLoading && <div className="assistant-empty">Загружаем структуру книги...</div>}
                {!summaryLoading && summaryError && <div className="assistant-empty">{summaryError}</div>}
                {!summaryLoading && !summaryError && mode !== "chat" && (
                  <QuestionContextPicker
                    mode={mode}
                    sectionItems={sectionItems}
                    chapterItems={chapterItems}
                    selectedSectionId={effectiveSelectedSectionId}
                    selectedChapterId={effectiveSelectedChapterId}
                    selectedSectionIds={selectedSectionIds}
                    onSectionChange={setSelectedSectionId}
                    onChapterChange={setSelectedChapterId}
                    onSectionToggle={toggleSection}
                    onCreateQuestions={handleCreateQuestions}
                    resultText={resultText}
                  />
                )}
                {!summaryLoading && !summaryError && mode === "chat" && (
                  <div className="assistant-chat">
                    <div className="assistant-chat-log">
                      {chatMessages.length === 0 ? (
                        <div className="assistant-empty">Сообщения появятся здесь.</div>
                      ) : chatMessages.map((message, index) => (
                        <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}>
                          {message.text}
                        </div>
                      ))}
                    </div>
                    <div className="assistant-chat-input">
                      <input
                        className="app-input"
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSendMessage();
                        }}
                        placeholder="Сообщение"
                      />
                      <button type="button" className="app-button px-3 text-sm" onClick={handleSendMessage}>
                        Отправить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Открыть помощника"
      >
        ?
      </button>
    </div>
  );
}

type QuestionContextPickerProps = {
  mode: Exclude<StudyAssistantMode, "chat">;
  sectionItems: BookSummaryItem[];
  chapterItems: BookSummaryItem[];
  selectedSectionId: string;
  selectedChapterId: string;
  selectedSectionIds: string[];
  onSectionChange: (sectionId: string) => void;
  onChapterChange: (chapterId: string) => void;
  onSectionToggle: (sectionId: string) => void;
  onCreateQuestions: () => void;
  resultText: string;
};

function QuestionContextPicker({
  mode,
  sectionItems,
  chapterItems,
  selectedSectionId,
  selectedChapterId,
  selectedSectionIds,
  onSectionChange,
  onChapterChange,
  onSectionToggle,
  onCreateQuestions,
  resultText,
}: QuestionContextPickerProps) {
  if (mode === "sections") {
    return (
      <div className="assistant-form">
        <div className="assistant-check-list">
          {sectionItems.map((item) => (
            <label key={item.id} className="assistant-check-row">
              <input
                type="checkbox"
                checked={selectedSectionIds.includes(item.id)}
                onChange={() => onSectionToggle(item.id)}
              />
              <span>{item.title}</span>
            </label>
          ))}
        </div>
        <button type="button" className="app-button assistant-primary" onClick={onCreateQuestions}>
          Сформировать вопросы
        </button>
        {resultText && <div className="assistant-result">{resultText}</div>}
      </div>
    );
  }

  const items = mode === "chapter" ? chapterItems : sectionItems;
  const value = mode === "chapter" ? selectedChapterId : selectedSectionId;
  const onChange = mode === "chapter" ? onChapterChange : onSectionChange;

  return (
    <div className="assistant-form">
      <select className="app-input assistant-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      <button type="button" className="app-button assistant-primary" onClick={onCreateQuestions}>
        Сформировать вопросы
      </button>
      {resultText && <div className="assistant-result">{resultText}</div>}
    </div>
  );
}
