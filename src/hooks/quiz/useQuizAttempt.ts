import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { quizService } from "../../services/quizService";
import type { QuizAttempt } from "../../types/quiz";
import { getErrorMessage } from "../../utils/errors";
import { useNow } from "./useNow";

const TIMEOUT_RETRY_MS = 2_000;

/**
 * Drives one in-progress attempt. The main process owns the timer: this hook only renders the
 * remaining time from absolute deadlines and asks the main process to advance or submit once a
 * deadline passes. Answers are saved on every change so a reload or crash keeps them.
 */
export function useQuizAttempt(attemptId: string, onCompleted: (attempt: QuizAttempt) => void) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offsetRef = useRef(0);
  const attemptRef = useRef<QuizAttempt | null>(null);
  const busyRef = useRef(false);
  const handledDeadlineRef = useRef<string | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const apply = useCallback((next: QuizAttempt) => {
    offsetRef.current = next.serverNow - Date.now();
    attemptRef.current = next;
    setAttempt(next);
    if (next.status === "completed") {
      onCompletedRef.current(next);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await quizService.getById(attemptId));
    } catch (error) {
      setLoadError(getErrorMessage(error, "Could not load this quiz."));
    }
  }, [apply, attemptId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    quizService
      .resume(attemptId)
      .then((next) => !cancelled && apply(next))
      .catch((error) => !cancelled && setLoadError(getErrorMessage(error, "Could not load this quiz.")))
      .finally(() => !cancelled && setLoading(false));

    const pause = () => {
      if (attemptRef.current?.status === "in_progress") {
        void quizService.pause(attemptId).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", pause);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", pause);
      pause();
    };
  }, [apply, attemptId]);

  /** Run one navigation/submission at a time and adopt the main process's view of the attempt. */
  const run = useCallback(
    async (action: () => Promise<QuizAttempt>, failure: string) => {
      if (busyRef.current) {
        return false;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        apply(await action());
        return true;
      } catch (error) {
        toast.error(getErrorMessage(error, failure));
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [apply]
  );

  const inProgress = attempt?.status === "in_progress";
  const now = useNow(inProgress) + offsetRef.current;
  const current = attempt ? attempt.questions[attempt.currentIndex] ?? null : null;

  let deadline: number | null = null;
  if (attempt?.timeMode === "total") {
    deadline = attempt.deadlineAt;
  } else if (attempt?.timeMode === "per_question") {
    deadline = current?.deadlineAt ?? null;
  }
  const remainingMs = deadline === null ? null : Math.max(0, deadline - now);
  const elapsedMs = attempt ? Math.max(0, now - attempt.startedAt) : 0;

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || deadline === null || now < deadline) {
      return;
    }
    const key = attempt.timeMode === "total" ? `${attempt.id}:total` : `${attempt.id}:${attempt.currentIndex}`;
    if (handledDeadlineRef.current === key || busyRef.current) {
      return;
    }
    handledDeadlineRef.current = key;
    const action =
      attempt.timeMode === "total"
        ? () => quizService.submit(attempt.id, "timeout")
        : () => quizService.advance(attempt.id, attempt.currentIndex, "timeout");
    void run(action, "The timer could not be applied. Retrying…").then((ok) => {
      if (!ok) {
        window.setTimeout(() => {
          if (handledDeadlineRef.current === key) {
            handledDeadlineRef.current = null;
          }
        }, TIMEOUT_RETRY_MS);
      }
    });
  }, [attempt, deadline, now, run]);

  const updateQuestion = useCallback((questionId: string, patch: { selected?: string[]; marked?: boolean }) => {
    setAttempt((previous) => {
      if (!previous) {
        return previous;
      }
      const next = {
        ...previous,
        questions: previous.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)),
      };
      attemptRef.current = next;
      return next;
    });
  }, []);

  /** Optimistically update, then persist. The main process applies saves in the order sent. */
  const saveAnswer = useCallback(
    async (questionId: string, patch: { selected?: string[]; marked?: boolean }) => {
      updateQuestion(questionId, patch);
      try {
        const response = await quizService.saveAnswer(attemptId, questionId, patch);
        if (response.closed) {
          await reload();
        } else if (response.locked) {
          toast.info("Time is up for this question.");
          await reload();
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "Your answer could not be saved."));
        await reload();
      }
    },
    [attemptId, reload, updateQuestion]
  );

  const select = useCallback(
    (option: string) => {
      const question = attemptRef.current?.questions[attemptRef.current.currentIndex];
      if (!question || question.locked || attemptRef.current?.status !== "in_progress") {
        return;
      }
      const selected =
        question.type === "multiple_choice"
          ? question.selected.includes(option)
            ? question.selected.filter((value) => value !== option)
            : [...question.selected, option]
          : [option];
      void saveAnswer(question.id, { selected });
    },
    [saveAnswer]
  );

  const clearAnswer = useCallback(() => {
    const question = attemptRef.current?.questions[attemptRef.current.currentIndex];
    if (question && question.selected.length > 0) {
      void saveAnswer(question.id, { selected: [] });
    }
  }, [saveAnswer]);

  const toggleMark = useCallback(() => {
    const question = attemptRef.current?.questions[attemptRef.current.currentIndex];
    if (question) {
      void saveAnswer(question.id, { marked: !question.marked });
    }
  }, [saveAnswer]);

  const goTo = useCallback(
    (index: number) => {
      const snapshot = attemptRef.current;
      if (!snapshot || snapshot.timeMode === "per_question" || index === snapshot.currentIndex) {
        return;
      }
      if (index < 0 || index >= snapshot.questions.length) {
        return;
      }
      void run(() => quizService.navigate(snapshot.id, index), "Could not open that question.");
    },
    [run]
  );

  /** Next / Skip. In per-question mode this closes the current question for good. */
  const next = useCallback(() => {
    const snapshot = attemptRef.current;
    if (!snapshot) {
      return;
    }
    if (snapshot.timeMode === "per_question") {
      void run(() => quizService.advance(snapshot.id, snapshot.currentIndex, "manual"), "Could not move to the next question.");
    } else {
      goTo(snapshot.currentIndex + 1);
    }
  }, [goTo, run]);

  const previous = useCallback(() => {
    const snapshot = attemptRef.current;
    if (snapshot) {
      goTo(snapshot.currentIndex - 1);
    }
  }, [goTo]);

  const submit = useCallback(() => {
    const snapshot = attemptRef.current;
    if (snapshot) {
      void run(() => quizService.submit(snapshot.id, "manual"), "The quiz could not be submitted. Try again.");
    }
  }, [run]);

  return {
    attempt,
    current,
    loading,
    loadError,
    busy,
    remainingMs,
    elapsedMs,
    select,
    clearAnswer,
    toggleMark,
    goTo,
    next,
    previous,
    submit,
  };
}
