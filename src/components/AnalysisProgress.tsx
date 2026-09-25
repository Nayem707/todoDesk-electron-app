import { Check, Loader2 } from "lucide-react";
import type { FormAnalysisStep } from "../types/formAssistant";
import { cn } from "../utils/cn";

const FORM_STEPS: { id: FormAnalysisStep; label: string }[] = [
  { id: "opening", label: "Opening website" },
  { id: "loading", label: "Loading page" },
  { id: "detecting", label: "Detecting form fields" },
  { id: "mapping", label: "Mapping fields" },
];

interface AnalysisProgressProps {
  step: string | null;
  steps?: { id: string; label: string }[];
  title?: string;
}

export function AnalysisProgress({ step, steps = FORM_STEPS, title = "Analyzing website…" }: AnalysisProgressProps) {
  const activeIndex = step ? Math.max(0, steps.findIndex((item) => item.id === step)) : 0;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card dark:shadow-card-dark"
    >
      <p className="text-sm font-semibold">{title}</p>
      <ol className="mt-3 space-y-2">
        {steps.map((item, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                done || active ? "text-[rgb(var(--text))]" : "text-[rgb(var(--muted))]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full",
                  done
                    ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                    : active
                      ? "text-[rgb(var(--accent))]"
                      : "border border-[rgb(var(--border))]"
                )}
              >
                {done ? (
                  <Check size={12} strokeWidth={3} />
                ) : active ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
              </span>
              <span className={cn(active && "font-medium")}>{item.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
