import { openBrowserSession } from "./browserSession.js";
import { FormAssistantError, toFormAssistantError } from "./errors.js";
import { extractFormFieldsInPage } from "./fieldExtractor.js";
import { mapFields } from "./fieldMapper.js";
import { strictUrlPolicy } from "./urlSafety.js";

export const ANALYSIS_STEPS = ["opening", "loading", "detecting", "mapping"];

const DEFAULT_TIMEOUTS = {
  navigationTimeoutMs: 30_000,
  settleTimeoutMs: 12_000,
  totalTimeoutMs: 75_000,
};
const EXTRACTION_LIMITS = { maxFields: 400, maxOptions: 250, maxText: 300 };
const MAX_FRAMES = 15;
const CAPTCHA_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha/i;
const CHALLENGE_TITLE = /just a moment|attention required|verify you are human|access denied|security check/i;
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sign_in|auth|sso|account\/login|oauth)(\/|\?|$)/i;

async function extractFromFrames(page) {
  const frames = page.frames().slice(0, MAX_FRAMES);
  const main = page.mainFrame();
  let title = "";
  let hasCaptcha = false;
  let truncated = false;
  const fields = [];
  const forms = [];

  for (const frame of frames) {
    const frameUrl = frame.url();
    if (frame !== main && CAPTCHA_FRAME.test(frameUrl)) {
      hasCaptcha = true;
      continue;
    }
    let result;
    try {
      result = await frame.evaluate(extractFormFieldsInPage, EXTRACTION_LIMITS);
    } catch {
      // Detached or cross-process frames that vanish mid-analysis are skipped.
      continue;
    }
    const isMain = frame === main;
    if (isMain) {
      title = result.title;
    }
    hasCaptcha = hasCaptcha || result.hasCaptcha;
    truncated = truncated || result.truncated;

    const formOffset = forms.length;
    for (const form of result.forms) {
      forms.push({ ...form, index: formOffset + form.index, frameUrl: isMain ? null : frameUrl });
    }
    for (const field of result.fields) {
      fields.push({
        ...field,
        formIndex: field.formIndex === null ? null : formOffset + field.formIndex,
        frameUrl: isMain ? null : frameUrl,
      });
    }
  }

  return {
    title,
    hasCaptcha,
    truncated,
    forms,
    fields: fields.slice(0, EXTRACTION_LIMITS.maxFields).map((field, index) => ({ key: `f${index + 1}`, ...field })),
  };
}

function classifyHttpStatus(status) {
  if (status === 401 || status === 407) {
    return new FormAssistantError("AUTH_REQUIRED", "This page requires you to sign in, so it can't be analyzed.");
  }
  if (status === 403 || status === 429) {
    return new FormAssistantError(
      "BLOCKED",
      "The website refused automated access. It may use anti-bot protection that Form Assistant won't bypass."
    );
  }
  if (status === 404 || status === 410) {
    return new FormAssistantError("PAGE_LOAD_FAILED", "The page was not found (HTTP 404). Check the URL.");
  }
  if (status !== null && status >= 500) {
    return new FormAssistantError("PAGE_LOAD_FAILED", `The website returned a server error (HTTP ${status}).`);
  }
  return null;
}

function buildWarnings({ extraction, redirectCount, finalUrl, requestedUrl }) {
  const warnings = [];
  if (extraction.hasCaptcha) {
    warnings.push({
      code: "CAPTCHA_DETECTED",
      message: "This page uses a CAPTCHA. Form Assistant will not solve it; you'll need to complete it yourself.",
    });
  }
  const visibleFields = extraction.fields.filter((field) => field.visible);
  const passwordFields = visibleFields.filter((field) => field.type === "password");
  if (passwordFields.length && visibleFields.length <= 4) {
    warnings.push({
      code: "LOGIN_FORM",
      message: "This looks like a sign-in form. Form Assistant never stores or fills passwords automatically.",
    });
  }
  if (redirectCount > 0 && new URL(finalUrl).host !== new URL(requestedUrl).host) {
    warnings.push({ code: "REDIRECTED", message: `The website redirected to ${new URL(finalUrl).host}.` });
  }
  if (extraction.truncated) {
    warnings.push({
      code: "TRUNCATED",
      message: `Only the first ${EXTRACTION_LIMITS.maxFields} fields were analyzed.`,
    });
  }
  return warnings;
}

