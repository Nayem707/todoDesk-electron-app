const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function isToday(value: string | null) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  const today = startOfDay();
  return date >= today && date <= endOfDay();
}

export function isUpcoming(value: string | null) {
  if (!value) {
    return false;
  }
  return new Date(value) > endOfDay();
}

export function isOverdue(value: string | null, completed = false) {
  if (!value || completed) {
    return false;
  }
  return new Date(value) < new Date();
}

export function formatDueDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const target = startOfDay(date);

  if (target.getTime() === today.getTime()) {
    return "Today";
  }
  if (target.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  }
  if (target.getTime() === today.getTime() - DAY_MS) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(value: string) {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day, 18, 0, 0, 0).toISOString();
}
