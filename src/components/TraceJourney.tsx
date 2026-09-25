import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, Clock, Flag, Laptop, Loader2, XCircle, type LucideIcon } from "lucide-react";
import type { TraceHop, TraceHopStatus } from "../types/traceroute";
import { cn } from "../utils/cn";

export const HOP_STATUS_META: Record<TraceHopStatus, { label: string; icon: LucideIcon; node: string; badge: string }> = {
  ok: {
    label: "Responding",
    icon: CheckCircle2,
    node: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  slow: {
    label: "Slow",
    icon: Clock,
    node: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  timeout: {
    label: "Request timed out",
    icon: CircleDashed,
    node: "border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))]",
    badge: "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10",
  },
  destination: {
    label: "Destination reached",
    icon: Flag,
    node: "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  unreachable: {
    label: "Unreachable",
    icon: XCircle,
    node: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  },
};

export function formatLatency(ms: number) {
  return ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`;
}

/** A plain-language guess at what a hop is, based only on its address and position. */
function hopRole(hop: TraceHop, hops: TraceHop[]) {
  if (hop.status === "destination") {
    return "Destination";
  }
  if (!hop.ip) {
    return undefined;
  }
  if (hop.isPrivate) {
    return hop.number === 1 ? "Your router" : "Private network";
  }
  const earlier = hops.filter((other) => other.number < hop.number && other.ip);
  const firstPublic = earlier.every((other) => other.isPrivate);
  return firstPublic && earlier.length > 0 ? "Likely your internet provider" : "Internet";
}

function probeSummary(hop: TraceHop) {
  if (!hop.probes.length) {
    return null;
  }
  const values = hop.probes.map((probe) => (probe === null ? "no reply" : formatLatency(probe)));
  return `Response times: ${values.join(" · ")}`;
}

interface TraceJourneyProps {
  hops: TraceHop[];
  destination: string | null;
  running?: boolean;
  /** Draws a final "not reached" node when the trace ended without reaching the destination. */
  reached?: boolean;
}

/** The route drawn as a vertical path from this computer, through each hop, to the destination. */
export function TraceJourney({ hops, destination, running = false, reached = false }: TraceJourneyProps) {
  const lastResponding = Math.max(0, ...hops.filter((hop) => hop.ip).map((hop) => hop.number));

  return (
    <ol aria-label="Route to the destination" className="space-y-0">
      <JourneyNode
        marker={<Laptop size={15} />}
        markerClass="border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
        title="Your computer"
        subtitle="Where the trace starts"
        connector={hops.length > 0 || running || !reached}
      />
      {hops.map((hop, index) => {
        const meta = HOP_STATUS_META[hop.status];
        const StatusIcon = meta.icon;
        const isLast = index === hops.length - 1;
        const showConnector = !isLast || running || (!reached && hop.status !== "destination");
        const silentButPassed = hop.status === "timeout" && hop.number < lastResponding;
        const probes = probeSummary(hop);
        const isDestination = hop.status === "destination";
        const name = isDestination ? (destination ?? hop.hostname) : hop.hostname;
        return (
          <JourneyNode
            key={hop.number}
            marker={isDestination ? <Flag size={14} /> : hop.number}
            markerClass={meta.node}
            markerLabel={`Hop ${hop.number}`}
            title={name ?? hop.ip ?? "No response"}
            titleMono={!name && Boolean(hop.ip)}
            role={hopRole(hop, hops)}
            subtitle={
              hop.status === "timeout"
                ? silentButPassed
                  ? "This router didn't reply, but traffic still passed through it."
                  : "No reply. Many networks don't answer trace requests."
                : [name ? hop.ip : null, hop.ips.length > 1 ? `+${hop.ips.length - 1} more` : null]
                    .filter(Boolean)
                    .join(" ")
            }
            detail={
              hop.lostProbes > 0 && hop.status !== "timeout"
                ? `${probes ?? ""} (${hop.lostProbes} of ${hop.probes.length} got no reply)`
                : hop.status !== "timeout"
                  ? probes
                  : null
            }
            aside={
              <div className="flex flex-col items-end gap-1 text-right">
                {hop.latency && (
                  <span className="text-sm font-semibold tabular-nums" title="Average response time">
                    {formatLatency(hop.latency.avg)}
                  </span>
                )}
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.badge)}>
                  <StatusIcon size={11} />
                  {meta.label}
                </span>
              </div>
            }
            connector={showConnector}
          />
        );
      })}
      {running ? (
        <JourneyNode
          marker={<Loader2 size={14} className="animate-spin" />}
          markerClass="border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))]"
          title={hops.length ? "Looking for the next hop…" : "Waiting for the first hop…"}
          subtitle={destination ? `On the way to ${destination}` : undefined}
          muted
        />
      ) : (
        !reached && (
          <JourneyNode
            marker={<Flag size={14} />}
            markerClass="border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))]"
            title={destination ?? "Destination"}
            subtitle="Not reached by this trace"
            muted
          />
        )
      )}
    </ol>
  );
}

function JourneyNode({
  marker,
  markerClass,
  markerLabel,
  title,
  titleMono = false,
  role,
  subtitle,
  detail,
  aside,
  connector = false,
  muted = false,
}: {
  marker: ReactNode;
  markerClass: string;
  markerLabel?: string;
  title: string;
  titleMono?: boolean;
  role?: string;
  subtitle?: string | null;
  detail?: string | null;
  aside?: ReactNode;
  connector?: boolean;
  muted?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-label={markerLabel}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
            markerClass
          )}
        >
          {marker}
        </span>
        {connector && <span aria-hidden className="w-px flex-1 bg-[rgb(var(--border))]" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 items-start justify-between gap-3", connector ? "pb-4" : "pb-1")}>
        <div className="min-w-0 pt-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn("break-all text-sm font-medium", titleMono && "font-mono", muted && "text-[rgb(var(--muted))]")}>
              {title}
            </span>
            {role && <span className="text-xs text-[rgb(var(--muted))]">{role}</span>}
          </p>
          {subtitle && <p className="mt-0.5 break-all text-xs text-[rgb(var(--muted))]">{subtitle}</p>}
          {detail && <p className="mt-0.5 text-[11px] tabular-nums text-[rgb(var(--muted))]">{detail}</p>}
        </div>
        {aside}
      </div>
    </li>
  );
}
