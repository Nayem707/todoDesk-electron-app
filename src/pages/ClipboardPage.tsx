import { useMemo, useState, type RefObject } from "react";
import { ClipboardFilterBar } from "../components/ClipboardFilterBar";
import { ClipboardItemCard } from "../components/ClipboardItemCard";
import { EmptyState } from "../components/EmptyState";
import { SearchBar } from "../components/SearchBar";
import { queryClipboardItems } from "../services/clipboardService";
import { useClipboard } from "../store/ClipboardProvider";
import type { ClipboardFilter, ClipboardSort } from "../types/clipboard";

interface ClipboardPageProps {
  searchRef: RefObject<HTMLInputElement | null>;
}

const SORT_LABELS: Record<ClipboardSort, string> = {
  lastCopiedDesc: "newest first",
  lastCopiedAsc: "oldest first",
  copyCountDesc: "most used first",
  copyCountAsc: "least used first",
};

export function ClipboardPage({ searchRef }: ClipboardPageProps) {
  const { items, loading, copyAgain, deleteItem, togglePin } = useClipboard();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClipboardFilter>("all");
  const [sort, setSort] = useState<ClipboardSort>("lastCopiedDesc");

  const visible = useMemo(
    () => queryClipboardItems(items, { search, filter, sort }),
    [items, search, filter, sort]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Clipboard</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          {loading
            ? "Loading clipboard history…"
            : `${visible.length} ${visible.length === 1 ? "item" : "items"} · ${SORT_LABELS[sort]}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchBar
          value={search}
          onChange={setSearch}
          inputRef={searchRef}
          placeholder="Search copied text"
        />
        <ClipboardFilterBar
          filter={filter}
          sort={sort}
          onFilterChange={setFilter}
          onSortChange={setSort}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            search || filter === "pinned"
              ? "No matching clipboard items"
              : "No clipboard history yet"
          }
          description={
            search
              ? "Try a different search, filter, or sort."
              : filter === "pinned"
                ? "Pin an item to see it here."
                : "Copy text anywhere on this computer and it will appear here."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <ClipboardItemCard
              key={item.id}
              item={item}
              onCopyAgain={(next) => void copyAgain(next.id)}
              onDelete={(next) => void deleteItem(next.id)}
              onTogglePin={(next) => void togglePin(next.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
