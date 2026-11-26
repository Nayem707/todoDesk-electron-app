import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";
import { getListById } from "./projectRepository.js";
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
    listId: row.listId,
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

function requireListId(listId) {
  const id = typeof listId === "string" ? listId.trim() : "";
  if (!id) {
    throw new Error("Task list is required.");
  }
  const list = getListById(id);
  if (!list) {
    throw new Error("Task list not found.");
  }
  return id;
}

function buildStats(whereSql = "", params = []) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayStart = startOfToday.toISOString();
  const todayEnd = endOfToday.toISOString();
  const now = new Date().toISOString();
  const clause = whereSql ? `WHERE ${whereSql}` : "";
  const and = whereSql ? `AND ${whereSql}` : "";

  const scalar = (sql, sqlParams = []) => {
    const row = queryOne(sql, sqlParams);
    return Number(row?.count ?? 0);
  };

  return {
    total: scalar(`SELECT COUNT(*) AS count FROM todos ${clause}`, params),
    completed: scalar(
      `SELECT COUNT(*) AS count FROM todos WHERE completed = 1 ${and}`,
      params
    ),
    pending: scalar(
      `SELECT COUNT(*) AS count FROM todos WHERE completed = 0 ${and}`,
      params
    ),
    overdue: scalar(
      `SELECT COUNT(*) AS count FROM todos
       WHERE completed = 0 AND dueDate IS NOT NULL AND dueDate < ? ${and}`,
      [now, ...params]
    ),
    highPriority: scalar(
      `SELECT COUNT(*) AS count FROM todos
       WHERE completed = 0 AND priority = 'high' ${and}`,
      params
    ),
    today: scalar(
      `SELECT COUNT(*) AS count FROM todos
       WHERE dueDate IS NOT NULL AND dueDate >= ? AND dueDate <= ? ${and}`,
      [todayStart, todayEnd, ...params]
    ),
  };
}

export function getAllTodos() {
  return queryAll("SELECT * FROM todos ORDER BY createdAt DESC").map(mapRow);
}

export function getTodosByListId(listId) {
  requireListId(listId);
  return queryAll(
    "SELECT * FROM todos WHERE listId = ? ORDER BY createdAt DESC",
    [listId]
  ).map(mapRow);
}

export function getTodoById(id) {
  const row = queryOne("SELECT * FROM todos WHERE id = ?", [id]);
  return row ? mapRow(row) : null;
}

export function createTodo(input) {
  const listId = requireListId(input?.listId);
  const payload = validateTodoInput(input, { requireTitle: true });
  const timestamp = nowIso();
  const todo = {
    id: crypto.randomUUID(),
    listId,
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
      (id, listId, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.listId,
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

  const listId =
    input.listId === undefined ? existing.listId : requireListId(input.listId);

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

  const updatedAt = nowIso();

  run(
    `UPDATE todos
     SET listId = ?, title = ?, description = ?, completed = ?, priority = ?, dueDate = ?, tags = ?, updatedAt = ?
     WHERE id = ?`,
    [
      listId,
      payload.title,
      payload.description,
      payload.completed ? 1 : 0,
      payload.priority,
      payload.dueDate,
      JSON.stringify(payload.tags),
      updatedAt,
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
  return buildStats();
}

export function getTodoStatsByListId(listId) {
  requireListId(listId);
  return buildStats("listId = ?", [listId]);
}
