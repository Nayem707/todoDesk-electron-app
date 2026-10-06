import { useMemo, useState } from "react";
import { Check, Clock, Flag, X } from "lucide-react";
import type { AttemptQuestion, QuizOutcome } from "../../types/quiz";
import { DIFFICULTY_LABEL, OUTCOME_LABEL, QUESTION_TYPE_LABEL, formatDuration } from "../../utils/quizFormat";
import { cn } from "../../utils/cn";
import { CARD, CHIP } from "./styles";

type Filter = "all" | QuizOutcome | "marked";

const OUTCOME_BADGE: Record<QuizOutcome, string> = {
  correct: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  wrong: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  skipped: "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10",
};

/** Question-by-question review of a completed attempt. */
export function ReviewList({ questions, topic }: { questions: AttemptQuestion[]; topic: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(
    () => ({
      all: questions.length,
      correct: questions.filter((q) => q.outcome === "correct").length,
      wrong: questions.filter((q) => q.outcome === "wrong").length,
      skipped: questions.filter((q) => q.outcome === "skipped").length,
      marked: questions.filter((q) => q.marked).length,
    }),
    [questions]
  );
  const visible = questions.filter((question) =>
    filter === "all" ? true : filter === "marked" ? question.marked : question.outcome === filter
  );
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "wrong", label: "Wrong" },
    { id: "skipped", label: "Skipped" },
    { id: "correct", label: "Correct" },
    ...(counts.marked ? [{ id: "marked" as Filter, label: "Marked" }] : []),
  ];

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Question review</h2>
        <div role="group" aria-label="Filter questions" className="flex flex-wrap gap-1">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition",
                filter === item.id
                  ? "bg-[rgb(var(--accent))] font-medium text-[rgb(var(--accent-foreground))]"
                  : "text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
              )}
            >
              {item.label} <span className="tabular-nums opacity-80">{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-[rgb(var(--muted))]">No questions match this filter.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {visible.map((question) => (
            <ReviewItem key={question.id} question={question} topic={topic} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewItem({ question, topic }: { question: AttemptQuestion; topic: string }) {
  const outcome = question.outcome ?? "skipped";
  const correct = question.correctAnswers ?? [];
  const slow = question.timeSpentMs > question.estimatedTime * 1000 * 1.5;
  return (
    <li className="rounded-xl border border-[rgb(var(--border))] p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
        <span className="font-semibold text-[rgb(var(--text))]">Q{question.index + 1}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-medium", OUTCOME_BADGE[outcome])}>{OUTCOME_LABEL[outcome]}</span>
        {question.marked && (
          <span className="inline-flex items-center gap-1">
            <Flag size={11} /> Marked
          </span>
        )}
        <span className={CHIP}>{question.concept || topic}</span>
        <span className={CHIP}>{DIFFICULTY_LABEL[question.difficulty]}</span>
        <span className={CHIP}>{QUESTION_TYPE_LABEL[question.type]}</span>
        <span className={cn("ml-auto inline-flex items-center gap-1", slow && "text-amber-700 dark:text-amber-400")}>
          <Clock size={11} />
          {formatDuration(question.timeSpentMs)} <span className="opacity-70">(est. {formatDuration(question.estimatedTime * 1000)})</span>
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed">{question.question}</p>
      {question.code && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] p-3 font-mono text-xs leading-relaxed select-text">
          <code>{question.code}</code>
        </pre>
      )}

      <ul className="mt-3 space-y-1.5">
        {question.options.map((option) => {
          const isCorrect = correct.includes(option);
          const chosen = question.selected.includes(option);
          return (
            <li
              key={option}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-1.5 text-sm",
                isCorrect && "bg-emerald-50 dark:bg-emerald-950/40",
                chosen && !isCorrect && "bg-rose-50 dark:bg-rose-950/40"
              )}
            >
              <span className="mt-0.5 w-4 shrink-0" aria-hidden>
                {isCorrect ? (
                  <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                ) : chosen ? (
                  <X size={14} className="text-rose-600 dark:text-rose-400" />
                ) : null}
              </span>
              <span className="flex-1 whitespace-pre-wrap">{option}</span>
              {chosen && <span className="shrink-0 text-xs text-[rgb(var(--muted))]">Your answer</span>}
              {isCorrect && !chosen && <span className="shrink-0 text-xs text-[rgb(var(--muted))]">Correct answer</span>}
            </li>
          );
        })}
      </ul>

      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-[rgb(var(--muted))]">Your answer</dt>
        <dd>{question.selected.length ? question.selected.join(", ") : <span className="text-[rgb(var(--muted))]">Not answered</span>}</dd>
        <dt className="text-[rgb(var(--muted))]">Correct answer</dt>
        <dd>{correct.join(", ")}</dd>
      </dl>
      {question.explanation && (
        <p className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2 text-sm leading-relaxed text-[rgb(var(--muted))] dark:bg-white/5">
          <span className="font-medium text-[rgb(var(--text))]">Explanation: </span>
          {question.explanation}
        </p>
      )}
    </li>
  );
}
