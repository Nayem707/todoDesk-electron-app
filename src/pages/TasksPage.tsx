import { useMemo, useState, type RefObject } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Flame,
  LayoutDashboard,
  ListTodo,
  Plus,
  Sun,
} from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { SearchBar } from "../components/SearchBar";
import { Tabs, type TabItem } from "../components/Tabs";
import { TodoList } from "../components/TodoList";
import { useTodos } from "../store/TodoProvider";
import type {
  FilterOption,
  SortOption,
  Todo,
  TodoListFilter,
} from "../types/todo";
import { countForView, queryTodos } from "../utils/todoFilters";
import { ListOverview } from "./todo/ListOverview";

const LIST_TABS: {
  id: TodoListFilter;
  label: string;
  icon: TabItem["icon"];
}[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "all", label: "All Tasks", icon: ListTodo },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "high", label: "High Priority", icon: Flame },
];

const TITLES: Record<Exclude<TodoListFilter, "overview">, string> = {
  all: "All Tasks",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
  high: "High Priority",
};

interface TasksPageProps {
  listId: string;
  listName: string;
  projectName: string;
  filter: TodoListFilter;
  onFilterChange: (filter: TodoListFilter) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onCreate: () => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TasksPage({
  listId,
  listName,
  projectName,
  filter,
  onFilterChange,
  searchRef,
  onBack,
  onCreate,
  onEdit,
  onDelete,
}: TasksPageProps) {
  const { todos, loading, toggleTodo } = useTodos();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterOption>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const listTodos = useMemo(
    () => todos.filter((todo) => todo.listId === listId),
    [todos, listId]
  );

  const visible = useMemo(
    () =>
      queryTodos(listTodos, {
        search,
        filter: statusFilter,
        sort,
        view: filter,
      }),
    [listTodos, search, statusFilter, sort, filter]
  );

  const items: TabItem<TodoListFilter>[] = LIST_TABS.map((item) => ({
    ...item,
    count: countForView(listTodos, item.id),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
          >
            <ArrowLeft size={14} />
            {projectName}
          </button>
          <h1 className="truncate text-2xl font-semibold">{listName}</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            {loading
              ? "Loading tasks…"
              : filter === "overview"
                ? `${listTodos.length} task${listTodos.length === 1 ? "" : "s"} in this list`
                : `${visible.length} shown`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      <Tabs
        items={items}
        value={filter}
        onChange={onFilterChange}
        ariaLabel="Task list views"
      />

      {filter === "overview" ? (
        <ListOverview
          todos={listTodos}
          loading={loading}
          onCreate={onCreate}
          onToggle={(todo) => void toggleTodo(todo.id)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar value={search} onChange={setSearch} inputRef={searchRef} />
            <FilterBar
              filter={statusFilter}
              sort={sort}
              onFilterChange={setStatusFilter}
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
              emptyTitle={search ? "No matching tasks" : `No ${TITLES[filter].toLowerCase()}`}
              emptyDescription={
                search
                  ? "Try a different search, filter, or sort."
                  : "Create a task in this list to get started."
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
        </>
      )}
    </div>
  );
}
