const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TodoDesk-WebAudit/1.0";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 200_000;

/**
 * A bounded HTTP request where every hop, including redirects, must pass the URL policy, so a
 * public page can't point the app at a local or private address. Never throws: failures come back
 * as `{ status: null, error }` with error one of dns | blocked | timeout | redirects | network |
 * cancelled | unsupported.
 *
 * @param {string} input
 * @param {{
 *   urlPolicy: { assertHostAllowed: (hostname: string) => Promise<void> },
 *   method?: 'GET' | 'HEAD',
 *   timeoutMs?: number,
 *   maxRedirects?: number,
 *   readBody?: boolean,
 *   maxBodyBytes?: number,
 *   followRedirects?: boolean,
 *   signal?: AbortSignal,
 * }} options
 */
export async function safeFetch(input, options) {
  const {
    urlPolicy,
    method = "GET",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    readBody = false,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
    followRedirects = true,
    signal,
  } = options;
  const redirects = [];
  let current = input;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let url;
    try {
      url = new URL(current);
    } catch {
      return { status: null, error: "unsupported", finalUrl: current, redirects };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { status: null, error: "unsupported", finalUrl: url.toString(), redirects };
    }
    try {
      await urlPolicy.assertHostAllowed(url.hostname);
    } catch (error) {
      const code = /** @type {{ code?: string }} */ (error)?.code;
      return { status: null, error: code === "UNREACHABLE" ? "dns" : "blocked", finalUrl: url.toString(), redirects };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal?.aborted) {
        return { status: null, error: "cancelled", finalUrl: url.toString(), redirects };
      }
      const response = await fetch(url, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
      });
      const location = response.headers.get("location");
      if (followRedirects && response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => {});
        redirects.push(url.toString());
        current = new URL(location, url).toString();
        continue;
      }
      const headers = Object.fromEntries(response.headers.entries());
      const body = readBody ? await readLimited(response, maxBodyBytes) : null;
      if (!readBody) {
        await response.body?.cancel().catch(() => {});
      }
      return { status: response.status, headers, finalUrl: url.toString(), redirects, body, error: null };
    } catch (error) {
      if (signal?.aborted) {
        return { status: null, error: "cancelled", finalUrl: url.toString(), redirects };
      }
      const timedOut = controller.signal.aborted;
      const cause = /** @type {{ cause?: { code?: string } }} */ (error)?.cause?.code ?? "";
      return {
        status: null,
        error: timedOut ? "timeout" : /ENOTFOUND|EAI_AGAIN/.test(cause) ? "dns" : "network",
        finalUrl: url.toString(),
        redirects,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  return { status: null, error: "redirects", finalUrl: current, redirects };
}

async function readLimited(response, maxBytes) {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}
