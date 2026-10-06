import { getDb, schedulePersist } from "../database/connection.js";
import { createAiConfigRepository } from "../database/aiConfigRepository.js";
import { createQuizRepository } from "../database/quizRepository.js";
import {
  DEFAULT_OLLAMA_URL,
  OllamaError,
  chatJson,
  checkConnection as checkOllama,
  listModels,
  normalizeOllamaUrl,
} from "../ai/ollamaProvider.js";
import { createQuizEngine } from "./quizEngine.js";
import { QuizError, toUserError } from "./quizErrors.js";
import { generateQuizQuestions } from "./quizGenerator.js";
import { normalizeQuizConfig } from "./quizOptions.js";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from "./quizPrompts.js";
import { ANALYSIS_SCHEMA, extractJson, validateAnalysis } from "./quizSchema.js";

export const DEFAULT_AI_CONFIG = { provider: "ollama", baseUrl: DEFAULT_OLLAMA_URL, model: "", temperature: 0.4 };

/** Used to pick a sensible default when no model has been chosen yet. */
const PREFERRED_MODELS = [/^qwen/i, /^llama/i, /^gemma/i, /^mistral/i, /^phi/i];
const SPECIALIZED_MODEL = /embed|vl\b|vision|llava|bge|minilm|coder/i;
const ANALYSIS_TIMEOUT_MS = 180_000;
const RETRYABLE = new Set(["INVALID_RESPONSE", "AI_EMPTY", "AI_FAILED"]);

const repo = createQuizRepository({ getDb, persist: schedulePersist });
const aiConfig = createAiConfigRepository({ getDb, persist: schedulePersist, defaults: DEFAULT_AI_CONFIG });
const engine = createQuizEngine({ repo });

/** @type {{ requestId: string, controller: AbortController } | null} */
let generation = null;
const analysesInFlight = new Set();

/** Keep database and other internal errors out of the UI; user-facing errors pass through. */
function guard(fn, message = "Could not access the local quiz database. Try again.") {
  try {
    return fn();
  } catch (error) {
    if (error instanceof QuizError || error instanceof OllamaError) {
      throw error;
    }
    console.error("[quiz] database error", error);
    throw new QuizError("DATABASE_ERROR", message);
  }
}

// ---------------------------------------------------------------------------------------------
// AI configuration

export function getAiConfig() {
  return guard(() => aiConfig.get());
}

function normalizeAiConfig(input, base) {
  const patch = input && typeof input === "object" ? input : {};
  const merged = {
    baseUrl: "baseUrl" in patch ? patch.baseUrl : base.baseUrl,
    model: "model" in patch ? patch.model : base.model,
    temperature: "temperature" in patch ? patch.temperature : base.temperature,
  };
  const baseUrl = normalizeOllamaUrl(merged.baseUrl);
  const model = typeof merged.model === "string" ? merged.model.trim() : "";
  if (model.length > 200 || (model && !/^[\w.\-:/@]+$/.test(model))) {
    throw new QuizError("INVALID_CONFIG", "That model name is not valid.");
  }
  const temperature = Number(merged.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    throw new QuizError("INVALID_CONFIG", "Temperature must be between 0 and 1.");
  }
  return { provider: "ollama", baseUrl, model, temperature: Math.round(temperature * 100) / 100 };
}

export function saveAiConfig(patch) {
  const next = normalizeAiConfig(patch, getAiConfig());
  return guard(() => aiConfig.save(next), "Could not save the AI settings.");
}

export function getModels(baseUrl) {
  return listModels(normalizeOllamaUrl(typeof baseUrl === "string" ? baseUrl : getAiConfig().baseUrl));
}

/** Test a configuration, including unsaved values from the settings form. */
export function checkConnection(input) {
  return checkOllama(normalizeAiConfig(input, getAiConfig()));
}

export function pickDefaultModel(models) {
  const names = models.map((model) => model.name);
  for (const pattern of PREFERRED_MODELS) {
    const match = names.find((name) => pattern.test(name) && !SPECIALIZED_MODEL.test(name));
    if (match) {
      return match;
    }
  }
  return names.find((name) => !SPECIALIZED_MODEL.test(name)) ?? names[0] ?? "";
}

