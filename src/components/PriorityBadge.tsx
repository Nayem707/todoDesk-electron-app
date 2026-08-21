import type { Priority } from "../types/todo";
import { cn } from "../utils/cn";

const styles: Record<Priority, string> = {
  high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        styles[priority]
      )}
    >
      {priority}
    </span>
  );
}
