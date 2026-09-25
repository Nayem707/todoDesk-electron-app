import { WebAnalyzeError } from "../webAnalyze/errors.js";
import { runTraceroute } from "./traceRunner.js";

/** @type {{ requestId: string, controller: AbortController } | null} */
let active = null;

const PARTIAL_MESSAGES = {
  cancelled: { code: "CANCELLED", message: "Trace cancelled. The hops found before you cancelled are shown below." },
  timeout: { code: "TIMEOUT", message: "The trace took too long and was stopped. The hops found so far are shown below." },
};

/**
 * Runs one trace at a time. Independent of the other Web Analyze tools. Failures are returned
 * as data; a cancelled or timed-out trace that already found hops returns both the partial
 * result and the reason.
 *
 * @param {unknown} target
 * @param {{ requestId: string, emit: (payload: object) => void }} options
 */
export async function startTrace(target, { requestId, emit }) {
  if (active) {
    return { result: null, error: { code: "BUSY", message: "A trace is already running. Wait for it to finish or cancel it." } };
  }

  const controller = new AbortController();
  active = { requestId, controller };
  try {
    const result = await runTraceroute(target, {
      signal: controller.signal,
      onEvent: (event) => emit({ requestId, ...event }),
    });
    return { result, error: PARTIAL_MESSAGES[result.outcome] ?? null };
  } catch (thrown) {
    const error =
      thrown instanceof WebAnalyzeError
        ? thrown
        : new WebAnalyzeError("TRACE_FAILED", "The trace couldn't be completed. Try again.");
    if (!(thrown instanceof WebAnalyzeError)) {
      console.error("[traceroute]", thrown);
    }
    return { result: null, error: { code: error.code, message: error.message } };
  } finally {
    if (active?.requestId === requestId) {
      active = null;
    }
  }
}

export function cancelTrace(requestId) {
  if (active && (!requestId || active.requestId === requestId)) {
    active.controller.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

export function shutdown() {
  active?.controller.abort();
}