/**
 * Analyzes a URL: open → load → detect → map. Throws FormAssistantError on failure.
 *
 * @param {string} input
 * @param {{
 *   urlPolicy?: typeof strictUrlPolicy,
 *   onProgress?: (step: string) => void,
 *   signal?: AbortSignal,
 *   mappers?: Parameters<typeof mapFields>[1],
 *   timeouts?: Partial<typeof DEFAULT_TIMEOUTS>,
 * }} [options]
 */
export async function analyzeWebsite(input, options = {}) {
  const urlPolicy = options.urlPolicy ?? strictUrlPolicy;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const progress = options.onProgress ?? (() => {});
  const startedAt = Date.now();

  const url = urlPolicy.parse(input);
  const requestedUrl = url.toString();

  if (options.signal?.aborted) {
    throw new FormAssistantError("CANCELLED", "The analysis was stopped.");
  }

  progress("opening");
  await urlPolicy.assertHostAllowed(url.hostname);

  let session = null;
  let deadlineTimer = null;
  let deadlineHit = false;
  const onAbort = () => void session?.close();

  try {
    session = await openBrowserSession(urlPolicy);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    deadlineTimer = setTimeout(() => {
      deadlineHit = true;
      void session?.close();
    }, timeouts.totalTimeoutMs);

    progress("loading");
    const navigation = await session.navigate(requestedUrl, timeouts);
    const statusError = classifyHttpStatus(navigation.status);

    progress("detecting");
    const extraction = await extractFromFrames(session.page);
    const title = extraction.title || new URL(navigation.finalUrl).host;

    const challengePage = CHALLENGE_TITLE.test(title) && extraction.fields.length <= 1;
    if (challengePage || (extraction.hasCaptcha && extraction.fields.length === 0)) {
      throw new FormAssistantError(
        "CAPTCHA_DETECTED",
        "This website is showing a CAPTCHA or bot check. Form Assistant won't bypass it — open the site in your browser instead."
      );
    }
    if (statusError) {
      throw statusError;
    }
    if (
      navigation.redirectCount > 0 &&
      LOGIN_PATH.test(new URL(navigation.finalUrl).pathname + "/") &&
      !LOGIN_PATH.test(url.pathname + "/")
    ) {
      throw new FormAssistantError(
        "AUTH_REQUIRED",
        "The website redirected to a sign-in page. This form requires an account, so it can't be analyzed."
      );
    }
    if (extraction.fields.length === 0) {
      throw new FormAssistantError("NO_FORMS", "No form fields were found on this page.");
    }

    progress("mapping");
    const fields = mapFields(extraction.fields, options.mappers);

    return {
      url: requestedUrl,
      finalUrl: navigation.finalUrl,
      title,
      fields,
      forms: extraction.forms,
      warnings: buildWarnings({
        extraction,
        redirectCount: navigation.redirectCount,
        finalUrl: navigation.finalUrl,
        requestedUrl,
      }),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (options.signal?.aborted) {
      throw new FormAssistantError("CANCELLED", "The analysis was stopped.");
    }
    if (deadlineHit) {
      throw new FormAssistantError("TIMEOUT", "The website took too long to analyze.");
    }
    const friendly = toFormAssistantError(error);
    if (friendly.code === "BROWSER_ERROR") {
      console.error("[formAssistant] analysis failed", error);
    }
    throw friendly;
  } finally {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
    options.signal?.removeEventListener("abort", onAbort);
    await session?.close();
  }
}
