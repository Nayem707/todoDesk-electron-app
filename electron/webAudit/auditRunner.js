import { openBrowserSession } from "../webAnalyze/browserSession.js";
import { WebAnalyzeError, toWebAnalyzeError } from "../webAnalyze/errors.js";
import { safeFetch } from "../webAnalyze/safeFetch.js";
import { strictUrlPolicy } from "../webAnalyze/urlSafety.js";
import { analyzeAccessibility } from "./analyzers/accessibility.js";
import { analyzeHtml } from "./analyzers/html.js";
import { analyzeImages } from "./analyzers/images.js";
import { analyzeLinks } from "./analyzers/links.js";
import { analyzePerformance } from "./analyzers/performance.js";
import { analyzeSecurity } from "./analyzers/security.js";
import { analyzeSeo } from "./analyzers/seo.js";
import { checkLinks } from "./linkChecker.js";
import { collectContrastInPage, collectPageFacts, collectPerformanceInPage } from "./pageCollector.js";
import { buildReport } from "./reportBuilder.js";

export const AUDIT_STEPS = [
  "loading",
  "inspecting",
  "metadata",
  "links",
  "images",
  "accessibility",
  "performance",
  "recommendations",
];

const DEFAULT_TIMEOUTS = { navigationTimeoutMs: 30_000, settleTimeoutMs: 10_000, browserTimeoutMs: 75_000 };
const FACT_LIMITS = { maxLinks: 1000, maxImages: 300, maxItems: 100, maxText: 300 };
const PERF_LIMITS = { maxResources: 1000 };
const CONTRAST_LIMITS = { maxElements: 500, maxIssues: 30 };
const MAX_RESPONSES = 1500;
const MAX_MESSAGES = 30;
const LOGGED_HEADERS = ["content-type", "content-encoding", "cache-control", "content-length", "expires"];
const CHALLENGE_TITLE = /just a moment|attention required|verify you are human|access denied|security check/i;

const clip = (value, max = 300) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

function classifyHttpStatus(status) {
  if (status === 401 || status === 407) {
    return new WebAnalyzeError("AUTH_REQUIRED", "This page requires you to sign in, so it can't be audited.");
  }
  if (status === 403 || status === 429) {
    return new WebAnalyzeError(
      "BLOCKED",
      "The website refused automated access. It may use anti-bot protection that Web Audit won't bypass."
    );
  }
  if (status === 404 || status === 410) {
    return new WebAnalyzeError("PAGE_LOAD_FAILED", "The page was not found (HTTP 404). Check the URL.");
  }
  if (status !== null && status >= 500) {
    return new WebAnalyzeError("PAGE_LOAD_FAILED", `The website returned a server error (HTTP ${status}).`);
  }
  return null;
}

