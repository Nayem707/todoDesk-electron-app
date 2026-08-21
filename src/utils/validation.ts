import type { TodoInput } from "../types/todo";

export interface FieldErrors {
  title?: string;
  description?: string;
  tags?: string;
}

export function validateTodoForm(input: TodoInput): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();

  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > 200) {
    errors.title = "Title must be 200 characters or fewer.";
  }

  if (input.description.trim().length > 2000) {
    errors.description = "Description must be 2,000 characters or fewer.";
  }

  if (input.tags.length > 10) {
    errors.tags = "You can add up to 10 tags.";
  }

  return errors;
}
