export type Priority = "low" | "medium" | "high";
export type ThemePreference = "light" | "dark" | "system";
export type AppView =
  | "dashboard"
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "high"
  | "clipboard"
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

export interface Todo {
  id: string;
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