/** Loads the page once in a locked-down headless browser and gathers everything the analyzers need. */
async function collectFromBrowser(requestedUrl, { urlPolicy, timeouts, signal, progress }) {
  let session = null;
  let deadlineHit = false;
  let deadlineTimer = null;
  const onAbort = () => void session?.close();
  const responses = [];
  const consoleErrors = [];
  const pageErrors = [];

  try {
    session = await openBrowserSession(urlPolicy, { loadAllResources: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    deadlineTimer = setTimeout(() => {
      deadlineHit = true;
      void session?.close();
    }, timeouts.browserTimeoutMs);

    const { page } = session;
    page.on("response", (response) => {
      const status = response.status();
      if (responses.length >= MAX_RESPONSES || (status >= 300 && status < 400)) {
        return;
      }
      const all = response.headers();
      responses.push({
        url: response.url().slice(0, 400),
        status,
        type: response.request().resourceType(),
        headers: Object.fromEntries(LOGGED_HEADERS.filter((name) => all[name]).map((name) => [name, all[name]])),
      });
    });
    page.on("console", (message) => {
      // Failed resource loads are reported by the Links/Images checks, not as script errors.
      if (message.type() === "error" && consoleErrors.length < MAX_MESSAGES && !/^Failed to load resource/i.test(message.text())) {
        consoleErrors.push(clip(message.text()));
      }
    });
    page.on("pageerror", (error) => {
      if (pageErrors.length < MAX_MESSAGES) {
        pageErrors.push(clip(error.message));
      }
    });

    const navigation = await session.navigate(requestedUrl, { ...timeouts, waitForFormFields: false });
    const statusError = classifyHttpStatus(navigation.status);
    if (statusError) {
      throw statusError;
    }

    progress("inspecting");
    const facts = await page.evaluate(collectPageFacts, FACT_LIMITS);
    if (CHALLENGE_TITLE.test(facts.title) && facts.linkTotal < 5) {
      throw new WebAnalyzeError(
        "CAPTCHA_DETECTED",
        "This website is showing a CAPTCHA or bot check. Web Audit won't bypass it; open the site in your browser instead."
      );
    }
    const perf = await page.evaluate(collectPerformanceInPage, PERF_LIMITS).catch((error) => {
      console.error("[webAudit] performance collection failed", error);
      return null;
    });
    const contrast = await page.evaluate(collectContrastInPage, CONTRAST_LIMITS).catch((error) => {
      console.error("[webAudit] contrast collection failed", error);
      return null;
    });
    const cookies = await page.context().cookies().catch(() => []);

    return {
      navigation: { ...navigation, requestedUrl },
      facts,
      perf,
      contrast,
      cookies: cookies.map(({ name, domain, secure, httpOnly, sameSite }) => ({ name, domain, secure, httpOnly, sameSite })),
      responses,
      consoleErrors,
      pageErrors,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new WebAnalyzeError("CANCELLED", "The audit was stopped.");
    }
    if (deadlineHit) {
      throw new WebAnalyzeError("TIMEOUT", "The website took too long to load for an audit.");
    }
    const friendly = toWebAnalyzeError(error);
    if (friendly.code === "BROWSER_ERROR") {
      console.error("[webAudit] page collection failed", error);
    }
    throw friendly;
  } finally {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
    signal?.removeEventListener("abort", onAbort);
    await session?.close();
  }
}

/** robots.txt, sitemap and the http→https redirect, each bounded and policy-checked. */
async function fetchSiteExtras(finalUrl, { urlPolicy, signal }) {
  const page = new URL(finalUrl);
  const common = { urlPolicy, signal, timeoutMs: 6_000 };

  const robotsTask = safeFetch(`${page.origin}/robots.txt`, { ...common, readBody: true, maxBodyBytes: 50_000 });
  const redirectTask =
    page.protocol === "https:"
      ? safeFetch(`http://${page.host}${page.pathname}`, { ...common, followRedirects: false })
      : Promise.resolve(null);

  const robotsResponse = await robotsTask;
  const robots = robotsResponse.status === null ? null : { status: robotsResponse.status, body: robotsResponse.body ?? "" };

  const declared = robots?.status === 200 ? /^\s*sitemap:\s*(\S+)/im.exec(robots.body)?.[1] : null;
  const sitemapUrl = declared ?? `${page.origin}/sitemap.xml`;
  let sitemapResponse = await safeFetch(sitemapUrl, { ...common, method: "HEAD" });
  if (sitemapResponse.status === 405 || sitemapResponse.status === 501) {
    sitemapResponse = await safeFetch(sitemapUrl, { ...common, method: "GET" });
  }
  const sitemap =
    sitemapResponse.status === null
      ? null
      : { found: sitemapResponse.status < 400, url: sitemapUrl, declared: Boolean(declared) };

  const redirectResponse = await redirectTask;
  const location = redirectResponse?.headers?.location ?? null;
  const httpRedirect = redirectResponse
    ? {
        status: redirectResponse.status,
        location,
        redirectsToHttps:
          redirectResponse.status !== null &&
          redirectResponse.status >= 300 &&
          redirectResponse.status < 400 &&
          Boolean(location && URL.canParse(location, `http://${page.host}`) && new URL(location, `http://${page.host}`).protocol === "https:"),
      }
    : null;

  return { robots, sitemap, httpRedirect };
}

/**
 * Audits one public page. Throws WebAnalyzeError when the page itself can't be audited; problems
 * in individual categories are reported as incomplete categories (a partial report) instead.
 *
 * @param {string} input
 * @param {{ urlPolicy?: typeof strictUrlPolicy, onProgress?: (step: string) => void, signal?: AbortSignal,
 *   timeouts?: Partial<typeof DEFAULT_TIMEOUTS>, linkLimits?: object }} [options]
 */
export async function runWebAudit(input, options = {}) {
  const urlPolicy = options.urlPolicy ?? strictUrlPolicy;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const progress = options.onProgress ?? (() => {});
  const { signal } = options;
  const startedAt = Date.now();
  const throwIfCancelled = () => {
    if (signal?.aborted) {
      throw new WebAnalyzeError("CANCELLED", "The audit was stopped.");
    }
  };

  const url = urlPolicy.parse(input);
  const requestedUrl = url.toString();
  throwIfCancelled();
  progress("loading");
  await urlPolicy.assertHostAllowed(url.hostname);

  const collected = await collectFromBrowser(requestedUrl, { urlPolicy, timeouts, signal, progress });
  throwIfCancelled();

  const { facts, perf, contrast, navigation } = collected;
  const ctx = { ...collected, extras: { robots: null, sitemap: null, httpRedirect: null }, linkResults: null };
  const results = {};
  const notes = [];
  const run = (id, analyze) => {
    try {
      results[id] = { checks: analyze(), error: null };
    } catch (error) {
      console.error(`[webAudit] ${id} analyzer failed`, error);
      results[id] = { checks: [], error: "This category couldn't be fully checked." };
    }
  };

  progress("metadata");
  try {
    ctx.extras = await fetchSiteExtras(navigation.finalUrl, { urlPolicy, signal });
  } catch (error) {
    console.error("[webAudit] site checks failed", error);
    notes.push("robots.txt, sitemap and HTTPS redirect checks couldn't be completed.");
  }
  throwIfCancelled();
  run("seo", () => analyzeSeo(ctx));
  run("html", () => analyzeHtml(ctx));
  run("security", () => analyzeSecurity(ctx));

  progress("links");
  try {
    ctx.linkResults = await checkLinks(facts.links, {
      baseUrl: navigation.finalUrl,
      urlPolicy,
      signal,
      limits: options.linkLimits,
    });
  } catch (error) {
    console.error("[webAudit] link check failed", error);
  }
  throwIfCancelled();
  if (ctx.linkResults) {
    run("links", () => analyzeLinks(ctx));
    if (ctx.linkResults.timedOut && !results.links.error) {
      results.links.error = "Time ran out before every link could be checked.";
    }
    if (ctx.linkResults.skippedCount > 0) {
      notes.push(
        `Checked ${ctx.linkResults.results.length} of ${ctx.linkResults.internalCount + ctx.linkResults.externalCount} unique links to keep the audit quick.`
      );
    }
  } else {
    results.links = { checks: [], error: "Links couldn't be checked." };
  }

  progress("images");
  run("images", () => analyzeImages(ctx));

  progress("accessibility");
  run("accessibility", () => analyzeAccessibility(ctx));
  if (!contrast) {
    notes.push("Text contrast couldn't be measured on this page.");
  }

  progress("performance");
  let perfMetrics = { totalBytes: null, requestCount: null };
  if (perf) {
    run("performance", () => {
      const output = analyzePerformance(ctx);
      perfMetrics = output.metrics;
      return output.checks;
    });
  } else {
    results.performance = { checks: [], error: "Performance data wasn't available for this page." };
  }

  progress("recommendations");
  if (facts.linkTotal > FACT_LIMITS.maxLinks) {
    notes.push(`Only the first ${FACT_LIMITS.maxLinks} of ${facts.linkTotal} links were inspected.`);
  }
  if (facts.imageTotal > FACT_LIMITS.maxImages) {
    notes.push(`Only the first ${FACT_LIMITS.maxImages} of ${facts.imageTotal} images were inspected.`);
  }

  return buildReport({
    url: requestedUrl,
    finalUrl: navigation.finalUrl,
    title: facts.title.trim() || new URL(navigation.finalUrl).host,
    durationMs: Date.now() - startedAt,
    results,
    notes,
    metrics: {
      httpStatus: navigation.status,
      redirectCount: navigation.redirectCount,
      ttfbMs: perf?.ttfbMs ?? null,
      fcpMs: perf?.fcpMs ?? null,
      lcpMs: perf?.lcpMs ?? null,
      cls: perf?.cls ?? null,
      loadMs: perf?.loadMs ?? null,
      totalBytes: perfMetrics.totalBytes,
      requestCount: perfMetrics.requestCount,
      domNodes: facts.domNodes,
      linkCount: facts.linkTotal,
      imageCount: facts.imageTotal,
    },
  });
}
