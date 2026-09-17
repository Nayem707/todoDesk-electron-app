import { Pin, PinOff, Trash2 } from "lucide-react";
import type { ClipboardItem } from "../types/clipboard";
import { previewClipboardContent } from "../services/clipboardService";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";

interface ClipboardItemCardProps {
  item: ClipboardItem;
  onCopyAgain: (item: ClipboardItem) => void;
  onDelete: (item: ClipboardItem) => void;
  onTogglePin: (item: ClipboardItem) => void;
}

export function ClipboardItemCard({
  item,
  onCopyAgain,
  onDelete,
  onTogglePin,
}: ClipboardItemCardProps) {
  const preview = previewClipboardContent(item.content);

  const copyAgain = () => {
    const selection = window.getSelection()?.toString();
    if (selection) {
      return;
    }
    onCopyAgain(item);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={copyAgain}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCopyAgain(item);
        }
      }}
      title="Click to copy"
      className={cn(
        "group cursor-pointer rounded-2xl border bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark",
        item.isPinned
          ? "border-[rgb(var(--accent))]/35"
          : "border-[rgb(var(--border))]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className="select-text break-all font-mono text-sm leading-5"
              title={item.content.length > 500 ? `${item.content.slice(0, 500)}…` : item.content}
            >
              {preview}
            </p>
            <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold tabular-nums dark:bg-white/10">
              ×{item.copyCount}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-[rgb(var(--accent))]">
                <Pin size={11} />
                Pinned
              </span>
            )}
            <span>Last copied {formatDateTime(item.lastCopiedAt)}</span>
            {item.content.length > 280 && (
              <span>{item.content.length.toLocaleString()} characters</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(item);
            }}
            className={cn(
              "rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/10",
              item.isPinned
                ? "text-[rgb(var(--accent))]"
                : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
            )}
            aria-label={item.isPinned ? "Unpin" : "Pin"}
            title={item.isPinned ? "Unpin" : "Pin"}
          >
            {item.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item);
            }}
            className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
            aria-label="Delete clipboard item"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
