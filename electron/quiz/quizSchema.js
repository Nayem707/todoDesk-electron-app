import crypto from "crypto";
import { QuizError } from "./quizErrors.js";
import { cleanLine } from "./quizOptions.js";

/**
 * Everything the model returns is untrusted text. It is parsed as JSON, validated field by field
 * and rebuilt into plain objects; nothing from it is ever executed, evaluated or used as SQL.
 */

export const LIMITS = {
  questionMin: 8,
  questionMax: 600,
  optionMax: 200,
  codeMax: 3000,
  codeMaxLines: 60,
  explanationMax: 600,
  conceptMax: 60,
  titleMax: 80,
  estimatedMin: 10,
  estimatedMax: 300,
};

const DEFAULT_SECONDS = { easy: 20, medium: 30, hard: 45, expert: 60 };
const CODING_EXTRA_SECONDS = 30;
const VAGUE_OPTION = /^(all|none|both|neither) of (the )?(above|these|them)\b|^both [a-f] and [a-f]\b/i;
const OPTION_PREFIX = /^\s*(?:\(?[A-Fa-f]\)|[A-Fa-f][.:]|\(?[1-6]\)|[1-6][.:])\s+/;

// ---------------------------------------------------------------------------------------------
// JSON extraction

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Index just past the bracket that closes the one at `start`, honouring JSON strings. */
function matchingBracket(text, start) {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return -1;
}

/**
 * Parse model output as JSON. Falls back to fenced code blocks and then to the first balanced
 * object or array embedded in surrounding prose.
 */
export function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new QuizError("INVALID_RESPONSE", "The model returned an empty response.");
  }
  const trimmed = text.replace(/^\uFEFF/, "").trim();

  const direct = tryParse(trimmed);
  if (direct.ok) {
    return direct.value;
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fenced = tryParse(match[1].trim());
    if (fenced.ok) {
      return fenced.value;
    }
  }

  let attempts = 0;
  for (let index = 0; index < trimmed.length && attempts < 8; index += 1) {
    const char = trimmed[index];
    if (char !== "{" && char !== "[") {
      continue;
    }
    attempts += 1;
    const end = matchingBracket(trimmed, index);
    if (end > index) {
      const embedded = tryParse(trimmed.slice(index, end));
      if (embedded.ok && embedded.value && typeof embedded.value === "object") {
        return embedded.value;
      }
    }
  }

  throw new QuizError("INVALID_RESPONSE", "The model did not return valid JSON.");
}

// ---------------------------------------------------------------------------------------------
// Schemas sent to Ollama's `format` field

const stringArray = (minItems, maxItems) => ({ type: "array", items: { type: "string" }, minItems, maxItems });

export function questionBatchSchema(type, { withTitle = false } = {}) {
  const item = {
    type: "object",
    properties: {
      question: { type: "string" },
      options: type === "true_false" ? stringArray(2, 2) : stringArray(type === "multiple_choice" ? 4 : 3, 6),
      explanation: { type: "string" },
      concept: { type: "string" },
      estimatedTime: { type: "integer" },
    },
    required: ["question", "options", "explanation", "concept", "estimatedTime"],
  };
  if (type === "multiple_choice") {
    item.properties.correctAnswers = stringArray(1, 5);
    item.required.push("correctAnswers");
  } else {
    item.properties.correctAnswer = type === "true_false" ? { type: "string", enum: ["True", "False"] } : { type: "string" };
    item.required.push("correctAnswer");
  }
  if (type === "coding") {
    item.properties.code = { type: "string" };
    item.required.splice(1, 0, "code");
  }
  const schema = {
    type: "object",
    properties: { questions: { type: "array", items: item } },
    required: ["questions"],
  };
  if (withTitle) {
    schema.properties = { title: { type: "string" }, ...schema.properties };
    schema.required = ["title", "questions"];
  }
  return schema;
}

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: stringArray(0, 6),
    weaknesses: stringArray(0, 6),
    missedConcepts: stringArray(0, 6),
    difficultyInsight: { type: "string" },
    timeManagement: { type: "string" },
    recommendations: stringArray(1, 5),
    suggestedTopics: stringArray(1, 5),
  },
  required: [
    "summary",
    "strengths",
    "weaknesses",
    "missedConcepts",
    "difficultyInsight",
    "timeManagement",
    "recommendations",
    "suggestedTopics",
  ],
};

