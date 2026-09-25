import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { tracerouteService } from "../services/tracerouteService";
import type { TraceError, TraceHop, TraceResponse, TraceResult } from "../types/traceroute";
import { getErrorMessage } from "../utils/errors";

export interface LiveTrace {
  destination: string | null;
  resolvedIp: string | null;
  hops: TraceHop[];
  startedAt: number;
}

interface Inflight extends LiveTrace {
  requestId: string;
  promise: Promise<TraceResponse>;
}

/**
 * Module-level so a running trace (and the last result) survive switching tools or pages while
 * the main process keeps tracing.
 */
const session: {
  url: string;
  inflight: Inflight | null;
  result: TraceResult | null;
  error: TraceError | null;
} = { url: "", inflight: null, result: null, error: null };

function snapshot(inflight: Inflight | null): LiveTrace | null {
  return inflight
    ? { destination: inflight.destination, resolvedIp: inflight.resolvedIp, hops: inflight.hops, startedAt: inflight.startedAt }
    : null;
}

export function useTraceroute() {
  const [url, setUrlState] = useState(session.url);
  const [live, setLive] = useState<LiveTrace | null>(() => snapshot(session.inflight));
  const [result, setResult] = useState<TraceResult | null>(session.result);
  const [error, setError] = useState<TraceError | null>(session.error);
  const mountedRef = useRef(true);

  const setUrl = useCallback((value: string) => {
    session.url = value;
    setUrlState(value);
  }, []);

  const finish = useCallback((next: { result: TraceResult | null; error: TraceError | null }) => {
    session.result = next.result;
    session.error = next.error;
    if (mountedRef.current) {
      setResult(next.result);
      setError(next.error);
    }
  }, []);

  const awaitInflight = useCallback(
    async (inflight: Inflight) => {
      try {
        finish(await inflight.promise);
      } catch (traceError) {
        finish({ result: null, error: { code: "TRACE_FAILED", message: getErrorMessage(traceError, "The trace failed.") } });
      } finally {
        if (session.inflight === inflight) {
          session.inflight = null;
        }
        if (mountedRef.current) {
          setLive(null);
        }
      }
    },
    [finish]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (session.inflight) {
      void awaitInflight(session.inflight);
    }

    const unsubscribe = tracerouteService.onProgress((event) => {
      const inflight = session.inflight;
      if (inflight?.requestId !== event.requestId) {
        return;
      }
      if (event.type === "resolved") {
        inflight.destination = event.destination;
        inflight.resolvedIp = event.resolvedIp;
      } else {
        inflight.hops = [...inflight.hops.filter((hop) => hop.number !== event.hop.number), event.hop].sort(
          (a, b) => a.number - b.number
        );
      }
      if (mountedRef.current) {
        setLive(snapshot(inflight));
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [awaitInflight]);

  const start = useCallback(async () => {
    if (session.inflight) {
      return;
    }
    const target = url.trim();
    if (!target) {
      finish({ result: null, error: { code: "INVALID_URL", message: "Enter a website or domain to trace." } });
      return;
    }
    const requestId = crypto.randomUUID();
    const inflight: Inflight = {
      requestId,
      destination: null,
      resolvedIp: null,
      hops: [],
      startedAt: Date.now(),
      promise: tracerouteService.start(target, requestId),
    };
    session.inflight = inflight;
    finish({ result: null, error: null });
    setLive(snapshot(inflight));
    await awaitInflight(inflight);
  }, [awaitInflight, finish, url]);

  const cancel = useCallback(async () => {
    const inflight = session.inflight;
    if (!inflight) {
      return;
    }
    try {
      await tracerouteService.cancel(inflight.requestId);
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Could not cancel the trace."));
    }
  }, []);

  return { url, setUrl, running: live !== null, live, result, error, start, cancel };
}
