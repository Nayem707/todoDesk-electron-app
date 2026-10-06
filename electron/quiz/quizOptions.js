import { QuizError } from "./quizErrors.js";

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
export const QUESTION_TYPES = ["single_choice", "multiple_choice", "true_false", "coding"];
export const QUESTION_COUNTS = [5, 10, 15, 20, 30, 50];
export const TIME_MODES = ["none", "total", "per_question"];
export const TOTAL_TIME_MINUTES = [5, 10, 15, 20, 30, 60];
export const PER_QUESTION_SECONDS = [15, 30, 45, 60, 120];

export const MAX_TOPIC_LENGTH = 80;
export const MAX_FOCUS_LENGTH = 300;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function cleanLine(value, max) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function invalid(message) {
  return new QuizError("INVALID_CONFIG", message);
}

/**
 * Validate the Create Quiz form. Everything the main process acts on comes through here, so the
 * renderer cannot request unsupported counts, modes or types.
 */
export function normalizeQuizConfig(input) {
  if (!input || typeof input !== "object") {
    throw invalid("The quiz settings are missing.");
  }

  const topic = cleanLine(input.topic, MAX_TOPIC_LENGTH + 1);
  if (!topic) {
    throw invalid("Enter a topic for the quiz.");
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    throw invalid(`Keep the topic under ${MAX_TOPIC_LENGTH} characters.`);
  }

  const questionCount = Number(input.questionCount);
  if (!QUESTION_COUNTS.includes(questionCount)) {
    throw invalid("Choose a supported number of questions.");
  }

  const difficulty = String(input.difficulty ?? "");
  if (!DIFFICULTIES.includes(difficulty)) {
    throw invalid("Choose a difficulty.");
  }

  const requestedTypes = Array.isArray(input.questionTypes) ? input.questionTypes : [];
  const questionTypes = QUESTION_TYPES.filter((type) => requestedTypes.includes(type));
  if (questionTypes.length === 0) {
    throw invalid("Choose at least one question type.");
  }
  if (questionTypes.length > questionCount) {
    throw invalid("Choose fewer question types than questions.");
  }

  const timeMode = String(input.timeMode ?? "");
  if (!TIME_MODES.includes(timeMode)) {
    throw invalid("Choose a time mode.");
  }

  let totalSeconds = null;
  let perQuestionSeconds = null;
  if (timeMode === "total") {
    const minutes = Number(input.totalMinutes);
    if (!TOTAL_TIME_MINUTES.includes(minutes)) {
      throw invalid("Choose a total quiz time.");
    }
    totalSeconds = minutes * 60;
  } else if (timeMode === "per_question") {
    const seconds = Number(input.perQuestionSeconds);
    if (!PER_QUESTION_SECONDS.includes(seconds)) {
      throw invalid("Choose a time per question.");
    }
    perQuestionSeconds = seconds;
  }

  const focus = cleanLine(input.focus, MAX_FOCUS_LENGTH);

  return { topic, questionCount, difficulty, questionTypes, timeMode, totalSeconds, perQuestionSeconds, focus };
}
