import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run("PRAGMA foreign_keys = ON;");

db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('low', 'medium', 'high')),
    dueDate TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

const now = new Date().toISOString();
db.run(
  `INSERT INTO todos (id, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ["1", "Ship TodoDesk", "Finish the desktop app", 0, "high", now, JSON.stringify(["work"]), now, now]
);

const stmt = db.prepare("SELECT title, priority, completed FROM todos WHERE id = ?");
stmt.bind(["1"]);
stmt.step();
const row = stmt.getAsObject();
stmt.free();

if (row.title !== "Ship TodoDesk" || row.priority !== "high") {
  throw new Error("CRUD smoke test failed: insert/select mismatch");
}

db.run("UPDATE todos SET completed = 1 WHERE id = ?", ["1"]);
const count = db.exec("SELECT COUNT(*) AS c FROM todos WHERE completed = 1")[0].values[0][0];
if (count !== 1) {
  throw new Error("CRUD smoke test failed: toggle/update mismatch");
}

db.run("DELETE FROM todos WHERE id = ?", ["1"]);
const remaining = db.exec("SELECT COUNT(*) AS c FROM todos")[0].values[0][0];
if (remaining !== 0) {
  throw new Error("CRUD smoke test failed: delete mismatch");
}

const tmp = path.join(os.tmpdir(), `tododesk-smoke-${Date.now()}.sqlite`);
fs.writeFileSync(tmp, Buffer.from(db.export()));
const reopened = new SQL.Database(fs.readFileSync(tmp));
reopened.run("CREATE TABLE IF NOT EXISTS probe (id TEXT)");
fs.unlinkSync(tmp);
console.log("database CRUD + persistence smoke test passed");

const { runMigrations } = await import("../electron/database/migrations.js");

function scalar(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const hasRow = statement.step();
  const row = hasRow ? statement.getAsObject() : null;
  statement.free();
  return row;
}

function insertClipboard(database, { id, content, pinned = 0, created, copies, lastCopied }) {
  database.run(
    `INSERT INTO clipboard_items (id, content, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, content, pinned, created, created]
  );
  database.run(
    `INSERT INTO clipboard_usage (id, clipboard_item_id, copy_count, last_copied_at)
     VALUES (?, ?, ?, ?)`,
    [`usage-${id}`, id, copies, lastCopied]
  );
}

const migrated = new SQL.Database();
migrated.run("PRAGMA foreign_keys = ON;");
runMigrations(migrated);
runMigrations(migrated);

const versions = migrated.exec("SELECT version FROM schema_migrations ORDER BY version")[0].values.map((row) => row[0]);
if (versions.join(",") !== "1,2,3") {
  throw new Error(`Clipboard migration versions mismatch: ${versions.join(",")}`);
}

const later = new Date(Date.now() + 1000).toISOString();
insertClipboard(migrated, {
  id: "clip-express",
  content: "npm install express",
  created: now,
  copies: 12,
  lastCopied: now,
});
insertClipboard(migrated, {
  id: "clip-git",
  content: "git status",
  created: now,
  copies: 9,
  lastCopied: later,
});
insertClipboard(migrated, {
  id: "clip-docker",
  content: "docker compose up",
  created: now,
  copies: 12,
  lastCopied: later,
});

try {
  migrated.run(
    `INSERT INTO clipboard_items (id, content, is_pinned, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)`,
    ["clip-dup", "git status", now, now]
  );
  throw new Error("Duplicate clipboard content was allowed");
} catch (error) {
  if (String(error.message || error).includes("Duplicate clipboard content was allowed")) {
    throw error;
  }
}

migrated.run(
  `UPDATE clipboard_usage SET copy_count = copy_count + 1, last_copied_at = ? WHERE clipboard_item_id = ?`,
  [later, "clip-git"]
);
const gitUsage = scalar(
  migrated,
  "SELECT copy_count AS copy_count FROM clipboard_usage WHERE clipboard_item_id = ?",
  ["clip-git"]
);
if (Number(gitUsage.copy_count) !== 10) {
  throw new Error("Copy again did not increment copy_count");
}

