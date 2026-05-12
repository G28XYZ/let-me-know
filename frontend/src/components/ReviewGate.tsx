"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { methodContent, type MethodType } from "@/lib/methods";
import type { FetchWithAuth, QuestionSet } from "@/types/reader";

/**
 * Внутренний шаг паузы повторения.
 */
type ReviewStep = "quiz" | "practical" | "summary";

/**
 * Контекст, который родитель передает компоненту вопросов перед переходом дальше.
 */
export type ReviewGateOpenInput = {
  /** Текст текущего фрагмента, на котором пользователь нажал "дальше". */
  currentText: string;
  /** Текст, пройденный с момента предыдущего вопроса или паузы. */
  segmentText: string;
  /** Предыдущий контекст. Сейчас передается как задел для будущей проверки связей. */
  previousContext?: string;
  /** Индекс текущего фрагмента. */
  currentIndex: number;
  /** Общее количество уже подготовленных фрагментов. */
  totalChunks: number;
};

/**
 * Imperative API компонента вопросов.
 *
 * Родитель использует этот контракт перед переходом к следующему фрагменту:
 * вызывает `openForSegment`, а компонент сам решает, есть ли вопросы и надо ли
 * блокировать чтение.
 */
export type ReviewGateHandle = {
  /**
   * Запрашивает вопросы у AI для переданного сегмента.
   *
   * Возвращает `true`, если компонент открыл паузу повторения и навигацию нужно
   * заблокировать. Возвращает `false`, если фича выключена, вопросов нет или
   * запрос не удался.
   */
  openForSegment: (input: ReviewGateOpenInput) => Promise<boolean>;
  /** Полностью сбрасывает внутреннее состояние вопросов и ответов. */
  reset: () => void;
  /** Сообщает, есть ли сейчас активный набор вопросов. */
  hasQuestions: () => boolean;
};

/**
 * Props автономного компонента вопросов.
 */
export type ReviewGateProps = {
  /** Включена ли фича вопросов на паузах повторения. */
  enabled: boolean;
  /** Текущий метод обучения, влияет на формулировки вопросов. */
  method: MethodType;
  /** AI provider для backend-запросов. */
  provider: string;
  /** Базовый endpoint анализа, из него строятся `/questions` и `/evaluate`. */
  apiEndpoint: string;
  /** Авторизованный fetch, передается снаружи для минимальной зависимости от auth. */
  fetchWithAuth: FetchWithAuth;
  /** Контекст текущего фрагмента для проверки открытого ответа. */
  contextText: string;
  /** Вызывается после успешного завершения паузы, чтобы родитель продолжил чтение. */
  onComplete: () => void;
};

/**
 * Результат проверки открытого ответа.
 */
type EvaluationFeedback = {
  /** Считается ли ответ корректным. */
  isCorrect: boolean;
  /** Короткий комментарий или подсказка от AI. */
  feedback: string;
  /** Нужно ли показывать текст подсказки пользователю. */
  showHint: boolean;
};

/**
 * Сырой элемент тестового вопроса из API.
 */
type QuestionApiItem = {
  /** Текст вопроса из API. */
  question?: unknown;
  /** Варианты ответа из API. */
  options?: unknown;
  /** Правильный ответ из API. */
  correctAnswer?: unknown;
};

/**
 * Сырой ответ `/questions`.
 */
type QuestionApiResponse = {
  /** Backend может явно вернуть `false`, если фича выключена. */
  featureEnabled?: boolean;
  /** Есть ли вопросы, которыми нужно блокировать переход дальше. */
  hasQuestions?: boolean;
  /** Открытый вопрос. */
  question?: unknown;
  /** Тестовые вопросы. */
  quiz?: unknown;
  /** Практическое задание. */
  practicalTask?: unknown;
};

type CachedReview = {
  questionSet: QuestionSet;
  evaluationContext: string;
};

/**
 * Автономный компонент вопросов на паузе повторения.
 *
 * Компонент держит у себя состояние вопросов, ответов, подсказок, проверки и
 * свернутого режима. Родитель не передает готовые вопросы: он вызывает
 * `openForSegment`, а компонент сам обращается к `/questions`, нормализует ответ
 * и решает, нужно ли показывать паузу.
 */
