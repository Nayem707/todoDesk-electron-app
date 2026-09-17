import type { RefObject } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Flame,
  LayoutDashboard,
  ListTodo,
  Sun,
} from "lucide-react";
import { Tabs, type TabItem } from "../components/Tabs";
import { DashboardPage } from "./DashboardPage";
import { TasksPage } from "./TasksPage";
import { useTodos } from "../store/TodoProvider";
import type { Todo, TodoTab } from "../types/todo";
import { isToday, isUpcoming } from "../utils/dates";

const TODO_TABS: { id: TodoTab; label: string; icon: TabItem["icon"] }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "all", label: "All Tasks", icon: ListTodo },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "high", label: "High Priority", icon: Flame },
];

interface TodoPageProps {
  tab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onCreate: () => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoPage({
  tab,
  onTabChange,
  searchRef,
  onCreate,
  onEdit,
  onDelete,
}: TodoPageProps) {
  const { todos, stats } = useTodos();

  const counts: Partial<Record<TodoTab, number>> = {
    all: stats?.pending ?? 0,
    today: todos.filter((todo) => isToday(todo.dueDate) && !todo.completed).length,
    upcoming: todos.filter((todo) => isUpcoming(todo.dueDate) && !todo.completed).length,
    completed: stats?.completed ?? 0,
    high: stats?.highPriority ?? 0,
  };

  const items: TabItem<TodoTab>[] = TODO_TABS.map((item) => ({
    ...item,
    count: counts[item.id],
  }));

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[rgb(var(--bg))] px-6 pt-4">
        <Tabs
          items={items}
          value={tab}
          onChange={onTabChange}
          ariaLabel="Todo views"
        />
      </div>
      {tab === "dashboard" ? (
        <DashboardPage onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        <TasksPage
          view={tab}
          searchRef={searchRef}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
