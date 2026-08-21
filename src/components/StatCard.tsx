import { cn } from "../utils/cn";

interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
}

const tones = {
  default: "bg-[rgb(var(--surface))]",
  success: "bg-emerald-50 dark:bg-emerald-950/40",
  warning: "bg-amber-50 dark:bg-amber-950/40",
  danger: "bg-rose-50 dark:bg-rose-950/40",
  accent: "bg-teal-50 dark:bg-teal-950/40",
};

export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-[rgb(var(--border))] p-4 shadow-card dark:shadow-card-dark",
        tones[tone]
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-[rgb(var(--muted))]">{hint}</p>}
    </article>
  );
}
