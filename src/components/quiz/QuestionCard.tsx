import { Check, Flag } from "lucide-react";
import type { AttemptQuestion } from "../../types/quiz";
import { DIFFICULTY_LABEL, QUESTION_TYPE_HINT } from "../../utils/quizFormat";
import { cn } from "../../utils/cn";
import { CHIP } from "./styles";

interface QuestionCardProps {
  question: AttemptQuestion;
  total: number;
  disabled: boolean;
  onSelect: (option: string) => void;
}

/** One question with selectable answers. AI text is rendered as plain text, never as HTML. */
export function QuestionCard({ question, total, disabled, onSelect }: QuestionCardProps) {
  const multiple = question.type === "multiple_choice";
  return (
    <article aria-labelledby={`question-${question.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
        <span className="font-medium text-[rgb(var(--text))]">
          Question {question.index + 1} of {total}
        </span>
        <span aria-hidden>·</span>
        <span>{QUESTION_TYPE_HINT[question.type]}</span>
        <span className={CHIP}>{DIFFICULTY_LABEL[question.difficulty]}</span>
        {question.marked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <Flag size={11} /> Marked for review
          </span>
        )}
      </div>

      <h2 id={`question-${question.id}`} className="mt-3 whitespace-pre-wrap text-lg font-medium leading-relaxed">
        {question.question}
      </h2>

      {question.code && (
        <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] p-4 font-mono text-xs leading-relaxed select-text">
          <code>{question.code}</code>
        </pre>
      )}

      <div role={multiple ? "group" : "radiogroup"} aria-labelledby={`question-${question.id}`} className="mt-5 space-y-2">
        {question.options.map((option, index) => {
          const selected = question.selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10"
                  : "border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50 hover:bg-black/[0.03] dark:hover:bg-white/5"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center border transition",
                  multiple ? "rounded-md" : "rounded-full",
                  selected
                    ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                    : "border-[rgb(var(--border))]"
                )}
              >
                {selected && (multiple ? <Check size={13} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-current" />)}
              </span>
              <span className="flex-1 whitespace-pre-wrap">{option}</span>
              <kbd className="hidden text-[11px] text-[rgb(var(--muted))] sm:inline">{index + 1}</kbd>
            </button>
          );
        })}
      </div>
    </article>
  );
}
