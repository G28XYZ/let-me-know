"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookSummaryItem, BookSummaryResponse, ChatResponse, EvaluateResponse, GeneratedQuestionsData, ChapterContentResponse } from "@/types/reader";

type StudyAssistantMode = "section" | "sections" | "chapter" | "chat";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type StudyAssistantWidgetProps = {
  activeBookId: string | null;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onQuestionsGenerated: (data: GeneratedQuestionsData, title: string) => void;
};

const modes: Array<{ id: StudyAssistantMode; label: string }> = [
  { id: "section", label: "Вопросы для самопроверки раздела" },
  { id: "sections", label: "Вопросы для самопроверки разделов" },
  { id: "chapter", label: "Вопросы для самопроверки всей главы" },
  { id: "chat", label: "Чат" },
];

export function StudyAssistantWidget({ activeBookId, fetchWithAuth, onQuestionsGenerated }: StudyAssistantWidgetProps) {
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
  
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

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

  const handleCreateQuestions = useCallback(async () => {
    if (!activeBookId) return;
    
    let selectedItems: BookSummaryItem[] = [];
    let questionSetTitle = "Самопроверка";
    if (mode === "chapter") {
      const chapterItem = chapterItems.find((item) => item.id === effectiveSelectedChapterId);
      if (chapterItem) {
        questionSetTitle = chapterItem.title;
        const index = activeSummaryItems.findIndex((item) => item.id === chapterItem.id);
        if (index !== -1) {
          selectedItems.push(chapterItem);
          const chapterLevel = chapterItem.level;
          for (let i = index + 1; i < activeSummaryItems.length; i++) {
            if (activeSummaryItems[i].level <= chapterLevel) break;
            selectedItems.push(activeSummaryItems[i]);
          }
        }
      }
    } else if (mode === "section") {
      selectedItems = sectionItems.filter((item) => item.id === effectiveSelectedSectionId);
      questionSetTitle = selectedItems[0]?.title || questionSetTitle;
    } else {
      selectedItems = sectionItems.filter((item) => selectedSectionIds.includes(item.id));
      questionSetTitle = selectedItems.length === 1
        ? selectedItems[0].title
        : `Выбранные разделы: ${selectedItems.length}`;
    }

    if (selectedItems.length === 0) {
      setResultText("Выберите хотя бы один пункт.");
      return;
    }

    setLoadingQuestions(true);
    setResultText("Подготавливаем вопросы...");

    try {
      // Fetch content for each selected section
      const sectionsWithText = await Promise.all(
        selectedItems.map(async (item) => {
          const res = await fetchWithAuth(`/api/books/${encodeURIComponent(activeBookId)}/chapters/${encodeURIComponent(item.href)}`);
          if (!res.ok) throw new Error(`Не удалось загрузить ${item.title}`);
          const data = await res.json() as ChapterContentResponse;
          return { title: item.title, text: data.content };
        })
      );

      // Generate questions via AI
      const aiRes = await fetchWithAuth("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sectionsWithText, provider: "gemini-cli" }),
      });

      if (!aiRes.ok) throw new Error("Ошибка AI при генерации вопросов");
      const aiData = await aiRes.json() as GeneratedQuestionsData;

      onQuestionsGenerated(aiData, questionSetTitle || "Самопроверка");
      setResultText("Вопросы готовы во вкладке Тренажер.");
      setOpen(false);
    } catch (error) {
      setResultText(error instanceof Error ? error.message : "Произошла ошибка");
    } finally {
      setLoadingQuestions(false);
    }
  }, [activeBookId, activeSummaryItems, chapterItems, effectiveSelectedChapterId, effectiveSelectedSectionId, fetchWithAuth, mode, onQuestionsGenerated, sectionItems, selectedSectionIds]);

  const handleSendMessage = useCallback(async () => {
    const message = draftMessage.trim();
    if (!message || loadingChat) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", text: message }];
    setChatMessages(newMessages);
    setDraftMessage("");
    setLoadingChat(true);

    try {
      const aiRes = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, provider: "gemini-cli" }),
      });

      if (!aiRes.ok) throw new Error("Ошибка AI");
      const aiData = await aiRes.json() as ChatResponse;

      setChatMessages((current) => [...current, { role: "assistant", text: aiData.text }]);
    } catch {
      setChatMessages((current) => [...current, { role: "assistant", text: "Извините, произошла ошибка при общении с AI." }]);
    } finally {
      setLoadingChat(false);
    }
  }, [chatMessages, draftMessage, fetchWithAuth, loadingChat]);

  return (
    <>
      <div className="assistant-widget fixed right-[18px] bottom-[18px] z-[60]">
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
                      loading={loadingQuestions}
                    />
                  )}
                  {!summaryLoading && !summaryError && mode === "chat" && (
                    <div className="assistant-chat">
                      <div className="assistant-chat-log">
                        {chatMessages.length === 0 ? (
                          <div className="assistant-empty">Задайте вопрос по материалу книги.</div>
                        ) : (
                          <>
                            {chatMessages.map((message, index) => (
                              <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}>
                                {message.text}
                              </div>
                            ))}
                            {loadingChat && (
                              <div className="assistant-message assistant opacity-50">Печатает...</div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="assistant-chat-input">
                        <input
                          className="app-input"
                          value={draftMessage}
                          onChange={(event) => setDraftMessage(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleSendMessage();
                          }}
                          placeholder="Сообщение"
                          disabled={loadingChat}
                        />
                        <button type="button" className="app-button px-3 text-sm" onClick={() => void handleSendMessage()} disabled={loadingChat}>
                          {loadingChat ? "..." : "Отправить"}
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
    </>
  );
}

export function InteractiveQuestionsFlow({
  data,
  fetchWithAuth,
  onClose
}: {
  data: GeneratedQuestionsData;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"quiz" | "practice" | "open">(() => {
    if (data.quizzes?.length) return "quiz";
    if (data.practicalTask) return "practice";
    return "open";
  });
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizResults, setQuizResults] = useState<Record<number, boolean>>({});
  const [quizHints, setQuizHints] = useState<Record<number, boolean>>({});
  const [practicalAnswer, setPracticalAnswer] = useState("");
  const [openAnswer, setOpenAnswer] = useState("");
  const [showPracticalHint, setShowPracticalHint] = useState(false);
  const [showOpenHint, setShowOpenHint] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState<"practice" | "open" | null>(null);
  const [practicalCheck, setPracticalCheck] = useState<EvaluateResponse | null>(null);
  const [openCheck, setOpenCheck] = useState<EvaluateResponse | null>(null);
  const [finished, setFinished] = useState(false);
  
  const quizzes = data.quizzes || [];
  const quizzesCount = quizzes.length;
  const practicalTask = data.practicalTask;
  const openQuestion = data.openQuestion;
  const tabs = [
    ...(quizzesCount > 0 ? [{ id: "quiz" as const, label: "Тест" }] : []),
    ...(practicalTask ? [{ id: "practice" as const, label: "Практика" }] : []),
    ...(openQuestion ? [{ id: "open" as const, label: "Вопрос" }] : []),
  ];
  const currentQuiz = quizzes[quizIndex];
  const selectedOption = quizAnswers[quizIndex] || null;
  const isCorrect = quizResults[quizIndex];
  const showQuizHint = Boolean(quizHints[quizIndex]);
  const correctAnswersCount = quizzes.reduce((count, _quiz, index) => (
    quizResults[index] === true ? count + 1 : count
  ), 0);
  const canFinish =
    (quizzesCount === 0 || correctAnswersCount === quizzesCount)
    && (!practicalTask || practicalCheck?.isCorrect === true)
    && (!openQuestion || openCheck?.isCorrect === true);

  const handleCheckTextAnswer = useCallback(async (
    kind: "practice" | "open",
    question: string,
    answer: string,
    contextText: string
  ) => {
    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer || checkingAnswer) return;

    setCheckingAnswer(kind);
    try {
      const response = await fetchWithAuth("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          answer: normalizedAnswer,
          contextText,
          provider: "gemini-cli",
        }),
      });

      if (!response.ok) throw new Error("Не удалось проверить ответ");
      const result = await response.json() as EvaluateResponse;

      if (kind === "practice") {
        setPracticalCheck(result);
      } else {
        setOpenCheck(result);
      }
    } catch (error) {
      const result = {
        isCorrect: false,
        feedback: error instanceof Error ? error.message : "Не удалось проверить ответ",
      };
      if (kind === "practice") {
        setPracticalCheck(result);
      } else {
        setOpenCheck(result);
      }
    } finally {
      setCheckingAnswer(null);
    }
  }, [checkingAnswer, fetchWithAuth]);
  
  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted mb-4">Не удалось сформировать задания.</p>
        <button type="button" className="app-button px-6 assistant-primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h3 className="text-xl mb-4 font-bold">Вы отлично справились!</h3>
        <p className="text-muted mb-6">Самопроверка успешно завершена.</p>
        <button type="button" className="app-button px-6 assistant-primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  const renderTabContent = () => {
    if (activeTab === "quiz" && currentQuiz) {
      return (
        <div className="space-y-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-lg mb-2 text-left">Вопрос {quizIndex + 1} из {quizzesCount}</h4>
              <p className="text-[1rem] leading-relaxed mb-4 text-left">{currentQuiz.question}</p>
            </div>
            <span className="question-progress-label">{correctAnswersCount}/{quizzesCount}</span>
          </div>
          <div className="flex flex-col gap-3">
            {currentQuiz.options?.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isWrong = isSelected && isCorrect === false;
              const isRight = isSelected && isCorrect === true;
              
              let btnClass = "question-option";
              if (isSelected) btnClass += " is-selected";
              if (isRight) btnClass += " is-correct";
              if (isWrong) btnClass += " is-wrong";
              
              return (
                <button 
                  key={i} 
                  type="button"
                  className={btnClass}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (isCorrect) return;
                    const correct = opt === currentQuiz.correctAnswer;
                    setQuizAnswers((current) => ({ ...current, [quizIndex]: opt }));
                    setQuizResults((current) => ({ ...current, [quizIndex]: correct }));
                    if (!correct) {
                      setQuizHints((current) => ({ ...current, [quizIndex]: true }));
                    }
                  }}
                  disabled={isCorrect === true}
                >
                  <span className="question-option-marker" aria-hidden="true" />
                  <span className="question-option-label">{opt}</span>
                </button>
              );
            })}
          </div>
          {showQuizHint && isCorrect === false && (
            <div className="mt-4 p-4 bg-warning-soft border-l-4 border-warning rounded">
              <strong className="block mb-1 text-warning">Подсказка:</strong> 
              {currentQuiz.hint}
            </div>
          )}
          <div className="question-nav-row">
            <button
              type="button"
              className="app-button px-4"
              onClick={() => setQuizIndex((current) => Math.max(0, current - 1))}
              disabled={quizIndex === 0}
            >
              Назад
            </button>
            <button
              type="button"
              className="app-button px-4 assistant-primary"
              onClick={() => setQuizIndex((current) => Math.min(quizzesCount - 1, current + 1))}
              disabled={quizIndex >= quizzesCount - 1 || isCorrect !== true}
            >
              Далее
            </button>
          </div>
        </div>
      );
    }

    if (activeTab === "practice" && practicalTask) {
      return (
        <div className="space-y-4 text-left">
          <h4 className="font-bold text-lg mb-2 text-left">Практическое задание</h4>
          <p className="text-[1rem] leading-relaxed mb-4 text-left">{practicalTask.task}</p>
          <textarea
            className="app-input question-answer-input"
            value={practicalAnswer}
            onChange={(event) => {
              setPracticalAnswer(event.target.value);
              setPracticalCheck(null);
            }}
            placeholder="Напишите свой ответ"
          />
          <div className="question-action-row">
            <button
              type="button"
              className="app-button px-4 assistant-primary"
              onClick={() => void handleCheckTextAnswer("practice", practicalTask.task, practicalAnswer, practicalTask.hint)}
              disabled={!practicalAnswer.trim() || checkingAnswer !== null}
            >
              {checkingAnswer === "practice" ? "Проверяем..." : "Проверить ответ"}
            </button>
            <button type="button" className="app-button px-4 text-sm" onClick={() => setShowPracticalHint((current) => !current)}>
              {showPracticalHint ? "Скрыть подсказку" : "Показать подсказку"}
            </button>
          </div>
          {practicalCheck && (
            <div className={practicalCheck.isCorrect ? "question-feedback is-correct" : "question-feedback is-wrong"}>
              {practicalCheck.feedback}
            </div>
          )}
          {showPracticalHint && (
            <div className="mt-4 p-4 bg-warning-soft border-l-4 border-warning rounded">
              <strong className="block mb-1 text-warning">Подсказка:</strong> 
              {practicalTask.hint}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "open" && openQuestion) {
      return (
        <div className="space-y-4 text-left">
          <h4 className="font-bold text-lg mb-2 text-left">Открытый вопрос для размышления</h4>
          <p className="text-[1rem] leading-relaxed mb-4 text-left">{openQuestion.question}</p>
          <textarea
            className="app-input question-answer-input"
            value={openAnswer}
            onChange={(event) => {
              setOpenAnswer(event.target.value);
              setOpenCheck(null);
            }}
            placeholder="Напишите свой ответ"
          />
          <div className="question-action-row">
            <button
              type="button"
              className="app-button px-4 assistant-primary"
              onClick={() => void handleCheckTextAnswer("open", openQuestion.question, openAnswer, openQuestion.hint)}
              disabled={!openAnswer.trim() || checkingAnswer !== null}
            >
              {checkingAnswer === "open" ? "Проверяем..." : "Проверить ответ"}
            </button>
            <button type="button" className="app-button px-4 text-sm" onClick={() => setShowOpenHint((current) => !current)}>
              {showOpenHint ? "Скрыть ответ / подсказку" : "Показать ответ / подсказку"}
            </button>
          </div>
          {openCheck && (
            <div className={openCheck.isCorrect ? "question-feedback is-correct" : "question-feedback is-wrong"}>
              {openCheck.feedback}
            </div>
          )}
          {showOpenHint && (
            <div className="mt-4 p-4 bg-warning-soft border-l-4 border-warning rounded">
              <strong className="block mb-1 text-warning">Разбор:</strong> 
              {openQuestion.hint}
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col">
      <div className="question-tabs" role="tablist" aria-label="Разделы самопроверки">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "question-tab is-active" : "question-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="question-tab-panel">
        {renderTabContent()}
      </div>
      <div className="question-finish-row">
        <button
          type="button"
          className="app-button px-6 assistant-primary"
          onClick={() => setFinished(true)}
          disabled={!canFinish}
        >
          Завершить проверку
        </button>
      </div>
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
  loading: boolean;
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
  loading,
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
        <button type="button" className="app-button assistant-primary" onClick={onCreateQuestions} disabled={loading}>
          {loading ? "Сборка..." : "Сформировать вопросы"}
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
      <select className="app-input assistant-select" value={value} onChange={(event) => onChange(event.target.value)} disabled={loading}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      <button type="button" className="app-button assistant-primary" onClick={onCreateQuestions} disabled={loading}>
        {loading ? "Сборка..." : "Сформировать вопросы"}
      </button>
      {resultText && <div className="assistant-result">{resultText}</div>}
    </div>
  );
}
