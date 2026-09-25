import * as formAnalysisRepository from "../database/formAnalysisRepository.js";
import { FormAssistantError, toFormAssistantError } from "./errors.js";
import { isKnownField } from "./fieldMapper.js";
import { analyzeWebsite } from "./formAnalyzer.js";
import { parseTargetUrl } from "./urlSafety.js";

/** Failures that happen before a site is contacted aren't worth keeping in history. */
const UNSAVED_ERROR_CODES = new Set(["INVALID_URL", "UNSUPPORTED_URL", "CANCELLED", "BUSY"]);

/** @type {{ requestId: string, controller: AbortController } | null} */
let active = null;

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
  if (active) {
    const error = new FormAssistantError("BUSY", "Another analysis is already running. Wait for it to finish.");
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

function safeUrl(input) {
  try {
    return parseTargetUrl(input).toString();
  } catch {
    return String(input ?? "").slice(0, 2048);
  }
}
