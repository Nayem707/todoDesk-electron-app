import type { TodoInput } from "../types/todo";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.todoAPI) {
    throw new Error("Todo API is unavailable. Restart the application.");
  }
  return window.todoAPI;
}

export const todoService = {
  getAll: () => unwrap(api().getTodos()),
  getById: (id: string) => unwrap(api().getTodo(id)),
  create: (todo: TodoInput) => unwrap(api().createTodo(todo)),
  update: (id: string, todo: Partial<TodoInput>) => unwrap(api().updateTodo(id, todo)),
  remove: (id: string) => unwrap(api().deleteTodo(id)),
  toggle: (id: string) => unwrap(api().toggleTodo(id)),
  clearCompleted: () => unwrap(api().clearCompleted()),
  clearAll: () => unwrap(api().clearAll()),
  getStats: () => unwrap(api().getStats()),
};