const gitRows = migrated.exec(
  "SELECT COUNT(*) AS c FROM clipboard_items WHERE content = 'git status'"
)[0].values[0][0];
if (gitRows !== 1) {
  throw new Error("Copy again created a duplicate clipboard history row");
}

const ordered = migrated.exec(`
  SELECT items.content
  FROM clipboard_items items
  INNER JOIN clipboard_usage usage ON usage.clipboard_item_id = items.id
  ORDER BY items.is_pinned DESC, usage.copy_count DESC, usage.last_copied_at DESC
`)[0].values.map((row) => row[0]);
if (ordered.join(" | ") !== "docker compose up | npm install express | git status") {
  throw new Error(`Clipboard sort mismatch: ${ordered.join(" | ")}`);
}

migrated.run("DELETE FROM clipboard_items WHERE id = ?", ["clip-express"]);
const leftoverUsage = migrated.exec(
  "SELECT COUNT(*) AS c FROM clipboard_usage WHERE clipboard_item_id = 'clip-express'"
)[0].values[0][0];
if (leftoverUsage !== 0) {
  throw new Error("Clipboard usage row was not deleted with its item");
}

const persistedPath = path.join(os.tmpdir(), `tododesk-clipboard-${Date.now()}.sqlite`);
fs.writeFileSync(persistedPath, Buffer.from(migrated.export()));
const reopenedClipboard = new SQL.Database(fs.readFileSync(persistedPath));
const persistedCount = reopenedClipboard.exec("SELECT COUNT(*) AS c FROM clipboard_items")[0].values[0][0];
if (persistedCount !== 2) {
  throw new Error("Clipboard history did not persist after reopen");
}
fs.unlinkSync(persistedPath);

const existingUser = new SQL.Database();
existingUser.run("PRAGMA foreign_keys = ON;");
existingUser.run(`
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    appliedAt TEXT NOT NULL
  );
`);
existingUser.run(`
  CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('low', 'medium', 'high')),
    dueDate TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);
existingUser.run(
  "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)",
  [1, "create-todos-and-settings", now]
);
existingUser.run(
  `INSERT INTO todos (id, title, description, completed, priority, dueDate, tags, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ["todo-1", "Keep this task", "", 0, "medium", null, "[]", now, now]
);
runMigrations(existingUser);
const todoStillThere = existingUser.exec("SELECT title FROM todos")[0].values[0][0];
if (todoStillThere !== "Keep this task") {
  throw new Error("Clipboard migration overwrote existing todos");
}
const clipboardReady = existingUser.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clipboard_items'"
)[0];
if (!clipboardReady) {
  throw new Error("Clipboard tables were not created for existing users");
}
const markdownReady = existingUser.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'markdown_documents'"
)[0];
if (!markdownReady) {
  throw new Error("Markdown tables were not created for existing users");
}

migrated.run(
  `INSERT INTO markdown_documents (id, title, content, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)`,
  ["md-1", "Hello", "# Hello\n\n**Markdown**", now, now]
);
const mdCount = migrated.exec("SELECT COUNT(*) AS c FROM markdown_documents")[0].values[0][0];
if (mdCount !== 1) {
  throw new Error("Markdown document insert failed");
}
migrated.run(
  `UPDATE markdown_documents SET title = ?, content = ?, updated_at = ? WHERE id = ?`,
  ["Hello", "# Hello\n\n**Markdown**", later, "md-1"]
);
const stillOne = migrated.exec(
  "SELECT COUNT(*) AS c FROM markdown_documents WHERE content = '# Hello\n\n**Markdown**'"
)[0].values[0][0];
if (stillOne !== 1) {
  throw new Error("Markdown save created a duplicate document");
}

console.log("clipboard schema + uniqueness + usage + persistence smoke test passed");
console.log("markdown documents schema + persistence smoke test passed");

