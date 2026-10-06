import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { quizService } from "../../services/quizService";
import type { QuizAiConfig, QuizAiStatus } from "../../types/quiz";
import { getErrorMessage } from "../../utils/errors";

/** Shared across screens so the dashboard, Create Quiz and AI Settings agree on the status. */
const cache: { config: QuizAiConfig | null; status: QuizAiStatus | null } = { config: null, status: null };

export function useQuizAi() {
  const [config, setConfig] = useState<QuizAiConfig | null>(cache.config);
  const [status, setStatus] = useState<QuizAiStatus | null>(cache.status);
  const [loading, setLoading] = useState(!cache.config);
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  /**
   * Check Ollama with `input` (unsaved form values) or the saved configuration. Only checks of the
   * saved configuration update the shared status; form checks are returned to the caller.
   */
  const check = useCallback(async (input?: Partial<QuizAiConfig>) => {
    setChecking(true);
    try {
      const next = await quizService.ai.checkConnection(input);
      if (!input) {
        cache.status = next;
        if (mountedRef.current) {
          setStatus(next);
        }
      }
      return next;
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not check the Ollama connection."));
      return null;
    } finally {
      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    quizService.ai
      .getConfig()
      .then((next) => {
        cache.config = next;
        if (mountedRef.current) {
          setConfig(next);
        }
        return check();
      })
      .catch((error) => toast.error(getErrorMessage(error, "Could not load the AI settings.")))
      .finally(() => mountedRef.current && setLoading(false));
    return () => {
      mountedRef.current = false;
    };
  }, [check]);

  const save = useCallback(
    async (patch: Partial<QuizAiConfig>) => {
      try {
        const next = await quizService.ai.saveConfig(patch);
        cache.config = next;
        setConfig(next);
        toast.success("AI settings saved");
        await check();
        return next;
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save the AI settings."));
        return null;
      }
    },
    [check]
  );

  /** Re-read the saved configuration, e.g. after generation auto-picked a model. */
  const reload = useCallback(async () => {
    try {
      const next = await quizService.ai.getConfig();
      cache.config = next;
      if (mountedRef.current) {
        setConfig(next);
      }
    } catch {
      /* the next explicit action will surface the error */
    }
  }, []);

  return { config, status, loading, checking, check, save, reload };
}