export const ReviewGate = forwardRef<ReviewGateHandle, ReviewGateProps>(function ReviewGate({
  enabled,
  method,
  provider,
  apiEndpoint,
  fetchWithAuth,
  contextText,
  onComplete,
}, ref) {
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [step, setStep] = useState<ReviewStep>("summary");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizFeedback, setQuizFeedback] = useState<{ hasErrors: boolean; showHint: boolean } | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateFeedback, setEvaluateFeedback] = useState<EvaluationFeedback | null>(null);
  const [evaluationContext, setEvaluationContext] = useState("");
  const [currentReviewKey, setCurrentReviewKey] = useState("");
  const reviewCacheRef = useRef(new Map<string, CachedReview>());
  const completedReviewKeysRef = useRef(new Set<string>());

  const questionEndpoint = useMemo(() => apiEndpoint.replace("/analyze", "/questions"), [apiEndpoint]);
  const analyzeEndpoint = useMemo(() => apiEndpoint, [apiEndpoint]);
  const evaluateEndpoint = useMemo(() => apiEndpoint.replace("/analyze", "/evaluate"), [apiEndpoint]);

  const closeReview = () => {
    setActive(false);
    setMinimized(false);
    setLoading(false);
    setQuestionSet(null);
    setStep("summary");
    setQuizAnswers({});
    setQuizFeedback(null);
    setAnswerText("");
    setEvaluating(false);
    setEvaluateFeedback(null);
    setEvaluationContext("");
    setCurrentReviewKey("");
  };

  const reset = () => {
    closeReview();
    reviewCacheRef.current.clear();
    completedReviewKeysRef.current.clear();
  };

  const chooseFirstStep = (nextQuestionSet: QuestionSet): ReviewStep => {
    if (nextQuestionSet.quiz.length > 0) return "quiz";
    if (nextQuestionSet.practicalTask) return "practical";
    return "summary";
  };

  const normalizeQuestionSet = (data: QuestionApiResponse): QuestionSet | null => {
    const quiz = Array.isArray(data.quiz)
      ? data.quiz
          .filter((item): item is QuestionApiItem => {
            if (!item || typeof item !== "object") return false;
            const candidate = item as QuestionApiItem;
            return Boolean(candidate.question) && Array.isArray(candidate.options) && Boolean(candidate.correctAnswer);
          })
          .map((item) => ({
            question: String(item.question),
            options: (item.options as unknown[]).map((option) => String(option)).filter(Boolean),
            correctAnswer: String(item.correctAnswer),
          }))
          .filter((item) => item.options.length > 0)
      : [];

    const question = String(data.question || "").trim();
    const practicalTask = String(data.practicalTask || "").trim();

    if (!question && !practicalTask && quiz.length === 0) return null;
    return { question, practicalTask, quiz };
  };

  useImperativeHandle(ref, () => ({
    openForSegment: async (input) => {
      if (!enabled || !input.segmentText.trim()) return false;

      const reviewKey = buildReviewKey(method, provider, input);
      if (completedReviewKeysRef.current.has(reviewKey)) return false;

      const cachedReview = reviewCacheRef.current.get(reviewKey);
      if (cachedReview) {
        setQuestionSet(cachedReview.questionSet);
        setEvaluationContext(cachedReview.evaluationContext);
        setCurrentReviewKey(reviewKey);
        setStep(chooseFirstStep(cachedReview.questionSet));
        setActive(true);
        setMinimized(false);
        setQuizAnswers({});
        setQuizFeedback(null);
        setAnswerText("");
        setEvaluateFeedback(null);
        return true;
      }

      setLoading(true);
      try {
        const requestOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            method,
            methodTitle: methodContent[method].title,
            currentText: input.currentText,
            segmentText: input.segmentText,
            previousContext: input.previousContext || "",
            progress: {
              currentIndex: input.currentIndex,
              totalChunks: input.totalChunks,
            },
            featureEnabled: enabled,
          }),
        };

        let response = await fetchWithAuth(questionEndpoint, requestOptions);
        if (response.status === 404) {
          response = await fetchWithAuth(analyzeEndpoint, requestOptions);
        }

        if (!response.ok) return false;
        const data = await response.json() as QuestionApiResponse;
        if (data.featureEnabled === false || data.hasQuestions === false) return false;

        const nextQuestionSet = normalizeQuestionSet(data);
        if (!nextQuestionSet) return false;

        const nextEvaluationContext = input.segmentText || input.currentText;
        reviewCacheRef.current.set(reviewKey, {
          questionSet: nextQuestionSet,
          evaluationContext: nextEvaluationContext,
        });
        setQuestionSet(nextQuestionSet);
        setEvaluationContext(nextEvaluationContext);
        setCurrentReviewKey(reviewKey);
        setStep(chooseFirstStep(nextQuestionSet));
        setActive(true);
        setMinimized(false);
        setQuizAnswers({});
        setQuizFeedback(null);
        setAnswerText("");
        setEvaluateFeedback(null);
        return true;
      } catch (error) {
        console.error("Review questions failed:", error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    reset,
    hasQuestions: () => Boolean(questionSet),
  }));

  const moveToNextStep = () => {
    setQuizAnswers({});
    setQuizFeedback(null);
    setAnswerText("");
    setEvaluateFeedback(null);

    if (step === "quiz") {
      setStep(questionSet?.practicalTask ? "practical" : "summary");
      return;
    }

    if (step === "practical") {
      setStep("summary");
      return;
    }

    if (currentReviewKey) {
      completedReviewKeysRef.current.add(currentReviewKey);
    }
    closeReview();
    onComplete();
  };

  const handleQuizSubmit = () => {
    const quiz = questionSet?.quiz || [];
    const hasErrors = quiz.some((item, index) => quizAnswers[index] !== item.correctAnswer);

    if (hasErrors) {
      setQuizFeedback({ hasErrors: true, showHint: false });
      return;
    }

    moveToNextStep();
  };

  const handleTextSubmit = async () => {
    if (!answerText.trim() || evaluating || !questionSet) return;

    const question = step === "practical"
      ? questionSet.practicalTask
      : (questionSet.question || methodContent[method].task);

    setEvaluating(true);
    setEvaluateFeedback(null);

    try {
      const response = await fetchWithAuth(evaluateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          question,
          answer: answerText,
          contextText: evaluationContext || contextText,
        }),
      });

      if (!response.ok) throw new Error("Evaluation error");
      const data = await response.json() as { isCorrect?: unknown; feedback?: unknown };
      setEvaluateFeedback({
        isCorrect: Boolean(data.isCorrect),
        feedback: String(data.feedback || ""),
        showHint: false,
      });
    } catch (error) {
      console.error("Review answer evaluation failed:", error);
      setEvaluateFeedback({ isCorrect: false, feedback: "Произошла ошибка при проверке ответа.", showHint: true });
    } finally {
      setEvaluating(false);
    }
  };

  if (loading && !active) return null;
  if (!active || !questionSet) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 px-6 py-3 bg-warning text-white font-bold rounded-full shadow-lg hover:bg-warning transition-all"
        >
          <span>Вернуться к заданию</span>
        </button>
      </div>
    );
  }

  const header = (title: string, subtitle: string) => (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-accent text-xs font-bold uppercase tracking-wide">{title}</p>
        <h3 className="text-lg font-bold mt-1">{subtitle}</h3>
      </div>
      <button
        onClick={() => setMinimized(true)}
        className="p-1 hover:bg-black/5 rounded transition-colors"
        title="Свернуть задание, чтобы перечитать текст"
      >
        <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );

  if (step === "quiz") {
    const quiz = questionSet.quiz;

    return (
      <div className="flex flex-col gap-3 p-4 border-t border-line bg-warning-soft">
        {header("Пауза повторения: Тест", "Проверьте свои знания")}
        {quizFeedback?.hasErrors && !quizFeedback.showHint && (
          <p className="text-danger text-sm font-bold mt-2">Есть ошибки. Попробуйте еще раз или воспользуйтесь подсказкой.</p>
        )}
        <div className="flex flex-col gap-4">
          {quiz.map((item, questionIndex) => {
            const isWrong = quizFeedback?.hasErrors && quizAnswers[questionIndex] !== item.correctAnswer;
            const showCorrect = quizFeedback?.showHint;

            return (
              <div key={questionIndex} className="text-sm">
                <p className="font-bold mb-2">{item.question}</p>
                <div className="flex flex-col gap-1">
                  {item.options.map((option, optionIndex) => {
                    let labelClass = "flex items-center gap-2 cursor-pointer p-2 border border-line rounded bg-surface hover:border-accent transition-colors";

                    if (quizAnswers[questionIndex] === option) {
                      labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-accent bg-accent-soft";
                    }

                    if (isWrong && quizAnswers[questionIndex] === option) {
                      labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-danger bg-danger/10";
                    }

                    if (showCorrect && item.correctAnswer === option) {
                      labelClass = "flex items-center gap-2 cursor-pointer p-2 border rounded transition-colors border-accent bg-accent/20 font-bold";
                    }

                    return (
                      <label key={`${questionIndex}-${optionIndex}`} className={labelClass}>
                        <input
                          type="radio"
                          name={`review-q-${questionIndex}`}
                          value={option}
                          checked={quizAnswers[questionIndex] === option}
                          onChange={() => setQuizAnswers((previous) => ({ ...previous, [questionIndex]: option }))}
                          className="accent-accent"
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={handleQuizSubmit} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm">Далее</button>
          {quizFeedback?.hasErrors && !quizFeedback.showHint && (
            <button
              onClick={() => setQuizFeedback({ hasErrors: true, showHint: true })}
              className="px-4 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors"
            >
              Подсказка
            </button>
          )}
        </div>
      </div>
    );
  }

  const textPrompt = step === "practical"
    ? questionSet.practicalTask
    : (questionSet.question || methodContent[method].task);

  return (
    <div className="flex flex-col gap-3 p-4 border-t border-line bg-warning-soft">
      {header(step === "practical" ? "Пауза повторения: Практика" : "Пауза повторения: Закрепление", step === "practical" ? "Практическое задание" : "Ответьте на вопрос")}
      <p className="text-sm mt-1">{textPrompt}</p>
      {evaluateFeedback && (
        <div className={`mt-2 p-3 text-sm rounded-lg ${evaluateFeedback.isCorrect ? "bg-accent-soft border border-accent text-accent-strong" : "bg-danger/10 border border-danger text-danger"}`}>
          <strong>{evaluateFeedback.isCorrect ? "Отлично!" : "Попробуйте еще раз:"}</strong>
          {evaluateFeedback.showHint && <p className="mt-1">{evaluateFeedback.feedback}</p>}
        </div>
      )}
      <textarea
        className="w-full p-3 border border-line rounded-lg text-sm min-h-[100px]"
        placeholder={step === "practical" ? "Опишите ваше решение..." : "Введите ответ своими словами"}
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        disabled={evaluating || evaluateFeedback?.isCorrect}
      />
      <div className="flex gap-2 mt-2">
        {!evaluateFeedback?.isCorrect ? (
          <>
            <button
              onClick={handleTextSubmit}
              disabled={evaluating || !answerText.trim()}
              className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {evaluating ? "Проверка..." : "Проверить"}
            </button>
            {evaluateFeedback && !evaluateFeedback.showHint && (
              <button
                onClick={() => setEvaluateFeedback({ ...evaluateFeedback, showHint: true })}
                className="px-4 py-2 border border-line bg-surface text-text rounded-lg text-sm hover:border-accent transition-colors"
              >
                Подсказка
              </button>
            )}
          </>
        ) : (
          <button onClick={moveToNextStep} className="px-4 py-2 border border-accent bg-accent text-white rounded-lg text-sm">
            {step === "summary" ? "Продолжить чтение" : "Далее"}
          </button>
        )}
      </div>
    </div>
  );
});

function buildReviewKey(method: MethodType, provider: string, input: ReviewGateOpenInput) {
  return [
    method,
    provider,
    input.currentIndex,
    input.totalChunks,
    hashText(input.segmentText),
  ].join(":");
}

function hashText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}
