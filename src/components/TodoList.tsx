import type { ReactNode } from "react";
import type { Todo } from "../types/todo";
import { EmptyState } from "./EmptyState";
import { TodoCard } from "./TodoCard";

interface TodoListProps {
  todos: Todo[];
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoList({
  todos,
  emptyTitle,
  emptyDescription,
  action,
  onToggle,
  onEdit,
  onDelete,
}: TodoListProps) {
  if (todos.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={action} />
    );
  }

  return (
    <div className="space-y-3">
      {todos.map((todo) => (
        <TodoCard
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
