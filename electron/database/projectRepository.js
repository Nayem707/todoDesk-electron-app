import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;

function nowIso() {
  return new Date().toISOString();
}

function asString(value) {
  return typeof value === "string" ? value : "";
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

function scalar(sql, params = []) {
  const row = queryOne(sql, params);
  return Number(row?.count ?? 0);
}

function validateName(name, label = "Name") {
  const trimmed = asString(name).trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (trimmed.length > NAME_MAX) {
    throw new Error(`${label} must be ${NAME_MAX} characters or fewer.`);
  }
  return trimmed;
}

function validateDescription(description) {
  const trimmed = asString(description).trim();
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new Error(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
  }
  return trimmed;
}

function normalizeProjectDate(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return date.toISOString();
}

function mapProject(row, stats = null) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    startDate: row.startDate ?? null,
    deadline: row.deadline ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    listCount: stats?.listCount ?? Number(row.listCount ?? 0),
    taskCount: stats?.taskCount ?? Number(row.taskCount ?? 0),
    completedCount: stats?.completedCount ?? Number(row.completedCount ?? 0),
  };
}

function mapList(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    startDate: row.startDate ?? null,
    deadline: row.deadline ?? null,
    position: Number(row.position ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    taskCount: Number(row.taskCount ?? 0),
    completedCount: Number(row.completedCount ?? 0),
  };
}

const PROJECT_SELECT = `
  SELECT
    p.id,
    p.name,
    p.description,
    p.startDate,
    p.deadline,
    p.createdAt,
    p.updatedAt,
    (SELECT COUNT(*) FROM task_lists tl WHERE tl.projectId = p.id) AS listCount,
    (SELECT COUNT(*) FROM todos t
       INNER JOIN task_lists tl ON tl.id = t.listId
       WHERE tl.projectId = p.id) AS taskCount,
    (SELECT COUNT(*) FROM todos t
       INNER JOIN task_lists tl ON tl.id = t.listId
       WHERE tl.projectId = p.id AND t.completed = 1) AS completedCount
  FROM projects p
`;

export function getAllProjects() {
  const rows = queryAll(`${PROJECT_SELECT} ORDER BY p.createdAt ASC`);
  return rows.map((row) => mapProject(row));
}

export function getProjectById(id) {
  const row = queryOne(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
  return row ? mapProject(row) : null;
}

export function createProject(input = {}) {
  const name = validateName(input.name, "Project name");
  const description = validateDescription(input.description);
  const startDate = normalizeProjectDate(input.startDate, "Start date");
  const deadline = normalizeProjectDate(input.deadline, "Project deadline");
  const timestamp = nowIso();
  const projectId = crypto.randomUUID();
  const listId = crypto.randomUUID();

  const db = getDb();
  db.run("BEGIN");
  try {
    db.run(
      `INSERT INTO projects (id, name, description, startDate, deadline, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, description, startDate, deadline, timestamp, timestamp]
    );
    db.run(
      `INSERT INTO task_lists (id, projectId, name, position, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [listId, projectId, "General", 0, timestamp, timestamp]
    );
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  schedulePersist();
  return getProjectById(projectId);
}

export function updateProject(id, input = {}) {
  const existing = getProjectById(id);
  if (!existing) {
    throw new Error("Project not found.");
  }

  const name =
    input.name === undefined ? existing.name : validateName(input.name, "Project name");
  const description =
    input.description === undefined
      ? existing.description
      : validateDescription(input.description);
  const startDate =
    input.startDate === undefined
      ? existing.startDate
      : normalizeProjectDate(input.startDate, "Start date");
  const deadline =
    input.deadline === undefined
      ? existing.deadline
      : normalizeProjectDate(input.deadline, "Project deadline");
  const updatedAt = nowIso();

  run(
    `UPDATE projects SET name = ?, description = ?, startDate = ?, deadline = ?, updatedAt = ? WHERE id = ?`,
    [name, description, startDate, deadline, updatedAt, id]
  );
  return getProjectById(id);
}

export function deleteProject(id) {
  const existing = getProjectById(id);
  if (!existing) {
    throw new Error("Project not found.");
  }
  run("DELETE FROM projects WHERE id = ?", [id]);
  return { id };
}

export function getListsByProject(projectId) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const rows = queryAll(
    `
    SELECT
      tl.*,
      (SELECT COUNT(*) FROM todos t WHERE t.listId = tl.id) AS taskCount,
      (SELECT COUNT(*) FROM todos t WHERE t.listId = tl.id AND t.completed = 1) AS completedCount
    FROM task_lists tl
    WHERE tl.projectId = ?
    ORDER BY tl.position ASC, tl.createdAt ASC
    `,
    [projectId]
  );
  return rows.map(mapList);
}

export function getListById(id) {
  const row = queryOne(
    `
    SELECT
      tl.*,
      (SELECT COUNT(*) FROM todos t WHERE t.listId = tl.id) AS taskCount,
      (SELECT COUNT(*) FROM todos t WHERE t.listId = tl.id AND t.completed = 1) AS completedCount
    FROM task_lists tl
    WHERE tl.id = ?
    `,
    [id]
  );
  return row ? mapList(row) : null;
}

export function createTaskList(projectId, input = {}) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const name = validateName(input.name, "List name");
  const startDate = normalizeProjectDate(input.startDate, "List start date");
  const deadline = normalizeProjectDate(input.deadline, "List deadline");
  const timestamp = nowIso();
  const positionRow = queryOne(
    "SELECT COALESCE(MAX(position), -1) AS maxPos FROM task_lists WHERE projectId = ?",
    [projectId]
  );
  const position = Number(positionRow?.maxPos ?? -1) + 1;
  const id = crypto.randomUUID();

  run(
    `INSERT INTO task_lists (id, projectId, name, startDate, deadline, position, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, name, startDate, deadline, position, timestamp, timestamp]
  );

  run(`UPDATE projects SET updatedAt = ? WHERE id = ?`, [timestamp, projectId]);
  return getListById(id);
}

export function updateTaskList(id, input = {}) {
  const existing = getListById(id);
  if (!existing) {
    throw new Error("Task list not found.");
  }

  const name =
    input.name === undefined ? existing.name : validateName(input.name, "List name");
  const startDate =
    input.startDate === undefined
      ? existing.startDate
      : normalizeProjectDate(input.startDate, "List start date");
  const deadline =
    input.deadline === undefined
      ? existing.deadline
      : normalizeProjectDate(input.deadline, "List deadline");
  const updatedAt = nowIso();

  run(`UPDATE task_lists SET name = ?, startDate = ?, deadline = ?, updatedAt = ? WHERE id = ?`, [
    name,
    startDate,
    deadline,
    updatedAt,
    id,
  ]);
  run(`UPDATE projects SET updatedAt = ? WHERE id = ?`, [
    updatedAt,
    existing.projectId,
  ]);
  return getListById(id);
}

export function deleteTaskList(id) {
  const existing = getListById(id);
  if (!existing) {
    throw new Error("Task list not found.");
  }

  const siblingCount = scalar(
    "SELECT COUNT(*) AS count FROM task_lists WHERE projectId = ?",
    [existing.projectId]
  );
  if (siblingCount <= 1) {
    throw new Error("A project must keep at least one task list.");
  }

  run("DELETE FROM task_lists WHERE id = ?", [id]);
  run(`UPDATE projects SET updatedAt = ? WHERE id = ?`, [
    nowIso(),
    existing.projectId,
  ]);
  return { id };
}
