import { createRequire } from "module";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();
const { runMigrations } = await import("../electron/database/migrations.js");

const db = new SQL.Database();
db.run("PRAGMA foreign_keys = ON;");
runMigrations(db);

function scalar(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const hasRow = statement.step();
  const row = hasRow ? statement.getAsObject() : null;
  statement.free();
  return row;
}

const inbox = scalar("SELECT id, name FROM projects WHERE name = ?", ["Inbox"]);
const general = scalar(
  "SELECT id, name FROM task_lists WHERE projectId = ? AND name = ?",
  [inbox.id, "General"]
);
if (!inbox || !general) {
  throw new Error("Inbox / General seed missing");
}

const projectId = "proj-test-1";
const listId = "list-test-1";
const now = new Date().toISOString();
db.run(
  `INSERT INTO projects (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
  [projectId, "Website", "Launch site", now, now]
);
db.run(
  `INSERT INTO task_lists (id, projectId, name, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
  [listId, projectId, "Launch", 0, now, now]
);
db.run(
  `INSERT INTO todos (id, listId, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    "todo-1",
    listId,
    "Write copy",
    "Line one\nLine two\nLine three\nLine four",
    0,
    "high",
    now,
    "[]",
    now,
    now,
  ]
);

const task = scalar("SELECT title, listId FROM todos WHERE id = ?", ["todo-1"]);
if (task.title !== "Write copy" || task.listId !== listId) {
  throw new Error("Task insert failed");
}

db.run("DELETE FROM projects WHERE id = ?", [projectId]);
const orphanLists = Number(
  scalar("SELECT COUNT(*) AS count FROM task_lists WHERE projectId = ?", [projectId])
    .count
);
const orphanTodos = Number(
  scalar("SELECT COUNT(*) AS count FROM todos WHERE listId = ?", [listId]).count
);
if (orphanLists !== 0 || orphanTodos !== 0) {
  throw new Error("Cascade delete from project did not remove lists/tasks");
}

const inboxStill = Number(
  scalar("SELECT COUNT(*) AS count FROM projects WHERE name = ?", ["Inbox"]).count
);
if (inboxStill !== 1) {
  throw new Error("Inbox was affected by deleting another project");
}

// Last list cannot be deleted by product rule; schema still allows CASCADE from project.
const onlyList = general.id;
db.run("DELETE FROM task_lists WHERE id = ?", [onlyList]);
const listsLeft = Number(
  scalar("SELECT COUNT(*) AS count FROM task_lists WHERE projectId = ?", [inbox.id])
    .count
);
if (listsLeft !== 0) {
  throw new Error("Expected list delete to succeed at SQL layer");
}

console.log("project hierarchy seed + cascade smoke test passed");
