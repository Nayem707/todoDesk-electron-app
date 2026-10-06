import { QuizError } from "./quizErrors.js";
import { QUESTION_SYSTEM_PROMPT, buildQuestionPrompt } from "./quizPrompts.js";
import { extractJson, questionBatchSchema, shuffle, validateQuestionBatch } from "./quizSchema.js";

/** Small local models are far more reliable writing a few questions per request. */
export const BATCH_SIZE = 5;
export const ATTEMPTS_PER_BATCH = 3;
const AVOID_LIMIT = 40;
const BATCH_TIMEOUT_MS = 240_000;
/** Failures worth another request; connection, model and cancellation errors are not. */
const RETRYABLE = new Set(["INVALID_RESPONSE", "AI_EMPTY", "AI_FAILED"]);

const DIFFICULTY_TITLE = { easy: "Basics", medium: "Fundamentals", hard: "Deep Dive", expert: "Expert Challenge" };

/** Split the question count evenly across the selected types, then into batches. */
export function planBatches(questionCount, questionTypes) {
  const base = Math.floor(questionCount / questionTypes.length);
  let extra = questionCount % questionTypes.length;
  const batches = [];
  for (const type of questionTypes) {
    let remaining = base + (extra > 0 ? 1 : 0);
    extra -= 1;
    while (remaining > 0) {
      const size = Math.min(BATCH_SIZE, remaining);
      batches.push({ type, size });
      remaining -= size;
    }
  }
  return batches;
}

/**
 * Generate validated questions for a normalized quiz config.
 *
 * `ai({ system, prompt, schema, timeoutMs, signal })` must resolve to the model's raw text.
 * `avoid` holds question texts from earlier quizzes that should not be repeated.
 */
export async function generateQuizQuestions(config, { ai, signal, onProgress, avoid = [] }) {
  const batches = planBatches(config.questionCount, config.questionTypes);
  const accepted = [];
  const seenTexts = avoid.slice(-AVOID_LIMIT);
  let title = "";
  let lastFailure = null;
  let requests = 0;
  let rejectedCount = 0;

  const report = (batchIndex, attempt) =>
    onProgress?.({
      generated: accepted.length,
      total: config.questionCount,
      batch: batchIndex + 1,
      batches: batches.length,
      attempt,
    });

  for (const [batchIndex, batch] of batches.entries()) {
    let collected = 0;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_BATCH && collected < batch.size; attempt += 1) {
      if (signal?.aborted) {
        throw new QuizError("CANCELLED", "Quiz generation was cancelled.");
      }
      report(batchIndex, attempt);
      const needed = batch.size - collected;
      const withTitle = !title && batchIndex === 0;
      requests += 1;

      let content;
      try {
        content = await ai({
          system: QUESTION_SYSTEM_PROMPT,
          prompt: buildQuestionPrompt({
            topic: config.topic,
            difficulty: config.difficulty,
            focus: config.focus,
            type: batch.type,
            count: needed,
            avoid: seenTexts.slice(-AVOID_LIMIT),
            withTitle,
          }),
          schema: questionBatchSchema(batch.type, { withTitle }),
          timeoutMs: BATCH_TIMEOUT_MS,
          signal,
        });
      } catch (error) {
        if (!RETRYABLE.has(error?.code)) {
          throw error;
        }
        lastFailure = error;
        console.warn(`[quiz] batch ${batchIndex + 1} attempt ${attempt} failed: ${error.code}`);
        continue;
      }

      let parsed;
      try {
        parsed = extractJson(content);
      } catch (error) {
        lastFailure = error;
        console.warn(`[quiz] batch ${batchIndex + 1} attempt ${attempt}: unparseable response`, content.slice(0, 300));
        continue;
      }

      const result = validateQuestionBatch(parsed, { type: batch.type, difficulty: config.difficulty, topic: config.topic }, seenTexts);
      if (result.rejected.length) {
        rejectedCount += result.rejected.length;
        console.warn(`[quiz] batch ${batchIndex + 1} attempt ${attempt} rejected:`, result.rejected.join(", "));
      }
      if (withTitle && result.title) {
        title = result.title;
      }
      const usable = result.questions.slice(0, needed);
      if (usable.length === 0) {
        lastFailure = new QuizError("INVALID_RESPONSE", "No usable questions in the response.");
      }
      for (const question of usable) {
        accepted.push(question);
        seenTexts.push(question.question);
        collected += 1;
      }
    }

    if (collected < batch.size) {
      const parseProblem = lastFailure?.code === "INVALID_RESPONSE" && accepted.length === 0;
      throw new QuizError(
        parseProblem ? "INVALID_RESPONSE" : "GENERATION_FAILED",
        parseProblem
          ? "The model's responses were not valid quiz data after several attempts. Try again or choose a different model in AI Settings."
          : `The model produced ${accepted.length} usable question${accepted.length === 1 ? "" : "s"} out of ${config.questionCount}. Try again, choose fewer questions, or pick a different model.`
      );
    }
  }

  report(batches.length - 1, 0);
  return {
    title: title || `${config.topic} ${DIFFICULTY_TITLE[config.difficulty]}`,
    questions: shuffle(accepted),
    stats: { requests, rejected: rejectedCount },
  };
}
