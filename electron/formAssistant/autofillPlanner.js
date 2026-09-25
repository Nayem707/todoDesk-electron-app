import { CHECKBOX_RULES, DUMMY_PROFILE, OPTION_ALIASES } from "./dummyProfile.js";
import { normalizeText } from "./fieldMapper.js";

/** Rule-based mappings below this confidence are shown for review instead of being filled. */
export const REVIEW_CONFIDENCE = 0.75;

const TEXT_TYPES = new Set(["text", "email", "tel", "url", "password", "search", "number", ""]);
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * @typedef {{
 *   key: string, field: string, mappedField: string | null,
 *   action: 'fill' | 'select' | 'check' | 'uncheck' | 'radio' | null,
 *   value: string | null, displayValue: string | null,
 *   status: 'ready' | 'skipped' | 'review', reason: string | null,
 * }} FillPlan
 */

export function fieldDisplayName(field) {
  return field.name || field.id || field.label || field.ariaLabel || field.placeholder || `(unnamed ${field.type})`;
}

function fieldText(field) {
  return normalizeText([field.label, field.ariaLabel, field.legend, field.nearbyText, field.name, field.id].join(" "));
}

function loose(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Picks the option matching any candidate: exact value → case-insensitive value/label →
 * normalized text → whole-word containment. Placeholder options (empty value) never match.
 */
export function matchOption(options, candidates) {
  const usable = (options || []).filter((option) => option.value !== "" || option.label.trim());
  const real = usable.filter((option) => option.value !== "");
  const pool = real.length ? real : usable;
  const strategies = [
    (option, c) => option.value === c,
    (option, c) => option.value.toLowerCase() === c.toLowerCase() || option.label.toLowerCase() === c.toLowerCase(),
    (option, c) => loose(option.label) === loose(c) || loose(option.value) === loose(c),
    (option, c) => c.length >= 4 && normalizeText(option.label).includes(normalizeText(c)),
  ];
  for (const strategy of strategies) {
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const found = pool.find((option) => strategy(option, String(candidate)));
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function dateParts(iso) {
  const [year, month, day] = iso.split("-");
  return { year, month, day };
}

/** Formats an ISO date for a text field using a hint like "dd/mm/yyyy" in its placeholder or label. */
export function formatDateForField(field, iso) {
  const { year, month, day } = dateParts(iso);
  switch (field.type) {
    case "date":
      return iso;
    case "datetime-local":
      return `${iso}T09:00`;
    case "month":
      return `${year}-${month}`;
    default:
      break;
  }
  const hint = `${field.placeholder} ${field.label} ${field.ariaLabel}`.toLowerCase();
  const match = hint.match(/(dd|mm|yyyy|yy)\s*([/.\- ])\s*(dd|mm|yyyy|yy)\s*\2\s*(dd|mm|yyyy|yy)/);
  if (!match) {
    return iso;
  }
  const tokens = { dd: day, mm: month, yyyy: year, yy: year.slice(2) };
  return [match[1], match[3], match[4]].map((token) => tokens[token]).join(match[2]);
}

/** Candidate option values for a select that holds only part of a date (day / month / year). */
function dateSelectCandidates(field, iso) {
  const { year, month, day } = dateParts(iso);
  const monthIndex = Number(month) - 1;
  const monthCandidates = [String(Number(month)), month, MONTH_NAMES[monthIndex], MONTH_NAMES[monthIndex].slice(0, 3)];
  const text = fieldText(field);
  if (/\b(day|dd)\b/.test(text)) {
    return [String(Number(day)), day];
  }
  if (/\b(month|mm)\b/.test(text)) {
    return monthCandidates;
  }
  if (/\b(year|yyyy|yy)\b/.test(text)) {
    return [year];
  }
  return [iso, year];
}

function optionCandidates(field, value) {
  if (field.mappedField === "dateOfBirth") {
    return dateSelectCandidates(field, value);
  }
  return [value, ...(OPTION_ALIASES[value] ?? [])];
}

function planCheckbox(field, base) {
  if (field.options.length > 1) {
    return { ...base, status: "skipped", reason: "Multiple-choice checkboxes need your choice" };
  }
  // Surrounding text often belongs to a neighbouring checkbox, so prefer the checkbox's own label.
  const ownLabel = field.label || field.ariaLabel;
  const text = ownLabel
    ? normalizeText([ownLabel, field.name, field.id].join(" "))
    : fieldText(field);
  const rule = CHECKBOX_RULES.find((candidate) => candidate.pattern.test(text));
  if (!rule) {
    return { ...base, status: "skipped", reason: "No predefined behaviour for this checkbox" };
  }
  return {
    ...base,
    action: rule.checked ? "check" : "uncheck",
    displayValue: rule.checked ? "Checked" : "Unchecked",
    status: "ready",
    reason: rule.label,
  };
}

/**
 * @param {object} field A detected + mapped field.
 * @param {Record<string, string | null>} profile
 * @returns {FillPlan}
 */
export function planField(field, profile = DUMMY_PROFILE) {
  const base = {
    key: field.key,
    field: fieldDisplayName(field),
    mappedField: field.mappedField ?? null,
    action: null,
    value: null,
    displayValue: null,
    status: "skipped",
    reason: null,
  };
  const skip = (reason) => ({ ...base, status: "skipped", reason });

  if (field.type === "file") {
    return skip("File upload requires a user-provided file");
  }
  if (!field.visible) {
    return skip("Hidden field — never filled");
  }
  if (field.disabled || field.readOnly) {
    return skip("Field is disabled or read-only");
  }
  if (field.type === "checkbox") {
    return planCheckbox(field, base);
  }
  if (!field.mappedField) {
    return skip("Not mapped to a known field");
  }
  if (field.mappingSource !== "user" && field.confidence < REVIEW_CONFIDENCE) {
    return { ...base, status: "review", reason: "Low-confidence mapping — confirm it to fill this field" };
  }

  const value = profile[field.mappedField];
  if (value === null || value === undefined) {
    return skip("No test value for this field");
  }

  if (field.tag === "select" || field.type === "radio") {
    const option = matchOption(field.options, optionCandidates(field, value));
    if (!option) {
      return skip(`No option matches "${value}"`);
    }
    return {
      ...base,
      action: field.tag === "select" ? "select" : "radio",
      value: option.value,
      displayValue: option.label || option.value,
      status: "ready",
    };
  }

  let text = field.mappedField === "dateOfBirth" ? formatDateForField(field, value) : value;
  if (field.type === "number" && !/^-?\d+(\.\d+)?$/.test(text)) {
    return skip("Test value is not a number");
  }
  if (!TEXT_TYPES.has(field.type) && field.tag !== "textarea" && field.mappedField !== "dateOfBirth") {
    return skip(`Unsupported input type "${field.type}"`);
  }
  if (field.maxLength && text.length > field.maxLength) {
    text = text.slice(0, field.maxLength);
  }
  return { ...base, action: "fill", value: text, displayValue: field.type === "password" ? "••••••••" : text, status: "ready" };
}

/** Plans every detected field — the plan length always equals the detected field count. */
export function planAutofill(fields, profile = DUMMY_PROFILE) {
  return fields.map((field) => planField(field, profile));
}
