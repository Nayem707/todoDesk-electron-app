/**
 * In-memory repository smoke for project-based todos.
 * Stubs electron/database/connection.js via a temp module graph is impractical,
 * so this file mirrors the repository call sequence against a migrated DB.
 */
import { createRequire } from "module";
import crypto from "crypto";
import { runMigrations } from "../electron/database/migrations.js";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = new SQL.Database();
db.run("PRAGMA foreign_keys = ON;");
runMigrations(db);

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] ?? null;
}

function run(sql, params = []) {
  db.run(sql, params);
}

console.log("\nProject-based todos");

const inbox = queryOne("SELECT * FROM projects WHERE name = ?", ["Inbox"]);
const general = queryOne("SELECT * FROM task_lists WHERE projectId = ?", [inbox.id]);
check("seeds Inbox", Boolean(inbox));
check("seeds General list", general?.name === "General");

const projectId = crypto.randomUUID();
const listA = crypto.randomUUID();
const listB = crypto.randomUUID();
const now = new Date().toISOString();

run(
  `INSERT INTO projects (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
  [projectId, "Mobile App", "Ship MVP", now, now]
);
run(
  `INSERT INTO task_lists (id, projectId, name, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
  [listA, projectId, "Backlog", 0, now, now]
);
run(
  `INSERT INTO task_lists (id, projectId, name, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
  [listB, projectId, "Sprint", 1, now, now]
);

const todoId = crypto.randomUUID();
run(
  `INSERT INTO todos (id, listId, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, 0, 'high', NULL, '[]', ?, ?)`,
  [todoId, listA, "Design screens", "Long description for load more testing", now, now]
);

check(
  "task scoped to list",
  queryOne("SELECT listId FROM todos WHERE id = ?", [todoId])?.listId === listA
);

run("UPDATE todos SET completed = 1 WHERE id = ?", [todoId]);
check(
  "toggle complete",
  Boolean(queryOne("SELECT completed FROM todos WHERE id = ?", [todoId])?.completed)
);

const listCountBefore = queryAll("SELECT id FROM task_lists WHERE projectId = ?", [
  projectId,
]).length;
check("project has two lists", listCountBefore === 2);

run("DELETE FROM task_lists WHERE id = ?", [listA]);
check(
  "deleting list cascades tasks",
  queryOne("SELECT id FROM todos WHERE id = ?", [todoId]) === null
);
check(
  "sibling list remains",
  queryOne("SELECT id FROM task_lists WHERE id = ?", [listB])?.id === listB
);

run("DELETE FROM projects WHERE id = ?", [projectId]);
check(
  "deleting project cascades lists",
  queryAll("SELECT id FROM task_lists WHERE projectId = ?", [projectId]).length === 0
);
check(
  "Inbox untouched",
  queryOne("SELECT id FROM projects WHERE id = ?", [inbox.id])?.id === inbox.id
);

const projects = queryAll("SELECT name FROM projects ORDER BY createdAt");
check("at least Inbox remains", projects.some((row) => row.name === "Inbox"));

if (failures > 0) {
  console.error(`\n${failures} project todo check(s) failed`);
  process.exit(1);
}
console.log("\nproject todo checks passed");
