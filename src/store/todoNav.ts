import type { TodoListFilter, TodoNavState } from "../types/todo";

/** Remembered across sidebar switches so returning to Todo restores context. */
export const todoNav: TodoNavState = {
  screen: "projects",
  projectId: null,
  listId: null,
  filter: "overview",
};

export function setTodoNav(patch: Partial<TodoNavState>) {
  Object.assign(todoNav, patch);
}

export function setTodoFilter(filter: TodoListFilter) {
  todoNav.filter = filter;
}
