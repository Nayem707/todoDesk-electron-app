import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formAssistantService } from "../services/formAssistantService";
import type {
  AutofillPhase,
  AutofillSummary,
  FillFieldResult,
  FillPlanEntry,
  FormAnalysis,
  FormAnalysisError,
} from "../types/formAssistant";
import { getErrorMessage } from "../utils/errors";

/** Auto Fill state for one completed analysis. Filling only starts from an explicit `autofill()`. */
export function useAutofill(analysis: FormAnalysis) {
  const [plan, setPlan] = useState<Record<string, FillPlanEntry>>({});
  const [filling, setFilling] = useState(false);
  const [phase, setPhase] = useState<AutofillPhase | null>(null);
  const [liveResults, setLiveResults] = useState<FillFieldResult[]>([]);
  const [summary, setSummary] = useState<AutofillSummary | null>(null);
  const [error, setError] = useState<FormAnalysisError | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    formAssistantService
      .previewAutofill(analysis.id)
      .then((entries) => {
        if (!cancelled) {
          setPlan(Object.fromEntries(entries.map((entry) => [entry.key, entry])));
        }
      })
      .catch((previewError) => {
        console.error("[formAssistant] preview failed", previewError);
      });
    return () => {
      cancelled = true;
    };
  }, [analysis.id, analysis.updatedAt]);

  useEffect(
    () =>
      formAssistantService.onFillProgress((event) => {
        if (event.requestId !== requestIdRef.current) {
          return;
        }
        if (event.phase) {
          setPhase(event.phase);
        }
        const result = event.result;
        if (result) {
          setLiveResults((current) => [...current, result]);
        }
      }),
    []
  );

  const autofill = useCallback(async () => {
    if (requestIdRef.current) {
      return;
    }
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setFilling(true);
    setPhase(null);
    setLiveResults([]);
    setSummary(null);
    setError(null);
    try {
      const response = await formAssistantService.autofill(analysis.id, requestId);
      setSummary(response.result);
      setError(response.error);
      setBrowserOpen(Boolean(response.result));
    } catch (fillError) {
      setError({ code: "BROWSER_ERROR", message: getErrorMessage(fillError, "Auto Fill failed.") });
    } finally {
      requestIdRef.current = null;
      setFilling(false);
      setPhase(null);
    }
  }, [analysis.id]);

  const cancel = useCallback(async () => {
    if (requestIdRef.current) {
      await formAssistantService.cancelAutofill(requestIdRef.current).catch(() => {});
    }
  }, []);

  const closeBrowser = useCallback(async () => {
    try {
      await formAssistantService.closeBrowser();
      setBrowserOpen(false);
    } catch (closeError) {
      toast.error(getErrorMessage(closeError, "Could not close the browser window."));
    }
  }, []);

  return { plan, filling, phase, liveResults, summary, error, browserOpen, autofill, cancel, closeBrowser };
}
