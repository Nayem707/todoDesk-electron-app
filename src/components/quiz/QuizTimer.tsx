import { Clock } from "lucide-react";
import type { QuizTimeMode } from "../../types/quiz";
import { formatClock, formatElapsed } from "../../utils/quizFormat";
import { cn } from "../../utils/cn";

interface QuizTimerProps {
  timeMode: QuizTimeMode;
  remainingMs: number | null;
  elapsedMs: number;
  limitMs: number | null;
}

/** Remaining time for timed modes, elapsed time otherwise. Turns amber, then red, near the end. */
export function QuizTimer({ timeMode, remainingMs, elapsedMs, limitMs }: QuizTimerProps) {
  if (timeMode === "none" || remainingMs === null) {
    return (
      <div role="timer" className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
        <Clock size={15} />
        <span>
          Elapsed <span className="font-semibold tabular-nums text-[rgb(var(--text))]">{formatElapsed(elapsedMs)}</span>
        </span>
      </div>
    );
  }

  const urgent = timeMode === "per_question" ? remainingMs <= 5_000 : remainingMs <= 10_000;
  const warning = !urgent && (remainingMs <= 60_000 || (limitMs !== null && remainingMs <= limitMs * 0.1));
  return (
    <div
      role="timer"
      aria-label={`${timeMode === "per_question" ? "Question time remaining" : "Time remaining"} ${formatClock(remainingMs)}`}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
        urgent
          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
          : warning
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            : "bg-black/5 dark:bg-white/10"
      )}
    >
      <Clock size={15} className={urgent ? "animate-pulse" : undefined} />
      <span>{timeMode === "per_question" ? "Question time" : "Time Remaining"}:</span>
      <span className="font-semibold tabular-nums">{formatClock(remainingMs)}</span>
    </div>
  );
}
