import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { StatCard } from "../components/StatCard";
import { TodoList } from "../components/TodoList";
import { useTodos } from "../store/TodoProvider";
import type { Todo } from "../types/todo";
import { isToday, isUpcoming } from "../utils/dates";
import { sortTodos } from "../utils/todoFilters";

interface DashboardPageProps {
  onCreate: () => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function DashboardPage({
  onCreate,
  onEdit,
  onDelete,
}: DashboardPageProps) {
  const { todos, stats, loading, toggleTodo } = useTodos();

  const today = todos.filter(
    (todo) => isToday(todo.dueDate) && !todo.completed,
  );
  const upcoming = sortTodos(
    todos.filter((todo) => isUpcoming(todo.dueDate) && !todo.completed),
    "dueDate",
  ).slice(0, 5);
  const recent = sortTodos(todos, "newest").slice(0, 5);

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            A snapshot of what needs attention today.
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total tasks" value={stats?.total ?? 0} />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          tone="success"
        />
        <StatCard label="Pending" value={stats?.pending ?? 0} tone="accent" />
        <StatCard label="Overdue" value={stats?.overdue ?? 0} tone="danger" />
        <StatCard
          label="High priority"
          value={stats?.highPriority ?? 0}
          tone="warning"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <DashboardColumn title="Today" count={today.length}>
          <TodoList
            todos={today}
            emptyTitle="Nothing due today"
            emptyDescription="Add a due date or enjoy the breathing room."
            onToggle={(todo) => void toggleTodo(todo.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </DashboardColumn>
        <DashboardColumn title="Upcoming" count={upcoming.length}>
          <TodoList
            todos={upcoming}
            emptyTitle="No upcoming tasks"
            emptyDescription="Future due dates will appear here."
            onToggle={(todo) => void toggleTodo(todo.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </DashboardColumn>
        <DashboardColumn title="Recently created" count={recent.length}>
          <TodoList
            todos={recent}
            emptyTitle="No tasks yet"
            emptyDescription="Create your first task to get started."
            action={
              <button
                type="button"
                onClick={onCreate}
                className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
              >
                Create a task
              </button>
            }
            onToggle={(todo) => void toggleTodo(todo.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </DashboardColumn>
      </section>
    </div>
  );
}

function DashboardColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-[rgb(var(--muted))]">{count}</span>
      </div>
      {children}
    </section>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-40 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
          />
        ))}
      </div>
    </div>
  );
}
