export type TraceHopStatus = "ok" | "slow" | "timeout" | "destination" | "unreachable";

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
