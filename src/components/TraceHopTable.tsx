import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { HIGH_LATENCY_MS, type TraceHop, type TraceHopStatus } from "../types/traceroute";
import { cn } from "../utils/cn";
import { CopyButton } from "./CopyButton";
import { SearchBar } from "./SearchBar";

export const HOP_STATUS: Record<TraceHopStatus, { label: string; dot: string; badge: string; bar: string }> = {
  ok: {
    label: "Responded",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    bar: "bg-emerald-500/70",
  },
  timeout: {
    label: "Timeout",
    dot: "bg-[rgb(var(--muted))]",
    badge: "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10",
    bar: "bg-transparent",
  },
  destination: {
    label: "Destination",
    dot: "bg-[rgb(var(--accent))]",
    badge: "bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]",
    bar: "bg-[rgb(var(--accent))]/70",
  },
  unreachable: {
    label: "Unreachable",
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    bar: "bg-rose-500/70",
  },
};

const STATUS_NOTE: Partial<Record<TraceHopStatus, string>> = {
  timeout: "No response received",
  unreachable: "Reported unreachable",
};

/** Search and status filters only appear once a route is long enough to need them. */
const FILTER_MIN_HOPS = 12;

type HopFilter = "all" | TraceHopStatus;

export function formatLatency(ms: number) {
  if (ms < 1) {
    return "<1 ms";
  }
  return ms < 10 ? `${Math.round(ms * 10) / 10} ms` : `${Math.round(ms)} ms`;
}

interface TraceHopTableProps {
  hops: TraceHop[];
  destination: string | null;
  running?: boolean;
}

export function TraceHopTable({ hops, destination, running = false }: TraceHopTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HopFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scaleMax = Math.max(1, ...hops.map((hop) => hop.latency?.avg ?? 0));
  const showFilters = !running && hops.length >= FILTER_MIN_HOPS;

  const filterOptions = useMemo(() => {
    const counts = new Map<TraceHopStatus, number>();
    hops.forEach((hop) => counts.set(hop.status, (counts.get(hop.status) ?? 0) + 1));
    const options: { id: HopFilter; label: string; count: number }[] = [{ id: "all", label: "All", count: hops.length }];
    (["ok", "timeout", "destination", "unreachable"] as const).forEach((status) => {
      const count = counts.get(status) ?? 0;
      if (count > 0) {
        options.push({ id: status, label: HOP_STATUS[status].label, count });
      }
    });
    return options;
  }, [hops]);

  const visible = useMemo(() => {
    if (!showFilters) {
      return hops;
    }
    const needle = query.trim().toLowerCase();
    return hops.filter((hop) => {
      if (filter !== "all" && hop.status !== filter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [String(hop.number), hop.hostname ?? "", ...hop.ips].some((value) => value.toLowerCase().includes(needle));
    });
  }, [filter, hops, query, showFilters]);

  useEffect(() => {
    const container = scrollRef.current;
    if (running && container && container.scrollHeight - container.scrollTop - container.clientHeight < 120) {
      container.scrollTop = container.scrollHeight;
    }
  }, [hops.length, running]);

  const toggle = (number: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1 sm:max-w-xs">
            <SearchBar value={query} onChange={setQuery} placeholder="Search IP / hostname…" ariaLabel="Search hops" />
          </div>
          <div
            role="group"
            aria-label="Filter hops by status"
            className="inline-flex flex-wrap items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5"
          >
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  filter === option.id
                    ? "bg-[rgb(var(--accent))] font-medium text-[rgb(var(--accent-foreground))]"
                    : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                )}
              >
                {option.label} <span className="tabular-nums opacity-80">{option.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="max-h-[30rem] overflow-auto rounded-xl border border-[rgb(var(--border))]">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm" aria-label="Hop details">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
              <Th className="w-14 text-center" hint="Hop number: the order in which routers were reached">
                Hop
              </Th>
              <Th hint="IP address of the router that answered for this hop">Host / IP</Th>
              <Th hint="Name registered for the IP address (reverse DNS), when one exists">Hostname</Th>
              <Th
                className="w-36"
                hint={`Average round-trip time of the replies. The bar is relative to the slowest hop in this trace. Values of ${HIGH_LATENCY_MS} ms or more are highlighted.`}
              >
                Latency
              </Th>
              <Th className="w-40">Status</Th>
              <Th className="w-16 text-center">Details</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((hop) => (
              <HopRow
                key={hop.number}
                hop={hop}
                hops={hops}
                destination={destination}
                scaleMax={scaleMax}
                expanded={expanded.has(hop.number)}
                onToggle={() => toggle(hop.number)}
              />
            ))}
            {running && (
              <tr>
                <Td className="text-center tabular-nums text-[rgb(var(--muted))]">{(hops[hops.length - 1]?.number ?? 0) + 1}</Td>
                <Td colSpan={5}>
                  <span className="inline-flex items-center gap-2 text-[rgb(var(--muted))]">
                    <Loader2 size={14} className="animate-spin" />
                    {hops.length ? "Waiting for the next hop…" : "Waiting for the first hop…"}
                  </span>
                </Td>
              </tr>
            )}
            {!running && visible.length === 0 && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-[rgb(var(--muted))]">
                  {hops.length ? (
                    <>
                      No hops match your search.{" "}
                      <button type="button" onClick={clearFilters} className="font-medium text-[rgb(var(--accent))] hover:underline">
                        Clear filters
                      </button>
                    </>
                  ) : (
                    "No hops were recorded."
                  )}
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className, hint }: { children: ReactNode; className?: string; hint?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-10 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 font-medium",
        className
      )}
    >
      {hint ? (
        <span title={hint} className="cursor-help border-b border-dotted border-[rgb(var(--muted))]">
          {children}
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-[rgb(var(--border))] px-3 py-2.5 align-middle", className)}>
      {children}
    </td>
  );
}

