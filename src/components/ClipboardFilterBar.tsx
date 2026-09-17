import type { ClipboardFilter, ClipboardSort } from "../types/clipboard";
import { cn } from "../utils/cn";

const FILTERS: { id: ClipboardFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pinned", label: "Pin" },
];

const SORTS: { id: ClipboardSort; label: string }[] = [
  { id: "lastCopiedDesc", label: "Last Copied ↓" },
  { id: "lastCopiedAsc", label: "Last Copied ↑" },
  { id: "copyCountDesc", label: "Copy Count ↓" },
  { id: "copyCountAsc", label: "Copy Count ↑" },
];

interface ClipboardFilterBarProps {
  filter: ClipboardFilter;
  sort: ClipboardSort;
  onFilterChange: (value: ClipboardFilter) => void;
  onSortChange: (value: ClipboardSort) => void;
}

export function ClipboardFilterBar({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: ClipboardFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Clipboard filter"
        className="flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5"
      >
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                active
                  ? "bg-[rgb(var(--accent))] font-medium text-[rgb(var(--accent-foreground))]"
                  : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
        <span className="sr-only">Sort clipboard items</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as ClipboardSort)}
          className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--text))] outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          aria-label="Sort clipboard items"
        >
          {SORTS.map((item) => (
            <option key={item.id} value={item.id}>
              Sort: {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
