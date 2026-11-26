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
import { todoNav } from "./todoNav";
import type {
  DashboardStats,
  Project,
  ProjectInput,
  TaskList,
  TaskListInput,
  Todo,
  TodoInput,
} from "../types/todo";
import { getErrorMessage } from "../utils/errors";

interface TodoContextValue {
  projects: Project[];
  lists: TaskList[];
  todos: Todo[];
  stats: DashboardStats | null;
  loading: boolean;
  refreshing: boolean;
  activeProjectId: string | null;
  activeListId: string | null;
  setActiveProjectId: (id: string | null) => void;
  setActiveListId: (id: string | null) => void;
  createProject: (input: ProjectInput) => Promise<Project | null>;
  updateProject: (id: string, input: Partial<ProjectInput>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  createTaskList: (projectId: string, input: TaskListInput) => Promise<TaskList | null>;
  updateTaskList: (id: string, input: Partial<TaskListInput>) => Promise<TaskList | null>;
  deleteTaskList: (id: string) => Promise<boolean>;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    todoNav.projectId
  );
  const [activeListId, setActiveListId] = useState<string | null>(todoNav.listId);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextProjects, nextTodos, nextStats] = await Promise.all([
        todoService.getProjects(),
        todoService.getAll(),
        todoService.getStats(),
      ]);
      setProjects(nextProjects);
      setTodos(nextTodos);
      setStats(nextStats);

      let nextLists: TaskList[] = [];
      if (activeProjectId) {
        const stillExists = nextProjects.some((project) => project.id === activeProjectId);
        if (stillExists) {
          nextLists = await todoService.getTaskLists(activeProjectId);
        } else {
          setActiveProjectId(null);
          setActiveListId(null);
        }
      }
      setLists(nextLists);

      if (activeListId && !nextLists.some((list) => list.id === activeListId)) {
        setActiveListId(null);
      }
    } catch (error) {
      console.error("[todos] refresh failed", error);
      toast.error(getErrorMessage(error, "Could not load tasks."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeListId, activeProjectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (input: ProjectInput) => {
      try {
        const created = await todoService.createProject(input);
        await refresh();
        toast.success("Project created");
        return created;
      } catch (error) {
        console.error("[todos] create project failed", error);
        toast.error(getErrorMessage(error, "Could not create project."));
        return null;
      }
    },
    [refresh]
  );

  const updateProject = useCallback(
    async (id: string, input: Partial<ProjectInput>) => {
      try {
        const updated = await todoService.updateProject(id, input);
        await refresh();
        toast.success("Project updated");
        return updated;
      } catch (error) {
        console.error("[todos] update project failed", error);
        toast.error(getErrorMessage(error, "Could not update project."));
        return null;
      }
    },
    [refresh]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      try {
        await todoService.deleteProject(id);
        if (activeProjectId === id) {
          setActiveProjectId(null);
          setActiveListId(null);
        }
        await refresh();
        toast.success("Project deleted");
        return true;
      } catch (error) {
        console.error("[todos] delete project failed", error);
        toast.error(getErrorMessage(error, "Could not delete project."));
        return false;
      }
    },
    [activeProjectId, refresh]
  );

  const createTaskList = useCallback(
    async (projectId: string, input: TaskListInput) => {
      try {
        const created = await todoService.createTaskList(projectId, input);
        await refresh();
        toast.success("Task list created");
        return created;
      } catch (error) {
        console.error("[todos] create list failed", error);
        toast.error(getErrorMessage(error, "Could not create task list."));
        return null;
      }
    },
    [refresh]
  );

  const updateTaskList = useCallback(
    async (id: string, input: Partial<TaskListInput>) => {
      try {
        const updated = await todoService.updateTaskList(id, input);
        await refresh();
        toast.success("Task list renamed");
        return updated;
      } catch (error) {
        console.error("[todos] update list failed", error);
        toast.error(getErrorMessage(error, "Could not rename task list."));
        return null;
      }
    },
    [refresh]
  );

  const deleteTaskList = useCallback(
    async (id: string) => {
      try {
        await todoService.deleteTaskList(id);
        if (activeListId === id) {
          setActiveListId(null);
        }
        await refresh();
        toast.success("Task list deleted");
        return true;
      } catch (error) {
        console.error("[todos] delete list failed", error);
        toast.error(getErrorMessage(error, "Could not delete task list."));
        return false;
      }
    },
    [activeListId, refresh]
  );

  const createTodo = useCallback(
    async (input: TodoInput) => {
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
    },
    [refresh]
  );

  const updateTodo = useCallback(
    async (id: string, input: Partial<TodoInput>) => {
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
    },
    [refresh]
  );

  const deleteTodo = useCallback(
    async (id: string) => {
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
    },
    [refresh]
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      try {
        await todoService.toggle(id);
        await refresh();
      } catch (error) {
        console.error("[todos] toggle failed", error);
        toast.error(getErrorMessage(error, "Could not update task status."));
      }
    },
    [refresh]
  );

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
      projects,
      lists,
      todos,
      stats: stats ?? emptyStats,
      loading,
      refreshing,
      activeProjectId,
      activeListId,
      setActiveProjectId,
      setActiveListId,
      createProject,
      updateProject,
      deleteProject,
      createTaskList,
      updateTaskList,
      deleteTaskList,
      createTodo,
      updateTodo,
      deleteTodo,
      toggleTodo,
      clearCompleted,
      clearAll,
      refresh,
    }),
    [
      projects,
      lists,
      todos,
      stats,
      loading,
      refreshing,
      activeProjectId,
      activeListId,
      createProject,
      updateProject,
      deleteProject,
      createTaskList,
      updateTaskList,
      deleteTaskList,
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
