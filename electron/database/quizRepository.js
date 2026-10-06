import crypto from "crypto";

const ATTEMPT_COLUMNS = {
  status: "status",
  currentIndex: "current_index",
  activeSince: "active_since",
  submittedAt: "submitted_at",
  submitReason: "submit_reason",
  score: "score",
  total: "total",
  correct: "correct_count",
  wrong: "wrong_count",
  skipped: "skipped_count",
  accuracy: "accuracy",
  timeUsedMs: "time_used_ms",
  timeRemainingMs: "time_remaining_ms",
};

const ANSWER_COLUMNS = {
  selected: "selected",
  marked: "marked",
  isCorrect: "is_correct",
  timeSpentMs: "time_spent_ms",
  startedAt: "started_at",
  endedAt: "ended_at",
  locked: "locked",
};

function parseArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const numberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

function mapQuiz(row) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    difficulty: row.difficulty,
    questionTypes: parseArray(row.question_types),
    questionCount: Number(row.question_count),
    timeMode: row.time_mode,
    totalSeconds: numberOrNull(row.total_seconds),
    perQuestionSeconds: numberOrNull(row.per_question_seconds),
    focus: row.focus,
    model: row.model,
    createdAt: row.created_at,
  };
}

function mapQuestion(row) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    position: Number(row.position),
    type: row.type,
    question: row.question,
    code: row.code ?? null,
    options: parseArray(row.options),
    correctAnswers: parseArray(row.correct_answers),
    explanation: row.explanation,
    concept: row.concept,
    difficulty: row.difficulty,
    estimatedTime: Number(row.estimated_seconds),
  };
}

function mapAttempt(row) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    status: row.status,
    timeMode: row.time_mode,
    totalSeconds: numberOrNull(row.total_seconds),
    perQuestionSeconds: numberOrNull(row.per_question_seconds),
    startedAt: Number(row.started_at),
    deadlineAt: numberOrNull(row.deadline_at),
    currentIndex: Number(row.current_index),
    activeSince: numberOrNull(row.active_since),
    submittedAt: numberOrNull(row.submitted_at),
    submitReason: row.submit_reason ?? null,
    score: numberOrNull(row.score),
    total: numberOrNull(row.total),
    correct: numberOrNull(row.correct_count),
    wrong: numberOrNull(row.wrong_count),
    skipped: numberOrNull(row.skipped_count),
    accuracy: numberOrNull(row.accuracy),
    timeUsedMs: numberOrNull(row.time_used_ms),
    timeRemainingMs: numberOrNull(row.time_remaining_ms),
    createdAt: row.created_at,
  };
}

function mapAnswer(row) {
  return {
    attemptId: row.attempt_id,
    questionId: row.question_id,
    position: Number(row.position),
    selected: parseArray(row.selected),
    marked: Boolean(row.marked),
    isCorrect: row.is_correct === null || row.is_correct === undefined ? null : Boolean(row.is_correct),
    timeSpentMs: Number(row.time_spent_ms) || 0,
    startedAt: numberOrNull(row.started_at),
    endedAt: numberOrNull(row.ended_at),
    locked: Boolean(row.locked),
  };
}

function toColumnValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value ?? null;
}

/**
 * Quiz, question, attempt, answer and performance storage. A factory so the quiz engine can be
 * tested against an in-memory sql.js database.
 */
