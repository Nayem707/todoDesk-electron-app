import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";
import { validateTodoInput } from "./todoValidation.js";

function nowIso() {
  return new Date().toISOString();
}

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    completed: Boolean(row.completed),
    priority: row.priority,
    dueDate: row.dueDate || null,
    tags: parseTags(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

function run(sql, params = []) {
  getDb().run(sql, params);
  schedulePersist();
}

export function getAllTodos() {
  return queryAll("SELECT * FROM todos ORDER BY createdAt DESC").map(mapRow);
}

export function getTodoById(id) {
  const row = queryOne("SELECT * FROM todos WHERE id = ?", [id]);
  return row ? mapRow(row) : null;
}

export function createTodo(input) {
  const payload = validateTodoInput(input, { requireTitle: true });
  const timestamp = nowIso();
  const todo = {
    id: crypto.randomUUID(),
    title: payload.title,
    description: payload.description,
    completed: false,
    priority: payload.priority,
    dueDate: payload.dueDate,
    tags: payload.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  run(
    `INSERT INTO todos
      (id, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.title,
      todo.description,
      0,
      todo.priority,
      todo.dueDate,
      JSON.stringify(todo.tags),
      todo.createdAt,
      todo.updatedAt,
    ]
  );

  return todo;
}

export function updateTodo(id, input) {
  const existing = getTodoById(id);
  if (!existing) {
    throw new Error("Todo not found.");
  }

  const payload = validateTodoInput(
    {
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      priority: input.priority ?? existing.priority,
      dueDate: input.dueDate === undefined ? existing.dueDate : input.dueDate,
      tags: input.tags ?? existing.tags,
      completed: input.completed ?? existing.completed,
    },
    { requireTitle: true }
  );

  const updated = {
    ...existing,
    ...payload,
    updatedAt: nowIso(),
  };

  run(
    `UPDATE todos
     SET title = ?, description = ?, completed = ?, priority = ?, dueDate = ?, tags = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.title,
      updated.description,
      updated.completed ? 1 : 0,
      updated.priority,
      updated.dueDate,
      JSON.stringify(updated.tags),
      updated.updatedAt,
      id,
    ]
  );

  return getTodoById(id);
}

export function deleteTodo(id) {
  const existing = getTodoById(id);
  if (!existing) {
    throw new Error("Todo not found.");
  }
  run("DELETE FROM todos WHERE id = ?", [id]);
  return { id };
}

export function toggleTodo(id) {
  const existing = getTodoById(id);
  if (!existing) {
    throw new Error("Todo not found.");
  }
  return updateTodo(id, { completed: !existing.completed });
}

export function clearCompletedTodos() {
  run("DELETE FROM todos WHERE completed = 1");
  return { cleared: true };
}

export function clearAllTodos() {
  run("DELETE FROM todos");
  return { cleared: true };
}

export function getTodoStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayStart = startOfToday.toISOString();
  const todayEnd = endOfToday.toISOString();
  const now = new Date().toISOString();

  const scalar = (sql, params = []) => {
    const row = queryOne(sql, params);
    return Number(row?.count ?? 0);
  };

  return {
    total: scalar("SELECT COUNT(*) AS count FROM todos"),
    completed: scalar("SELECT COUNT(*) AS count FROM todos WHERE completed = 1"),
    pending: scalar("SELECT COUNT(*) AS count FROM todos WHERE completed = 0"),
    overdue: scalar(
      "SELECT COUNT(*) AS count FROM todos WHERE completed = 0 AND dueDate IS NOT NULL AND dueDate < ?",
      [now]
    ),
    highPriority: scalar(
      "SELECT COUNT(*) AS count FROM todos WHERE completed = 0 AND priority = 'high'"
    ),
    today: scalar(
      "SELECT COUNT(*) AS count FROM todos WHERE dueDate IS NOT NULL AND dueDate >= ? AND dueDate <= ?",
      [todayStart, todayEnd]
    ),
  };
}
