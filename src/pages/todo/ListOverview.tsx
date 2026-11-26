import { useMemo, type ReactNode } from "react";
import { StatCard } from "../../components/StatCard";
import { TodoList } from "../../components/TodoList";
import type { Todo } from "../../types/todo";
import { isOverdue, isToday } from "../../utils/dates";
import { matchesView, sortTodos } from "../../utils/todoFilters";

interface ListOverviewProps {
  todos: Todo[];
  loading: boolean;
  onCreate: () => void;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

function OverviewColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs tabular-nums text-[rgb(var(--muted))]">{count}</span>
      </div>
      {children}
    </section>
  );
}

export function ListOverview({
  todos,
  loading,
  onCreate,
  onToggle,
  onEdit,
  onDelete,
}: ListOverviewProps) {
  const stats = useMemo(
    () => ({
      total: todos.length,
      completed: todos.filter((todo) => todo.completed).length,
      pending: todos.filter((todo) => !todo.completed).length,
      overdue: todos.filter((todo) => isOverdue(todo.dueDate, todo.completed)).length,
      highPriority: todos.filter(
        (todo) => todo.priority === "high" && !todo.completed
      ).length,
      today: todos.filter((todo) => isToday(todo.dueDate) && !todo.completed).length,
    }),
    [todos]
  );

  const today = useMemo(
    () => todos.filter((todo) => matchesView(todo, "today")),
    [todos]
  );
  const upcoming = useMemo(
    () => todos.filter((todo) => matchesView(todo, "upcoming")),
    [todos]
  );
  const recent = useMemo(() => sortTodos(todos, "newest").slice(0, 5), [todos]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
            />
          ))}
        </div>
      </div>
    );
  }

  const emptyAction = (
    <button
      type="button"
      onClick={onCreate}
      className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
    >
      New Task
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total tasks" value={stats.total} />
        <StatCard label="Completed" value={stats.completed} tone="success" />
        <StatCard label="Pending" value={stats.pending} tone="accent" />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue ? "danger" : "default"}
        />
        <StatCard label="Due today" value={stats.today} />
        <StatCard
          label="High priority"
          value={stats.highPriority}
          tone={stats.highPriority ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <OverviewColumn title="Today" count={today.length}>
          <TodoList
            todos={today}
            emptyTitle="Nothing due today"
            emptyDescription="Tasks due today in this list will show up here."
            action={emptyAction}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </OverviewColumn>
        <OverviewColumn title="Upcoming" count={upcoming.length}>
          <TodoList
            todos={upcoming}
            emptyTitle="No upcoming tasks"
            emptyDescription="Incomplete tasks with a future due date appear here."
            action={emptyAction}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </OverviewColumn>
        <OverviewColumn title="Recently created" count={recent.length}>
          <TodoList
            todos={recent}
            emptyTitle="No tasks yet"
            emptyDescription="Create a task in this list to get started."
            action={emptyAction}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </OverviewColumn>
      </div>
    </div>
  );
}
