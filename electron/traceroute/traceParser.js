import net from "net";
import { isPrivateAddress } from "../webAnalyze/urlSafety.js";

/** Average round-trip time (ms) at or above which a responding hop is shown as slow. */
export const SLOW_HOP_MS = 150;

const HOP_LINE = /^\s*(\d{1,3})\s+(.*\S)\s*$/;
/**
 * One Windows probe column: "<1 ms", "12 ms" or "*". The unit is matched loosely (no digits,
 * dots or colons) so localized builds of tracert still parse, without swallowing an IP address.
 */
const WINDOWS_PROBE = /^(?:(<)?(\d+)\s*[^\s\d.:*<[\]]{1,3}(?=\s|$)|\*(?=\s|$))\s*/;
const UNIX_UNREACHABLE = /^!(?:[HNPSFXVC]|<\d+>|\d+)?$/;

/**
 * Parses one line of traceroute output into a raw hop, or returns null for headers, footers
 * and anything that isn't a hop.
 * @param {string} line
 * @param {NodeJS.Platform} platform
 */
export function parseHopLine(line, platform) {
  const match = line.match(HOP_LINE);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  if (number < 1 || number > 255) {
    return null;
  }
  const parsed = platform === "win32" ? parseWindowsHop(match[2]) : parseUnixHop(match[2]);
  return parsed ? { number, ...parsed, raw: line.replace(/\s+$/, "") } : null;
}

function parseWindowsHop(rest) {
  const probes = [];
  let remaining = rest;
  while (probes.length < 3) {
    const probe = remaining.match(WINDOWS_PROBE);
    if (!probe) {
      break;
    }
    probes.push(probe[0].trimStart().startsWith("*") ? null : probe[1] ? 0.5 : Number(probe[2]));
    remaining = remaining.slice(probe[0].length);
  }

  const tail = remaining.trim();
  let ip = null;
  let hostname = null;
  const named = tail.match(/^(\S+)\s+\[([0-9a-fA-F:.%]+)\]/);
  if (named && net.isIP(named[2])) {
    hostname = named[1];
    ip = named[2];
  } else {
    const first = tail.split(/\s+/)[0] ?? "";
    if (net.isIP(first)) {
      ip = first;
    }
  }

  if (!probes.length && !ip) {
    return null;
  }
  return {
    ips: ip ? [ip] : [],
    hostname,
    probes,
    unreachable: Boolean(ip) && /unreachable/i.test(tail),
  };
}

function parseUnixHop(rest) {
  const tokens = rest.split(/\s+/);
  const probes = [];
  const ips = [];
  let hostname = null;
  let unreachable = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token === "*") {
      probes.push(null);
    } else if (/^\d+(?:\.\d+)?$/.test(token) && tokens[index + 1] === "ms") {
      probes.push(Number(token));
      index += 1;
    } else if (/^\d+(?:\.\d+)?ms$/.test(token)) {
      probes.push(Number.parseFloat(token));
    } else if (UNIX_UNREACHABLE.test(token)) {
      unreachable = true;
    } else if (/^\(.+\)$/.test(token) && net.isIP(token.slice(1, -1))) {
      addUnique(ips, token.slice(1, -1));
    } else if (net.isIP(token)) {
      addUnique(ips, token);
    } else if (!hostname && /^[a-z0-9_][a-z0-9_.-]*$/i.test(token)) {
      hostname = token;
    }
  }

  if (!probes.length && !ips.length) {
    return null;
  }
  return { ips, hostname, probes, unreachable };
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Turns a raw parsed hop into the normalized shape the renderer displays.
 * @param {NonNullable<ReturnType<typeof parseHopLine>>} parsed
 * @param {string} targetIp
 */
export function buildHop(parsed, targetIp) {
  const replies = parsed.probes.filter((value) => value !== null);
  const ip = parsed.ips[0] ?? null;
  const latency = replies.length
    ? {
        min: round(Math.min(...replies)),
        avg: round(replies.reduce((sum, value) => sum + value, 0) / replies.length),
        max: round(Math.max(...replies)),
      }
    : null;

  let status;
  if (parsed.ips.some((address) => sameAddress(address, targetIp))) {
    status = "destination";
  } else if (parsed.unreachable) {
    status = "unreachable";
  } else if (!ip || !latency) {
    status = ip ? "ok" : "timeout";
  } else {
    status = latency.avg >= SLOW_HOP_MS ? "slow" : "ok";
  }

  return {
    number: parsed.number,
    ip,
    ips: parsed.ips,
    hostname: parsed.hostname && !sameAddress(parsed.hostname, ip) ? parsed.hostname : null,
    probes: parsed.probes,
    latency,
    lostProbes: parsed.probes.length - replies.length,
    status,
    isPrivate: ip ? isPrivateAddress(ip) : false,
    raw: parsed.raw,
  };
}

const ERROR_RULES = [
  {
    test: /operation not permitted|not enough privileges|permission denied|must be root|access is denied/i,
    code: "PERMISSION_DENIED",
    message: "Your computer didn't allow the trace to run. Check that your account can use network tools.",
  },
  {
    test: /unable to resolve|name or service not known|unknown host|cannot resolve|could not resolve/i,
    code: "DNS_FAILED",
    message: "Unable to trace this destination. The domain could not be resolved.",
  },
  {
    test: /transmit error|general failure|network is unreachable|no route to host|sendto:/i,
    code: "UNREACHABLE",
    message: "Your computer couldn't send trace requests. Check your internet connection and try again.",
  },
];

/**
 * Recognizes a tool-level failure in a non-hop output line.
 * @param {string} line
 * @returns {{ code: string, message: string } | null}
 */
export function detectTraceError(line) {
  const rule = ERROR_RULES.find((candidate) => candidate.test.test(line));
  return rule ? { code: rule.code, message: rule.message } : null;
}
