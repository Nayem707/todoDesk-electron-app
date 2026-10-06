import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { quizService } from "../../services/quizService";
import type { QuizAttempt, QuizHistoryItem, QuizStats, QuizSummary } from "../../types/quiz";
import { getErrorMessage } from "../../utils/errors";

/** Saved quizzes, completed attempts, aggregate stats and the unfinished attempt (if any). */
export function useQuizLibrary() {
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [active, setActive] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const activeResult = await quizService.getActive();
      const [nextHistory, nextStats, nextQuizzes] = await Promise.all([
        quizService.history(),
        quizService.stats(),
        quizService.list(),
      ]);
      if (activeResult.expiredAttemptId) {
        toast.info("Time ran out on your unfinished quiz, so it was submitted automatically.");
      }
      if (mountedRef.current) {
        setActive(activeResult.attempt);
        setHistory(nextHistory);
        setStats(nextStats);
        setQuizzes(nextQuizzes);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not load your quizzes."));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const deleteAttempt = useCallback(
    async (attemptId: string) => {
      try {
        await quizService.deleteAttempt(attemptId);
        toast.success("Result deleted");
        await refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not delete this result."));
      }
    },
    [refresh]
  );

  const deleteQuiz = useCallback(
    async (quizId: string) => {
      try {
        await quizService.deleteQuiz(quizId);
        toast.success("Quiz deleted");
        await refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not delete this quiz."));
      }
    },
    [refresh]
  );

  const discardActive = useCallback(async () => {
    if (!active) {
      return;
    }
    try {
      await quizService.discard(active.id);
      toast.success("Unfinished quiz discarded");
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not discard the quiz."));
    }
  }, [active, refresh]);

  return { history, stats, quizzes, active, loading, refresh, deleteAttempt, deleteQuiz, discardActive };
}
