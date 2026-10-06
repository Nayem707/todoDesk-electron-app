/** A question is correct only when the selected set equals the answer key exactly. */
export function isAnswerCorrect(correctAnswers, selected) {
  if (!Array.isArray(selected) || selected.length === 0) {
    return false;
  }
  const expected = new Set(correctAnswers);
  const chosen = new Set(selected);
  if (expected.size !== chosen.size) {
    return false;
  }
  for (const value of chosen) {
    if (!expected.has(value)) {
      return false;
    }
  }
  return true;
}

/** "correct" | "wrong" | "skipped" for a graded answer. */
export function answerOutcome(correctAnswers, selected) {
  if (!Array.isArray(selected) || selected.length === 0) {
    return "skipped";
  }
  return isAnswerCorrect(correctAnswers, selected) ? "correct" : "wrong";
}

export function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Totals for an attempt. `items` are `{ correctAnswers, selected }`.
 * Accuracy is correct answers over all questions, so skipped questions count against it.
 */
export function scoreItems(items) {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  for (const item of items) {
    const outcome = answerOutcome(item.correctAnswers, item.selected);
    if (outcome === "correct") {
      correct += 1;
    } else if (outcome === "wrong") {
      wrong += 1;
    } else {
      skipped += 1;
    }
  }
  const total = items.length;
  return { score: correct, total, correct, wrong, skipped, accuracy: percent(correct, total) };
}

function bucketize(items, keyOf, labelOf = keyOf) {
  const buckets = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = buckets.get(key) ?? { key, label: labelOf(item), total: 0, correct: 0 };
    bucket.total += 1;
    if (item.outcome === "correct") {
      bucket.correct += 1;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, accuracy: percent(bucket.correct, bucket.total) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Local, deterministic analytics for one attempt. `items` are graded results with
 * `{ outcome, concept, difficulty, type, timeSpentMs, estimatedTime }`.
 */
export function buildBreakdown(items) {
  const answered = items.filter((item) => item.timeSpentMs > 0);
  const totalTime = answered.reduce((sum, item) => sum + item.timeSpentMs, 0);
  return {
    byConcept: bucketize(items, (item) => item.concept.toLowerCase(), (item) => item.concept),
    byDifficulty: bucketize(items, (item) => item.difficulty),
    byType: bucketize(items, (item) => item.type),
    averageTimeMs: answered.length ? Math.round(totalTime / answered.length) : 0,
    overEstimateCount: items.filter((item) => item.timeSpentMs > item.estimatedTime * 1000 * 1.5).length,
  };
}
