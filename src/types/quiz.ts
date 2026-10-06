export type QuizDifficulty = "easy" | "medium" | "hard" | "expert";
export type QuizQuestionType = "single_choice" | "multiple_choice" | "true_false" | "coding";
export type QuizTimeMode = "none" | "total" | "per_question";
export type QuizOutcome = "correct" | "wrong" | "skipped";
export type QuizSubmitReason = "manual" | "timeout";

export interface QuizConfigInput {
  topic: string;
  questionCount: number;
  difficulty: QuizDifficulty;
  questionTypes: QuizQuestionType[];
  timeMode: QuizTimeMode;
  totalMinutes: number | null;
  perQuestionSeconds: number | null;
  focus: string;
  similarToQuizId?: string | null;
}

export interface QuizSummary {
  id: string;
  title: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionTypes: QuizQuestionType[];
  questionCount: number;
  timeMode: QuizTimeMode;
  totalSeconds: number | null;
  perQuestionSeconds: number | null;
  focus: string;
  model: string;
  createdAt: string;
  attemptCount: number;
  bestAccuracy: number | null;
  lastAttemptAt: number | null;
}

export interface QuizError {
  code: string;
  message: string;
}

export interface QuizGenerateResponse {
  quiz: QuizSummary | null;
  error: QuizError | null;
}

export interface QuizGenerateProgress {
  requestId: string;
  phase: "checking" | "generating" | "saving";
  generated: number;
  total: number;
  batch?: number;
  batches?: number;
  attempt?: number;
}

export interface AttemptQuestion {
  id: string;
  index: number;
  type: QuizQuestionType;
  question: string;
  code: string | null;
  options: string[];
  difficulty: QuizDifficulty;
  estimatedTime: number;
  selected: string[];
  marked: boolean;
  locked: boolean;
  startedAt: number | null;
  endedAt: number | null;
  timeSpentMs: number;
  /** Per-question mode: when the current question's window closes. */
  deadlineAt: number | null;
  /** Only present once the attempt is completed. */
  correctAnswers?: string[];
  explanation?: string;
  concept?: string;
  outcome?: QuizOutcome;
}

export interface QuizResultSummary {
  score: number;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  timeUsedMs: number;
  timeRemainingMs: number | null;
  totalTimeMs: number | null;
}

export interface QuizBucket {
  key: string;
  label: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface QuizBreakdown {
  byConcept: QuizBucket[];
  byDifficulty: QuizBucket[];
  byType: QuizBucket[];
  averageTimeMs: number;
  overEstimateCount: number;
}

export interface PerformanceAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missedConcepts: string[];
  difficultyInsight: string;
  timeManagement: string;
  recommendations: string[];
  suggestedTopics: string[];
  model: string;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  status: "in_progress" | "completed";
  title: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionTypes: QuizQuestionType[];
  focus: string;
  timeMode: QuizTimeMode;
  totalSeconds: number | null;
  perQuestionSeconds: number | null;
  startedAt: number;
  deadlineAt: number | null;
  currentIndex: number;
  activeSince: number | null;
  submittedAt: number | null;
  submitReason: QuizSubmitReason | null;
  /** Main-process clock when this view was built, to correct for renderer clock offset. */
  serverNow: number;
  questions: AttemptQuestion[];
  result: QuizResultSummary | null;
  breakdown: QuizBreakdown | null;
  analysis: PerformanceAnalysis | null;
}

export interface QuizStartResponse {
  attempt: QuizAttempt | null;
  activeAttemptId: string | null;
}

export interface QuizActiveResponse {
  attempt: QuizAttempt | null;
  expiredAttemptId: string | null;
}

export interface QuizSaveAnswerResponse {
  closed: boolean;
  locked: boolean;
  question: AttemptQuestion | null;
}

export interface QuizHistoryItem {
  id: string;
  quizId: string;
  title: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  score: number;
  total: number;
  accuracy: number;
  timeUsedMs: number;
  timeMode: QuizTimeMode;
  submitReason: QuizSubmitReason;
  completedAt: number;
}

export interface QuizConceptStat {
  label: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface QuizGroupStat {
  label: string;
  attempts: number;
  averageAccuracy: number | null;
}

export interface QuizStats {
  totalAttempts: number;
  averageAccuracy: number | null;
  bestAccuracy: number | null;
  questionsAnswered: number;
  totalTimeMs: number;
  byTopic: QuizGroupStat[];
  byDifficulty: QuizGroupStat[];
  recentAccuracy: number[];
  weakConcepts: QuizConceptStat[];
  strongConcepts: QuizConceptStat[];
}

export interface QuizAiConfig {
  provider: "ollama";
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize: string;
  family: string;
  modifiedAt: string;
}

export interface QuizAiStatus {
  connected: boolean;
  baseUrl: string;
  version: string | null;
  models: OllamaModel[];
  model: string;
  modelAvailable: boolean;
  code: string | null;
  message: string;
}
