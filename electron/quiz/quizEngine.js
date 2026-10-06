import crypto from "crypto";
import { QuizError } from "./quizErrors.js";
import { answerOutcome, buildBreakdown, percent, scoreItems } from "./quizScoring.js";

/** Answers that reach the main process this soon after a deadline still count (IPC latency). */
export const GRACE_MS = 2_000;
/** Upper bound for one uninterrupted viewing segment when the app closed without pausing. */
export const IDLE_CAP_MS = 10 * 60_000;

/**
 * Quiz attempt lifecycle. Timing is authoritative here, based on absolute timestamps stored in
 * the database (`deadline_at`, per-question `started_at`), so a slow or reloaded renderer cannot
 * stretch or reset a timer.
 *
 * Time modes:
 * - none: free navigation, no deadline.
 * - total: free navigation until `deadlineAt`; the clock keeps running while the app is closed.
 * - per_question: questions are answered in order; each one closes `perQuestionSeconds` after it
 *   opened. After a restart, an expired question is closed at its deadline and the next question
 *   starts when the user returns.
 */
export function createQuizEngine({ repo, now = Date.now }) {
  function load(attemptId) {
    if (typeof attemptId !== "string" || !attemptId || attemptId.length > 100) {
      throw new QuizError("NOT_FOUND", "Quiz attempt not found.");
    }
    const attempt = repo.getAttempt(attemptId);
    if (!attempt) {
      throw new QuizError("NOT_FOUND", "This quiz attempt no longer exists.");
    }
    return attempt;
  }

  function loadQuiz(quizId) {
    const quiz = typeof quizId === "string" && quizId ? repo.getQuiz(quizId) : null;
    if (!quiz) {
      throw new QuizError("NOT_FOUND", "This quiz no longer exists.");
    }
    return quiz;
  }

  const perQuestionMs = (attempt) => (attempt.perQuestionSeconds ?? 0) * 1000;

  function windowEnd(attempt, answers) {
    const current = answers[attempt.currentIndex];
    return (current?.startedAt ?? attempt.startedAt) + perQuestionMs(attempt);
  }

  /** Add the open viewing segment of the current question to its time spent. */
  function closeSegment(attempt, answers, endAt) {
    const current = answers[attempt.currentIndex];
    if (!current || current.locked || attempt.activeSince === null) {
      return;
    }
    const spent = Math.max(0, endAt - attempt.activeSince);
    repo.updateAnswer(attempt.id, current.questionId, { timeSpentMs: current.timeSpentMs + spent, endedAt: endAt });
  }

  function finalize(attempt, reason, endAt) {
    const quiz = loadQuiz(attempt.quizId);
    repo.transaction(() => {
      closeSegment(attempt, repo.getAnswers(attempt.id), endAt);
      if (attempt.timeMode === "per_question") {
        const current = repo.getAnswers(attempt.id)[attempt.currentIndex];
        if (current) {
          repo.updateAnswer(attempt.id, current.questionId, { locked: true, endedAt: current.endedAt ?? endAt });
        }
      }

      const answers = repo.getAnswers(attempt.id);
      const keyById = new Map(quiz.questions.map((question) => [question.id, question.correctAnswers]));
      const items = answers.map((answer) => ({ correctAnswers: keyById.get(answer.questionId) ?? [], selected: answer.selected }));
      answers.forEach((answer, index) => {
        repo.updateAnswer(attempt.id, answer.questionId, {
          isCorrect: answerOutcome(items[index].correctAnswers, answer.selected) === "correct",
        });
      });

      const totals = scoreItems(items);
      const activeMs = answers.reduce((sum, answer) => sum + answer.timeSpentMs, 0);
      const limitMs = attempt.timeMode === "total" ? attempt.totalSeconds * 1000 : null;
      const timeUsedMs = limitMs === null ? activeMs : Math.min(limitMs, Math.max(0, endAt - attempt.startedAt));
      repo.updateAttempt(attempt.id, {
        status: "completed",
        submittedAt: endAt,
        submitReason: reason,
        activeSince: null,
        ...totals,
        timeUsedMs,
        timeRemainingMs: limitMs === null ? null : Math.max(0, limitMs - timeUsedMs),
      });
    });
  }

  /** Close the current per-question window and open the next one (or finish on the last). */
  function stepForward(attempt, answers, reason, endAt, nextStart) {
    if (attempt.currentIndex >= answers.length - 1) {
      finalize(attempt, reason, endAt);
      return;
    }
    const current = answers[attempt.currentIndex];
    const next = answers[attempt.currentIndex + 1];
    repo.transaction(() => {
      closeSegment(attempt, answers, endAt);
      repo.updateAnswer(attempt.id, current.questionId, { locked: true, endedAt: endAt });
      repo.updateAnswer(attempt.id, next.questionId, { startedAt: nextStart, endedAt: null });
      repo.updateAttempt(attempt.id, { currentIndex: attempt.currentIndex + 1, activeSince: nextStart });
    });
  }

  /** Apply any deadline that has passed. Returns the up-to-date attempt. */
  function reconcile(attempt) {
    if (attempt.status !== "in_progress") {
      return attempt;
    }
    const t = now();
    if (attempt.timeMode === "total" && t >= attempt.deadlineAt + GRACE_MS) {
      finalize(attempt, "timeout", attempt.deadlineAt);
      return repo.getAttempt(attempt.id);
    }
    if (attempt.timeMode === "per_question") {
      const answers = repo.getAnswers(attempt.id);
      const end = windowEnd(attempt, answers);
      if (t >= end + GRACE_MS) {
        stepForward(attempt, answers, "timeout", end, t);
        return repo.getAttempt(attempt.id);
      }
    }
    return attempt;
  }

  function validateSelection(question, selected) {
    if (!Array.isArray(selected) || selected.length > question.options.length) {
      throw new QuizError("INVALID_ANSWER", "That answer could not be saved.");
    }
    const unique = [...new Set(selected)];
    if (unique.some((value) => typeof value !== "string" || !question.options.includes(value))) {
      throw new QuizError("INVALID_ANSWER", "That answer is not one of the options.");
    }
    if (question.type !== "multiple_choice" && unique.length > 1) {
      throw new QuizError("INVALID_ANSWER", "Choose only one answer for this question.");
    }
    return unique;
  }

  function questionView(question, answer, index, attempt, reveal) {
    const isCurrentWindow =
      attempt.timeMode === "per_question" && attempt.status === "in_progress" && index === attempt.currentIndex;
    const view = {
      id: question.id,
      index,
      type: question.type,
      question: question.question,
      code: question.code,
      options: question.options,
      difficulty: question.difficulty,
      estimatedTime: question.estimatedTime,
      selected: answer?.selected ?? [],
      marked: answer?.marked ?? false,
      locked: answer?.locked ?? false,
      startedAt: answer?.startedAt ?? null,
      endedAt: answer?.endedAt ?? null,
      timeSpentMs: answer?.timeSpentMs ?? 0,
      deadlineAt: isCurrentWindow && answer?.startedAt ? answer.startedAt + perQuestionMs(attempt) : null,
    };
    if (reveal) {
      Object.assign(view, {
        correctAnswers: question.correctAnswers,
        explanation: question.explanation,
        concept: question.concept,
        outcome: answerOutcome(question.correctAnswers, view.selected),
      });
    }
    return view;
  }

  /**
   * What the renderer sees. Answer keys, explanations and concepts are only included once the
   * attempt is completed.
   */
  function view(attemptId) {
    const attempt = load(attemptId);
    const quiz = loadQuiz(attempt.quizId);
    const completed = attempt.status === "completed";
    const answers = new Map(repo.getAnswers(attempt.id).map((answer) => [answer.questionId, answer]));
    const questions = quiz.questions.map((question, index) =>
      questionView(question, answers.get(question.id), index, attempt, completed)
    );

    const result = {
      id: attempt.id,
      quizId: quiz.id,
      status: attempt.status,
      title: quiz.title,
      topic: quiz.topic,
      difficulty: quiz.difficulty,
      questionTypes: quiz.questionTypes,
      focus: quiz.focus,
      timeMode: attempt.timeMode,
      totalSeconds: attempt.totalSeconds,
      perQuestionSeconds: attempt.perQuestionSeconds,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      currentIndex: attempt.currentIndex,
      activeSince: attempt.activeSince,
      submittedAt: attempt.submittedAt,
      submitReason: attempt.submitReason,
      serverNow: now(),
      questions,
      result: null,
      breakdown: null,
      analysis: null,
    };

    if (completed) {
      result.result = {
        score: attempt.score,
        total: attempt.total,
        correct: attempt.correct,
        wrong: attempt.wrong,
        skipped: attempt.skipped,
        accuracy: attempt.accuracy,
        timeUsedMs: attempt.timeUsedMs,
        timeRemainingMs: attempt.timeRemainingMs,
        totalTimeMs:
          attempt.timeMode === "total"
            ? attempt.totalSeconds * 1000
            : attempt.timeMode === "per_question"
              ? attempt.perQuestionSeconds * 1000 * questions.length
              : null,
      };
      result.breakdown = buildBreakdown(questions);
      result.analysis = repo.getPerformance(attempt.id);
    }
    return result;
  }

  function getActiveAttempt() {
    const active = repo.getActiveAttempt();
    return active ? reconcile(active) : null;
  }

  return {
    view,
    reconcile,

    /** Start a new attempt. Returns `activeAttemptId` instead when another quiz is unfinished. */
    start(quizId, { replaceActive = false } = {}) {
      const quiz = loadQuiz(quizId);
      if (quiz.questions.length === 0) {
        throw new QuizError("NOT_FOUND", "This quiz has no questions.");
      }
      const active = getActiveAttempt();
      if (active?.status === "in_progress") {
        if (!replaceActive) {
          return { attempt: null, activeAttemptId: active.id };
        }
        repo.deleteAttempt(active.id);
      }

      const t = now();
      const attempt = {
        id: crypto.randomUUID(),
        quizId: quiz.id,
        timeMode: quiz.timeMode,
        totalSeconds: quiz.totalSeconds,
        perQuestionSeconds: quiz.perQuestionSeconds,
        startedAt: t,
        deadlineAt: quiz.timeMode === "total" ? t + quiz.totalSeconds * 1000 : null,
        activeSince: t,
      };
      repo.insertAttempt(
        attempt,
        quiz.questions.map((question, position) => ({ questionId: question.id, position, startedAt: position === 0 ? t : null }))
      );
      return { attempt: view(attempt.id), activeAttemptId: null };
    },

    /** The unfinished attempt, or the id of one that expired while nobody was watching. */
    getActive() {
      const active = repo.getActiveAttempt();
      if (!active) {
        return { attempt: null, expiredAttemptId: null };
      }
      const current = reconcile(active);
      if (current.status === "completed") {
        return { attempt: null, expiredAttemptId: current.id };
      }
      return { attempt: view(current.id), expiredAttemptId: null };
    },

    get(attemptId) {
      return view(reconcile(load(attemptId)).id);
    },

    saveAnswer(attemptId, questionId, input = {}) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status !== "in_progress") {
        return { closed: true, locked: false, question: null };
      }
      const quiz = loadQuiz(attempt.quizId);
      const index = quiz.questions.findIndex((question) => question.id === questionId);
      if (index < 0) {
        throw new QuizError("NOT_FOUND", "Question not found.");
      }
      const question = quiz.questions[index];
      const answer = repo.getAnswers(attempt.id).find((item) => item.questionId === questionId);
      if (attempt.timeMode === "per_question" && (index !== attempt.currentIndex || answer?.locked)) {
        return { closed: false, locked: true, question: null };
      }

      const patch = {};
      if (input && "selected" in input) {
        patch.selected = validateSelection(question, input.selected);
      }
      if (input && "marked" in input) {
        patch.marked = input.marked === true;
      }
      repo.transaction(() => repo.updateAnswer(attempt.id, questionId, patch));
      return {
        closed: false,
        locked: false,
        question: questionView(question, { ...answer, ...patch }, index, attempt, false),
      };
    },

    /** Free navigation (no-limit and total-time modes). */
    navigate(attemptId, toIndex) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status !== "in_progress") {
        return view(attempt.id);
      }
      if (attempt.timeMode === "per_question") {
        throw new QuizError("INVALID_NAVIGATION", "In per-question mode, questions are answered in order.");
      }
      const answers = repo.getAnswers(attempt.id);
      if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= answers.length) {
        throw new QuizError("INVALID_NAVIGATION", "That question does not exist.");
      }
      if (toIndex !== attempt.currentIndex) {
        const t = now();
        const endAt = attempt.timeMode === "total" ? Math.min(t, attempt.deadlineAt) : t;
        const target = answers[toIndex];
        repo.transaction(() => {
          closeSegment(attempt, answers, endAt);
          if (target.startedAt === null) {
            repo.updateAnswer(attempt.id, target.questionId, { startedAt: t });
          }
          repo.updateAttempt(attempt.id, { currentIndex: toIndex, activeSince: t });
        });
      }
      return view(attempt.id);
    },

    /**
     * Per-question mode: close question `fromIndex` and open the next. Idempotent, so a late
     * timer tick and a click arriving together only advance once.
     */
    advance(attemptId, fromIndex, reason) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status !== "in_progress" || attempt.currentIndex !== fromIndex) {
        return view(attempt.id);
      }
      if (attempt.timeMode !== "per_question") {
        throw new QuizError("INVALID_NAVIGATION", "Use Previous and Next to move between questions.");
      }
      const answers = repo.getAnswers(attempt.id);
      const t = now();
      const end = windowEnd(attempt, answers);
      const timedOut = reason === "timeout" && t >= end - GRACE_MS;
      stepForward(attempt, answers, timedOut ? "timeout" : "manual", Math.min(t, end), t);
      return view(attempt.id);
    },

    /** Finish the attempt. Repeated or late submissions return the stored result. */
    submit(attemptId, reason) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status === "completed") {
        return view(attempt.id);
      }
      const t = now();
      let end = Infinity;
      if (attempt.timeMode === "total") {
        end = attempt.deadlineAt;
      } else if (attempt.timeMode === "per_question") {
        end = windowEnd(attempt, repo.getAnswers(attempt.id));
      }
      const timedOut = reason === "timeout" && t >= end - GRACE_MS;
      finalize(attempt, timedOut ? "timeout" : "manual", Math.min(t, end));
      return view(attempt.id);
    },

    /** Stop counting time-spent while the quiz screen is not shown (deadlines keep running). */
    pause(attemptId) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status !== "in_progress" || attempt.timeMode === "per_question" || attempt.activeSince === null) {
        return { paused: false };
      }
      const t = now();
      const endAt = attempt.timeMode === "total" ? Math.min(t, attempt.deadlineAt) : t;
      repo.transaction(() => {
        closeSegment(attempt, repo.getAnswers(attempt.id), endAt);
        repo.updateAttempt(attempt.id, { activeSince: null });
      });
      return { paused: true };
    },

    /** Re-open the viewing segment when the quiz screen is shown again. */
    resume(attemptId) {
      const attempt = reconcile(load(attemptId));
      if (attempt.status === "in_progress" && attempt.timeMode !== "per_question") {
        const t = now();
        repo.transaction(() => {
          if (attempt.activeSince !== null) {
            // The app closed without pausing; count at most IDLE_CAP_MS of that segment.
            closeSegment(attempt, repo.getAnswers(attempt.id), Math.min(t, attempt.activeSince + IDLE_CAP_MS));
          }
          repo.updateAttempt(attempt.id, { activeSince: t });
        });
      }
      return view(attempt.id);
    },

    discard(attemptId) {
      const attempt = load(attemptId);
      if (attempt.status !== "in_progress") {
        throw new QuizError("INVALID_STATE", "Only unfinished quizzes can be discarded.");
      }
      repo.deleteAttempt(attempt.id);
      return { id: attempt.id };
    },

    deleteAttempt(attemptId) {
      const attempt = load(attemptId);
      repo.deleteAttempt(attempt.id);
      return { id: attempt.id };
    },

    history() {
      getActiveAttempt();
      return repo.listCompletedAttempts().map((attempt) => ({
        id: attempt.id,
        quizId: attempt.quizId,
        title: attempt.title,
        topic: attempt.topic,
        difficulty: attempt.difficulty,
        questionCount: attempt.questionCount,
        score: attempt.score,
        total: attempt.total,
        accuracy: attempt.accuracy,
        timeUsedMs: attempt.timeUsedMs,
        timeMode: attempt.timeMode,
        submitReason: attempt.submitReason,
        completedAt: attempt.submittedAt,
      }));
    },

    /** Aggregate analytics across completed attempts, computed locally. */
    stats() {
      getActiveAttempt();
      const attempts = repo.listCompletedAttempts();
      const average = (list) => (list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null);

      const group = (keyOf) => {
        const groups = new Map();
        for (const attempt of attempts) {
          const key = keyOf(attempt);
          const entry = groups.get(key.toLowerCase()) ?? { label: key, accuracies: [] };
          entry.accuracies.push(attempt.accuracy ?? 0);
          groups.set(key.toLowerCase(), entry);
        }
        return [...groups.values()]
          .map((entry) => ({ label: entry.label, attempts: entry.accuracies.length, averageAccuracy: average(entry.accuracies) }))
          .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));
      };

      const concepts = new Map();
      for (const row of repo.listRecentResults()) {
        const key = row.concept.toLowerCase();
        const entry = concepts.get(key) ?? { label: row.concept, total: 0, correct: 0 };
        entry.total += 1;
        if (row.isCorrect) {
          entry.correct += 1;
        }
        concepts.set(key, entry);
      }
      const conceptList = [...concepts.values()]
        .filter((entry) => entry.total >= 2)
        .map((entry) => ({ ...entry, accuracy: percent(entry.correct, entry.total) }));

      return {
        totalAttempts: attempts.length,
        averageAccuracy: average(attempts.map((attempt) => attempt.accuracy ?? 0)),
        bestAccuracy: attempts.length ? Math.max(...attempts.map((attempt) => attempt.accuracy ?? 0)) : null,
        questionsAnswered: attempts.reduce((sum, attempt) => sum + (attempt.total ?? 0), 0),
        totalTimeMs: attempts.reduce((sum, attempt) => sum + (attempt.timeUsedMs ?? 0), 0),
        byTopic: group((attempt) => attempt.topic).slice(0, 8),
        byDifficulty: group((attempt) => attempt.difficulty),
        recentAccuracy: attempts.slice(0, 10).reverse().map((attempt) => attempt.accuracy ?? 0),
        weakConcepts: conceptList.filter((entry) => entry.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 6),
        strongConcepts: conceptList.filter((entry) => entry.accuracy >= 80).sort((a, b) => b.accuracy - a.accuracy).slice(0, 6),
      };
    },
  };
}
