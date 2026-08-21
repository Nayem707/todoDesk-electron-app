import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");

const source = path.join(process.env.APPDATA, "TodoDesk", "tododesk.sqlite");
const copy = path.join(os.tmpdir ? os.tmpdir() : process.env.TEMP, `tododesk-inspect-${Date.now()}.sqlite`);

if (!fs.existsSync(source)) {
  throw new Error(`Database not found at ${source}`);
}

fs.copyFileSync(source, copy);
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(copy));

function all(sql) {
  const result = db.exec(sql);
  if (!result[0]) {
    return [];
  }
  return result[0].values.map((values) =>
    Object.fromEntries(result[0].columns.map((column, index) => [column, values[index]]))
  );
}

const migrations = all("SELECT * FROM schema_migrations");
const settings = all("SELECT * FROM settings");
const todos = all("SELECT id, title, completed, priority FROM todos");

console.log(JSON.stringify({ migrations, settings, todoCount: todos.length, todos }, null, 2));
fs.unlinkSync(copy);
