import { useMemo, useState, type RefObject } from "react";
import { ClipboardItemCard } from "../components/ClipboardItemCard";
import { EmptyState } from "../components/EmptyState";
import { SearchBar } from "../components/SearchBar";
import { filterClipboardItems } from "../services/clipboardService";
import { useClipboard } from "../store/ClipboardProvider";

interface ClipboardPageProps {
  searchRef: RefObject<HTMLInputElement | null>;
}

export function ClipboardPage({ searchRef }: ClipboardPageProps) {
  const { items, loading, copyAgain, deleteItem, togglePin } = useClipboard();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => filterClipboardItems(items, search), [items, search]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Clipboard</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          {loading
            ? "Loading clipboard history…"
            : `${visible.length} ${visible.length === 1 ? "item" : "items"} · most used first`}
        </p>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        inputRef={searchRef}
        placeholder="Search copied text"
      />

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
          title={search ? "No matching clipboard items" : "No clipboard history yet"}
          description={
            search
              ? "Try a different search. Sorting and usage counts stay the same."
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
