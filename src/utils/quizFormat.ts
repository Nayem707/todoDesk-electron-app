import type { QuizDifficulty, QuizOutcome, QuizQuestionType, QuizTimeMode } from "../types/quiz";

export const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

export const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  single_choice: "Single Choice MCQ",
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  coding: "Coding Question",
};

export const QUESTION_TYPE_HINT: Record<QuizQuestionType, string> = {
  single_choice: "Choose one answer",
  multiple_choice: "Select all that apply",
  true_false: "True or false?",
  coding: "Read the code and choose one answer",
};

export const TIME_MODE_LABEL: Record<QuizTimeMode, string> = {
  none: "No Time Limit",
  total: "Total Quiz Time",
  per_question: "Per Question Time",
};

export const OUTCOME_LABEL: Record<QuizOutcome, string> = {
  correct: "Correct",
  wrong: "Wrong",
  skipped: "Skipped",
};

/** Countdown style: 14:32, or 1:02:05 past an hour. */
export function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** Elapsed-time style that rounds down: 11:42 for 11 min 42.9 s. */
export function formatElapsed(ms: number) {
  return formatClock(Math.floor(Math.max(0, ms) / 1000) * 1000);
}

/** Short human duration: 42s, 3m 05s, 1h 02m. */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function timeLimitLabel(timeMode: QuizTimeMode, totalSeconds: number | null, perQuestionSeconds: number | null) {
  if (timeMode === "total" && totalSeconds) {
    return `${Math.round(totalSeconds / 60)} min total`;
  }
  if (timeMode === "per_question" && perQuestionSeconds) {
    return `${perQuestionSeconds}s per question`;
  }
  return "No time limit";
}

/** Text colour for an accuracy percentage. Thresholds match the dashboard's strong/weak concepts. */
export function accuracyTone(accuracy: number | null | undefined) {
  if (accuracy === null || accuracy === undefined) {
    return "text-[rgb(var(--muted))]";
  }
  if (accuracy >= 80) {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (accuracy >= 60) {
    return "text-amber-700 dark:text-amber-400";
  }
  return "text-rose-700 dark:text-rose-400";
}

export function accuracyBar(accuracy: number) {
  if (accuracy >= 80) {
    return "bg-emerald-500";
  }
  if (accuracy >= 60) {
    return "bg-amber-500";
  }
  return "bg-rose-500";
}

export function formatModelSize(bytes: number) {
  if (!bytes) {
    return "";
  }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
