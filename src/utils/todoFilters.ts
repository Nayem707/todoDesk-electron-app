import type { FilterOption, SortOption, Todo } from "../types/todo";
import { isOverdue, isToday, isUpcoming } from "./dates";

const PRIORITY_RANK: Record<Todo["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function matchesSearch(todo: Todo, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const inTitle = todo.title.toLowerCase().includes(query);
  const inDescription = todo.description.toLowerCase().includes(query);
  const inTags = todo.tags.some((tag) => tag.toLowerCase().includes(query));
  return inTitle || inDescription || inTags;
}

export function matchesFilter(todo: Todo, filter: FilterOption) {
  switch (filter) {
    case "completed":
      return todo.completed;
    case "pending":
      return !todo.completed;
    case "high":
      return todo.priority === "high";
    case "medium":
      return todo.priority === "medium";
    case "low":
      return todo.priority === "low";
    case "overdue":
      return isOverdue(todo.dueDate, todo.completed);
    default:
      return true;
  }
}

export function matchesView(todo: Todo, view: string) {
  switch (view) {
    case "today":
      return isToday(todo.dueDate) && !todo.completed;
    case "upcoming":
      return isUpcoming(todo.dueDate) && !todo.completed;
    case "completed":
      return todo.completed;
    case "high":
      return todo.priority === "high" && !todo.completed;
    default:
      return true;
  }
}

export function sortTodos(todos: Todo[], sortBy: SortOption) {
  const copy = [...todos];
  copy.sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "dueDate": {
        if (!a.dueDate && !b.dueDate) {
          return 0;
        }
        if (!a.dueDate) {
          return 1;
        }
        if (!b.dueDate) {
          return -1;
        }
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      case "priority":
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case "alphabetical":
        return a.title.localeCompare(b.title);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
  return copy;
}

export function queryTodos(
  todos: Todo[],
  options: { search: string; filter: FilterOption; sort: SortOption; view?: string }
) {
  return sortTodos(
    todos.filter(
      (todo) =>
        matchesView(todo, options.view ?? "all") &&
        matchesSearch(todo, options.search) &&
        matchesFilter(todo, options.filter)
    ),
    options.sort
  );
}
