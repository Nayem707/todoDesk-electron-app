import { CalendarClock } from "lucide-react";
import { cn } from "../utils/cn";
import {
  getProjectDeadlineInfo,
  type DeadlineTone,
} from "../utils/dates";

const toneClass: Record<DeadlineTone, string> = {
  none: "border-[rgb(var(--border))] bg-black/[0.03] text-[rgb(var(--muted))] dark:bg-white/[0.04]",
  ok: "border-teal-200/80 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200",
  soon: "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  today:
    "border-orange-300/80 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  overdue:
    "border-rose-300/80 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
};

interface ProjectDeadlineBadgeProps {
  deadline: string | null | undefined;
  className?: string;
  compact?: boolean;
}

export function ProjectDeadlineBadge({
  deadline,
  className,
  compact = false,
}: ProjectDeadlineBadgeProps) {
  const info = getProjectDeadlineInfo(deadline ?? null);

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-start gap-2 rounded-xl border px-2.5 py-1.5",
        toneClass[info.tone],
        className
      )}
      title={info.dateLabel ? `${info.label} · ${info.dateLabel}` : info.label}
    >
      <CalendarClock size={14} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs font-semibold">{info.label}</p>
        {!compact && info.dateLabel ? (
          <p className="mt-0.5 truncate text-[11px] opacity-80">{info.dateLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
