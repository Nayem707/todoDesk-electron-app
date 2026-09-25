import { safeFetch } from "../webAnalyze/safeFetch.js";
import { sameSite } from "./checks.js";

const DEFAULT_LIMITS = { maxInternal: 40, maxExternal: 20, concurrency: 6, timeoutMs: 6_000, budgetMs: 25_000 };
/** Statuses sites use to turn away bots; the link may well work in a browser. */
const UNVERIFIABLE_STATUS = new Set([401, 403, 405, 406, 429, 999]);

/**
 * @typedef {{ url: string, internal: boolean, outcome: 'ok' | 'broken' | 'unverified', status: number | null,
 *   error: string | null, redirected: boolean, finalUrl: string }} LinkResult
 * @typedef {{ results: LinkResult[], internalCount: number, externalCount: number, skippedCount: number,
 *   timedOut: boolean }} LinkCheckResult
 */

function classify(response) {
  if (response.status !== null) {
    if (response.status < 400) {
      return "ok";
    }
    return UNVERIFIABLE_STATUS.has(response.status) ? "unverified" : "broken";
  }
  return response.error === "dns" ? "broken" : "unverified";
}

async function checkOne(url, { urlPolicy, timeoutMs, signal }) {
  let response = await safeFetch(url, { urlPolicy, method: "HEAD", timeoutMs, signal });
  // Many servers mishandle HEAD; confirm anything that isn't a clear success with GET.
  if (response.status !== null && response.status >= 400 && response.status !== 404 && response.status !== 410) {
    response = await safeFetch(url, { urlPolicy, method: "GET", timeoutMs, signal });
  }
  return response;
}

/**
 * Checks unique http(s) links from the page with bounded concurrency, per-request timeouts and an
 * overall budget. Links not reached in time are counted as skipped, not broken.
 *
 * @param {{ href: string | null }[]} links
 * @param {{ baseUrl: string, urlPolicy: any, signal?: AbortSignal, limits?: Partial<typeof DEFAULT_LIMITS> }} options
 * @returns {Promise<LinkCheckResult>}
 */
export async function checkLinks(links, { baseUrl, urlPolicy, signal, limits = {} }) {
  const { maxInternal, maxExternal, concurrency, timeoutMs, budgetMs } = { ...DEFAULT_LIMITS, ...limits };
  const unique = new Map();
  for (const link of links) {
    if (!link.href || !/^https?:/i.test(link.href)) {
      continue;
    }
    let url;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    url.hash = "";
    const key = url.toString();
    if (!unique.has(key)) {
      unique.set(key, sameSite(key, baseUrl));
    }
  }
  const entries = [...unique.entries()];
  const internal = entries.filter(([, isInternal]) => isInternal);
  const external = entries.filter(([, isInternal]) => !isInternal);
  const queue = [...internal.slice(0, maxInternal), ...external.slice(0, maxExternal)];

  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), budgetMs);
  const onAbort = () => budget.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  /** @type {LinkResult[]} */
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length && !budget.signal.aborted) {
      const [url, isInternal] = queue[cursor];
      cursor += 1;
      const response = await checkOne(url, { urlPolicy, timeoutMs, signal: budget.signal });
      if (response.error === "cancelled") {
        cursor = queue.length;
        break;
      }
      results.push({
        url,
        internal: isInternal,
        outcome: classify(response),
        status: response.status,
        error: response.error ?? null,
        redirected: response.redirects.length > 0,
        finalUrl: response.finalUrl,
      });
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  } finally {
    clearTimeout(budgetTimer);
    signal?.removeEventListener("abort", onAbort);
  }

  return {
    results,
    internalCount: internal.length,
    externalCount: external.length,
    skippedCount: entries.length - results.length,
    timedOut: budget.signal.aborted && !signal?.aborted && results.length < queue.length,
  };
}
