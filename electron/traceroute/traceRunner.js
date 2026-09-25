import { spawn } from "child_process";
import dns from "dns/promises";
import fs from "fs";
import net from "net";
import path from "path";
import { WebAnalyzeError } from "../webAnalyze/errors.js";
import { isPrivateAddress, parseTargetUrl } from "../webAnalyze/urlSafety.js";
import { buildHop, detectTraceError, parseHopLine } from "./traceParser.js";

export const DEFAULT_LIMITS = {
  maxHops: 30,
  /** Hard cap for the whole trace; a 30-hop Windows trace of timeouts takes ~90 s. */
  timeoutMs: 120_000,
  /** After this many silent hops in a row the rest of the path is almost always silent too. */
  stopAfterTimeouts: 5,
};

const MAX_RAW_OUTPUT = 64 * 1024;
const REVERSE_LOOKUP_TIMEOUT_MS = 2500;
const KILL_GRACE_MS = 2000;

/**
 * Accepts "example.com", "www.example.com" or a full http(s) URL and returns the bare host.
 * Reuses the Web Analyze URL policy, so local/private targets are refused the same way.
 * @param {unknown} input
 */
export function normalizeTraceTarget(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new WebAnalyzeError("INVALID_URL", "Enter a website or domain to trace.");
  }
  const trimmed = input.trim();
  let candidate = "";
  try {
    candidate = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    // parseTargetUrl below reports the invalid input.
  }
  if (candidate && !/[.:]/.test(candidate) && candidate.toLowerCase() !== "localhost") {
    throw new WebAnalyzeError("INVALID_URL", "Enter a full domain name, such as example.com.");
  }

  let url;
  try {
    url = parseTargetUrl(input);
  } catch (error) {
    if (error instanceof WebAnalyzeError && error.code === "INVALID_URL") {
      throw new WebAnalyzeError(
        "INVALID_URL",
        "That doesn't look like a valid website or domain. Try something like example.com."
      );
    }
    if (error instanceof WebAnalyzeError && /local and private/i.test(error.message)) {
      throw new WebAnalyzeError(
        "UNSUPPORTED_URL",
        "Local and private network addresses can't be traced. Enter a public website or domain."
      );
    }
    if (error instanceof WebAnalyzeError && /only http/i.test(error.message)) {
      throw new WebAnalyzeError("UNSUPPORTED_URL", "Only websites and domains can be traced, such as example.com.");
    }
    throw error;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return { host, isIp: net.isIP(host) !== 0 };
}

/**
 * Resolves the destination once so the trace targets a fixed public address and never passes
 * user text to the system tool. Prefers IPv4, which every platform's tool supports.
 */
export async function resolveTraceTarget(target, { lookup = dns.lookup, allowAddress = (ip) => !isPrivateAddress(ip) } = {}) {
  let addresses;
  if (target.isIp) {
    addresses = [{ address: target.host, family: net.isIP(target.host) }];
  } else {
    try {
      addresses = await lookup(target.host, { all: true, verbatim: true });
    } catch {
      throw new WebAnalyzeError(
        "DNS_FAILED",
        "Unable to trace this destination. The domain could not be resolved. Check the spelling and your internet connection."
      );
    }
  }
  if (!addresses?.length) {
    throw new WebAnalyzeError("DNS_FAILED", "Unable to trace this destination. The domain could not be resolved.");
  }
  if (addresses.some((entry) => !allowAddress(entry.address))) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "This domain points to a local or private network address, so it can't be traced."
    );
  }
  const chosen = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  return { ip: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

function firstExisting(candidates, fallback) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? fallback;
}

/**
 * Builds the argument list for the platform's trace tool. Arguments are passed straight to
 * spawn (no shell) and the target is always a validated IP literal.
 */
