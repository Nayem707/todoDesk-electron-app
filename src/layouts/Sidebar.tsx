import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Flame,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { AppMark } from "./TitleBar";
import { useClipboard } from "../store/ClipboardProvider";
import { useTodos } from "../store/TodoProvider";
import type { AppView } from "../types/todo";
import { cn } from "../utils/cn";
import { isToday, isUpcoming } from "../utils/dates";

interface SidebarProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onCreate: () => void;
}

const TASK_NAV: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "all", label: "All Tasks", icon: ListTodo },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "high", label: "High Priority", icon: Flame },
];

const TOOL_NAV: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "clipboard", label: "Clipboard", icon: ClipboardList },
];

export function Sidebar({ view, onViewChange, onCreate }: SidebarProps) {
  const { todos, stats } = useTodos();
  const { items: clipboardItems } = useClipboard();

  const counts: Partial<Record<AppView, number>> = {
    all: stats?.pending ?? 0,
    today: todos.filter((todo) => isToday(todo.dueDate) && !todo.completed).length,
    upcoming: todos.filter((todo) => isUpcoming(todo.dueDate) && !todo.completed).length,
    completed: stats?.completed ?? 0,
    high: stats?.highPriority ?? 0,
    clipboard: clipboardItems.length,
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
        {TASK_NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={view === item.id}
            count={counts[item.id]}
            onClick={() => onViewChange(item.id)}
          />
        ))}
        <div className="py-2">
          {TOOL_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              count={counts[item.id]}
              onClick={() => onViewChange(item.id)}
            />
          ))}
        </div>
      </nav>

      <div className="px-3 pb-4">
        {Boolean(stats?.overdue) && (
          <p className="mb-2 px-3 text-xs text-[rgb(var(--danger))]">
            {stats?.overdue} overdue {stats?.overdue === 1 ? "task" : "tasks"}
          </p>
        )}
        <NavButton
          item={{ id: "settings", label: "Settings", icon: Settings }}
          active={view === "settings"}
          onClick={() => onViewChange("settings")}
        />
      </div>
    </aside>
  );
}

function NavButton({
  item,
  active,
  count,
  onClick,
}: {
  item: { id: AppView; label: string; icon: typeof LayoutDashboard };
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
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
}

