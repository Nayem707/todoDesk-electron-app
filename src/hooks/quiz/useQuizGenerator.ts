import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { quizService } from "../../services/quizService";
import type { QuizConfigInput, QuizError, QuizGenerateProgress, QuizGenerateResponse, QuizSummary } from "../../types/quiz";
import { getErrorMessage } from "../../utils/errors";

type Inflight = {
  requestId: string;
  startedAt: number;
  progress: QuizGenerateProgress | null;
  promise: Promise<QuizGenerateResponse>;
};

/** Module-level so generation keeps running, and its result is kept, while the user navigates. */
const session: {
  inflight: Inflight | null;
  quiz: QuizSummary | null;
  error: QuizError | null;
  lastConfig: QuizConfigInput | null;
} = { inflight: null, quiz: null, error: null, lastConfig: null };

export function useQuizGenerator() {
  const [running, setRunning] = useState(Boolean(session.inflight));
  const [progress, setProgress] = useState<QuizGenerateProgress | null>(session.inflight?.progress ?? null);
  const [quiz, setQuiz] = useState<QuizSummary | null>(session.quiz);
  const [error, setError] = useState<QuizError | null>(session.error);
  const mountedRef = useRef(true);

  const awaitInflight = useCallback(async (inflight: Inflight) => {
    try {
      const result = await inflight.promise;
      session.quiz = result.quiz;
      session.error = result.error;
    } catch (generateError) {
      session.quiz = null;
      session.error = { code: "GENERATION_FAILED", message: getErrorMessage(generateError, "The quiz could not be generated.") };
    } finally {
      if (session.inflight === inflight) {
        session.inflight = null;
      }
      if (mountedRef.current) {
        setQuiz(session.quiz);
        setError(session.error);
        setRunning(false);
        setProgress(null);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (session.inflight) {
      void awaitInflight(session.inflight);
    }
    const unsubscribe = quizService.onGenerateProgress((event) => {
      if (session.inflight?.requestId !== event.requestId) {
        return;
      }
      session.inflight.progress = event;
      if (mountedRef.current) {
        setProgress(event);
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [awaitInflight]);

  const generate = useCallback(
    async (config: QuizConfigInput) => {
      if (session.inflight) {
        return;
      }
      const requestId = crypto.randomUUID();
      const inflight: Inflight = {
        requestId,
        startedAt: Date.now(),
        progress: null,
        promise: quizService.generate(config, requestId),
      };
      inflight.promise
        .then((result) => result.quiz && toast.success(`“${result.quiz.title}” is ready`))
        .catch(() => undefined);
      session.inflight = inflight;
      session.lastConfig = config;
      session.quiz = null;
      session.error = null;
      setRunning(true);
      setProgress(null);
      setQuiz(null);
      setError(null);
      await awaitInflight(inflight);
    },
    [awaitInflight]
  );

  const cancel = useCallback(async () => {
    const inflight = session.inflight;
    if (!inflight) {
      return;
    }
    try {
      await quizService.cancelGenerate(inflight.requestId);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Could not stop the generation."));
    }
  }, []);

  /** Forget the last result so the form is shown again. */
  const reset = useCallback(() => {
    session.quiz = null;
    session.error = null;
    setQuiz(null);
    setError(null);
  }, []);

  return {
    running,
    progress,
    quiz,
    error,
    startedAt: session.inflight?.startedAt ?? null,
    lastConfig: session.lastConfig,
    generate,
    cancel,
    reset,
  };
}
