import { chromium } from "playwright-core";
import { WebAnalyzeError } from "./errors.js";

/**
 * Uses an installed Edge/Chrome instead of a Playwright-downloaded browser, so nothing extra has
 * to ship with the app. Edge is always present on Windows 10/11.
 */
const BROWSER_CHANNELS = ["msedge", "chrome", undefined];
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font"]);
const MAX_REQUESTS = 600;
const MAX_REDIRECTS = 10;

const LAUNCH_ARGS = [
  "--disable-extensions",
  "--disable-sync",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
  "--disable-features=Translate,MediaRouter,OptimizationHints",
];

async function launchBrowser(interactive) {
  let lastError = null;
  for (const channel of BROWSER_CHANNELS) {
    try {
      return await chromium.launch({
        channel,
        headless: !interactive,
        args: interactive ? [...LAUNCH_ARGS, "--window-size=1280,900"] : LAUNCH_ARGS,
        timeout: 20_000,
      });
    } catch (error) {
      lastError = error;
    }
  }
  console.error("[webAnalyze] browser launch failed", lastError);
  throw new WebAnalyzeError(
    "BROWSER_UNAVAILABLE",
    "Could not start a browser for analysis. Make sure Microsoft Edge or Google Chrome is installed."
  );
}

/**
 * An isolated, locked-down browser session for one page.
 *
 * Analysis sessions are headless and strip heavy resources/popups/dialogs. Interactive sessions
 * (Auto Fill) open a visible window the user reviews and submits from, so the page loads normally
 * and popups/dialogs are left to the user. Network safety rules apply to both.
 * `loadAllResources` keeps a headless session from stripping images/fonts/media (Web Audit needs
 * them to measure the real page).
 *
 * @param {{ assertHostAllowed: (hostname: string) => Promise<void> }} urlPolicy
 * @param {{ interactive?: boolean, loadAllResources?: boolean }} [options]
 */
export async function openBrowserSession(
  urlPolicy,
  { interactive = false, loadAllResources = interactive } = {}
) {
  const browser = await launchBrowser(interactive);
  let closed = false;
  let requestCount = 0;
  /** @type {WebAnalyzeError | null} */
  let navigationViolation = null;
  /** @type {import('playwright-core').Page | null} */
  let page = null;
  const hostChecks = new Map();

  const hostAllowed = (hostname) => {
    if (!hostChecks.has(hostname)) {
      hostChecks.set(
        hostname,
        urlPolicy.assertHostAllowed(hostname).then(
          () => true,
          () => false
        )
      );
    }
    return hostChecks.get(hostname);
  };

  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    bypassCSP: false,
    permissions: [],
    viewport: interactive ? null : { width: 1280, height: 900 },
    locale: "en-US",
  });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);

  await context.route("**/*", async (route) => {
    const request = route.request();
    requestCount += 1;
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return route.abort("blockedbyclient");
    }
    let isDocument = false;
    try {
      isDocument = request.isNavigationRequest() && request.frame() === page?.mainFrame();
    } catch {
      isDocument = false;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return route.abort("blockedbyclient");
    }
    if (
      !isDocument &&
      ((!loadAllResources && BLOCKED_RESOURCE_TYPES.has(request.resourceType())) ||
        (!interactive && requestCount > MAX_REQUESTS))
    ) {
      return route.abort("blockedbyclient");
    }
    if (!(await hostAllowed(url.hostname))) {
      if (isDocument) {
        navigationViolation = new WebAnalyzeError(
          "UNSUPPORTED_URL",
          "The website redirected to a local or private network address, so it was not analyzed."
        );
      }
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  if (!interactive) {
    // Popups and new tabs are never needed for field detection.
    context.on("page", (extra) => {
      if (page && extra !== page) {
        void extra.close().catch(() => {});
      }
    });
  }

  page = await context.newPage();
  if (interactive) {
    // A listener that doesn't respond keeps dialogs open for the user instead of auto-dismissing.
    page.on("dialog", () => {});
  } else {
    page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));
  }

  /**
   * Navigates and waits (bounded) for the page and any client-rendered form to settle.
   * @param {string} url
   * @param {{ navigationTimeoutMs: number, settleTimeoutMs: number, waitForFormFields?: boolean }} timeouts
   */
  async function navigate(url, { navigationTimeoutMs, settleTimeoutMs, waitForFormFields = true }) {
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
    } catch (error) {
      if (navigationViolation) {
        throw navigationViolation;
      }
      throw error;
    }
    if (navigationViolation) {
      throw navigationViolation;
    }

    // Playwright routes don't see server-side redirect hops, so re-validate the whole chain.
    const chain = [];
    for (let request = response?.request() ?? null; request; request = request.redirectedFrom()) {
      chain.push(request.url());
    }
    if (chain.length - 1 > MAX_REDIRECTS) {
      throw new WebAnalyzeError("TOO_MANY_REDIRECTS", "The website redirected too many times and was not analyzed.");
    }
    for (const hop of chain) {
      const { hostname } = new URL(hop);
      if (!(await hostAllowed(hostname))) {
        throw new WebAnalyzeError(
          "UNSUPPORTED_URL",
          "The website redirected to a local or private network address, so it was not analyzed."
        );
      }
    }

    const settleDeadline = Date.now() + settleTimeoutMs;
    const remaining = () => Math.max(0, settleDeadline - Date.now());
    await page.waitForLoadState("load", { timeout: remaining() }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: Math.min(remaining(), 4_000) }).catch(() => {});
    if (waitForFormFields) {
      await page
        .waitForFunction(
          () => document.querySelector("input:not([type=hidden]), select, textarea") !== null,
          undefined,
          { timeout: Math.min(remaining(), 5_000), polling: 250 }
        )
        .catch(() => {});
    }
    await page.waitForTimeout(Math.min(remaining(), 400));

    return {
      status: response?.status() ?? null,
      finalUrl: page.url(),
      redirectCount: Math.max(0, chain.length - 1),
      headers: response?.headers() ?? {},
      securityDetails: (await response?.securityDetails().catch(() => null)) ?? null,
    };
  }

  async function close() {
    if (closed) {
      return;
    }
    closed = true;
    await browser.close().catch(() => {});
  }

  return {
    page,
    navigate,
    close,
    get closed() {
      return closed;
    },
    /** Fires once when the browser goes away, including when the user closes its window. */
    onClosed(callback) {
      browser.once("disconnected", () => {
        closed = true;
        callback();
      });
    },
  };
}
