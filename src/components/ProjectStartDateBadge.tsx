import { PlayCircle } from "lucide-react";
import { cn } from "../utils/cn";
import { formatDueDate } from "../utils/dates";

interface ProjectStartDateBadgeProps {
  startDate: string | null | undefined;
  className?: string;
}

export function ProjectStartDateBadge({
  startDate,
  className,
}: ProjectStartDateBadgeProps) {
  const hasDate = Boolean(startDate);
  const label = hasDate ? formatDueDate(startDate ?? null) : "No start date";
  const fullDate = hasDate
    ? new Date(startDate as string).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-start gap-2 rounded-xl border px-2.5 py-1.5",
        hasDate
          ? "border-[rgb(var(--border))] bg-black/[0.03] text-[rgb(var(--text))] dark:bg-white/[0.04]"
          : "border-[rgb(var(--border))] bg-black/[0.03] text-[rgb(var(--muted))] dark:bg-white/[0.04]",
        className
      )}
      title={fullDate ? `Started / assigned · ${fullDate}` : "No start date"}
    >
      <PlayCircle size={14} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide opacity-70">
          Start date
        </p>
        <p className="truncate text-xs font-semibold">{label}</p>
        {fullDate && label !== fullDate ? (
          <p className="mt-0.5 truncate text-[11px] opacity-70">{fullDate}</p>
        ) : null}
      </div>
    </div>
  );
}
