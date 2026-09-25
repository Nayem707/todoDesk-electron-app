import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Route } from "lucide-react";
import { AnalysisErrorCard } from "../components/AnalysisErrorCard";
import { EmptyState } from "../components/EmptyState";
import { TraceHopTable } from "../components/TraceHopTable";
import { TimeoutNote, TraceReport } from "../components/TraceReport";
import { UrlAnalyzeForm } from "../components/UrlAnalyzeForm";
import { useTraceroute, type LiveTrace } from "../hooks/useTraceroute";

const UNABLE = "Unable to complete traceroute";

const TRACE_ERROR_TITLES: Record<string, string> = {
  INVALID_URL: "Check the address",
  UNSUPPORTED_URL: "This address can't be traced",
  DNS_FAILED: UNABLE,
  COMMAND_UNAVAILABLE: "Traceroute isn't available",
  PERMISSION_DENIED: "Permission needed",
  UNREACHABLE: UNABLE,
  TRACE_FAILED: UNABLE,
  TIMEOUT: UNABLE,
  CANCELLED: "Trace cancelled",
  BUSY: "Trace in progress",
};

/** Retrying can't help when the input itself is the problem or the tool is missing. */
const NO_RETRY = new Set(["INVALID_URL", "UNSUPPORTED_URL", "COMMAND_UNAVAILABLE", "BUSY"]);

/** Traceroute tool body; rendered inside the Web Analyze page, which owns the page header. */
export function TraceroutePage() {
  const { url, setUrl, running, live, result, error, start, cancel } = useTraceroute();

  return (
    <div className="space-y-5">
      <UrlAnalyzeForm
        inputId="traceroute-target"
        label="Enter a website or domain"
        value={url}
        onChange={setUrl}
        running={running}
        onSubmit={() => void start()}
        onCancel={() => void cancel()}
        submitLabel="Trace Route"
        submitIcon={Route}
        cancelLabel="Cancel Trace"
        placeholder="example.com"
        hint="Works with example.com, www.example.com or https://example.com. Only public addresses can be traced."
      />

      {live ? (
        <TraceRunning live={live} fallbackTarget={url.trim()} />
      ) : result ? (
        <TraceReport key={result.startedAt} result={result} />
      ) : error ? (
        <AnalysisErrorCard
          error={error}
          fallbackTitle={UNABLE}
          titleOverrides={TRACE_ERROR_TITLES}
          action={
            !NO_RETRY.has(error.code) && url.trim() ? (
              <button
                type="button"
                onClick={() => void start()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              >
                <RotateCcw size={14} />
                Try Again
              </button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState title="No traceroute results yet." description="Enter a domain or website to inspect its network path." />
      )}
    </div>
  );
}

function TraceRunning({ live, fallbackTarget }: { live: LiveTrace; fallbackTarget: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - live.startedAt) / 1000));
  const target = live.destination ?? fallbackTarget;
  const lastResponding = Math.max(0, ...live.hops.filter((hop) => hop.ip).map((hop) => hop.number));
  const hasSilentHops = live.hops.some((hop) => hop.status === "timeout" && hop.number < lastResponding);

  return (
    <section
      aria-labelledby="trace-running-title"
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark"
    >
      <div className="flex items-start gap-3" aria-live="polite">
        <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[rgb(var(--accent))]" />
        <div className="min-w-0 flex-1">
          <h2 id="trace-running-title" className="text-base font-semibold">
            Traceroute in progress…
          </h2>
          <p className="mt-0.5 break-all text-sm text-[rgb(var(--muted))]">
            Tracing route to <span className="font-medium text-[rgb(var(--text))]">{target}</span>
            {live.resolvedIp && <span className="font-mono"> ({live.resolvedIp})</span>}. Analyzing network path. This may take a
            few seconds.
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[rgb(var(--muted))]">
          {live.hops.length} {live.hops.length === 1 ? "hop" : "hops"} · {elapsed}s
        </span>
      </div>
      {hasSilentHops && <TimeoutNote />}
      <div className="mt-4">
        <TraceHopTable hops={live.hops} destination={target} running />
      </div>
    </section>
  );
}
