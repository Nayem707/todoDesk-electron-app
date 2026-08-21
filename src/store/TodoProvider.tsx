import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { todoService } from "../services/todoService";
import type { DashboardStats, Todo, TodoInput } from "../types/todo";
import { getErrorMessage } from "../utils/errors";

interface TodoContextValue {
  todos: Todo[];
  stats: DashboardStats | null;
  loading: boolean;
  refreshing: boolean;
  createTodo: (input: TodoInput) => Promise<Todo | null>;
  updateTodo: (id: string, input: Partial<TodoInput>) => Promise<Todo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  toggleTodo: (id: string) => Promise<void>;
  clearCompleted: () => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const emptyStats: DashboardStats = {
  total: 0,
  completed: 0,
  pending: 0,
  overdue: 0,
  highPriority: 0,
  today: 0,
};

const TodoContext = createContext<TodoContextValue | null>(null);

export function TodoProvider({ children }: { children: ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextTodos, nextStats] = await Promise.all([
        todoService.getAll(),
        todoService.getStats(),
      ]);
      setTodos(nextTodos);
      setStats(nextStats);
    } catch (error) {
      console.error("[todos] refresh failed", error);
      toast.error(getErrorMessage(error, "Could not load tasks."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTodo = useCallback(async (input: TodoInput) => {
    try {
      const created = await todoService.create(input);
      await refresh();
      toast.success("Task created");
      return created;
    } catch (error) {
      console.error("[todos] create failed", error);
      toast.error(getErrorMessage(error, "Could not create task."));
      return null;
    }
  }, [refresh]);

  const updateTodo = useCallback(async (id: string, input: Partial<TodoInput>) => {
    try {
      const updated = await todoService.update(id, input);
      await refresh();
      toast.success("Task updated");
      return updated;
    } catch (error) {
      console.error("[todos] update failed", error);
      toast.error(getErrorMessage(error, "Could not update task."));
      return null;
    }
  }, [refresh]);

  const deleteTodo = useCallback(async (id: string) => {
    try {
      await todoService.remove(id);
      await refresh();
      toast.success("Task deleted");
      return true;
    } catch (error) {
      console.error("[todos] delete failed", error);
      toast.error(getErrorMessage(error, "Could not delete task."));
      return false;
    }
  }, [refresh]);

  const toggleTodo = useCallback(async (id: string) => {
    try {
      await todoService.toggle(id);
      await refresh();
    } catch (error) {
      console.error("[todos] toggle failed", error);
      toast.error(getErrorMessage(error, "Could not update task status."));
    }
  }, [refresh]);

  const clearCompleted = useCallback(async () => {
    try {
      await todoService.clearCompleted();
      await refresh();
      toast.success("Completed tasks cleared");
      return true;
    } catch (error) {
      console.error("[todos] clear completed failed", error);
      toast.error(getErrorMessage(error, "Could not clear completed tasks."));
      return false;
    }
  }, [refresh]);

  const clearAll = useCallback(async () => {
    try {
      await todoService.clearAll();
      await refresh();
      toast.success("All tasks cleared");
      return true;
    } catch (error) {
      console.error("[todos] clear all failed", error);
      toast.error(getErrorMessage(error, "Could not clear tasks."));
      return false;
    }
  }, [refresh]);

  const value = useMemo(
    () => ({
      todos,
      stats: stats ?? emptyStats,
      loading,
      refreshing,
      createTodo,
      updateTodo,
      deleteTodo,
      toggleTodo,
      clearCompleted,
      clearAll,
      refresh,
    }),
    [
      todos,
      stats,
      loading,
      refreshing,
      createTodo,
      updateTodo,
      deleteTodo,
      toggleTodo,
      clearCompleted,
      clearAll,
      refresh,
    ]
  );

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>;
}

export function useTodos() {
  const context = useContext(TodoContext);
  if (!context) {
    throw new Error("useTodos must be used within TodoProvider");
  }
  return context;
}
