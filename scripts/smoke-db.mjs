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
