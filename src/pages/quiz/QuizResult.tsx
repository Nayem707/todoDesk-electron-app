import { useEffect, useState } from "react";
import { ArrowLeft, Clock, RotateCcw, Sparkles, TimerOff } from "lucide-react";
import { AnalysisErrorCard } from "../../components/AnalysisErrorCard";
import { StatCard } from "../../components/StatCard";
import { AccuracyBars } from "../../components/quiz/AccuracyBars";
import { PerformanceAnalysisCard } from "../../components/quiz/PerformanceAnalysisCard";
import { ReviewList } from "../../components/quiz/ReviewList";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/quiz/styles";
import { quizService } from "../../services/quizService";
import type { QuizAttempt } from "../../types/quiz";
import { cn } from "../../utils/cn";
import { formatDateTime } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
  accuracyTone,
  formatDuration,
  formatElapsed,
  timeLimitLabel,
} from "../../utils/quizFormat";

interface QuizResultProps {
  attemptId: string;
  onBack: () => void;
  onRetry: (quizId: string) => void;
  onGenerateSimilar: (attempt: QuizAttempt) => void;
  onPracticeTopic: (topic: string, attempt: QuizAttempt) => void;
}

export function QuizResult({ attemptId, onBack, onRetry, onGenerateSimilar, onPracticeTopic }: QuizResultProps) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAttempt(null);
    setError(null);
    quizService
      .getById(attemptId)
      .then((next) => !cancelled && setAttempt(next))
      .catch((loadError) => !cancelled && setError(getErrorMessage(loadError, "Could not load this result.")));
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (error) {
    return (
      <AnalysisErrorCard
        error={{ code: "LOAD_FAILED", message: error }}
        fallbackTitle="Result unavailable"
        action={
          <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
            <ArrowLeft size={14} /> Back to Quiz Dashboard
          </button>
        }
      />
    );
  }
  if (!attempt) {
    return <div className="h-64 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />;
  }
  if (attempt.status !== "completed" || !attempt.result || !attempt.breakdown) {
    return (
      <AnalysisErrorCard
        error={{ code: "IN_PROGRESS", message: "This quiz hasn't been submitted yet. Resume it from the dashboard." }}
        fallbackTitle="Quiz in progress"
        action={
          <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
            <ArrowLeft size={14} /> Back to Quiz Dashboard
          </button>
        }
      />
    );
  }

  const { result, breakdown } = attempt;
  const timed = attempt.timeMode !== "none";

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Quiz Result</p>
            <h2 className="mt-1 text-xl font-semibold">{attempt.title}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {attempt.topic} · {DIFFICULTY_LABEL[attempt.difficulty]} ·{" "}
              {timeLimitLabel(attempt.timeMode, attempt.totalSeconds, attempt.perQuestionSeconds)}
              {attempt.submittedAt ? ` · ${formatDateTime(new Date(attempt.submittedAt).toISOString())}` : ""}
            </p>
            {attempt.submitReason === "timeout" && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <TimerOff size={12} /> Submitted automatically when time ran out
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-[rgb(var(--muted))]">Score</p>
            <p className="text-4xl font-semibold tabular-nums">
              {result.score} <span className="text-2xl text-[rgb(var(--muted))]">/ {result.total}</span>
            </p>
            <p className={cn("text-sm font-semibold", accuracyTone(result.accuracy))}>Accuracy: {result.accuracy}%</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={PRIMARY_BUTTON} onClick={() => onRetry(attempt.quizId)}>
            <RotateCcw size={14} /> Retry Quiz
          </button>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => onGenerateSimilar(attempt)}>
            <Sparkles size={14} /> Generate Similar Quiz
          </button>
          <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
            <ArrowLeft size={14} /> Back to Quiz Dashboard
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Correct" value={result.correct} tone="success" />
        <StatCard label="Wrong" value={result.wrong} tone={result.wrong ? "danger" : "default"} />
        <StatCard label="Skipped" value={result.skipped} />
        <StatCard
          label="Time Used"
          value={formatElapsed(result.timeUsedMs)}
          hint={attempt.timeMode === "total" ? "Since the quiz started" : "Time spent on questions"}
        />
        {attempt.timeMode === "total" && result.timeRemainingMs !== null ? (
          <StatCard label="Time Remaining" value={formatElapsed(result.timeRemainingMs)} />
        ) : (
          <StatCard label="Avg per question" value={formatDuration(breakdown.averageTimeMs)} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-sm font-semibold">By concept</h2>
          <div className="mt-3">
            <AccuracyBars
              rows={breakdown.byConcept.map((bucket) => ({
                label: bucket.label,
                accuracy: bucket.accuracy,
                detail: `${bucket.correct}/${bucket.total}`,
              }))}
              emptyText="No concepts recorded."
            />
          </div>
        </section>
        <section className={CARD}>
          <h2 className="text-sm font-semibold">Difficulty, type and timing</h2>
          <div className="mt-3 space-y-4">
            <AccuracyBars
              rows={[
                ...breakdown.byDifficulty.map((bucket) => ({
                  label: `${DIFFICULTY_LABEL[bucket.key as keyof typeof DIFFICULTY_LABEL] ?? bucket.label} difficulty`,
                  accuracy: bucket.accuracy,
                  detail: `${bucket.correct}/${bucket.total}`,
                })),
                ...(breakdown.byType.length > 1
                  ? breakdown.byType.map((bucket) => ({
                      label: QUESTION_TYPE_LABEL[bucket.key as keyof typeof QUESTION_TYPE_LABEL] ?? bucket.label,
                      accuracy: bucket.accuracy,
                      detail: `${bucket.correct}/${bucket.total}`,
                    }))
                  : []),
              ]}
              emptyText="No data."
            />
            <p className="flex items-start gap-2 text-sm text-[rgb(var(--muted))]">
              <Clock size={15} className="mt-0.5 shrink-0" />
              <span>
                Average {formatDuration(breakdown.averageTimeMs)} per answered question.
                {breakdown.overEstimateCount > 0
                  ? ` ${breakdown.overEstimateCount} ${breakdown.overEstimateCount === 1 ? "question" : "questions"} took over 1.5× the estimated time.`
                  : " No question took much longer than estimated."}
                {timed && attempt.submitReason === "timeout" ? " Time ran out before you submitted." : ""}
              </span>
            </p>
          </div>
        </section>
      </div>

      <PerformanceAnalysisCard
        key={attempt.id}
        attemptId={attempt.id}
        initial={attempt.analysis}
        onPracticeTopic={(topic) => onPracticeTopic(topic, attempt)}
      />

      <ReviewList questions={attempt.questions} topic={attempt.topic} />
    </div>
  );
}
