import { openBrowserSession } from "./browserSession.js";
import { planAutofill } from "./autofillPlanner.js";
import { DUMMY_PROFILE } from "./dummyProfile.js";
import { FormAssistantError, toFormAssistantError } from "./errors.js";
import { strictUrlPolicy } from "./urlSafety.js";

const FIELD_TIMEOUT_MS = 4_000;
const DEFAULT_TIMEOUTS = { navigationTimeoutMs: 30_000, settleTimeoutMs: 12_000, fillTimeoutMs: 120_000 };

/**
 * Safety contract: this module only uses `fill`, `selectOption` and `setChecked`. It never clicks
 * buttons, presses keys or submits forms — the user reviews and submits manually.
 */

function attr(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function resolveFrame(page, frameUrl) {
  if (!frameUrl) {
    return page.mainFrame();
  }
  const frames = page.frames();
  const exact = frames.find((frame) => frame.url() === frameUrl);
  if (exact) {
    return exact;
  }
  const { origin, pathname } = new URL(frameUrl);
  return (
    frames.find((frame) => {
      try {
        const url = new URL(frame.url());
        return url.origin === origin && url.pathname === pathname;
      } catch {
        return false;
      }
    }) ?? null
  );
}

/** Re-finds the detected element: stored selector first, then id, then name. */
async function resolveLocator(frame, field) {
  const selectors = [
    field.selector,
    field.id ? `${field.tag}[id="${attr(field.id)}"]` : null,
    field.name ? `${field.tag}[name="${attr(field.name)}"]` : null,
  ].filter(Boolean);
  for (const selector of selectors) {
    try {
      const locator = frame.locator(selector);
      if ((await locator.count()) > 0) {
        return locator.first();
      }
    } catch {
      // Invalid selector on this page; try the next strategy.
    }
  }
  return null;
}

async function setChecked(locator, checked) {
  try {
    await locator.setChecked(checked, { timeout: FIELD_TIMEOUT_MS });
  } catch {
    // Custom-styled controls often hide the real input behind a label.
    await locator.setChecked(checked, { timeout: FIELD_TIMEOUT_MS, force: true });
  }
}

async function executePlan(page, field, plan) {
  const frame = resolveFrame(page, field.frameUrl);
  if (!frame) {
    return { status: "failed", reason: "The frame containing this field was not found" };
  }

  if (plan.action === "radio") {
    const radio = frame.locator(
      `input[type="radio"][name="${attr(field.name)}"][value="${attr(plan.value)}"]`
    );
    if ((await radio.count()) === 0) {
      return { status: "failed", reason: "Radio option not found on the page" };
    }
    await setChecked(radio.first(), true);
    return { status: "filled" };
  }

  const locator = await resolveLocator(frame, field);
  if (!locator) {
    return { status: "failed", reason: "Field not found on the page" };
  }

  switch (plan.action) {
    case "fill":
      await locator.fill(plan.value, { timeout: FIELD_TIMEOUT_MS });
      break;
    case "select":
      try {
        await locator.selectOption({ value: plan.value }, { timeout: FIELD_TIMEOUT_MS });
      } catch {
        await locator.selectOption({ label: plan.displayValue }, { timeout: FIELD_TIMEOUT_MS });
      }
      break;
    case "check":
    case "uncheck":
      await setChecked(locator, plan.action === "check");
      break;
    default:
      return { status: "skipped", reason: "Nothing to fill" };
  }
  return { status: "filled" };
}

function toResult(plan, outcome) {
  return {
    key: plan.key,
    field: plan.field,
    mappedField: plan.mappedField,
    status: outcome.status,
    value: outcome.status === "filled" ? plan.displayValue : null,
    reason: outcome.reason ?? null,
  };
}

export function summarize(results) {
  const count = (status) => results.filter((result) => result.status === status).length;
  return {
    success: true,
    totalDetected: results.length,
    filled: count("filled"),
    skipped: count("skipped"),
    failed: count("failed"),
    review: count("review"),
    results,
  };
}

/**
 * Opens the analyzed page in a visible browser, fills every applicable detected field with test
 * data and stops. The returned session stays open for the user; the caller owns closing it.
 *
 * @param {{ url: string, finalUrl?: string | null, fields: object[] }} analysis
 * @param {{
 *   urlPolicy?: typeof strictUrlPolicy,
 *   interactive?: boolean,
 *   profile?: Record<string, string | null>,
 *   signal?: AbortSignal,
 *   onPhase?: (phase: 'opening' | 'loading' | 'filling') => void,
 *   onResult?: (result: ReturnType<typeof toResult>) => void,
 *   timeouts?: Partial<typeof DEFAULT_TIMEOUTS>,
 * }} [options]
 */
export async function runAutofill(analysis, options = {}) {
  const urlPolicy = options.urlPolicy ?? strictUrlPolicy;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const plans = planAutofill(analysis.fields, options.profile ?? DUMMY_PROFILE);
  const fieldsByKey = new Map(analysis.fields.map((field) => [field.key, field]));
  const cancelled = () => new FormAssistantError("CANCELLED", "Auto Fill was stopped.");

  const url = urlPolicy.parse(analysis.finalUrl ?? analysis.url);
  options.onPhase?.("opening");
  await urlPolicy.assertHostAllowed(url.hostname);

  const session = await openBrowserSession(urlPolicy, { interactive: options.interactive ?? true });
  const onAbort = () => void session.close();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    options.onPhase?.("loading");
    await session.navigate(url.toString(), timeouts);
    options.onPhase?.("filling");

    const deadline = Date.now() + timeouts.fillTimeoutMs;
    const results = [];
    for (const plan of plans) {
      if (options.signal?.aborted) {
        throw cancelled();
      }
      let outcome;
      if (plan.status !== "ready") {
        outcome = { status: plan.status, reason: plan.reason };
      } else if (Date.now() > deadline) {
        outcome = { status: "failed", reason: "Stopped: Auto Fill time limit reached" };
      } else {
        try {
          outcome = await executePlan(session.page, fieldsByKey.get(plan.key), plan);
        } catch (error) {
          if (session.closed) {
            throw error;
          }
          outcome = { status: "failed", reason: "Couldn't fill this field — it may be covered or changed" };
        }
      }
      const result = toResult(plan, outcome);
      results.push(result);
      options.onResult?.(result);
    }

    if (options.interactive ?? true) {
      await session.page.bringToFront().catch(() => {});
    }
    return { summary: summarize(results), session };
  } catch (error) {
    await session.close();
    if (options.signal?.aborted) {
      throw cancelled();
    }
    const friendly = toFormAssistantError(error);
    if (friendly.code === "CANCELLED") {
      throw new FormAssistantError("CANCELLED", "The browser window was closed before Auto Fill finished.");
    }
    throw friendly;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}
