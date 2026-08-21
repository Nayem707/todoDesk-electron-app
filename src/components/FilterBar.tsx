import type { FilterOption, SortOption } from "../types/todo";

const FILTERS: { id: FilterOption; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "high", label: "High Priority" },
  { id: "medium", label: "Medium Priority" },
  { id: "low", label: "Low Priority" },
  { id: "overdue", label: "Overdue" },
];

const SORTS: { id: SortOption; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "dueDate", label: "Due Date" },
  { id: "priority", label: "Priority" },
  { id: "alphabetical", label: "Alphabetical" },
];

interface FilterBarProps {
  filter: FilterOption;
  sort: SortOption;
  onFilterChange: (value: FilterOption) => void;
  onSortChange: (value: SortOption) => void;
}

export function FilterBar({ filter, sort, onFilterChange, onSortChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filter}
        onChange={(event) => onFilterChange(event.target.value as FilterOption)}
        className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        aria-label="Filter tasks"
      >
        {FILTERS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortOption)}
        className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        aria-label="Sort tasks"
      >
        {SORTS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
