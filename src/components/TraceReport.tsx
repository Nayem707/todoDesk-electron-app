import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Info, Square, XCircle, type LucideIcon } from "lucide-react";
import type { TraceHopStatus, TraceOutcome, TraceResult } from "../types/traceroute";
import { cn } from "../utils/cn";
import { CopyButton } from "./CopyButton";
import { formatLatency, HOP_STATUS, TraceHopTable } from "./TraceHopTable";
import { TraceJourney } from "./TraceJourney";

const CARD = "rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark";

const OUTCOME_BADGE: Record<TraceOutcome, { label: string; className: string }> = {
  reached: { label: "Destination reached", className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" },
  "no-response": { label: "Destination not reached", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  "max-hops": { label: "Destination not reached", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  incomplete: { label: "Destination not reached", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  timeout: { label: "Timed out", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  unreachable: { label: "Unreachable", className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10" },
};

const MAY_STILL_WORK = "Many servers and firewalls don't answer trace requests, so the destination may still be reachable.";

function outcomeNote(result: TraceResult): { tone: "warning" | "danger" | "neutral"; title: string; message: string } | null {
  switch (result.outcome) {
    case "reached":
      return null;
    case "cancelled":
      return { tone: "neutral", title: "Trace cancelled", message: "The route data collected before you cancelled is shown below." };
    case "unreachable":
      return {
        tone: "danger",
        title: "Destination unreachable",
        message: "A router on the route reported that the destination can't be reached from this network. The route up to that point is shown below.",
      };
    case "no-response":
      return {
        tone: "warning",
        title: "Trace partially completed",
        message: `The last few hops didn't respond, so the trace stopped early. ${MAY_STILL_WORK} The route data collected so far is shown below.`,
      };
    case "max-hops":
      return {
        tone: "warning",
        title: "Trace partially completed",
        message: `The destination wasn't reached within ${result.maxHops} hops. ${MAY_STILL_WORK}`,
      };
    case "timeout":
      return {
        tone: "warning",
        title: "Trace partially completed",
        message: "The trace took too long and was stopped. The route data collected so far is shown below.",
      };
    default:
      return {
        tone: "warning",
        title: "Trace partially completed",
        message: `The trace ended before reaching the destination. ${MAY_STILL_WORK}`,
      };
  }
}

const NOTE_TONES: Record<"warning" | "danger" | "neutral", { icon: LucideIcon; className: string }> = {
  warning: {
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
  },
  danger: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
  },
  neutral: { icon: Square, className: "border-[rgb(var(--border))] bg-black/[0.02] dark:bg-white/[0.03]" },
};

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function TraceReport({ result }: { result: TraceResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const badge = OUTCOME_BADGE[result.outcome];
  const note = outcomeNote(result);
  const lastResponding = Math.max(0, ...result.hops.filter((hop) => hop.ip).map((hop) => hop.number));
  const hasSilentHops = result.hops.some((hop) => hop.status === "timeout" && hop.number < lastResponding);

  const counts = new Map<TraceHopStatus, number>();
  result.hops.forEach((hop) => counts.set(hop.status, (counts.get(hop.status) ?? 0) + 1));
  const routeCounts = (["ok", "timeout", "destination", "unreachable"] as const)
    .map((status) => ({ status, label: HOP_STATUS[status].label, count: counts.get(status) ?? 0 }))
    .filter((item) => item.count > 0 || item.status !== "unreachable");

  return (
    <div className="space-y-5">
      <section className={cn(CARD, "space-y-5")} aria-labelledby="trace-result-title">
        <div>
          <h2 id="trace-result-title" className="text-base font-semibold">
            Traceroute Result
          </h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">See the journey from your machine to the destination</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" aria-label="Trace summary">
          <Fact label="Destination">
            <span className="truncate" title={result.destination}>
              {result.destination}
            </span>
            <CopyButton value={result.destination} label="Copy destination" />
          </Fact>
          <Fact label="Resolved IP">
            <span className="truncate font-mono" title={result.resolvedIp}>
              {result.resolvedIp}
            </span>
            <CopyButton value={result.resolvedIp} label="Copy resolved IP" />
          </Fact>
          <Fact label="Total hops">{result.totalHops}</Fact>
          <Fact label="Status">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.className)}>{badge.label}</span>
          </Fact>
        </dl>

        <div className="border-t border-[rgb(var(--border))] pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Route summary</p>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Hop counts">
              <li className="tabular-nums">
                <span className="font-semibold">{result.totalHops}</span> <span className="text-[rgb(var(--muted))]">{result.totalHops === 1 ? "hop" : "hops"}</span>
              </li>
              {routeCounts.map((item) => (
                <li key={item.status} className="inline-flex items-center gap-1.5 tabular-nums">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", HOP_STATUS[item.status].dot)} />
                  <span className="font-semibold">{item.count}</span>
                  <span className="text-[rgb(var(--muted))]">{item.label}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Timing">
              {result.destinationLatencyMs !== null && (
                <Metric label="Latency to destination" hint="Average round-trip time of the replies from the destination">
                  {formatLatency(result.destinationLatencyMs)}
                </Metric>
              )}
              {result.maxLatency && (
                <Metric label="Highest" hint="The slowest single reply in this trace, and the hop it came from">
                  {formatLatency(result.maxLatency.ms)} <span className="font-normal text-[rgb(var(--muted))]">(hop {result.maxLatency.hop})</span>
                </Metric>
              )}
              <Metric label="Duration" hint="How long the whole trace took to run">
                {formatDuration(result.durationMs)}
              </Metric>
            </dl>
          </div>
        </div>

        {note && <OutcomeNote {...note} />}
      </section>

      <section className={CARD} aria-labelledby="trace-hops-title">
        <h2 id="trace-hops-title" className="text-base font-semibold">
          Hop Details
        </h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">
          Each row is a router your connection passed through, in order. Select a row for its individual replies and raw output.
        </p>
        {hasSilentHops && <TimeoutNote />}
        <div className="mt-4">
          <TraceHopTable hops={result.hops} destination={result.destination} />
        </div>
      </section>

      <section className={CARD} aria-labelledby="trace-journey-title">
        <h2 id="trace-journey-title" className="mb-3 text-sm font-semibold">
          Route overview
        </h2>
        <TraceJourney hops={result.hops} destination={result.destination} reached={result.reached} />
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-expanded={showRaw}
            aria-controls="trace-raw-output"
            onClick={() => setShowRaw((value) => !value)}
            className="inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
          >
            <ChevronDown size={15} className={cn("transition-transform", showRaw && "rotate-180")} />
            {showRaw ? "Hide Raw Output" : "Show Raw Output"}
          </button>
          {showRaw && <CopyButton value={result.rawOutput} label="Copy raw output" showText />}
        </div>
        {showRaw && (
          <div id="trace-raw-output" className="mt-3">
            <p className="mb-1.5 text-xs text-[rgb(var(--muted))]">
              Output from <span className="font-mono">{result.tool}</span>, run against {result.resolvedIp}.
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre rounded-lg bg-black/[0.03] p-3 font-mono text-xs leading-5 dark:bg-white/[0.04]">
              {result.rawOutput.trim() || "(no output)"}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[rgb(var(--muted))]">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Metric({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[rgb(var(--muted))]">
        <span title={hint} className="cursor-help border-b border-dotted border-[rgb(var(--muted))]">
          {label}
        </span>
      </dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function OutcomeNote({ tone, title, message }: { tone: "warning" | "danger" | "neutral"; title: string; message: string }) {
  const style = NOTE_TONES[tone];
  const Icon = style.icon;
  return (
    <div role="status" className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", style.className)}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 opacity-90">{message}</p>
      </div>
    </div>
  );
}

export function TimeoutNote() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
      <Info size={14} className="mt-px shrink-0" />
      <span>
        A “Timeout” on a hop in the middle doesn't mean the route failed. Many routers are set up not to answer trace requests
        while still passing your traffic along.
      </span>
    </p>
  );
}
