export type Priority = "low" | "medium" | "high";
export type ThemePreference = "light" | "dark" | "system";

export type TodoScreen = "projects" | "project" | "list";

export type TodoListFilter =
  | "overview"
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "high";

/** @deprecated Use TodoListFilter. */
export type TodoTab = TodoListFilter;

export type AppView =
  | "todo"
  | "clipboard"
  | "markdown"
  | "assistant"
  | "webAnalyze"
  | "quiz"
  | "settings";

export type FilterOption =
  | "all"
  | "completed"
  | "pending"
  | "high"
  | "medium"
  | "low"
  | "overdue";

export type SortOption = "newest" | "oldest" | "dueDate" | "priority" | "alphabetical";

export interface Project {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  listCount: number;
  taskCount: number;
  completedCount: number;
}

export interface ProjectInput {
  name: string;
  description?: string;
  startDate?: string | null;
  deadline?: string | null;
}

export interface TaskList {
  id: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string | null;
  deadline: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  completedCount: number;
}

export interface TaskListInput {
  name: string;
  description?: string;
  startDate?: string | null;
  deadline?: string | null;
}

export interface Todo {
  id: string;
  listId: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoInput {
  listId?: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  completed?: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  confirmBeforeDelete: boolean;
}

export interface DashboardStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  highPriority: number;
  today: number;
}

export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface TodoNavState {
  screen: TodoScreen;
  projectId: string | null;
  listId: string | null;
  filter: TodoListFilter;
}
