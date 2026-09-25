import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formAssistantService } from "../services/formAssistantService";
import type {
  FormAnalysis,
  FormAnalysisError,
  FormAnalysisStep,
  FormAnalysisSummary,
  FormAnalyzeResult,
  SemanticField,
} from "../types/formAssistant";
import { getErrorMessage } from "../utils/errors";

/**
 * Module-level so an analysis keeps its state if the user navigates away and back while the
 * browser is still working in the main process.
 */
const session: {
  url: string;
  analysisId: string | null;
  inflight: { requestId: string; step: FormAnalysisStep | null; promise: Promise<FormAnalyzeResult> } | null;
} = { url: "", analysisId: null, inflight: null };

export function useFormAnalysis() {
  const [url, setUrlState] = useState(session.url);
  const [running, setRunning] = useState(Boolean(session.inflight));
  const [step, setStep] = useState<FormAnalysisStep | null>(session.inflight?.step ?? null);
  const [analysis, setAnalysis] = useState<FormAnalysis | null>(null);
  const [error, setError] = useState<FormAnalysisError | null>(null);
  const [history, setHistory] = useState<FormAnalysisSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const mountedRef = useRef(true);

  const setUrl = useCallback((value: string) => {
    session.url = value;
    setUrlState(value);
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const next = await formAssistantService.getHistory();
      if (mountedRef.current) {
        setHistory(next);
      }
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, "Could not load analysis history."));
    } finally {
      if (mountedRef.current) {
        setLoadingHistory(false);
      }
    }
  }, []);

  const applyResult = useCallback(
    (result: FormAnalyzeResult) => {
      session.analysisId = result.analysis?.status === "completed" ? result.analysis.id : null;
      if (!mountedRef.current) {
        return;
      }
      setAnalysis(result.analysis?.status === "completed" ? result.analysis : null);
      setError(result.error);
      void refreshHistory();
    },
    [refreshHistory]
  );

  const awaitInflight = useCallback(
    async (inflight: NonNullable<typeof session.inflight>) => {
      try {
        applyResult(await inflight.promise);
      } catch (analyzeError) {
        if (mountedRef.current) {
          setError({ code: "BROWSER_ERROR", message: getErrorMessage(analyzeError, "Analysis failed.") });
        }
      } finally {
        if (session.inflight === inflight) {
          session.inflight = null;
        }
        if (mountedRef.current) {
          setRunning(false);
          setStep(null);
        }
      }
    },
    [applyResult]
  );

  useEffect(() => {
    mountedRef.current = true;
    void refreshHistory();

    if (session.inflight) {
      void awaitInflight(session.inflight);
    } else if (session.analysisId) {
      formAssistantService
        .getAnalysis(session.analysisId)
        .then((restored) => mountedRef.current && setAnalysis(restored))
        .catch(() => {
          session.analysisId = null;
        });
    }

    const unsubscribe = formAssistantService.onProgress((event) => {
      if (session.inflight?.requestId !== event.requestId) {
        return;
      }
      session.inflight.step = event.step;
      if (mountedRef.current) {
        setStep(event.step);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [awaitInflight, refreshHistory]);

  const analyze = useCallback(async () => {
    if (session.inflight) {
      return;
    }
    const target = url.trim();
    if (!target) {
      setError({ code: "INVALID_URL", message: "Enter a website URL to analyze." });
      return;
    }
    const requestId = crypto.randomUUID();
    const inflight = {
      requestId,
      step: null,
      promise: formAssistantService.analyze(target, requestId),
    };
    session.inflight = inflight;
    setRunning(true);
    setStep(null);
    setError(null);
    setAnalysis(null);
    await awaitInflight(inflight);
  }, [awaitInflight, url]);

  const cancel = useCallback(async () => {
    const inflight = session.inflight;
    if (!inflight) {
      return;
    }
    try {
      await formAssistantService.cancel(inflight.requestId);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Could not stop the analysis."));
    }
  }, []);

  const openAnalysis = useCallback(
    async (id: string) => {
      try {
        const next = await formAssistantService.getAnalysis(id);
        setUrl(next.url);
        if (next.status === "completed") {
          session.analysisId = next.id;
          setAnalysis(next);
          setError(null);
        } else {
          session.analysisId = null;
          setAnalysis(null);
          setError({ code: next.errorCode ?? "BROWSER_ERROR", message: next.errorMessage ?? "Analysis failed." });
        }
        return next;
      } catch (openError) {
        toast.error(getErrorMessage(openError, "Could not open this analysis."));
        return null;
      }
    },
    [setUrl]
  );

  const deleteAnalysis = useCallback(
    async (id: string) => {
      try {
        await formAssistantService.deleteAnalysis(id);
        if (session.analysisId === id) {
          session.analysisId = null;
          setAnalysis(null);
        }
        await refreshHistory();
        toast.success("Analysis deleted");
      } catch (deleteError) {
        toast.error(getErrorMessage(deleteError, "Could not delete this analysis."));
      }
    },
    [refreshHistory]
  );

  const updateMapping = useCallback(
    async (fieldKey: string, mappedField: SemanticField | null) => {
      if (!analysis) {
        return;
      }
      try {
        setAnalysis(await formAssistantService.updateMapping(analysis.id, fieldKey, mappedField));
      } catch (updateError) {
        toast.error(getErrorMessage(updateError, "Could not update the mapping."));
      }
    },
    [analysis]
  );

  return {
    url,
    setUrl,
    running,
    step,
    analysis,
    error,
    history,
    loadingHistory,
    analyze,
    cancel,
    openAnalysis,
    deleteAnalysis,
    updateMapping,
  };
}
