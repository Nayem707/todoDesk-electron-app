import {
  CalendarClock,
  CheckCircle2,
  Flame,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { AppMark } from "./TitleBar";
import { useTodos } from "../store/TodoProvider";
import type { AppView } from "../types/todo";
import { cn } from "../utils/cn";
import { isToday, isUpcoming } from "../utils/dates";

interface SidebarProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onCreate: () => void;
}

const NAV: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "all", label: "All Tasks", icon: ListTodo },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "high", label: "High Priority", icon: Flame },
];

export function Sidebar({ view, onViewChange, onCreate }: SidebarProps) {
  const { todos, stats } = useTodos();

  const counts: Partial<Record<AppView, number>> = {
    all: stats?.pending ?? 0,
    today: todos.filter((todo) => isToday(todo.dueDate) && !todo.completed).length,
    upcoming: todos.filter((todo) => isUpcoming(todo.dueDate) && !todo.completed).length,
    completed: stats?.completed ?? 0,
    high: stats?.highPriority ?? 0,
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--sidebar))]">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <AppMark className="h-8 w-8 rounded-lg" />
          <div>
            <p className="text-sm font-semibold leading-none">TodoDesk</p>
            <p className="mt-1 text-xs text-[rgb(var(--muted))]">Local tasks, always yours</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] transition hover:opacity-90"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                active
                  ? "bg-[rgb(var(--surface))] font-medium text-[rgb(var(--text))] shadow-sm"
                  : "text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/5"
              )}
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {typeof count === "number" && item.id !== "dashboard" && (
                <span className="rounded-full bg-black/5 px-1.5 text-[11px] tabular-nums dark:bg-white/10">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        {Boolean(stats?.overdue) && (
          <p className="mb-2 px-3 text-xs text-[rgb(var(--danger))]">
            {stats?.overdue} overdue {stats?.overdue === 1 ? "task" : "tasks"}
          </p>
        )}
        <button
          type="button"
          onClick={() => onViewChange("settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
            view === "settings"
              ? "bg-[rgb(var(--surface))] font-medium shadow-sm"
              : "text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/5"
          )}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </aside>
  );
}

