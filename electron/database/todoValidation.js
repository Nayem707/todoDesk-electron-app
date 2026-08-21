const PRIORITIES = new Set(["low", "medium", "high"]);
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const TAG_MAX = 30;
const TAG_LIMIT = 10;

function asString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const unique = [];
  const seen = new Set();
  for (const tag of tags) {
    const normalized = asString(tag).trim().slice(0, TAG_MAX);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= TAG_LIMIT) {
      break;
    }
  }
  return unique;
}

function normalizeDueDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Due date is invalid.");
  }
  return date.toISOString();
}

export function validateTodoInput(input = {}, { requireTitle = true } = {}) {
  const title = asString(input.title).trim();
  const description = asString(input.description).trim();
  const priority = asString(input.priority || "medium").toLowerCase();

  if (requireTitle && !title) {
    throw new Error("Title is required.");
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`Title must be ${TITLE_MAX} characters or fewer.`);
  }
  if (description.length > DESCRIPTION_MAX) {
    throw new Error(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
  }
  if (!PRIORITIES.has(priority)) {
    throw new Error("Priority must be low, medium, or high.");
  }

  return {
    title,
    description,
    priority,
    dueDate: normalizeDueDate(input.dueDate),
    tags: normalizeTags(input.tags),
    completed: Boolean(input.completed),
  };
}
