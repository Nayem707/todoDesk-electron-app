import * as webAuditRepository from "../database/webAuditRepository.js";
import { WebAnalyzeError, toWebAnalyzeError } from "../webAnalyze/errors.js";
import { parseTargetUrl } from "../webAnalyze/urlSafety.js";
import { runWebAudit } from "./auditRunner.js";

/** Failures that happen before a site is contacted aren't worth keeping in history. */
const UNSAVED_ERROR_CODES = new Set(["INVALID_URL", "UNSUPPORTED_URL", "CANCELLED", "BUSY"]);

/** @type {{ requestId: string, controller: AbortController } | null} */
let active = null;

export function listAudits() {
  return webAuditRepository.getWebAudits();
}

export function getAudit(id) {
  const audit = webAuditRepository.getWebAuditById(id);
  if (!audit) {
    throw new Error("Web audit not found.");
  }
  return audit;
}

export function deleteAudit(id) {
  return webAuditRepository.deleteWebAudit(id);
}

/**
 * Runs one audit at a time (each spins up a real browser). Independent of Form Assistant, which
 * keeps its own lock. Failures are returned as data so the renderer can show a friendly message.
 *
 * @param {unknown} url
 * @param {{ requestId: string, emit: (payload: { requestId: string, step: string }) => void }} options
 */
export async function startAudit(url, { requestId, emit }) {
  if (active) {
    const error = new WebAnalyzeError("BUSY", "An audit is already running. Wait for it to finish.");
    return { audit: null, error: { code: error.code, message: error.message } };
  }

  const controller = new AbortController();
  active = { requestId, controller };
  try {
    const report = await runWebAudit(url, {
      signal: controller.signal,
      onProgress: (step) => emit({ requestId, step }),
    });
    const audit = webAuditRepository.createWebAudit({ url: report.url, status: "completed", report });
    return { audit, error: null };
  } catch (thrown) {
    const error = toWebAnalyzeError(thrown);
    let audit = null;
    if (!UNSAVED_ERROR_CODES.has(error.code)) {
      audit = webAuditRepository.createWebAudit({
        url: safeUrl(url),
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
    return { audit, error: { code: error.code, message: error.message } };
  } finally {
    if (active?.requestId === requestId) {
      active = null;
    }
  }
}

export function cancelAudit(requestId) {
  if (active && (!requestId || active.requestId === requestId)) {
    active.controller.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

export function shutdown() {
  active?.controller.abort();
}

function safeUrl(input) {
  try {
    return parseTargetUrl(input).toString();
  } catch {
    return String(input ?? "").slice(0, 2048);
  }
}