export function createQuizRepository({ getDb, persist }) {
  function queryAll(sql, params = []) {
    const stmt = getDb().prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  const queryOne = (sql, params = []) => queryAll(sql, params)[0] ?? null;

  function write(sql, params = []) {
    getDb().run(sql, params);
  }

  /** Run several writes atomically, then schedule one save to disk. */
  function transaction(fn) {
    const db = getDb();
    db.run("BEGIN");
    try {
      const result = fn();
      db.run("COMMIT");
      persist();
      return result;
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
  }

  function update(table, columns, where, whereParams, patch) {
    const entries = Object.entries(patch).filter(([key]) => key in columns);
    if (entries.length === 0) {
      return;
    }
    const assignments = entries.map(([key]) => `${columns[key]} = ?`);
    const params = entries.map(([, value]) => toColumnValue(value));
    if (table === "quiz_attempts") {
      assignments.push("updated_at = ?");
      params.push(new Date().toISOString());
    }
    write(`UPDATE ${table} SET ${assignments.join(", ")} WHERE ${where}`, [...params, ...whereParams]);
  }

  return {
    transaction,

    insertQuiz(quiz, questions) {
      const id = crypto.randomUUID();
      transaction(() => {
        write(
          `INSERT INTO quizzes (id, title, topic, difficulty, question_types, question_count, time_mode,
             total_seconds, per_question_seconds, focus, model, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            quiz.title,
            quiz.topic,
            quiz.difficulty,
            JSON.stringify(quiz.questionTypes),
            questions.length,
            quiz.timeMode,
            quiz.totalSeconds,
            quiz.perQuestionSeconds,
            quiz.focus ?? "",
            quiz.model ?? "",
            new Date().toISOString(),
          ]
        );
        questions.forEach((question, position) => {
          write(
            `INSERT INTO quiz_questions (id, quiz_id, position, type, question, code, options, correct_answers,
               explanation, concept, difficulty, estimated_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              id,
              position,
              question.type,
              question.question,
              question.code ?? null,
              JSON.stringify(question.options),
              JSON.stringify(question.correctAnswers),
              question.explanation,
              question.concept,
              question.difficulty,
              question.estimatedTime,
            ]
          );
        });
      });
      return id;
    },

    getQuiz(id) {
      const row = queryOne("SELECT * FROM quizzes WHERE id = ?", [id]);
      if (!row) {
        return null;
      }
      const questions = queryAll("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position", [id]).map(mapQuestion);
      return { ...mapQuiz(row), questions };
    },

    listQuizzes(limit = 50) {
      return queryAll(
        `SELECT q.*,
           (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.status = 'completed') AS attempt_count,
           (SELECT MAX(a.accuracy) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.status = 'completed') AS best_accuracy,
           (SELECT MAX(a.submitted_at) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.status = 'completed') AS last_attempt_at
         FROM quizzes q ORDER BY q.created_at DESC LIMIT ?`,
        [limit]
      ).map((row) => ({
        ...mapQuiz(row),
        attemptCount: Number(row.attempt_count) || 0,
        bestAccuracy: numberOrNull(row.best_accuracy),
        lastAttemptAt: numberOrNull(row.last_attempt_at),
      }));
    },

    deleteQuiz(id) {
      transaction(() => write("DELETE FROM quizzes WHERE id = ?", [id]));
    },

    insertAttempt(attempt, answers) {
      transaction(() => {
        const now = new Date().toISOString();
        write(
          `INSERT INTO quiz_attempts (id, quiz_id, status, time_mode, total_seconds, per_question_seconds,
             started_at, deadline_at, current_index, active_since, created_at, updated_at)
           VALUES (?, ?, 'in_progress', ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            attempt.id,
            attempt.quizId,
            attempt.timeMode,
            attempt.totalSeconds,
            attempt.perQuestionSeconds,
            attempt.startedAt,
            attempt.deadlineAt,
            attempt.activeSince,
            now,
            now,
          ]
        );
        for (const answer of answers) {
          write(
            `INSERT INTO quiz_answers (attempt_id, question_id, position, started_at) VALUES (?, ?, ?, ?)`,
            [attempt.id, answer.questionId, answer.position, answer.startedAt ?? null]
          );
        }
      });
    },

    getAttempt(id) {
      const row = queryOne("SELECT * FROM quiz_attempts WHERE id = ?", [id]);
      return row ? mapAttempt(row) : null;
    },

    getActiveAttempt() {
      const row = queryOne("SELECT * FROM quiz_attempts WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1");
      return row ? mapAttempt(row) : null;
    },

    getAnswers(attemptId) {
      return queryAll("SELECT * FROM quiz_answers WHERE attempt_id = ? ORDER BY position", [attemptId]).map(mapAnswer);
    },

    /** Unsaved changes are only written to disk by the caller's transaction or `persist`. */
    updateAttempt(id, patch) {
      update("quiz_attempts", ATTEMPT_COLUMNS, "id = ?", [id], patch);
    },

    updateAnswer(attemptId, questionId, patch) {
      update("quiz_answers", ANSWER_COLUMNS, "attempt_id = ? AND question_id = ?", [attemptId, questionId], patch);
    },

    deleteAttempt(id) {
      transaction(() => write("DELETE FROM quiz_attempts WHERE id = ?", [id]));
    },

    listCompletedAttempts(limit = 500) {
      return queryAll(
        `SELECT a.*, q.title, q.topic, q.difficulty, q.question_count
         FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
         WHERE a.status = 'completed' ORDER BY a.submitted_at DESC LIMIT ?`,
        [limit]
      ).map((row) => ({
        ...mapAttempt(row),
        title: row.title,
        topic: row.topic,
        difficulty: row.difficulty,
        questionCount: Number(row.question_count),
      }));
    },

    /** Concept-level results across recent completed attempts, for dashboard analytics. */
    listRecentResults(attemptLimit = 30) {
      return queryAll(
        `SELECT qq.concept, qq.difficulty, ans.is_correct, ans.selected
         FROM quiz_answers ans
         JOIN quiz_questions qq ON qq.id = ans.question_id
         WHERE ans.attempt_id IN (
           SELECT id FROM quiz_attempts WHERE status = 'completed' ORDER BY submitted_at DESC LIMIT ?
         )`,
        [attemptLimit]
      ).map((row) => ({
        concept: row.concept,
        difficulty: row.difficulty,
        isCorrect: Boolean(row.is_correct),
        answered: parseArray(row.selected).length > 0,
      }));
    },

    getQuestionTexts(quizIds) {
      if (quizIds.length === 0) {
        return [];
      }
      const placeholders = quizIds.map(() => "?").join(", ");
      return queryAll(`SELECT question FROM quiz_questions WHERE quiz_id IN (${placeholders}) ORDER BY position`, quizIds).map(
        (row) => row.question
      );
    },

    getPerformance(attemptId) {
      const row = queryOne("SELECT * FROM quiz_performance WHERE attempt_id = ?", [attemptId]);
      if (!row) {
        return null;
      }
      try {
        return { ...JSON.parse(row.analysis), model: row.model, createdAt: row.created_at };
      } catch {
        return null;
      }
    },

    savePerformance(attemptId, analysis, model) {
      transaction(() =>
        write(
          `INSERT INTO quiz_performance (attempt_id, analysis, model, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(attempt_id) DO UPDATE SET analysis = excluded.analysis, model = excluded.model,
             created_at = excluded.created_at`,
          [attemptId, JSON.stringify(analysis), model, new Date().toISOString()]
        )
      );
    },
  };
}
