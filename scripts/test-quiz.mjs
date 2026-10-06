import http from "http";
import { createRequire } from "module";
import { runMigrations } from "../electron/database/migrations.js";
import { createQuizRepository } from "../electron/database/quizRepository.js";
import { createAiConfigRepository } from "../electron/database/aiConfigRepository.js";
import { chatJson, checkConnection, listModels, matchesModel, normalizeOllamaUrl } from "../electron/ai/ollamaProvider.js";
import { normalizeQuizConfig } from "../electron/quiz/quizOptions.js";
import { extractJson, isDuplicateQuestion, questionBatchSchema, validateAnalysis, validateQuestion, validateQuestionBatch } from "../electron/quiz/quizSchema.js";
import { generateQuizQuestions, planBatches } from "../electron/quiz/quizGenerator.js";
import { buildBreakdown, isAnswerCorrect, scoreItems } from "../electron/quiz/quizScoring.js";
import { createQuizEngine, GRACE_MS, IDLE_CAP_MS } from "../electron/quiz/quizEngine.js";
import { buildQuestionPrompt } from "../electron/quiz/quizPrompts.js";

const ONLINE = process.argv.includes("--online");
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectCode(fn, code) {
  try {
    await fn();
    return { ok: false, detail: "did not throw" };
  } catch (error) {
    return { ok: error.code === code, detail: `${error.code}: ${error.message}` };
  }
}

