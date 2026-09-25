import * as formAnalysisRepository from "../database/formAnalysisRepository.js";
import { FormAssistantError, toFormAssistantError } from "../webAnalyze/errors.js";
import { parseTargetUrl } from "../webAnalyze/urlSafety.js";
import { isKnownField } from "./fieldMapper.js";
import { analyzeWebsite } from "./formAnalyzer.js";
import { planAutofill } from "./autofillPlanner.js";
import { runAutofill } from "./autofillService.js";

/** Failures that happen before a site is contacted aren't worth keeping in history. */
const UNSAVED_ERROR_CODES = new Set(["INVALID_URL", "UNSUPPORTED_URL", "CANCELLED", "BUSY"]);

/** @type {{ requestId: string, controller: AbortController } | null} */
let active = null;
/** @type {{ requestId: string, controller: AbortController } | null} */
let activeFill = null;
/** The visible browser left open after Auto Fill so the user can review and submit. */
let fillSession = null;

export function listAnalyses() {
  return formAnalysisRepository.getFormAnalyses();
}

export function getAnalysis(id) {
  const analysis = formAnalysisRepository.getFormAnalysisById(id);
  if (!analysis) {
    throw new Error("Form analysis not found.");
  }
  return analysis;
}

export function deleteAnalysis(id) {
  return formAnalysisRepository.deleteFormAnalysis(id);
}

/**
 * Runs one analysis at a time (each spins up a real browser). Failures are returned as data so
 * the renderer can show a friendly, code-specific message.
 *
 * @param {unknown} url
 * @param {{ requestId: string, emit: (payload: { requestId: string, step: string }) => void }} options
 */
export async function analyze(url, { requestId, emit }) {
  if (active || activeFill) {
    const error = new FormAssistantError("BUSY", "Another task is already running. Wait for it to finish.");
    return { analysis: null, error: { code: error.code, message: error.message } };
  }

  const controller = new AbortController();
  active = { requestId, controller };
  try {
    const result = await analyzeWebsite(url, {
      signal: controller.signal,
      onProgress: (step) => emit({ requestId, step }),
    });
    const analysis = formAnalysisRepository.createFormAnalysis({ ...result, status: "completed" });
    return { analysis, error: null };
  } catch (thrown) {
    const error = toFormAssistantError(thrown);
    let analysis = null;
    if (!UNSAVED_ERROR_CODES.has(error.code)) {
      analysis = formAnalysisRepository.createFormAnalysis({
        url: safeUrl(url),
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
    return { analysis, error: { code: error.code, message: error.message } };
  } finally {
    if (active?.requestId === requestId) {
      active = null;
    }
  }
}

export function cancelAnalysis(requestId) {
  if (active && (!requestId || active.requestId === requestId)) {
    active.controller.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

/**
 * @param {string} id
 * @param {string} fieldKey
 * @param {string | null} mappedField
 */
export function updateFieldMapping(id, fieldKey, mappedField) {
  if (!isKnownField(mappedField)) {
    throw new Error("Unknown field type.");
  }
  const analysis = getAnalysis(id);
  let found = false;
  const fields = analysis.fields.map((field) => {
    if (field.key !== fieldKey) {
      return field;
    }
    found = true;
    return {
      ...field,
      mappedField,
      confidence: mappedField ? 1 : 0,
      mappingSource: "user",
      mappingReasons: ["Set manually"],
    };
  });
  if (!found) {
    throw new Error("Field not found in this analysis.");
  }
  return formAnalysisRepository.updateFormAnalysisFields(id, fields);
}

/** What Auto Fill would do for each detected field, shown before the user confirms. */
export function previewAutofill(id) {
  return planAutofill(getAnalysis(id).fields).map(({ key, status, reason, displayValue, action }) => ({
    key,
    status,
    reason,
    displayValue,
    action,
  }));
}

/**
 * Fills the analyzed page with test data in a visible browser window, then stops. Only runs on
 * an explicit user request; never submits.
 *
 * @param {string} id
 * @param {{ requestId: string, emit: (payload: object) => void }} options
 */
export async function autofill(id, { requestId, emit }) {
  if (active || activeFill) {
    return { result: null, error: { code: "BUSY", message: "Wait for the current task to finish." } };
  }
  const analysis = getAnalysis(id);
  if (analysis.status !== "completed" || !analysis.fields.length) {
    return { result: null, error: { code: "NO_FORMS", message: "This analysis has no fields to fill." } };
  }

  await closeAutofillBrowser();
  const controller = new AbortController();
  activeFill = { requestId, controller };
  try {
    const { summary, session } = await runAutofill(analysis, {
      signal: controller.signal,
      onPhase: (phase) => emit({ requestId, phase }),
      onResult: (result) => emit({ requestId, result }),
    });
    fillSession = session;
    session.onClosed(() => {
      if (fillSession === session) {
        fillSession = null;
      }
    });
    return { result: summary, error: null };
  } catch (thrown) {
    const error = toFormAssistantError(thrown);
    return { result: null, error: { code: error.code, message: error.message } };
  } finally {
    if (activeFill?.requestId === requestId) {
      activeFill = null;
    }
  }
}

export function cancelAutofill(requestId) {
  if (activeFill && (!requestId || activeFill.requestId === requestId)) {
    activeFill.controller.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

export async function closeAutofillBrowser() {
  const session = fillSession;
  fillSession = null;
  await session?.close();
  return { closed: Boolean(session) };
}

export async function shutdown() {
  active?.controller.abort();
  activeFill?.controller.abort();
  await closeAutofillBrowser();
}

function safeUrl(input) {
  try {
    return parseTargetUrl(input).toString();
  } catch {
    return String(input ?? "").slice(0, 2048);
  }
}