export function buildTraceCommand(platform, { ip, family }, { maxHops }) {
  const hops = String(maxHops);
  if (platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
    return {
      label: "tracert",
      file: firstExisting([path.join(systemRoot, "System32", "TRACERT.EXE")], "tracert.exe"),
      args: ["-d", "-h", hops, "-w", "1000", family === 6 ? "-6" : "-4", ip],
    };
  }
  if (platform === "darwin") {
    const tool = family === 6 ? "traceroute6" : "traceroute";
    return {
      label: tool,
      file: firstExisting([`/usr/sbin/${tool}`], tool),
      args: ["-n", "-m", hops, "-q", "3", "-w", "2", ip],
    };
  }
  return {
    label: "traceroute",
    file: firstExisting(["/usr/bin/traceroute", "/usr/sbin/traceroute", "/bin/traceroute"], "traceroute"),
    args: ["-n", ...(family === 6 ? ["-6"] : []), "-m", hops, "-q", "3", "-w", "2", ip],
  };
}

function spawnFailure(error, platform) {
  const code = /** @type {NodeJS.ErrnoException} */ (error)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return new WebAnalyzeError(
      "PERMISSION_DENIED",
      "Your computer didn't allow the trace to run. Check that your account can use network tools."
    );
  }
  if (code === "ENOENT") {
    const message =
      platform === "win32"
        ? "The Windows tracert tool isn't available on this computer."
        : platform === "darwin"
          ? "The traceroute tool isn't available on this Mac."
          : "Traceroute isn't installed. Install the \"traceroute\" package (for example: sudo apt install traceroute) and try again.";
    return new WebAnalyzeError("COMMAND_UNAVAILABLE", message);
  }
  return new WebAnalyzeError("TRACE_FAILED", "The trace couldn't be started. Try again.");
}

/** Stops the child and escalates if it ignores the first request. */
function terminate(child, platform) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    child.kill();
  } catch {
    // Already gone.
  }
  const escalate = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      return;
    }
    try {
      if (platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Nothing else we can do.
    }
  }, KILL_GRACE_MS);
  escalate.unref?.();
}

async function defaultReverseLookup(ip) {
  const names = await dns.reverse(ip);
  return names[0] ?? null;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Runs one trace. Hops are reported through `onEvent` as soon as each line arrives; the
 * returned result also contains every hop plus the raw output.
 *
 * Throws WebAnalyzeError when nothing useful was produced. When the trace is cancelled or times
 * out after some hops were found, it resolves with the partial result and `outcome` set.
 *
 * @param {unknown} input
 * @param {{
 *   signal?: AbortSignal,
 *   onEvent?: (event: object) => void,
 *   platform?: NodeJS.Platform,
 *   spawnImpl?: typeof spawn,
 *   lookup?: typeof dns.lookup,
 *   reverseLookup?: ((ip: string) => Promise<string | null>) | null,
 *   allowAddress?: (ip: string) => boolean,
 *   limits?: Partial<typeof DEFAULT_LIMITS>,
 *   onSpawn?: (child: import("child_process").ChildProcess) => void,
 * }} [options]
 */
export async function runTraceroute(input, options = {}) {
  const {
    signal,
    onEvent = () => {},
    platform = process.platform,
    spawnImpl = spawn,
    lookup,
    reverseLookup = defaultReverseLookup,
    allowAddress,
    onSpawn,
  } = options;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };

  const throwIfCancelled = () => {
    if (signal?.aborted) {
      throw new WebAnalyzeError("CANCELLED", "The trace was cancelled.");
    }
  };

  throwIfCancelled();
  const target = normalizeTraceTarget(input);
  const resolved = await resolveTraceTarget(target, { lookup, allowAddress });
  throwIfCancelled();
  onEvent({ type: "resolved", destination: target.host, resolvedIp: resolved.ip });

  const command = buildTraceCommand(platform, resolved, limits);
  const startedAt = new Date();
  const run = await executeTrace({ command, resolved, platform, spawnImpl, signal, onEvent, reverseLookup, limits, onSpawn });
  const hops = [...run.hops.values()].sort((a, b) => a.number - b.number);

  if (!hops.length) {
    if (run.stopReason === "cancelled") {
      throw new WebAnalyzeError("CANCELLED", "The trace was cancelled.");
    }
    if (run.stopReason === "timeout") {
      throw new WebAnalyzeError("TIMEOUT", "The trace took too long and was stopped before any hops responded.");
    }
    if (run.detectedError) {
      throw new WebAnalyzeError(run.detectedError.code, run.detectedError.message);
    }
    throw new WebAnalyzeError("TRACE_FAILED", "The trace couldn't be completed. Check your internet connection and try again.");
  }

  const reached = hops.some((hop) => hop.status === "destination");
  const last = hops[hops.length - 1];
  const outcome = reached
    ? "reached"
    : run.stopReason ??
      (last?.status === "unreachable" ? "unreachable" : hops.length >= limits.maxHops ? "max-hops" : "incomplete");

  return {
    destination: target.host,
    resolvedIp: resolved.ip,
    family: resolved.family,
    tool: command.label,
    platform,
    maxHops: limits.maxHops,
    hops,
    totalHops: hops.length,
    reached,
    outcome,
    durationMs: run.durationMs,
    startedAt: startedAt.toISOString(),
    rawOutput: run.rawOutput,
  };
}

