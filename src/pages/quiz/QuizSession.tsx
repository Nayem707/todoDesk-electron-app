import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Flag, Send, SkipForward } from "lucide-react";
import { AnalysisErrorCard } from "../../components/AnalysisErrorCard";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { QuestionCard } from "../../components/quiz/QuestionCard";
import { QuestionNavigator } from "../../components/quiz/QuestionNavigator";
import { QuizTimer } from "../../components/quiz/QuizTimer";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/quiz/styles";
import { useQuizAttempt } from "../../hooks/quiz/useQuizAttempt";
import type { QuizAttempt } from "../../types/quiz";
import { cn } from "../../utils/cn";
import { DIFFICULTY_LABEL, timeLimitLabel } from "../../utils/quizFormat";

interface QuizSessionProps {
  attemptId: string;
  onExit: () => void;
  onCompleted: (attempt: QuizAttempt) => void;
}

export function QuizSession({ attemptId, onExit, onCompleted }: QuizSessionProps) {
  const session = useQuizAttempt(attemptId, onCompleted);
  const { attempt, current, busy, select, toggleMark, next, previous, goTo } = session;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const perQuestion = attempt?.timeMode === "per_question";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (confirmOpen) {
        if (event.key === "Escape") {
          setConfirmOpen(false);
        }
        return;
      }
      if (!current) {
        return;
      }
      const option = /^[1-9]$/.test(event.key) ? current.options[Number(event.key) - 1] : undefined;
      if (option !== undefined) {
        event.preventDefault();
        select(option);
      } else if (event.key === "ArrowRight" && !perQuestion) {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft" && !perQuestion) {
        event.preventDefault();
        previous();
      } else if (event.key.toLowerCase() === "m" && !perQuestion) {
        event.preventDefault();
        toggleMark();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, current, next, perQuestion, previous, select, toggleMark]);

  if (session.loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
        <div className="h-96 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
      </div>
    );
  }
  if (session.loadError) {
    return (
      <div className="space-y-4">
        <AnalysisErrorCard
          error={{ code: "LOAD_FAILED", message: session.loadError }}
          fallbackTitle="Quiz unavailable"
          action={
            <button type="button" className={SECONDARY_BUTTON} onClick={onExit}>
              <ArrowLeft size={14} /> Back to Quiz Dashboard
            </button>
          }
        />
      </div>
    );
  }
  if (!attempt || !current || attempt.status !== "in_progress") {
    return null;
  }

  const total = attempt.questions.length;
  const last = attempt.currentIndex === total - 1;
  const answered = attempt.questions.filter((question) => question.selected.length > 0).length;
  const marked = attempt.questions.filter((question) => question.marked).length;
  const unanswered = total - answered;
  const limitMs =
    attempt.timeMode === "total"
      ? (attempt.totalSeconds ?? 0) * 1000
      : attempt.timeMode === "per_question"
        ? (attempt.perQuestionSeconds ?? 0) * 1000
        : null;

  /** Free modes: jump to the next unanswered question, wrapping around. */
  const skip = () => {
    if (perQuestion) {
      next();
      return;
    }
    for (let offset = 1; offset < total; offset += 1) {
      const index = (attempt.currentIndex + offset) % total;
      if (attempt.questions[index]?.selected.length === 0) {
        goTo(index);
        return;
      }
    }
    next();
  };

  const submitDescription = [
    `You've answered ${answered} of ${total} questions.`,
    unanswered ? `${unanswered} unanswered ${unanswered === 1 ? "question counts" : "questions count"} as skipped.` : "",
    marked ? `${marked} ${marked === 1 ? "is" : "are"} marked for review.` : "",
    "You can't change your answers after submitting.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <header className={cn(CARD, "flex flex-wrap items-center gap-4 py-4")}>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
          title="Your progress is saved. Timed quizzes keep counting down."
        >
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{attempt.title}</h1>
          <p className="truncate text-xs text-[rgb(var(--muted))]">
            {attempt.topic} · {DIFFICULTY_LABEL[attempt.difficulty]} ·{" "}
            {timeLimitLabel(attempt.timeMode, attempt.totalSeconds, attempt.perQuestionSeconds)}
          </p>
        </div>
        <QuizTimer timeMode={attempt.timeMode} remainingMs={session.remainingMs} elapsedMs={session.elapsedMs} limitMs={limitMs} />
      </header>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
      >
        <div className="h-full rounded-full bg-[rgb(var(--accent))] transition-all" style={{ width: `${(answered / total) * 100}%` }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className={CARD}>
          <QuestionCard question={current} total={total} disabled={current.locked} onSelect={select} />
          {current.selected.length > 0 && (
            <button
              type="button"
              onClick={session.clearAnswer}
              className="mt-2 text-xs text-[rgb(var(--muted))] underline-offset-2 hover:text-[rgb(var(--text))] hover:underline"
            >
              Clear answer
            </button>
          )}

          <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-4">
            {!perQuestion && (
              <>
                <button type="button" className={SECONDARY_BUTTON} onClick={previous} disabled={busy || attempt.currentIndex === 0}>
                  <ChevronLeft size={15} /> Previous
                </button>
                <button
                  type="button"
                  className={cn(SECONDARY_BUTTON, current.marked && "border-amber-400 bg-amber-50 dark:bg-amber-950/40")}
                  onClick={toggleMark}
                  aria-pressed={current.marked}
                >
                  <Flag size={14} /> {current.marked ? "Marked" : "Mark for review"}
                </button>
              </>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {current.selected.length === 0 && !last && (
                <button type="button" className={SECONDARY_BUTTON} onClick={skip} disabled={busy}>
                  <SkipForward size={14} /> Skip
                </button>
              )}
              {last ? (
                <button type="button" className={PRIMARY_BUTTON} onClick={() => setConfirmOpen(true)} disabled={busy}>
                  <Send size={14} /> Submit Quiz
                </button>
              ) : (
                <button type="button" className={PRIMARY_BUTTON} onClick={next} disabled={busy}>
                  Next <ChevronRight size={15} />
                </button>
              )}
            </div>
          </footer>
        </section>

        <aside className={cn(CARD, "h-fit space-y-4 lg:sticky lg:top-4")}>
          <QuestionNavigator
            questions={attempt.questions}
            currentIndex={attempt.currentIndex}
            readOnly={perQuestion}
            disabled={busy}
            onSelect={goTo}
          />
          {perQuestion && (
            <p className="text-xs text-[rgb(var(--muted))]">
              Per-question timing: questions are answered in order and can't be revisited.
            </p>
          )}
          <button type="button" className={cn(SECONDARY_BUTTON, "w-full")} onClick={() => setConfirmOpen(true)} disabled={busy}>
            <Send size={14} /> Submit Quiz
          </button>
          <p className="text-[11px] leading-relaxed text-[rgb(var(--muted))]">
            Answers are saved as you go.
            {perQuestion ? " Press 1–6 to choose." : " Press 1–6 to choose, ← → to move, M to mark."}
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Submit quiz?"
        description={submitDescription}
        confirmLabel="Submit Quiz"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          session.submit();
        }}
      />
    </div>
  );
}
