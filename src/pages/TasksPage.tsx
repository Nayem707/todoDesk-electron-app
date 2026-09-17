import { useMemo, useState, type RefObject } from "react";
import { Plus } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { SearchBar } from "../components/SearchBar";
import { TodoList } from "../components/TodoList";
import { useTodos } from "../store/TodoProvider";
import type { FilterOption, SortOption, Todo, TodoTab } from "../types/todo";
import { queryTodos } from "../utils/todoFilters";

const TITLES: Record<Exclude<TodoTab, "dashboard">, string> = {
  all: "All Tasks",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
  high: "High Priority",
};

interface TasksPageProps {
  view: Exclude<TodoTab, "dashboard">;
  searchRef: RefObject<HTMLInputElement | null>;
  onCreate: () => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TasksPage({
  view,
  searchRef,
  onCreate,
  onEdit,
  onDelete,
}: TasksPageProps) {
  const { todos, loading, toggleTodo } = useTodos();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const visible = useMemo(
    () => queryTodos(todos, { search, filter, sort, view }),
    [todos, search, filter, sort, view]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{TITLES[view]}</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            {loading ? "Loading tasks…" : `${visible.length} shown`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} inputRef={searchRef} />
        <FilterBar
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
      ) : (
        <TodoList
          todos={visible}
          emptyTitle={search ? "No matching tasks" : "No tasks here"}
          emptyDescription={
            search
              ? "Try a different search, filter, or sort."
              : "Create a task or switch views from the tabs."
          }
          action={
            <button
              type="button"
              onClick={onCreate}
              className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
            >
              New Task
            </button>
          }
          onToggle={(todo) => void toggleTodo(todo.id)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
