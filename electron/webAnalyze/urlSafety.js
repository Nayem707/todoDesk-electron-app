import dns from "dns/promises";
import net from "net";
import { WebAnalyzeError } from "./errors.js";

const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([base, bits]) => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (ipv4ToInt(base) & mask) >>> 0, mask };
});

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(({ base, mask }) => ((value & mask) >>> 0) === base);
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") {
    return true;
  }
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isPrivateIpv4(mapped[1]);
  }
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) {
    return true;
  }
  const first = Number.parseInt(lower.split(":")[0] || "0", 16);
  // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) {
    return true;
  }
  return lower.startsWith("2001:db8:") || lower.startsWith("64:ff9b:");
}

export function isPrivateAddress(ip) {
  const family = net.isIP(ip.replace(/^\[|\]$/g, ""));
  if (family === 4) {
    return isPrivateIpv4(ip);
  }
  if (family === 6) {
    return isPrivateIpv6(ip);
  }
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) {
    return true;
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  // Single-label names (e.g. "router", "intranet") only resolve on local networks.
  return !host.includes(".") && net.isIP(host) === 0;
}

/**
 * Parses and statically validates a user-supplied URL. Throws WebAnalyzeError("INVALID_URL")
 * or ("UNSUPPORTED_URL") with a user-facing message.
 * @param {unknown} input
 * @returns {URL}
 */
export function parseTargetUrl(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new WebAnalyzeError("INVALID_URL", "Enter a website URL to analyze.");
  }
  let raw = input.trim();
  if (raw.length > MAX_URL_LENGTH) {
    throw new WebAnalyzeError("INVALID_URL", "That URL is too long.");
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    raw = `https://${raw}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new WebAnalyzeError("INVALID_URL", "That doesn't look like a valid website URL.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "Only http:// and https:// websites can be analyzed."
    );
  }
  if (url.username || url.password) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "URLs containing a username or password are not supported."
    );
  }
  if (!url.hostname) {
    throw new WebAnalyzeError("INVALID_URL", "That URL has no website address.");
  }
  if (isBlockedHostname(url.hostname) || isPrivateAddress(url.hostname)) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "Local and private network addresses cannot be analyzed."
    );
  }
  url.hash = "";
  return url;
}

/**
 * Resolves the hostname and rejects it if any address is private/reserved.
 * @param {string} hostname
 * @param {{ lookup?: typeof dns.lookup }} [options]
 */
export async function assertPublicHost(hostname, { lookup = dns.lookup } = {}) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host) || isPrivateAddress(host)) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "Local and private network addresses cannot be analyzed."
    );
  }
  if (net.isIP(host)) {
    return;
  }
  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new WebAnalyzeError(
      "UNREACHABLE",
      "The website could not be found. Check the address and your internet connection."
    );
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new WebAnalyzeError(
      "UNSUPPORTED_URL",
      "This website points to a local or private network address and cannot be analyzed."
    );
  }
}

/**
 * The URL policy used by the analyzer. Tests can inject a permissive policy; the app always
 * uses this strict default.
 */
export const strictUrlPolicy = {
  parse: parseTargetUrl,
  assertHostAllowed: (hostname) => assertPublicHost(hostname),
};