// ---------------------------------------------------------------------------------------------
// Question validation

function normalizeForCompare(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value) {
  return new Set(normalizeForCompare(value).split(" ").filter((word) => word.length > 1));
}

/** Questions are duplicates when identical after normalization or when their words overlap ≥ 80%. */
export function isDuplicateQuestion(text, existing) {
  const key = normalizeForCompare(text);
  const tokens = words(text);
  return existing.some((other) => {
    if (normalizeForCompare(other) === key) {
      return true;
    }
    const otherTokens = words(other);
    if (tokens.size < 4 || otherTokens.size < 4) {
      return false;
    }
    let shared = 0;
    for (const token of tokens) {
      if (otherTokens.has(token)) {
        shared += 1;
      }
    }
    return shared / (tokens.size + otherTokens.size - shared) >= 0.8;
  });
}

function cleanBlock(value, max) {
  if (typeof value !== "string") {
    return "";
  }
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\t/g, "  ")
    .replace(/^\n+|\s+$/g, "");
  return text.length > max ? null : text;
}

function stripFence(code) {
  const fenced = code.match(/^```[\w+-]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : code;
}

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Map an answer key (exact text, different case, "B", "B) text") onto an option index. */
function resolveAnswer(answer, options, strippedOptions) {
  if (typeof answer !== "string" && typeof answer !== "boolean") {
    return -1;
  }
  const raw = String(answer).trim();
  if (!raw) {
    return -1;
  }
  const exact = options.indexOf(raw);
  if (exact >= 0) {
    return exact;
  }
  const loose = normalizeForCompare(raw.replace(OPTION_PREFIX, ""));
  const byText = strippedOptions.findIndex((option) => normalizeForCompare(option) === loose);
  if (byText >= 0) {
    return byText;
  }
  const letter = raw.match(/^\(?([A-Fa-f])\)?[.:]?$/);
  if (letter) {
    const index = letter[1].toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : -1;
  }
  return -1;
}

function normalizeTrueFalse(value) {
  if (value === true || value === false) {
    return value ? "True" : "False";
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "t", "yes"].includes(text)) {
    return "True";
  }
  if (["false", "f", "no"].includes(text)) {
    return "False";
  }
  return null;
}

function estimatedSeconds(raw, difficulty, type) {
  const fallback = DEFAULT_SECONDS[difficulty] + (type === "coding" ? CODING_EXTRA_SECONDS : 0);
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < LIMITS.estimatedMin) {
    return fallback;
  }
  return Math.min(LIMITS.estimatedMax, value);
}

function reject(reason) {
  return { ok: false, reason };
}

/**
 * Validate one generated question and rebuild it as a clean object. `type`, `difficulty` and the
 * topic come from the user's settings, not from the model.
 */
export function validateQuestion(raw, { type, difficulty, topic }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reject("not an object");
  }

  const question = cleanBlock(raw.question, LIMITS.questionMax);
  if (question === null) {
    return reject("question too long");
  }
  if (question.length < LIMITS.questionMin) {
    return reject("question missing");
  }

  let code = null;
  if (type === "coding") {
    const rawCode = cleanBlock(typeof raw.code === "string" ? stripFence(raw.code.trim()) : "", LIMITS.codeMax);
    if (!rawCode) {
      return reject(rawCode === null ? "code too long" : "code missing");
    }
    if (rawCode.split("\n").length > LIMITS.codeMaxLines) {
      return reject("code too long");
    }
    code = rawCode;
  }

  let options;
  let correctIndexes;
  if (type === "true_false") {
    options = ["True", "False"];
    const answer = normalizeTrueFalse(raw.correctAnswer);
    if (!answer) {
      return reject("true/false answer missing");
    }
    correctIndexes = [options.indexOf(answer)];
  } else {
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    const original = rawOptions.map((option) => cleanLine(typeof option === "number" ? String(option) : option, LIMITS.optionMax + 1));
    if (original.some((option) => !option || option.length > LIMITS.optionMax)) {
      return reject("empty or oversized option");
    }
    const allPrefixed = original.length > 0 && original.every((option) => OPTION_PREFIX.test(option));
    options = allPrefixed ? original.map((option) => option.replace(OPTION_PREFIX, "")) : original;

    const minOptions = type === "multiple_choice" ? 4 : 3;
    if (options.length < minOptions || options.length > 6) {
      return reject("wrong number of options");
    }
    const keys = options.map(normalizeForCompare);
    if (new Set(keys).size !== keys.length || keys.some((key) => !key)) {
      return reject("duplicate options");
    }
    if (options.some((option) => VAGUE_OPTION.test(option))) {
      return reject("vague option");
    }

    const answers =
      type === "multiple_choice"
        ? Array.isArray(raw.correctAnswers)
          ? raw.correctAnswers
          : Array.isArray(raw.correctAnswer)
            ? raw.correctAnswer
            : []
        : [raw.correctAnswer];
    const indexes = answers.map((answer) => resolveAnswer(answer, original, options));
    if (indexes.length === 0 || indexes.some((index) => index < 0)) {
      return reject("answer not among options");
    }
    correctIndexes = [...new Set(indexes)];
    if (type !== "multiple_choice" && correctIndexes.length !== 1) {
      return reject("needs exactly one answer");
    }
    if (type === "multiple_choice" && correctIndexes.length >= options.length) {
      return reject("every option is correct");
    }

    // A long correct answer quoted verbatim in the question gives it away.
    const questionKey = ` ${normalizeForCompare(question)} `;
    const correctTexts = correctIndexes.map((index) => keys[index]);
    const leaks = correctTexts.some((key) => key.length >= 8 && questionKey.includes(` ${key} `));
    const distractorsQuoted = keys.some((key, index) => !correctIndexes.includes(index) && key.length >= 8 && questionKey.includes(` ${key} `));
    if (leaks && !distractorsQuoted) {
      return reject("answer revealed in question");
    }
  }

  const explanation = cleanLine(raw.explanation, LIMITS.explanationMax);
  if (!explanation) {
    return reject("explanation missing");
  }

  const correctAnswers = correctIndexes.map((index) => options[index]);
  return {
    ok: true,
    question: {
      type,
      question,
      code,
      options: type === "true_false" ? options : shuffle(options),
      correctAnswers,
      explanation,
      concept: cleanLine(raw.concept, LIMITS.conceptMax) || topic,
      difficulty,
      estimatedTime: estimatedSeconds(raw.estimatedTime, difficulty, type),
    },
  };
}

/**
 * Validate a model response for one batch. Returns accepted questions (deduplicated against
 * `existing` question texts) and the reasons others were dropped.
 */
export function validateQuestionBatch(value, context, existing = []) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.questions) ? value.questions : null;
  if (!list) {
    return { questions: [], rejected: ["response has no questions array"], title: "" };
  }
  const seen = [...existing];
  const questions = [];
  const rejected = [];
  for (const raw of list) {
    const result = validateQuestion(raw, context);
    if (!result.ok) {
      rejected.push(result.reason);
      continue;
    }
    if (isDuplicateQuestion(result.question.question, seen)) {
      rejected.push("duplicate question");
      continue;
    }
    seen.push(result.question.question);
    questions.push(result.question);
  }
  const title = Array.isArray(value) ? "" : cleanLine(value?.title, LIMITS.titleMax);
  return { questions, rejected, title };
}

// ---------------------------------------------------------------------------------------------
// Performance analysis validation

function cleanList(value, maxItems, maxLength = 160) {
  if (!Array.isArray(value)) {
    return [];
  }
  const items = [];
  for (const entry of value) {
    const text = cleanLine(entry, maxLength);
    if (text && !items.some((item) => item.toLowerCase() === text.toLowerCase())) {
      items.push(text);
    }
    if (items.length >= maxItems) {
      break;
    }
  }
  return items;
}

export function validateAnalysis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuizError("INVALID_RESPONSE", "The model returned an unreadable analysis.");
  }
  const summary = cleanLine(value.summary, 600);
  if (!summary) {
    throw new QuizError("INVALID_RESPONSE", "The model returned an analysis without a summary.");
  }
  return {
    summary,
    strengths: cleanList(value.strengths, 6),
    weaknesses: cleanList(value.weaknesses, 6),
    missedConcepts: cleanList(value.missedConcepts, 6),
    difficultyInsight: cleanLine(value.difficultyInsight, 400),
    timeManagement: cleanLine(value.timeManagement, 400),
    recommendations: cleanList(value.recommendations, 5, 240),
    suggestedTopics: cleanList(value.suggestedTopics, 5, 60),
  };
}
