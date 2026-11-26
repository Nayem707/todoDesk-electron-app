import type { ProjectInput, TaskListInput, TodoInput } from "../types/todo";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.todoAPI) {
    throw new Error("Todo API is unavailable. Restart the application.");
  }
  return window.todoAPI;
}

export const todoService = {
  getProjects: () => unwrap(api().getProjects()),
  getProject: (id: string) => unwrap(api().getProject(id)),
  createProject: (input: ProjectInput) => unwrap(api().createProject(input)),
  updateProject: (id: string, input: Partial<ProjectInput>) =>
    unwrap(api().updateProject(id, input)),
  deleteProject: (id: string) => unwrap(api().deleteProject(id)),

  getTaskLists: (projectId: string) => unwrap(api().getTaskLists(projectId)),
  getTaskList: (id: string) => unwrap(api().getTaskList(id)),
  createTaskList: (projectId: string, input: TaskListInput) =>
    unwrap(api().createTaskList(projectId, input)),
  updateTaskList: (id: string, input: Partial<TaskListInput>) =>
    unwrap(api().updateTaskList(id, input)),
  deleteTaskList: (id: string) => unwrap(api().deleteTaskList(id)),

  getAll: () => unwrap(api().getTodos()),
  getByList: (listId: string) => unwrap(api().getTodosByList(listId)),
  getById: (id: string) => unwrap(api().getTodo(id)),
  create: (todo: TodoInput) => unwrap(api().createTodo(todo)),
  update: (id: string, todo: Partial<TodoInput>) => unwrap(api().updateTodo(id, todo)),
  remove: (id: string) => unwrap(api().deleteTodo(id)),
  toggle: (id: string) => unwrap(api().toggleTodo(id)),
  clearCompleted: () => unwrap(api().clearCompleted()),
  clearAll: () => unwrap(api().clearAll()),
  getStats: () => unwrap(api().getStats()),
  getStatsByList: (listId: string) => unwrap(api().getStatsByList(listId)),
};