/** Verify Ollama and the model before any generation; picks a default model on first use. */
async function readyConfig() {
  let config = getAiConfig();
  const status = await checkOllama(config);
  if (!status.connected) {
    throw new QuizError(status.code ?? "OLLAMA_UNAVAILABLE", status.message);
  }
  if (status.models.length === 0) {
    throw new QuizError("NO_MODELS", status.message);
  }
  if (!config.model) {
    config = guard(() => aiConfig.save({ ...config, model: pickDefaultModel(status.models) }));
  } else if (!status.modelAvailable) {
    throw new QuizError("MODEL_UNAVAILABLE", `${status.message} Or choose another model in AI Settings.`);
  }
  return config;
}

function askModel(config, { system, prompt, schema, timeoutMs, signal }) {
  return chatJson({
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    schema,
    timeoutMs,
    signal,
  });
}

// ---------------------------------------------------------------------------------------------
// Quizzes

function summarizeQuiz(quizId) {
  const quiz = repo.getQuiz(quizId);
  if (!quiz) {
    throw new QuizError("NOT_FOUND", "This quiz no longer exists.");
  }
  const { questions, ...summary } = quiz;
  return { ...summary, questionCount: questions.length, attemptCount: 0, bestAccuracy: null, lastAttemptAt: null };
}

export async function generateQuiz(rawConfig, { requestId, emit } = {}) {
  if (generation) {
    return { quiz: null, error: { code: "BUSY", message: "A quiz is already being generated." } };
  }
  const controller = new AbortController();
  generation = { requestId, controller };
  const send = (payload) => {
    try {
      emit?.({ requestId, ...payload });
    } catch (error) {
      console.error("[quiz] progress emit failed", error);
    }
  };

  try {
    const config = normalizeQuizConfig(rawConfig);
    send({ phase: "checking", generated: 0, total: config.questionCount });
    const ai = await readyConfig();
    const similarTo = typeof rawConfig?.similarToQuizId === "string" ? rawConfig.similarToQuizId : null;
    const avoid = similarTo ? guard(() => repo.getQuestionTexts([similarTo])) : [];

    const generated = await generateQuizQuestions(config, {
      signal: controller.signal,
      avoid,
      onProgress: (progress) => send({ phase: "generating", ...progress }),
      ai: (request) => askModel(ai, request).then((response) => response.content),
    });

    send({ phase: "saving", generated: config.questionCount, total: config.questionCount });
    const quizId = guard(
      () => repo.insertQuiz({ ...config, title: generated.title, model: ai.model }, generated.questions),
      "Could not save the quiz to the local database."
    );
    console.log(
      `[quiz] generated ${generated.questions.length} questions with ${ai.model} ` +
        `(${generated.stats.requests} requests, ${generated.stats.rejected} rejected)`
    );
    return { quiz: guard(() => summarizeQuiz(quizId)), error: null };
  } catch (error) {
    if (controller.signal.aborted) {
      return { quiz: null, error: { code: "CANCELLED", message: "Quiz generation was cancelled." } };
    }
    if (!(error instanceof QuizError) && !(error instanceof OllamaError)) {
      console.error("[quiz] generation failed", error);
    }
    return {
      quiz: null,
      error: toUserError(error, { code: "GENERATION_FAILED", message: "The quiz could not be generated. Try again." }),
    };
  } finally {
    if (generation?.controller === controller) {
      generation = null;
    }
  }
}

export function cancelGeneration(requestId) {
  if (!generation || (requestId && generation.requestId !== requestId)) {
    return { cancelled: false };
  }
  generation.controller.abort();
  return { cancelled: true };
}

export function listQuizzes() {
  return guard(() => repo.listQuizzes());
}

export function deleteQuiz(quizId) {
  return guard(() => {
    if (typeof quizId !== "string" || !repo.getQuiz(quizId)) {
      throw new QuizError("NOT_FOUND", "This quiz no longer exists.");
    }
    repo.deleteQuiz(quizId);
    return { id: quizId };
  });
}

// ---------------------------------------------------------------------------------------------
// Attempts

function answerInput(input) {
  const result = {};
  if (input && typeof input === "object") {
    if ("selected" in input) {
      result.selected = input.selected;
    }
    if ("marked" in input) {
      result.marked = input.marked;
    }
  }
  return result;
}

