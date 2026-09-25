export type TraceHopStatus = "ok" | "timeout" | "destination" | "unreachable";

/** Mirrors HIGH_LATENCY_MS in electron/traceroute/traceParser.js. */
export const HIGH_LATENCY_MS = 150;

export interface TraceHop {
  number: number;
  /** First responder; null when every probe timed out. */
  ip: string | null;
  /** Every responder for this hop (load-balanced routes can have several). */
  ips: string[];
  hostname: string | null;
  /** Round-trip time per probe in ms; null for a lost probe. */
  probes: (number | null)[];
  latency: { min: number; avg: number; max: number } | null;
  lostProbes: number;
  status: TraceHopStatus;
  /** Average ≥ HIGH_LATENCY_MS. Informational; doesn't affect status. */
  highLatency: boolean;
  isPrivate: boolean;
  raw: string;
}

export type TraceOutcome = "reached" | "no-response" | "max-hops" | "unreachable" | "incomplete" | "cancelled" | "timeout";

export interface TraceResult {
  destination: string;
  resolvedIp: string;
  family: 4 | 6;
  tool: string;
  platform: string;
  maxHops: number;
  hops: TraceHop[];
  totalHops: number;
  /** Hops that answered at least one probe, including the destination. */
  successfulHops: number;
  timeoutHops: number;
  /** Average round trip to the destination; null when it wasn't reached. */
  destinationLatencyMs: number | null;
  /** Slowest single reply in the trace. */
  maxLatency: { ms: number; hop: number } | null;
  reached: boolean;
  outcome: TraceOutcome;
  durationMs: number;
  startedAt: string;
  rawOutput: string;
}

export interface TraceError {
  code: string;
  message: string;
}

/** A partial result (cancelled/timed out) comes back with both fields set. */
export interface TraceResponse {
  result: TraceResult | null;
  error: TraceError | null;
}

export type TraceProgressEvent =
  | { requestId: string; type: "resolved"; destination: string; resolvedIp: string }
  | { requestId: string; type: "hop"; hop: TraceHop };
