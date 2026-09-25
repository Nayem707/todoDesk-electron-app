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
if (versions.join(",") !== "1,2,3,4,5,6,7") {
  throw new Error(`Migration versions mismatch: ${versions.join(",")}`);
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
  ORDER BY usage.last_copied_at DESC, usage.copy_count DESC
`)[0].values.map((row) => row[0]);
if (ordered.join(" | ") !== "docker compose up | git status | npm install express") {
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
const aiReady = existingUser.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_conversations'"
)[0];
if (!aiReady) {
  throw new Error("AI conversation tables were not created for existing users");
}
const aiImageCols = existingUser.exec("PRAGMA table_info(ai_messages)")[0].values.map((row) => row[1]);
if (!aiImageCols.includes("image_path") || !aiImageCols.includes("image_mime")) {
  throw new Error("AI message image columns were not created for existing users");
}

const formAnalysesReady = existingUser.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'form_analyses'"
)[0];
if (!formAnalysesReady) {
  throw new Error("Form analysis table was not created for existing users");
}
migrated.run(
  `INSERT INTO form_analyses (id, url, title, status, fields, field_count, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ["fa-1", "https://example.com/apply", "Apply", "completed", JSON.stringify([{ key: "f1" }]), 1, now, now]
);
try {
  migrated.run(
    `INSERT INTO form_analyses (id, url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ["fa-bad", "https://example.com", "running", now, now]
  );
  throw new Error("Invalid form analysis status was allowed");
} catch (error) {
  if (String(error.message || error).includes("Invalid form analysis status was allowed")) {
    throw error;
  }
}

const webAuditsReady = existingUser.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'web_audits'"
)[0];
if (!webAuditsReady) {
  throw new Error("Web audit table was not created for existing users");
}
migrated.run(
  `INSERT INTO web_audits (id, url, title, status, overall_score, report, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ["wa-1", "https://example.com/", "Example", "completed", 82, JSON.stringify({ overallScore: 82 }), now, now]
);
try {
  migrated.run(
    `INSERT INTO web_audits (id, url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ["wa-bad", "https://example.com", "running", now, now]
  );
  throw new Error("Invalid web audit status was allowed");
} catch (error) {
  if (String(error.message || error).includes("Invalid web audit status was allowed")) {
    throw error;
  }
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

migrated.run(
  `INSERT INTO ai_conversations (id, title, created_at, updated_at)
   VALUES (?, ?, ?, ?)`,
  ["conv-a", "Node.js Discussion", now, now]
);
migrated.run(
  `INSERT INTO ai_conversations (id, title, created_at, updated_at)
   VALUES (?, ?, ?, ?)`,
  ["conv-b", "React Hooks", later, later]
);
migrated.run(
  `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
   VALUES (?, ?, ?, ?, ?)`,
  ["msg-1", "conv-a", "user", "What is Node.js?", now]
);
migrated.run(
  `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
   VALUES (?, ?, ?, ?, ?)`,
  ["msg-2", "conv-a", "assistant", "Node.js is a JavaScript runtime.", later]
);
migrated.run(
  `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
   VALUES (?, ?, ?, ?, ?)`,
  ["msg-3", "conv-b", "user", "Explain React hooks", later]
);

const convAMessages = migrated.exec(
  "SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = 'conv-a'"
)[0].values[0][0];
if (convAMessages !== 2) {
  throw new Error("AI messages were not linked to conversation A");
}

// sql.js resets PRAGMA foreign_keys after export(); re-enable before cascade checks.
migrated.run("PRAGMA foreign_keys = ON;");
migrated.run("DELETE FROM ai_conversations WHERE id = ?", ["conv-a"]);
const orphanMessages = migrated.exec(
  "SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = 'conv-a'"
)[0].values[0][0];
if (orphanMessages !== 0) {
  throw new Error("AI messages were not cascade-deleted with conversation A");
}
const convBLeft = migrated.exec(
  "SELECT COUNT(*) AS c FROM ai_conversations WHERE id = 'conv-b'"
)[0].values[0][0];
const convBMessages = migrated.exec(
  "SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = 'conv-b'"
)[0].values[0][0];
if (convBLeft !== 1 || convBMessages !== 1) {
  throw new Error("Deleting conversation A affected conversation B");
}

const aiPersistedPath = path.join(os.tmpdir(), `tododesk-ai-${Date.now()}.sqlite`);
fs.writeFileSync(aiPersistedPath, Buffer.from(migrated.export()));
const reopenedAi = new SQL.Database(fs.readFileSync(aiPersistedPath));
reopenedAi.run("PRAGMA foreign_keys = ON;");
const persistedConv = reopenedAi.exec(
  "SELECT COUNT(*) AS c FROM ai_conversations"
)[0].values[0][0];
const persistedMsg = reopenedAi.exec("SELECT COUNT(*) AS c FROM ai_messages")[0].values[0][0];
if (persistedConv !== 1 || persistedMsg !== 1) {
  throw new Error("AI conversations/messages did not persist after reopen");
}
const todosUntouched = migrated.exec("SELECT COUNT(*) AS c FROM todos")[0].values[0][0];
if (todosUntouched !== 0) {
  throw new Error("Unexpected todos present during AI smoke insert path");
}
fs.unlinkSync(aiPersistedPath);

console.log("clipboard schema + uniqueness + usage + persistence smoke test passed");
console.log("markdown documents schema + persistence smoke test passed");
console.log("ai conversations + cascade delete + persistence smoke test passed");

