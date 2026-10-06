import type { AttemptQuestion } from "../../types/quiz";
import { cn } from "../../utils/cn";

interface QuestionNavigatorProps {
  questions: AttemptQuestion[];
  currentIndex: number;
  /** Per-question mode shows progress only; questions are answered in order. */
  readOnly: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
}

function stateLabel(question: AttemptQuestion, current: boolean) {
  const parts = [`Question ${question.index + 1}`];
  if (current) {
    parts.push("current");
  }
  parts.push(question.selected.length ? "answered" : question.locked ? "skipped" : "not answered");
  if (question.marked) {
    parts.push("marked for review");
  }
  return parts.join(", ");
}

export function QuestionNavigator({ questions, currentIndex, readOnly, disabled, onSelect }: QuestionNavigatorProps) {
  const answered = questions.filter((question) => question.selected.length > 0).length;
  const marked = questions.filter((question) => question.marked).length;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-[rgb(var(--muted))]">
        <span>
          <span className="font-semibold tabular-nums text-[rgb(var(--text))]">{answered}</span> / {questions.length} answered
        </span>
        {marked > 0 && <span>{marked} marked</span>}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="list" aria-label="Questions">
        {questions.map((question) => {
          const current = question.index === currentIndex;
          const isAnswered = question.selected.length > 0;
          return (
            <button
              key={question.id}
              type="button"
              role="listitem"
              aria-label={stateLabel(question, current)}
              aria-current={current ? "step" : undefined}
              disabled={readOnly || disabled}
              onClick={() => onSelect(question.index)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg border text-xs tabular-nums transition disabled:cursor-default",
                current && "ring-2 ring-[rgb(var(--accent))] ring-offset-1 ring-offset-[rgb(var(--surface))]",
                isAnswered
                  ? "border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/15 font-semibold"
                  : question.locked
                    ? "border-dashed border-[rgb(var(--border))] text-[rgb(var(--muted))]"
                    : "border-[rgb(var(--border))]",
                !readOnly && !current && "hover:border-[rgb(var(--accent))]/60"
              )}
            >
              {question.index + 1}
              {question.marked && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--muted))]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/15" /> Answered
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border border-[rgb(var(--border))]" /> Unanswered
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Marked
        </span>
      </div>
    </div>
  );
}
