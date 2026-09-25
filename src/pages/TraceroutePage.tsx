import { useEffect, useState } from "react";
import { Loader2, Route } from "lucide-react";
import { AnalysisErrorCard } from "../components/AnalysisErrorCard";
import { EmptyState } from "../components/EmptyState";
import { TraceJourney } from "../components/TraceJourney";
import { TimeoutNote, TraceReport } from "../components/TraceReport";
import { UrlAnalyzeForm } from "../components/UrlAnalyzeForm";
import { useTraceroute, type LiveTrace } from "../hooks/useTraceroute";

const TRACE_ERROR_TITLES: Record<string, string> = {
  INVALID_URL: "Check the address",
  UNSUPPORTED_URL: "This address can't be traced",
  DNS_FAILED: "Domain not found",
  COMMAND_UNAVAILABLE: "Traceroute isn't available",
  PERMISSION_DENIED: "Permission needed",
  UNREACHABLE: "Couldn't send trace requests",
  TRACE_FAILED: "Trace failed",
  TIMEOUT: "Trace timed out",
  CANCELLED: "Trace cancelled",
  BUSY: "Trace in progress",
};

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
        placeholder="https://example.com"
        hint="Works with example.com, www.example.com or https://example.com. Only public addresses can be traced."
      />

      {live ? (
        <TraceRunning live={live} fallbackTarget={url.trim()} />
      ) : result ? (
        <TraceReport key={result.startedAt} result={result} />
      ) : error ? (
        <AnalysisErrorCard error={error} fallbackTitle="Trace failed" titleOverrides={TRACE_ERROR_TITLES} />
      ) : (
        <EmptyState
          title="See the journey"
          description="Enter a website or domain to see each network stop your connection passes through on its way there."
        />
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
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark">
      <div className="flex items-start gap-3" aria-live="polite">
        <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[rgb(var(--accent))]" />
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-semibold">Tracing route to {target}…</p>
          <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">Analyzing network path. This may take a few seconds.</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[rgb(var(--muted))]">
          {live.hops.length} {live.hops.length === 1 ? "hop" : "hops"} · {elapsed}s
        </span>
      </div>
      {hasSilentHops && <TimeoutNote />}
      <div className="mt-4">
        <TraceJourney hops={live.hops} destination={target} running />
      </div>
    </section>
  );
}
