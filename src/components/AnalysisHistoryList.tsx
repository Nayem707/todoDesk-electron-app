import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { formatDateTime } from "../utils/dates";
import { EmptyState } from "./EmptyState";

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  status: "completed" | "failed";
  errorCode: string | null;
  createdAt: string;
}

interface AnalysisHistoryListProps<T extends HistoryItem> {
  items: T[];
  loading: boolean;
  onOpen: (item: T) => void;
  onDelete: (item: T) => void;
  renderBadge: (item: T) => ReactNode;
  failedLabel: (item: T) => string;
  emptyTitle: string;
  emptyDescription: string;
  deleteLabel: string;
}

export function hostOf(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

/** Saved runs of a Web Analyze tool, newest first. */
export function AnalysisHistoryList<T extends HistoryItem>({
  items,
  loading,
  onOpen,
  onDelete,
  renderBadge,
  failedLabel,
  emptyTitle,
  emptyDescription,
  deleteLabel,
}: AnalysisHistoryListProps<T>) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(item);
            }
          }}
          className="cursor-pointer rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-5">{item.title || hostOf(item.url)}</h3>
              <p className="mt-0.5 truncate text-xs text-[rgb(var(--muted))]">{item.url}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
                {item.status === "completed" ? (
                  renderBadge(item)
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                    {failedLabel(item)}
                  </span>
                )}
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
              className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
              aria-label={deleteLabel}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