const ctx = (type, difficulty = "medium") => ({ type, difficulty, topic: "JavaScript" });
const single = (overrides = {}) => ({
  question: "Which array method returns a new array with transformed elements?",
  options: ["push()", "map()", "splice()", "pop()"],
  correctAnswer: "map()",
  explanation: "map() calls a function on every element and returns a new array.",
  concept: "Array methods",
  estimatedTime: 25,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
console.log("\nQuiz config validation");
const baseConfig = {
  topic: "  JavaScript  ",
  questionCount: 10,
  difficulty: "medium",
  questionTypes: ["single_choice", "true_false"],
  timeMode: "total",
  totalMinutes: 15,
  perQuestionSeconds: 30,
};
const normalized = normalizeQuizConfig(baseConfig);
check("topic trimmed", normalized.topic === "JavaScript");
check("total minutes become seconds", normalized.totalSeconds === 900 && normalized.perQuestionSeconds === null);
check("per-question seconds kept", normalizeQuizConfig({ ...baseConfig, timeMode: "per_question" }).perQuestionSeconds === 30);
check("no-limit has no times", normalizeQuizConfig({ ...baseConfig, timeMode: "none" }).totalSeconds === null);
for (const [label, patch, message] of [
  ["empty topic", { topic: "   " }, /topic/i],
  ["long topic", { topic: "x".repeat(81) }, /under 80/],
  ["unsupported count", { questionCount: 7 }, /number of questions/],
  ["bad difficulty", { difficulty: "insane" }, /difficulty/],
  ["no types", { questionTypes: [] }, /question type/],
  ["unknown type only", { questionTypes: ["essay"] }, /question type/],
  ["bad time mode", { timeMode: "forever" }, /time mode/],
  ["bad total time", { totalMinutes: 7 }, /total quiz time/],
  ["bad per-question time", { timeMode: "per_question", perQuestionSeconds: 10 }, /per question/],
]) {
  try {
    normalizeQuizConfig({ ...baseConfig, ...patch });
    check(`rejects ${label}`, false, "accepted");
  } catch (error) {
    check(`rejects ${label}`, error.code === "INVALID_CONFIG" && message.test(error.message), error.message);
  }
}

// ---------------------------------------------------------------------------------------------
console.log("\nJSON extraction");
check("plain JSON", extractJson('{"a":1}').a === 1);
check("fenced JSON", extractJson('Here you go:\n```json\n{"a":2}\n```\nEnjoy').a === 2);
check("JSON inside prose", extractJson('Sure! {"questions":[{"q":"a } b"}]} Hope it helps.').questions[0].q === "a } b");
check("array JSON", Array.isArray(extractJson("[1,2]")));
check("garbage rejected", (await expectCode(() => extractJson("I cannot do that."), "INVALID_RESPONSE")).ok);
check("truncated JSON rejected", (await expectCode(() => extractJson('{"questions":[{"question":"x"'), "INVALID_RESPONSE")).ok);
check("empty rejected", (await expectCode(() => extractJson("   "), "INVALID_RESPONSE")).ok);

// ---------------------------------------------------------------------------------------------
console.log("\nQuestion validation");
const good = validateQuestion(single(), ctx("single_choice"));
check("valid single choice accepted", good.ok, good.reason);
check("answer key kept after shuffle", good.ok && good.question.correctAnswers[0] === "map()" && good.question.options.includes("map()"));
check("difficulty comes from settings", validateQuestion(single({ difficulty: "easy" }), ctx("single_choice", "hard")).question.difficulty === "hard");

let firstPositions = new Set();
for (let index = 0; index < 30; index += 1) {
  firstPositions.add(validateQuestion(single(), ctx("single_choice")).question.options.indexOf("map()"));
}
check("options are shuffled", firstPositions.size > 1);

check("letter answer mapped", validateQuestion(single({ correctAnswer: "B" }), ctx("single_choice")).question?.correctAnswers[0] === "map()");
const prefixed = validateQuestion(
  single({ options: ["A) push()", "B) map()", "C) splice()", "D) pop()"], correctAnswer: "B) map()" }),
  ctx("single_choice")
);
check("letter prefixes stripped", prefixed.ok && prefixed.question.options.every((option) => !/^[A-D]\)/.test(option)));
check("case-insensitive answer", validateQuestion(single({ correctAnswer: "MAP()" }), ctx("single_choice")).ok);
check("answer not in options rejected", validateQuestion(single({ correctAnswer: "filter()" }), ctx("single_choice")).reason === "answer not among options");
check("duplicate options rejected", validateQuestion(single({ options: ["map()", "map()", "pop()", "push()"] }), ctx("single_choice")).reason === "duplicate options");
check("vague option rejected", validateQuestion(single({ options: ["push()", "map()", "All of the above", "pop()"] }), ctx("single_choice")).reason === "vague option");
check("too few options rejected", validateQuestion(single({ options: ["map()", "pop()"] }), ctx("single_choice")).reason === "wrong number of options");
check("missing explanation rejected", validateQuestion(single({ explanation: "" }), ctx("single_choice")).reason === "explanation missing");
check("short question rejected", validateQuestion(single({ question: "Why?" }), ctx("single_choice")).reason === "question missing");
check("non-object rejected", !validateQuestion("question", ctx("single_choice")).ok);
check(
  "answer revealed in question rejected",
  validateQuestion(
    single({
      question: "The Array.prototype.forEach method executes a function once per element. What does it do?",
      options: ["executes a function once per element", "returns a new array", "sorts the array", "removes elements"],
      correctAnswer: "executes a function once per element",
    }),
    ctx("single_choice")
  ).reason === "answer revealed in question"
);
check("tiny estimated time replaced", validateQuestion(single({ estimatedTime: 2 }), ctx("single_choice")).question.estimatedTime === 30);
check("huge estimated time clamped", validateQuestion(single({ estimatedTime: 9999 }), ctx("single_choice")).question.estimatedTime === 300);
check("concept falls back to topic", validateQuestion(single({ concept: "" }), ctx("single_choice")).question.concept === "JavaScript");
check("control characters removed", !/\u0007/.test(validateQuestion(single({ explanation: "Bell\u0007 char" }), ctx("single_choice")).question.explanation));

const tf = validateQuestion({ question: "JavaScript arrays are fixed-length.", options: ["Yes", "No"], correctAnswer: "false", explanation: "Arrays grow dynamically.", concept: "Arrays", estimatedTime: 15 }, ctx("true_false"));
check("true/false normalized", tf.ok && tf.question.options.join() === "True,False" && tf.question.correctAnswers[0] === "False");
check("true/false needs an answer", validateQuestion({ question: "Arrays are objects in JS.", correctAnswer: "maybe", explanation: "x", estimatedTime: 10 }, ctx("true_false")).reason === "true/false answer missing");

const multi = validateQuestion(
  {
    question: "Which of these are primitive types in JavaScript? (Select all that apply.)",
    options: ["string", "object", "number", "array", "boolean"],
    correctAnswers: ["string", "number", "boolean"],
    explanation: "Objects and arrays are reference types.",
    concept: "Types",
    estimatedTime: 40,
  },
  ctx("multiple_choice")
);
check("multiple choice accepted", multi.ok && multi.question.correctAnswers.length === 3);
check(
  "multiple choice with every option correct rejected",
  validateQuestion({ question: "Pick the primitives in this list please.", options: ["string", "number", "boolean", "symbol"], correctAnswers: ["string", "number", "boolean", "symbol"], explanation: "x", estimatedTime: 20 }, ctx("multiple_choice")).reason === "every option is correct"
);
check("single choice with two answers rejected", validateQuestion(single({ correctAnswer: undefined }), ctx("single_choice")).ok === false);

const coding = validateQuestion(
  { question: "What does this code log?", code: "```js\nconst a = [1, 2, 3];\nconsole.log(a.length);\n```", options: ["3", "2", "undefined", "4"], correctAnswer: "3", explanation: "The array has three items.", concept: "Arrays", estimatedTime: 30 },
  ctx("coding")
);
check("coding question keeps code, strips fence", coding.ok && coding.question.code === "const a = [1, 2, 3];\nconsole.log(a.length);");
check("coding question without code rejected", validateQuestion(single(), ctx("coding")).reason === "code missing");
check("numeric options accepted", coding.ok && coding.question.options.includes("3"));

const batch = validateQuestionBatch(
  { title: "  JS Arrays  ", questions: [single(), single({ question: "Which array method returns a new array with the transformed elements?" }), single({ correctAnswer: "nope" })] },
  ctx("single_choice")
);
check("batch keeps valid, drops duplicate and invalid", batch.questions.length === 1 && batch.rejected.includes("duplicate question") && batch.rejected.includes("answer not among options"), JSON.stringify(batch.rejected));
check("batch title cleaned", batch.title === "JS Arrays");
check("batch dedupes against existing", validateQuestionBatch({ questions: [single()] }, ctx("single_choice"), [single().question]).questions.length === 0);
check("missing questions array reported", validateQuestionBatch({ foo: 1 }, ctx("single_choice")).rejected[0] === "response has no questions array");
check("near-duplicate detection", isDuplicateQuestion("What does Array.map return in JavaScript?", ["What does Array.map return in JavaScript code?"]));
check("different questions not duplicates", !isDuplicateQuestion("What does Array.map return?", ["How does the event loop schedule microtasks?"]));

check("schema for multiple choice uses correctAnswers", questionBatchSchema("multiple_choice").properties.questions.items.required.includes("correctAnswers"));
check("schema for coding requires code", questionBatchSchema("coding").properties.questions.items.required.includes("code"));
check("schema with title", questionBatchSchema("single_choice", { withTitle: true }).required.includes("title"));
const prompt = buildQuestionPrompt({ topic: 'Java"Script', difficulty: "hard", focus: "closures", type: "single_choice", count: 5, avoid: ["Old question?"] });
check("prompt includes rules and avoid list", /Never reveal/.test(prompt) && /Old question\?/.test(prompt) && /closures/.test(prompt) && !/Java"Script/.test(prompt));

const analysis = validateAnalysis({ summary: "Good job.", strengths: ["Arrays", "arrays", ""], weaknesses: "nope", missedConcepts: [], difficultyInsight: "ok", timeManagement: "fine", recommendations: ["Practice"], suggestedTopics: ["Closures"] });
check("analysis cleaned", analysis.strengths.length === 1 && analysis.weaknesses.length === 0);
check("analysis without summary rejected", (await expectCode(() => validateAnalysis({ strengths: [] }), "INVALID_RESPONSE")).ok);

// ---------------------------------------------------------------------------------------------
console.log("\nGenerator");
const plan = planBatches(12, ["single_choice", "true_false"]);
check("batches split by type", plan.map((b) => `${b.type}:${b.size}`).join(",") === "single_choice:5,single_choice:1,true_false:5,true_false:1", JSON.stringify(plan));
check("uneven split", planBatches(5, ["single_choice", "true_false"]).map((b) => b.size).join(",") === "3,2");
check("50 questions = 10 batches", planBatches(50, ["single_choice"]).length === 10);

let counter = 0;
const makeQuestion = () => {
  counter += 1;
  return single({ question: `Question number ${counter} about distinct concept ${counter * 7919}?`, options: [`opt${counter}a`, `opt${counter}b`, `opt${counter}c`, `opt${counter}d`], correctAnswer: `opt${counter}b` });
};
const genConfig = normalizeQuizConfig({ ...baseConfig, questionCount: 10, questionTypes: ["single_choice"], timeMode: "none" });
const progress = [];
let calls = 0;
const flaky = async ({ prompt: text }) => {
  calls += 1;
  const count = Number(text.match(/Write (\d+)/)[1]);
  if (calls === 1) {
    return "Sorry, here are your questions: not json";
  }
  if (calls === 2) {
    return JSON.stringify({ title: "Flaky Title", questions: [makeQuestion(), { question: "broken" }] });
  }
  return JSON.stringify({ questions: Array.from({ length: count }, makeQuestion) });
};
const generated = await generateQuizQuestions(genConfig, { ai: flaky, onProgress: (p) => progress.push(p) });
check("generator retries and fills the quiz", generated.questions.length === 10, `${generated.questions.length}`);
check("generator keeps AI title", generated.title === "Flaky Title");
check("generator reports progress", progress.length > 0 && progress.at(-1).generated === 10);
check("generator counts rejections", generated.stats.rejected >= 1);

const garbage = await expectCode(() => generateQuizQuestions(genConfig, { ai: async () => "no json here" }), "INVALID_RESPONSE");
check("persistent garbage gives INVALID_RESPONSE", garbage.ok, garbage.detail);
check("persistent garbage message is friendly", /not valid quiz data/.test(garbage.detail));

let partialCalls = 0;
const partial = await expectCode(
  () => generateQuizQuestions(genConfig, { ai: async () => (partialCalls++ < 1 ? JSON.stringify({ questions: [makeQuestion(), makeQuestion(), makeQuestion(), makeQuestion(), makeQuestion()] }) : JSON.stringify({ questions: [] })) }),
  "GENERATION_FAILED"
);
check("partial failure gives GENERATION_FAILED with counts", partial.ok && /5 usable questions out of 10/.test(partial.detail), partial.detail);

const offline = Object.assign(new Error("Ollama is not running"), { code: "OLLAMA_UNAVAILABLE", name: "OllamaError" });
let offlineCalls = 0;
const offlineResult = await expectCode(() => generateQuizQuestions(genConfig, { ai: async () => { offlineCalls += 1; throw offline; } }), "OLLAMA_UNAVAILABLE");
check("connection errors are not retried", offlineResult.ok && offlineCalls === 1);

const controller = new AbortController();
controller.abort();
check("cancelled before start", (await expectCode(() => generateQuizQuestions(genConfig, { ai: flaky, signal: controller.signal }), "CANCELLED")).ok);

const fromTitle = await generateQuizQuestions(normalizeQuizConfig({ ...baseConfig, questionCount: 5, questionTypes: ["single_choice"], difficulty: "expert" }), {
  ai: async () => JSON.stringify({ questions: Array.from({ length: 5 }, makeQuestion) }),
});
check("fallback title", fromTitle.title === "JavaScript Expert Challenge");

// ---------------------------------------------------------------------------------------------
console.log("\nScoring");
check("exact single match", isAnswerCorrect(["a"], ["a"]));
check("multi needs full set", !isAnswerCorrect(["a", "b"], ["a"]) && isAnswerCorrect(["a", "b"], ["b", "a"]));
check("extra selection is wrong", !isAnswerCorrect(["a"], ["a", "b"]));
const totals = scoreItems([
  { correctAnswers: ["a"], selected: ["a"] },
  { correctAnswers: ["a"], selected: ["b"] },
  { correctAnswers: ["a"], selected: [] },
  { correctAnswers: ["x", "y"], selected: ["x", "y"] },
]);
check("totals", totals.correct === 2 && totals.wrong === 1 && totals.skipped === 1 && totals.accuracy === 50 && totals.score === 2, JSON.stringify(totals));
const breakdown = buildBreakdown([
  { outcome: "correct", concept: "Closures", difficulty: "hard", type: "single_choice", timeSpentMs: 10_000, estimatedTime: 30 },
  { outcome: "wrong", concept: "closures", difficulty: "hard", type: "single_choice", timeSpentMs: 60_000, estimatedTime: 30 },
]);
check("breakdown groups concepts case-insensitively", breakdown.byConcept.length === 1 && breakdown.byConcept[0].accuracy === 50);
check("breakdown flags slow answers", breakdown.overEstimateCount === 1 && breakdown.averageTimeMs === 35_000);

// ---------------------------------------------------------------------------------------------
console.log("\nAttempt engine (in-memory SQLite, fake clock)");
function setup() {
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  let persisted = 0;
  const repo = createQuizRepository({ getDb: () => db, persist: () => (persisted += 1) });
  const clock = { t: 1_000_000 };
  const engine = createQuizEngine({ repo, now: () => clock.t });
  return { db, repo, clock, engine, persisted: () => persisted };
}

function seedQuiz(repo, { timeMode = "none", totalSeconds = null, perQuestionSeconds = null, count = 4 } = {}) {
  const questions = Array.from({ length: count }, (_, index) => ({
    type: index === count - 1 ? "multiple_choice" : "single_choice",
    question: `Seed question ${index + 1}?`,
    code: null,
    options: ["A", "B", "C", "D"],
    correctAnswers: index === count - 1 ? ["A", "C"] : ["B"],
    explanation: `Because ${index + 1}.`,
    concept: index % 2 ? "Closures" : "Arrays",
    difficulty: "medium",
    estimatedTime: 30,
  }));
  return repo.insertQuiz(
    { title: "Seed Quiz", topic: "JavaScript", difficulty: "medium", questionTypes: ["single_choice", "multiple_choice"], timeMode, totalSeconds, perQuestionSeconds, focus: "", model: "test" },
    questions
  );
}

{
  const { repo, clock, engine, persisted } = setup();
  const quizId = seedQuiz(repo);
  const { attempt } = engine.start(quizId);
  check("attempt started", attempt.status === "in_progress" && attempt.questions.length === 4);
  check("answer keys hidden during quiz", attempt.questions.every((q) => q.correctAnswers === undefined && q.explanation === undefined && q.concept === undefined));
  check("writes are persisted", persisted() > 0);

  const [q1, q2, q3, q4] = attempt.questions;
  check("save answer", engine.saveAnswer(attempt.id, q1.id, { selected: ["B"] }).question.selected[0] === "B");
  check("invalid option rejected", (await expectCode(() => engine.saveAnswer(attempt.id, q1.id, { selected: ["Z"] }), "INVALID_ANSWER")).ok);
  check("two answers on single choice rejected", (await expectCode(() => engine.saveAnswer(attempt.id, q1.id, { selected: ["A", "B"] }), "INVALID_ANSWER")).ok);
  check("unknown question rejected", (await expectCode(() => engine.saveAnswer(attempt.id, "nope", { selected: ["A"] }), "NOT_FOUND")).ok);
  check("mark for review", engine.saveAnswer(attempt.id, q2.id, { marked: true }).question.marked === true);

  clock.t += 20_000;
  let view = engine.navigate(attempt.id, 1);
  check("navigate updates current question", view.currentIndex === 1);
  check("time spent recorded on leave", view.questions[0].timeSpentMs === 20_000, String(view.questions[0].timeSpentMs));
  engine.saveAnswer(attempt.id, q2.id, { selected: ["A"] });
  clock.t += 5_000;
  engine.navigate(attempt.id, 3);
  engine.saveAnswer(attempt.id, q4.id, { selected: ["C", "A"] });
  check("out-of-range navigation rejected", (await expectCode(() => engine.navigate(attempt.id, 9), "INVALID_NAVIGATION")).ok);

  const paused = engine.pause(attempt.id);
  clock.t += 600_000;
  engine.resume(attempt.id);
  clock.t += 4_000;
  check("pause excludes time away from the quiz", paused.paused && engine.get(attempt.id).questions[3].timeSpentMs === 0);

  const blockedStart = engine.start(quizId);
  check("second start reports the active attempt", blockedStart.attempt === null && blockedStart.activeAttemptId === attempt.id);

  const done = engine.submit(attempt.id, "manual");
  check("manual submit scores correctly", done.result.correct === 2 && done.result.wrong === 1 && done.result.skipped === 1 && done.result.accuracy === 50, JSON.stringify(done.result));
  check("submit reason recorded", done.submitReason === "manual");
  check("answers revealed after submit", done.questions[0].correctAnswers[0] === "B" && done.questions[0].outcome === "correct" && done.questions[2].outcome === "skipped");
  check("no-limit time used = active time", done.result.timeUsedMs === 29_000 && done.result.timeRemainingMs === null, JSON.stringify(done.result));
  check("breakdown included", done.breakdown.byConcept.length === 2);
  check("double submit is idempotent", engine.submit(attempt.id, "manual").submittedAt === done.submittedAt);
  check("save after submit reports closed", engine.saveAnswer(attempt.id, q3.id, { selected: ["B"] }).closed === true);
  check("discarding a completed attempt refused", (await expectCode(() => engine.discard(attempt.id), "INVALID_STATE")).ok);

  const history = engine.history();
  check("history lists the attempt", history.length === 1 && history[0].accuracy === 50 && history[0].title === "Seed Quiz");
  const stats = engine.stats();
  check("stats aggregate", stats.totalAttempts === 1 && stats.averageAccuracy === 50 && stats.byTopic[0].label === "JavaScript", JSON.stringify(stats));

  const retry = engine.start(quizId);
  check("retry creates a new attempt", retry.attempt && retry.attempt.id !== attempt.id && retry.attempt.questions.every((q) => q.selected.length === 0));
  const replaced = engine.start(quizId, { replaceActive: true });
  check("replaceActive discards the unfinished attempt", replaced.attempt && (await expectCode(() => engine.get(retry.attempt.id), "NOT_FOUND")).ok);
  engine.discard(replaced.attempt.id);
  check("discard removes attempt", engine.getActive().attempt === null);
}

{
  const { db, repo, clock, engine } = setup();
  const quizId = seedQuiz(repo, { timeMode: "total", totalSeconds: 60 });
  const { attempt } = engine.start(quizId);
  check("total mode has an absolute deadline", attempt.deadlineAt === attempt.startedAt + 60_000);
  engine.saveAnswer(attempt.id, attempt.questions[0].id, { selected: ["B"] });

  clock.t = attempt.deadlineAt + GRACE_MS - 1;
  check("answer inside grace window accepted", engine.saveAnswer(attempt.id, attempt.questions[1].id, { selected: ["B"] }).closed === false);

  // Simulate a restart: persist, reopen the file, and return after the deadline.
  const reopenedDb = new SQL.Database(db.export());
  reopenedDb.run("PRAGMA foreign_keys = ON;");
  const reopenedRepo = createQuizRepository({ getDb: () => reopenedDb, persist: () => {} });
  const reopened = createQuizEngine({ repo: reopenedRepo, now: () => clock.t });
  check("restart within time resumes same deadline", reopened.getActive().attempt?.deadlineAt === attempt.deadlineAt);

  clock.t = attempt.deadlineAt + 5 * 60_000;
  const active = reopened.getActive();
  check("deadline passed while closed: auto-submitted", active.attempt === null && active.expiredAttemptId === attempt.id);
  const result = reopened.get(attempt.id);
  check("timeout reason and full time used", result.submitReason === "timeout" && result.result.timeUsedMs === 60_000 && result.result.timeRemainingMs === 0, JSON.stringify(result.result));
  check("answers before deadline counted", result.result.correct === 2);
  check("late answer reports closed", reopened.saveAnswer(attempt.id, attempt.questions[2].id, { selected: ["B"] }).closed === true);
}

{
  const { repo, clock, engine } = setup();
  const quizId = seedQuiz(repo, { timeMode: "total", totalSeconds: 300 });
  const { attempt } = engine.start(quizId);
  clock.t += 100_000;
  const early = engine.submit(attempt.id, "timeout");
  check("early 'timeout' claim recorded as manual", early.submitReason === "manual" && early.result.timeUsedMs === 100_000 && early.result.timeRemainingMs === 200_000);
}

{
  const { repo, clock, engine } = setup();
  const quizId = seedQuiz(repo, { timeMode: "per_question", perQuestionSeconds: 30 });
  const { attempt } = engine.start(quizId);
  const [q1, q2, q3, q4] = attempt.questions;
  check("first question window open", attempt.questions[0].deadlineAt === attempt.startedAt + 30_000);
  check("free navigation refused", (await expectCode(() => engine.navigate(attempt.id, 2), "INVALID_NAVIGATION")).ok);
  check("answering a future question refused", engine.saveAnswer(attempt.id, q3.id, { selected: ["B"] }).locked === true);
  engine.saveAnswer(attempt.id, q1.id, { selected: ["B"] });

  clock.t += 30_000;
  let view = engine.advance(attempt.id, 0, "timeout");
  check("timeout advances to next question", view.currentIndex === 1 && view.questions[0].locked);
  check("question time capped at limit", view.questions[0].timeSpentMs === 30_000);
  check("duplicate advance is ignored", engine.advance(attempt.id, 0, "timeout").currentIndex === 1);
  check("locked question cannot change", engine.saveAnswer(attempt.id, q1.id, { selected: ["A"] }).locked === true);

  clock.t += 4_000;
  view = engine.advance(attempt.id, 1, "manual");
  check("skip moves on with time used so far", view.currentIndex === 2 && view.questions[1].timeSpentMs === 4_000);

  // Renderer stalls for 3 minutes; the next read applies the expired window.
  clock.t += 180_000;
  view = engine.get(attempt.id);
  check("stalled window closed at its deadline", view.currentIndex === 3 && view.questions[2].timeSpentMs === 30_000, `${view.currentIndex} ${view.questions[2].timeSpentMs}`);
  check("next question starts on return", view.questions[3].startedAt === clock.t);
  engine.saveAnswer(attempt.id, q4.id, { selected: ["A", "C"] });

  clock.t += 30_000 + GRACE_MS;
  const finished = engine.get(attempt.id);
  check("last question timeout submits quiz", finished.status === "completed" && finished.submitReason === "timeout");
  check("per-question score", finished.result.correct === 2 && finished.result.skipped === 2, JSON.stringify(finished.result));
  check("per-question time used = sum of windows", finished.result.timeUsedMs === 30_000 + 4_000 + 30_000 + 30_000, String(finished.result.timeUsedMs));
  check("per-question total time", finished.result.totalTimeMs === 120_000);
  void q2;
}

{
  const { repo, clock, engine } = setup();
  const quizId = seedQuiz(repo);
  const { attempt } = engine.start(quizId);
  clock.t += 3 * 60 * 60_000;
  const resumed = engine.resume(attempt.id);
  check("crash without pause caps the open segment", resumed.questions[0].timeSpentMs === IDLE_CAP_MS);
}

{
  const { repo, engine } = setup();
  const quizId = seedQuiz(repo);
  const { attempt } = engine.start(quizId);
  repo.deleteQuiz(quizId);
  check("deleting a quiz removes its attempts", engine.getActive().attempt === null && (await expectCode(() => engine.get(attempt.id), "NOT_FOUND")).ok);
}

{
  const db = new SQL.Database();
  runMigrations(db);
  const configRepo = createAiConfigRepository({ getDb: () => db, persist: () => {}, defaults: { provider: "ollama", baseUrl: "http://localhost:11434", model: "", temperature: 0.4 } });
  check("AI config defaults", configRepo.get().model === "" && configRepo.get().temperature === 0.4);
  configRepo.save({ provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "llama3.2", temperature: 0.7 });
  check("AI config saved", configRepo.get().model === "llama3.2" && configRepo.get().temperature === 0.7);
  try {
    db.run("INSERT INTO ai_configuration (id, provider, base_url, updated_at) VALUES ('x', 'openai', 'u', 'now')");
    check("only the ollama provider is allowed", false);
  } catch {
    check("only the ollama provider is allowed", true);
  }
}

// ---------------------------------------------------------------------------------------------
console.log("\nOllama provider (fake local server)");
check("default URL", normalizeOllamaUrl("") === "http://localhost:11434");
check("path and query dropped", normalizeOllamaUrl("http://127.0.0.1:11434/api?x=1") === "http://127.0.0.1:11434");
check("non-http refused", (await expectCode(() => normalizeOllamaUrl("file:///etc/passwd"), "INVALID_URL")).ok);
check("credentials refused", (await expectCode(() => normalizeOllamaUrl("http://user:pw@localhost:11434"), "INVALID_URL")).ok);
check("garbage URL refused", (await expectCode(() => normalizeOllamaUrl("not a url"), "INVALID_URL")).ok);
check("model tag matching", matchesModel("llama3.2:latest", "llama3.2") && !matchesModel("llama3.1:latest", "llama3.2"));

const seen = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    seen.push({ url: req.url, body: body ? JSON.parse(body) : null });
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.url === "/api/tags") {
      return send(200, { models: [{ name: "qwen2.5:7b", size: 4_700_000_000, details: { parameter_size: "7.6B", family: "qwen2" } }, { name: "llama3.2:latest", size: 2e9, details: {} }] });
    }
    if (req.url === "/api/version") {
      return send(200, { version: "9.9.9" });
    }
    const request = JSON.parse(body);
    if (request.model === "missing") {
      return send(404, { error: 'model "missing" not found, try pulling it first' });
    }
    if (request.model === "slow") {
      return setTimeout(() => send(200, { message: { content: "{}" } }), 1500);
    }
    if (request.model === "old" && typeof request.format === "object") {
      return send(400, { error: "invalid format: expected \"json\"" });
    }
    return send(200, { model: request.model, message: { role: "assistant", content: '{"ok":true}' } });
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${server.address().port}`;
try {
  const models = await listModels(fakeUrl);
  check("models listed and sorted", models.map((m) => m.name).join() === "llama3.2:latest,qwen2.5:7b" && models[1].parameterSize === "7.6B");
  const status = await checkConnection({ baseUrl: fakeUrl, model: "llama3.2" });
  check("connected + model available (implicit :latest)", status.connected && status.modelAvailable && status.version === "9.9.9");
  const missingStatus = await checkConnection({ baseUrl: fakeUrl, model: "mistral" });
  check("missing model explained", missingStatus.connected && !missingStatus.modelAvailable && /ollama pull mistral/.test(missingStatus.message));
  const reply = await chatJson({ baseUrl: fakeUrl, model: "qwen2.5:7b", temperature: 0.3, messages: [{ role: "user", content: "hi" }], schema: { type: "object" } });
  const chatRequest = seen.find((entry) => entry.url === "/api/chat").body;
  check("chat sends schema, temperature and stream=false", reply.content === '{"ok":true}' && chatRequest.stream === false && chatRequest.format.type === "object" && chatRequest.options.temperature === 0.3);
  check("missing model -> MODEL_UNAVAILABLE", (await expectCode(() => chatJson({ baseUrl: fakeUrl, model: "missing", temperature: 0, messages: [] }), "MODEL_UNAVAILABLE")).ok);
  check("timeout -> MODEL_TIMEOUT", (await expectCode(() => chatJson({ baseUrl: fakeUrl, model: "slow", temperature: 0, messages: [], timeoutMs: 300 }), "MODEL_TIMEOUT")).ok);
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 100);
  check("abort -> CANCELLED", (await expectCode(() => chatJson({ baseUrl: fakeUrl, model: "slow", temperature: 0, messages: [], signal: abort.signal }), "CANCELLED")).ok);
  const legacy = await chatJson({ baseUrl: fakeUrl, model: "old", temperature: 0, messages: [], schema: { type: "object" } });
  check("falls back to format=json on old Ollama", legacy.content === '{"ok":true}' && seen.at(-1).body.format === "json");
} finally {
  server.close();
}
const deadStatus = await checkConnection({ baseUrl: "http://127.0.0.1:9", model: "llama3.2" });
check("unreachable Ollama reported, never thrown", !deadStatus.connected && ["OLLAMA_UNAVAILABLE", "OLLAMA_NOT_INSTALLED"].includes(deadStatus.code) && /Ollama/.test(deadStatus.message), deadStatus.message);

// ---------------------------------------------------------------------------------------------
if (ONLINE) {
  console.log("\nLive Ollama (--online)");
  const live = await checkConnection({ baseUrl: "http://localhost:11434", model: process.env.QUIZ_MODEL || "llama3.2" });
  check("live Ollama connected", live.connected && live.modelAvailable, live.message);
  if (live.connected && live.modelAvailable) {
    const started = Date.now();
    const liveConfig = normalizeQuizConfig({ topic: "JavaScript", questionCount: 5, difficulty: "medium", questionTypes: ["single_choice", "true_false"], timeMode: "none" });
    const liveProgress = [];
    const quiz = await generateQuizQuestions(liveConfig, {
      onProgress: (p) => liveProgress.push(p),
      ai: ({ system, prompt: text, schema, timeoutMs, signal }) =>
        chatJson({ baseUrl: "http://localhost:11434", model: live.model, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content: text }], schema, timeoutMs, signal }).then((r) => r.content),
    });
    console.log(`       ${quiz.questions.length} questions in ${Math.round((Date.now() - started) / 1000)}s, ${quiz.stats.requests} requests, ${quiz.stats.rejected} rejected; title "${quiz.title}"`);
    for (const question of quiz.questions) {
      console.log(`       [${question.type}] ${question.question} -> ${question.correctAnswers.join(" | ")}`);
    }
    check("live quiz has 5 valid questions", quiz.questions.length === 5);
    check("live quiz mixes requested types", new Set(quiz.questions.map((q) => q.type)).size === 2);
  }
}

console.log(failures ? `\n${failures} quiz test(s) failed` : "\nAll quiz tests passed");
process.exit(failures ? 1 : 0);
