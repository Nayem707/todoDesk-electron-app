import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Square, XCircle, type LucideIcon } from "lucide-react";
import type { TraceOutcome, TraceResult } from "../types/traceroute";
import { cn } from "../utils/cn";
import { TraceJourney } from "./TraceJourney";

const CARD = "rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONES: Record<Tone, { icon: LucideIcon; box: string; iconClass: string }> = {
  success: {
    icon: CheckCircle2,
    box: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    box: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    icon: XCircle,
    box: "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40",
    iconClass: "text-rose-600 dark:text-rose-400",
  },
  neutral: {
    icon: Square,
    box: "border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
    iconClass: "text-[rgb(var(--muted))]",
  },
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function describeOutcome(outcome: TraceOutcome, result: TraceResult): { tone: Tone; title: string; message: string } {
  const hops = plural(result.totalHops, "hop");
  const mayStillWork = "Many servers and firewalls don't answer trace requests, so the website may still be working normally.";
  switch (outcome) {
    case "reached":
      return {
        tone: "success",
        title: `Reached ${result.destination} in ${hops}`,
        message: "Your connection found a complete path to the destination.",
      };
    case "no-response":
      return {
        tone: "warning",
        title: "The destination didn't respond to the trace",
        message: `The trace stopped after several hops in a row didn't reply. ${mayStillWork}`,
      };
    case "max-hops":
      return {
        tone: "warning",
        title: `Stopped at the ${result.maxHops}-hop limit`,
        message: `The destination wasn't reached within ${plural(result.maxHops, "hop")}. ${mayStillWork}`,
      };
    case "unreachable":
      return {
        tone: "danger",
        title: "A router reported the destination as unreachable",
        message: "The network couldn't find a path past the last hop shown. The site may be down or blocked on this network.",
      };
    case "cancelled":
      return {
        tone: "neutral",
        title: "Trace cancelled",
        message: `Showing the ${hops} found before you cancelled.`,
      };
    case "timeout":
      return {
        tone: "warning",
        title: "The trace took too long and was stopped",
        message: `Showing the ${hops} found so far.`,
      };
    default:
      return {
        tone: "warning",
        title: "The trace ended before reaching the destination",
        message: mayStillWork,
      };
  }
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function TraceReport({ result }: { result: TraceResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const outcome = describeOutcome(result.outcome, result);
  const tone = TONES[outcome.tone];
  const OutcomeIcon = tone.icon;
  const lastResponding = Math.max(0, ...result.hops.filter((hop) => hop.ip).map((hop) => hop.number));
  const hasSilentHops = result.hops.some((hop) => hop.status === "timeout" && hop.number < lastResponding);

  const summary = [
    { label: "Destination", value: result.destination, mono: false },
    { label: "Resolved IP", value: result.resolvedIp, mono: true },
    { label: "Hops", value: String(result.totalHops), mono: false },
    { label: "Total trace time", value: formatDuration(result.durationMs), mono: false },
  ];

  return (
    <div className="space-y-5">
      <section role="status" className={cn("flex items-start gap-3 rounded-2xl border p-5", tone.box)}>
        <OutcomeIcon size={18} className={cn("mt-0.5 shrink-0", tone.iconClass)} />
        <div>
          <p className="text-sm font-semibold">{outcome.title}</p>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">{outcome.message}</p>
        </div>
      </section>

      <section className={CARD} aria-label="Trace summary">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <dt className="text-[11px] text-[rgb(var(--muted))]">{item.label}</dt>
              <dd className={cn("truncate text-sm font-semibold tabular-nums", item.mono && "font-mono")} title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={CARD}>
        <h2 className="text-base font-semibold">The journey</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--muted))]">
          Each step is a router your connection passed through on the way to {result.destination}.
        </p>
        {hasSilentHops && <TimeoutNote />}
        <div className="mt-4">
          <TraceJourney hops={result.hops} destination={result.destination} reached={result.reached} />
        </div>
      </section>

      <section className={CARD}>
        <button
          type="button"
          aria-expanded={showRaw}
          aria-controls="trace-raw-output"
          onClick={() => setShowRaw((value) => !value)}
          className="inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
        >
          <ChevronDown size={15} className={cn("transition-transform", showRaw && "rotate-180")} />
          {showRaw ? "Hide raw output" : "Show raw output"}
        </button>
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

export function TimeoutNote() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
      <Info size={14} className="mt-px shrink-0" />
      <span>
        “Request timed out” on a hop in the middle doesn't mean the route failed. Many routers are set up not to answer trace
        requests while still passing your traffic along.
      </span>
    </p>
  );
}