function executeTrace({ command, resolved, platform, spawnImpl, signal, onEvent, reverseLookup, limits, onSpawn }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command.file, command.args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      });
    } catch (error) {
      reject(spawnFailure(error, platform));
      return;
    }
    onSpawn?.(child);

    const started = Date.now();
    const hops = new Map();
    const lookups = new Set();
    let rawOutput = "";
    let stdoutBuffer = "";
    let stopReason = null;
    let detectedError = null;
    let trailingTimeouts = 0;
    let finished = false;

    const stop = (reason) => {
      stopReason ??= reason;
      terminate(child, platform);
    };
    const onAbort = () => stop("cancelled");
    if (signal?.aborted) {
      stop("cancelled");
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
    const deadline = setTimeout(() => stop("timeout"), limits.timeoutMs);

    const appendRaw = (text) => {
      if (rawOutput.length < MAX_RAW_OUTPUT) {
        rawOutput = (rawOutput + text).slice(0, MAX_RAW_OUTPUT);
      }
    };

    const lookupHostname = (hop) => {
      if (!reverseLookup || !hop.ip || hop.hostname) {
        return;
      }
      const pending = withTimeout(reverseLookup(hop.ip).catch(() => null), REVERSE_LOOKUP_TIMEOUT_MS).then((name) => {
        lookups.delete(pending);
        const current = hops.get(hop.number);
        if (name && current && current.ip === hop.ip && name.toLowerCase() !== hop.ip.toLowerCase()) {
          current.hostname = name.replace(/\.$/, "");
          if (!finished) {
            onEvent({ type: "hop", hop: { ...current } });
          }
        }
      });
      lookups.add(pending);
    };

    const handleLine = (line) => {
      const parsed = parseHopLine(line, platform);
      if (!parsed) {
        detectedError ??= detectTraceError(line);
        return;
      }
      if (parsed.number > limits.maxHops) {
        return;
      }
      const hop = buildHop(parsed, resolved.ip);
      hops.set(hop.number, hop);
      onEvent({ type: "hop", hop: { ...hop } });
      lookupHostname(hop);

      trailingTimeouts = hop.status === "timeout" ? trailingTimeouts + 1 : 0;
      if (hop.status === "destination") {
        return;
      }
      if (trailingTimeouts >= limits.stopAfterTimeouts) {
        stop("no-response");
      }
    };

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      appendRaw(text);
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      appendRaw(text);
      for (const line of text.split(/\r?\n/)) {
        detectedError ??= detectTraceError(line);
      }
    });

    let finishing = false;
    const finish = async (spawnError) => {
      if (finishing) {
        return;
      }
      finishing = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      if (spawnError) {
        finished = true;
        reject(spawnFailure(spawnError, platform));
        return;
      }
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
        stdoutBuffer = "";
      }
      await Promise.allSettled([...lookups]);
      finished = true;
      resolve({ hops, rawOutput, stopReason, detectedError, durationMs: Date.now() - started });
    };

    child.on("error", (error) => {
      if (!child.pid) {
        void finish(error);
      }
    });
    child.on("close", () => void finish(null));
  });
}
