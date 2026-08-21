import fs from "fs";
import path from "path";
import { app } from "electron";
import { createRequire } from "module";
import { runMigrations } from "./migrations.js";

const require = createRequire(import.meta.url);

/** @type {import('sql.js').Database | null} */
let db = null;
let dbPath = "";
let persistTimer = null;

export async function initDatabase() {
  const initSqlJs = require("sql.js/dist/sql-asm.js");
  const SQL = await initSqlJs();

  dbPath = path.join(app.getPath("userData"), "tododesk.sqlite");

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  persistNow();
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database has not been initialized.");
  }
  return db;
}

export function persistNow() {
  if (!db || !dbPath) {
    return;
  }
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (error) {
    console.error("[database] persist failed", error);
    throw new Error("Failed to save data to disk.");
  }
}

export function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 40);
}

export function closeDatabase() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!db) {
    return;
  }
  try {
    persistNow();
    db.close();
  } catch (error) {
    console.error("[database] close failed", error);
  } finally {
    db = null;
  }
}
