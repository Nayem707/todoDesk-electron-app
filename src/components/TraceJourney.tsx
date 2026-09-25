import { ChevronRight, Flag, Laptop } from "lucide-react";
import type { TraceHop } from "../types/traceroute";
import { cn } from "../utils/cn";
import { formatLatency, HOP_STATUS } from "./TraceHopTable";

interface TraceJourneyProps {
  hops: TraceHop[];
  destination: string;
  reached: boolean;
}

/** A compact, supplemental overview of the route. The hop table holds the full details. */
export function TraceJourney({ hops, destination, reached }: TraceJourneyProps) {
  return (
    <ol aria-label="Route overview" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
      <li className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-2.5 py-1 font-medium">
        <Laptop size={13} />
        Your device
      </li>
      {hops.map((hop) => {
        const meta = HOP_STATUS[hop.status];
        const isDestination = hop.status === "destination";
        const label = isDestination ? destination : (hop.ip ?? "*");
        const tooltip = [
          `Hop ${hop.number}`,
          hop.ip ?? "No response",
          hop.hostname,
          hop.latency ? formatLatency(hop.latency.avg) : null,
          meta.label,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={hop.number} className="inline-flex items-center gap-1">
            <ChevronRight size={13} aria-hidden className="text-[rgb(var(--muted))]" />
            <span
              title={tooltip}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                isDestination
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 font-medium text-[rgb(var(--accent))]"
                  : hop.status === "timeout"
                    ? "border-dashed border-[rgb(var(--border))] text-[rgb(var(--muted))]"
                    : "border-[rgb(var(--border))]"
              )}
            >
              {isDestination ? <Flag size={12} /> : <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />}
              <span className="tabular-nums text-[rgb(var(--muted))]">{hop.number}</span>
              <span className={cn(!isDestination && hop.ip && "font-mono")}>{label}</span>
            </span>
          </li>
        );
      })}
      {!reached && (
        <li className="inline-flex items-center gap-1">
          <ChevronRight size={13} aria-hidden className="text-[rgb(var(--muted))]" />
          <span
            title="The trace didn't reach the destination"
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[rgb(var(--border))] px-2.5 py-1 text-[rgb(var(--muted))]"
          >
            <Flag size={12} />
            {destination} (not reached)
          </span>
        </li>
      )}
    </ol>
  );
}
