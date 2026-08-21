import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import type { Todo } from "../types/todo";
import { cn } from "../utils/cn";
import { formatDueDate, isOverdue } from "../utils/dates";
import { PriorityBadge } from "./PriorityBadge";

interface TodoCardProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoCard({ todo, onToggle, onEdit, onDelete }: TodoCardProps) {
  const overdue = isOverdue(todo.dueDate, todo.completed);

  return (
    <article
      className={cn(
        "group rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark",
        todo.completed && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <label className="mt-0.5 flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => onToggle(todo)}
            className="h-4 w-4 cursor-pointer accent-[rgb(var(--accent))]"
            aria-label={`Mark ${todo.title} as ${todo.completed ? "uncompleted" : "completed"}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={cn(
                "text-sm font-semibold leading-5",
                todo.completed && "text-[rgb(var(--muted))] line-through"
              )}
            >
              {todo.title}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(todo)}
                className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
                aria-label={`Edit ${todo.title}`}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(todo)}
                className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                aria-label={`Delete ${todo.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {todo.description && (
            <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--muted))]">
              {todo.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={todo.priority} />
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                overdue ? "text-[rgb(var(--danger))]" : "text-[rgb(var(--muted))]"
              )}
            >
              <CalendarDays size={12} />
              {formatDueDate(todo.dueDate)}
              {overdue ? " · Overdue" : ""}
            </span>
            {todo.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[rgb(var(--muted))] dark:bg-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
