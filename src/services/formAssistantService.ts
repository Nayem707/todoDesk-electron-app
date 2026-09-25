import type {
  AutofillProgressEvent,
  DetectedFormField,
  FormAnalysisProgressEvent,
  SemanticField,
} from "../types/formAssistant";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.formAssistantAPI) {
    throw new Error("Form Assistant is unavailable. Restart the application.");
  }
  return window.formAssistantAPI;
}

export const formAssistantService = {
  analyze: (url: string, requestId: string) => unwrap(api().analyze(url, requestId)),
  cancel: (requestId: string) => unwrap(api().cancel(requestId)),
  getHistory: () => unwrap(api().getHistory()),
  getAnalysis: (id: string) => unwrap(api().getAnalysis(id)),
  deleteAnalysis: (id: string) => unwrap(api().deleteAnalysis(id)),
  updateMapping: (id: string, fieldKey: string, mappedField: SemanticField | null) =>
    unwrap(api().updateMapping(id, fieldKey, mappedField)),
  onProgress: (callback: (event: FormAnalysisProgressEvent) => void) =>
    api().onProgress(callback),
  previewAutofill: (id: string) => unwrap(api().previewAutofill(id)),
  autofill: (id: string, requestId: string) => unwrap(api().autofill(id, requestId)),
  cancelAutofill: (requestId: string) => unwrap(api().cancelAutofill(requestId)),
  closeBrowser: () => unwrap(api().closeBrowser()),
  onFillProgress: (callback: (event: AutofillProgressEvent) => void) =>
    api().onFillProgress(callback),
};

export const UNCERTAIN_CONFIDENCE = 0.75;

export function fieldDisplayName(field: DetectedFormField) {
  return field.name || field.id || field.label || field.ariaLabel || field.placeholder || `(unnamed ${field.type})`;
}

export function fieldDescription(field: DetectedFormField) {
  return field.label || field.ariaLabel || field.placeholder || field.legend || field.nearbyText;
}

export function isUncertain(field: DetectedFormField) {
  return field.mappingSource !== "user" && (!field.mappedField || field.confidence < UNCERTAIN_CONFIDENCE);
}