export const startQuiz = (quizId, options) =>
  guard(() => engine.start(quizId, { replaceActive: options?.replaceActive === true }));
export const getActiveAttempt = () => guard(() => engine.getActive());
export const getAttempt = (attemptId) => guard(() => engine.get(attemptId));
export const saveAnswer = (attemptId, questionId, input) =>
  guard(() => engine.saveAnswer(attemptId, questionId, answerInput(input)), "Your answer could not be saved. Try again.");
export const navigate = (attemptId, toIndex) => guard(() => engine.navigate(attemptId, toIndex));
export const advance = (attemptId, fromIndex, reason) => guard(() => engine.advance(attemptId, fromIndex, reason));
export const submitQuiz = (attemptId, reason) =>
  guard(() => engine.submit(attemptId, reason), "The quiz could not be submitted. Try again.");
export const pauseAttempt = (attemptId) => guard(() => engine.pause(attemptId));
export const resumeAttempt = (attemptId) => guard(() => engine.resume(attemptId));
export const discardAttempt = (attemptId) => guard(() => engine.discard(attemptId));
export const deleteAttempt = (attemptId) => guard(() => engine.deleteAttempt(attemptId));
export const getHistory = () => guard(() => engine.history());
export const getStats = () => guard(() => engine.stats());

// ---------------------------------------------------------------------------------------------
// AI performance analysis

function analysisData(attempt) {
  return {
    topic: attempt.topic,
    difficulty: attempt.difficulty,
    score: `${attempt.result.correct}/${attempt.result.total}`,
    accuracyPercent: attempt.result.accuracy,
    wrong: attempt.result.wrong,
    skipped: attempt.result.skipped,
    timeMode: attempt.timeMode,
    timeUsedSeconds: Math.round((attempt.result.timeUsedMs ?? 0) / 1000),
    timeLimitSeconds: attempt.result.totalTimeMs ? Math.round(attempt.result.totalTimeMs / 1000) : null,
    endedBecause: attempt.submitReason === "timeout" ? "time ran out" : "learner submitted",
    questions: attempt.questions.map((question, index) => ({
      n: index + 1,
      concept: question.concept,
      type: question.type,
      result: question.outcome,
      secondsSpent: Math.round(question.timeSpentMs / 1000),
      estimatedSeconds: question.estimatedTime,
      question: question.question.slice(0, 140),
    })),
  };
}

export async function analyzePerformance(attemptId, { force = false } = {}) {
  const attempt = getAttempt(attemptId);
  if (attempt.status !== "completed") {
    throw new QuizError("INVALID_STATE", "Finish the quiz before analyzing it.");
  }
  if (attempt.analysis && !force) {
    return attempt.analysis;
  }
  if (analysesInFlight.has(attempt.id)) {
    throw new QuizError("BUSY", "This analysis is already running.");
  }
  analysesInFlight.add(attempt.id);
  try {
    const ai = await readyConfig();
    const request = {
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: buildAnalysisPrompt(analysisData(attempt)),
      schema: ANALYSIS_SCHEMA,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    };
    let analysis = null;
    for (let attemptNumber = 1; attemptNumber <= 2 && !analysis; attemptNumber += 1) {
      try {
        const response = await askModel(ai, request);
        analysis = validateAnalysis(extractJson(response.content));
      } catch (error) {
        if (!RETRYABLE.has(error?.code)) {
          throw error;
        }
        console.warn(`[quiz] analysis attempt ${attemptNumber} failed: ${error.code}`);
      }
    }
    if (!analysis) {
      throw new QuizError("INVALID_RESPONSE", "The model's analysis could not be read. Try again.");
    }
    return guard(() => {
      repo.savePerformance(attempt.id, analysis, ai.model);
      return repo.getPerformance(attempt.id);
    }, "Could not save the analysis.");
  } finally {
    analysesInFlight.delete(attempt.id);
  }
}

/** Runs before the database closes, so stop the active question's clock here. */
export function shutdown() {
  generation?.controller.abort();
  try {
    const active = repo.getActiveAttempt();
    if (active) {
      engine.pause(active.id);
    }
  } catch (error) {
    console.error("[quiz] could not pause the active attempt on exit", error);
  }
}
