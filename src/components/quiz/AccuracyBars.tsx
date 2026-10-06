import { accuracyBar, accuracyTone } from "../../utils/quizFormat";
import { cn } from "../../utils/cn";

export interface AccuracyRow {
  label: string;
  accuracy: number;
  detail: string;
}

/** Labelled horizontal bars for accuracy per topic, concept or difficulty. */
export function AccuracyBars({ rows, emptyText }: { rows: AccuracyRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[rgb(var(--muted))]">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 text-xs text-[rgb(var(--muted))]">
              {row.detail} · <span className={cn("font-semibold tabular-nums", accuracyTone(row.accuracy))}>{row.accuracy}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className={cn("h-full rounded-full", accuracyBar(row.accuracy))} style={{ width: `${Math.max(2, row.accuracy)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
