import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { webAuditService } from "../services/webAuditService";
import type { WebAudit, WebAuditError, WebAuditResult, WebAuditStep, WebAuditSummary } from "../types/webAudit";
import { getErrorMessage } from "../utils/errors";

/**
 * Module-level so a running audit keeps its state if the user switches tools or pages while the
 * main process is still working.
 */
const session: {
  url: string;
  auditId: string | null;
  inflight: { requestId: string; step: WebAuditStep | null; promise: Promise<WebAuditResult> } | null;
} = { url: "", auditId: null, inflight: null };

export function useWebAudit() {
  const [url, setUrlState] = useState(session.url);
  const [running, setRunning] = useState(Boolean(session.inflight));
  const [step, setStep] = useState<WebAuditStep | null>(session.inflight?.step ?? null);
  const [audit, setAudit] = useState<WebAudit | null>(null);
  const [error, setError] = useState<WebAuditError | null>(null);
  const [history, setHistory] = useState<WebAuditSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const mountedRef = useRef(true);

  const setUrl = useCallback((value: string) => {
    session.url = value;
    setUrlState(value);
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const next = await webAuditService.getHistory();
      if (mountedRef.current) {
        setHistory(next);
      }
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, "Could not load audit history."));
    } finally {
      if (mountedRef.current) {
        setLoadingHistory(false);
      }
    }
  }, []);

  const awaitInflight = useCallback(
    async (inflight: NonNullable<typeof session.inflight>) => {
      try {
        const result = await inflight.promise;
        const completed = result.audit?.status === "completed" ? result.audit : null;
        session.auditId = completed?.id ?? null;
        if (mountedRef.current) {
          setAudit(completed);
          setError(result.error);
          void refreshHistory();
        }
      } catch (auditError) {
        if (mountedRef.current) {
          setError({ code: "BROWSER_ERROR", message: getErrorMessage(auditError, "The audit failed.") });
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
    [refreshHistory]
  );

  useEffect(() => {
    mountedRef.current = true;
    void refreshHistory();

    if (session.inflight) {
      void awaitInflight(session.inflight);
    } else if (session.auditId) {
      webAuditService
        .getAudit(session.auditId)
        .then((restored) => mountedRef.current && setAudit(restored))
        .catch(() => {
          session.auditId = null;
        });
    }

    const unsubscribe = webAuditService.onProgress((event) => {
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

  const start = useCallback(async () => {
    if (session.inflight) {
      return;
    }
    const target = url.trim();
    if (!target) {
      setError({ code: "INVALID_URL", message: "Enter a website URL to audit." });
      return;
    }
    const requestId = crypto.randomUUID();
    const inflight = { requestId, step: null, promise: webAuditService.start(target, requestId) };
    session.inflight = inflight;
    setRunning(true);
    setStep(null);
    setError(null);
    setAudit(null);
    await awaitInflight(inflight);
  }, [awaitInflight, url]);

  const cancel = useCallback(async () => {
    const inflight = session.inflight;
    if (!inflight) {
      return;
    }
    try {
      await webAuditService.cancel(inflight.requestId);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Could not stop the audit."));
    }
  }, []);

  const openAudit = useCallback(
    async (id: string) => {
      try {
        const next = await webAuditService.getAudit(id);
        setUrl(next.url);
        if (next.status === "completed" && next.report) {
          session.auditId = next.id;
          setAudit(next);
          setError(null);
        } else {
          session.auditId = null;
          setAudit(null);
          setError({ code: next.errorCode ?? "BROWSER_ERROR", message: next.errorMessage ?? "The audit failed." });
        }
        return next;
      } catch (openError) {
        toast.error(getErrorMessage(openError, "Could not open this audit."));
        return null;
      }
    },
    [setUrl]
  );

  const deleteAudit = useCallback(
    async (id: string) => {
      try {
        await webAuditService.deleteAudit(id);
        if (session.auditId === id) {
          session.auditId = null;
          setAudit(null);
        }
        await refreshHistory();
        toast.success("Audit deleted");
      } catch (deleteError) {
        toast.error(getErrorMessage(deleteError, "Could not delete this audit."));
      }
    },
    [refreshHistory]
  );

  return { url, setUrl, running, step, audit, error, history, loadingHistory, start, cancel, openAudit, deleteAudit };
}