function HopRow({
  hop,
  hops,
  destination,
  scaleMax,
  expanded,
  onToggle,
}: {
  hop: TraceHop;
  hops: TraceHop[];
  destination: string | null;
  scaleMax: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = HOP_STATUS[hop.status];
  const detailsId = `trace-hop-${hop.number}-details`;
  const isDestination = hop.status === "destination";
  const hostname = hop.hostname ?? (isDestination ? destination : null);

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("button") || window.getSelection()?.toString()) {
      return;
    }
    onToggle();
  };

  return (
    <Fragment>
      <tr
        id={`trace-hop-${hop.number}`}
        onClick={onRowClick}
        className={cn(
          "group cursor-pointer transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
          expanded && "bg-black/[0.02] dark:bg-white/[0.03]"
        )}
      >
        <Td className="text-center font-medium tabular-nums">{hop.number}</Td>
        <Td>
          {hop.ip ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-[13px]" title={hop.ips.join(", ")}>
                {hop.ip}
              </span>
              {hop.ips.length > 1 && (
                <span className="shrink-0 text-xs text-[rgb(var(--muted))]" title={hop.ips.slice(1).join(", ")}>
                  +{hop.ips.length - 1}
                </span>
              )}
              <CopyButton value={hop.ip} label={`Copy IP address of hop ${hop.number}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
            </div>
          ) : (
            <span className="font-mono text-[rgb(var(--muted))]" title="No reply, so the address is unknown">
              *
            </span>
          )}
        </Td>
        <Td className="max-w-[260px]">
          {hostname ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate" title={hop.hostname ? hostname : "The domain you traced (this IP has no reverse DNS name)"}>
                {hostname}
              </span>
              <CopyButton value={hostname} label={`Copy hostname of hop ${hop.number}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
            </div>
          ) : (
            <span className="text-[rgb(var(--muted))]">—</span>
          )}
        </Td>
        <Td>
          <LatencyCell hop={hop} scaleMax={scaleMax} bar={meta.bar} />
        </Td>
        <Td>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", meta.badge)}>
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          {STATUS_NOTE[hop.status] && <p className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">{STATUS_NOTE[hop.status]}</p>}
        </Td>
        <Td className="text-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Hide" : "Show"} details for hop ${hop.number}`}
            className="rounded-md p-1 text-[rgb(var(--muted))] transition hover:bg-black/5 hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] dark:hover:bg-white/10"
          >
            <ChevronRight size={16} className={cn("transition-transform", expanded && "rotate-90")} />
          </button>
        </Td>
      </tr>
      {expanded && (
        <tr id={detailsId}>
          <td colSpan={6} className="border-b border-[rgb(var(--border))] bg-black/[0.02] px-5 py-4 dark:bg-white/[0.03]">
            <HopDetails hop={hop} hops={hops} hostname={hostname} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function LatencyCell({ hop, scaleMax, bar }: { hop: TraceHop; scaleMax: number; bar: string }) {
  if (!hop.latency) {
    return <span className="text-[rgb(var(--muted))]">—</span>;
  }
  const replies = hop.probes.length - hop.lostProbes;
  const width = Math.max(4, Math.round((hop.latency.avg / scaleMax) * 100));
  return (
    <div className="w-28" title={hop.probes.map((probe) => (probe === null ? "no reply" : formatLatency(probe))).join(" · ")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-medium tabular-nums", hop.highLatency && "text-amber-700 dark:text-amber-300")}>
          {formatLatency(hop.latency.avg)}
        </span>
        {hop.lostProbes > 0 && (
          <span className="text-[11px] tabular-nums text-[rgb(var(--muted))]">
            {replies}/{hop.probes.length} replies
          </span>
        )}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10" aria-hidden>
        <div className={cn("h-full rounded-full", hop.highLatency ? "bg-amber-500/80" : bar)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function statusExplanation(hop: TraceHop, hops: TraceHop[]) {
  const laterResponded = hops.some((other) => other.number > hop.number && other.ip);
  switch (hop.status) {
    case "timeout":
      return laterResponded
        ? "This router didn't answer the trace requests, but hops after it did, so traffic still passed through. Many routers are set up not to reply to trace requests."
        : "No reply was received, so the trace can't tell what happens at this point. Many routers and firewalls don't answer trace requests.";
    case "destination":
      return "This is the destination you traced. Its latency is the round-trip time from your computer to the site.";
    case "unreachable":
      return "This router reported that it has no route to the destination.";
    default:
      return "This router answered the trace requests.";
  }
}

function latencyExplanation(hop: TraceHop, hops: TraceHop[]) {
  if (!hop.highLatency || hop.status === "destination") {
    return null;
  }
  const later = hops.filter((other) => other.number > hop.number && other.latency);
  if (!later.length) {
    return `Replies took ${HIGH_LATENCY_MS} ms or longer.`;
  }
  return later.some((other) => !other.highLatency)
    ? `Replies took ${HIGH_LATENCY_MS} ms or longer, but later hops were faster. That usually means this router answers trace requests slowly, not that the route is slow here.`
    : `Replies took ${HIGH_LATENCY_MS} ms or longer, and the hops after it stayed slow, so the delay likely starts around here.`;
}

function HopDetails({ hop, hops, hostname }: { hop: TraceHop; hops: TraceHop[]; hostname: string | null }) {
  const meta = HOP_STATUS[hop.status];
  const latencyNote = latencyExplanation(hop, hops);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Hop {hop.number}</p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="IP address">
          {hop.ips.length ? (
            <ul className="space-y-0.5">
              {hop.ips.map((ip) => (
                <li key={ip} className="flex items-center gap-1">
                  <span className="break-all font-mono text-[13px]">{ip}</span>
                  <CopyButton value={ip} label={`Copy ${ip}`} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[rgb(var(--muted))]">Unknown (no reply)</span>
          )}
        </Detail>
        <Detail label="Hostname">
          {hostname ? (
            <span className="flex items-center gap-1">
              <span className="break-all">{hostname}</span>
              <CopyButton value={hostname} label={`Copy ${hostname}`} />
            </span>
          ) : (
            <span className="text-[rgb(var(--muted))]">{hop.ip ? "No reverse DNS name" : "—"}</span>
          )}
        </Detail>
        <Detail label="Latency">
          {hop.latency ? (
            <>
              <span className="font-medium tabular-nums">{formatLatency(hop.latency.avg)}</span>{" "}
              <span className="text-[rgb(var(--muted))]">average</span>
              {hop.latency.max !== hop.latency.min && (
                <p className="text-xs tabular-nums text-[rgb(var(--muted))]">
                  Range {formatLatency(hop.latency.min)} – {formatLatency(hop.latency.max)}
                </p>
              )}
            </>
          ) : (
            <span className="text-[rgb(var(--muted))]">—</span>
          )}
        </Detail>
        <Detail label="Status">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </Detail>
        <Detail label="Packet responses" hint="Traceroute sends several probes to each hop and times each reply">
          {hop.probes.length ? (
            <ol className="space-y-0.5 tabular-nums">
              {hop.probes.map((probe, index) => (
                <li key={index}>
                  <span className="text-[rgb(var(--muted))]">{index + 1}:</span>{" "}
                  {probe === null ? <span className="text-[rgb(var(--muted))]">no reply</span> : formatLatency(probe)}
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-[rgb(var(--muted))]">—</span>
          )}
        </Detail>
        {hop.ip && (
          <Detail label="Address type" hint="Private and reserved ranges (such as 10.x, 192.168.x or 100.64.x) are only used inside networks">
            {hop.isPrivate ? "Private / reserved range" : "Public"}
          </Detail>
        )}
      </dl>

      <div className="space-y-1.5 text-[13px] text-[rgb(var(--muted))]">
        <p>{statusExplanation(hop, hops)}</p>
        {latencyNote && (
          <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {latencyNote}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1">
          <p className="text-xs font-medium text-[rgb(var(--muted))]">Raw response</p>
          <CopyButton value={hop.raw} label={`Copy raw line for hop ${hop.number}`} />
        </div>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-xs dark:bg-white/[0.05]">{hop.raw.trim()}</pre>
      </div>
    </div>
  );
}

function Detail({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[rgb(var(--muted))]">
        {hint ? (
          <span title={hint} className="cursor-help border-b border-dotted border-[rgb(var(--muted))]">
            {label}
          </span>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
