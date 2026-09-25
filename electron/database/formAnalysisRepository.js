import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const MAX_HISTORY = 100;

function nowIso() {
  return new Date().toISOString();
}

function requireId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Form analysis id is required.");
  }
  return id;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapSummary(row) {
  return {
    id: row.id,
    url: row.url,
    finalUrl: row.final_url ?? null,
    title: row.title,
    status: row.status,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    fieldCount: Number(row.field_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRow(row) {
  return {
    ...mapSummary(row),
    fields: parseJson(row.fields, []),
    forms: parseJson(row.forms, []),
    warnings: parseJson(row.warnings, []),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
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
  return queryAll(sql, params)[0] ?? null;
}

function run(sql, params = []) {
  getDb().run(sql, params);
  schedulePersist();
}

export function getFormAnalyses() {
  return queryAll(
    `SELECT id, url, final_url, title, status, error_code, error_message, field_count, created_at, updated_at
     FROM form_analyses ORDER BY created_at DESC`
  ).map(mapSummary);
}

export function getFormAnalysisById(id) {
  const row = queryOne("SELECT * FROM form_analyses WHERE id = ?", [requireId(id)]);
  return row ? mapRow(row) : null;
}

/**
 * @param {{ url: string, finalUrl?: string | null, title?: string, status: 'completed' | 'failed',
 *   errorCode?: string | null, errorMessage?: string | null, fields?: object[], forms?: object[],
 *   warnings?: object[], durationMs?: number | null }} input
 */
export function createFormAnalysis(input) {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const fields = input.fields ?? [];
  run(
    `INSERT INTO form_analyses
       (id, url, final_url, title, status, error_code, error_message, fields, forms, warnings,
        field_count, duration_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.url,
      input.finalUrl ?? null,
      input.title ?? "",
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      JSON.stringify(fields),
      JSON.stringify(input.forms ?? []),
      JSON.stringify(input.warnings ?? []),
      fields.length,
      input.durationMs ?? null,
      timestamp,
      timestamp,
    ]
  );
  pruneHistory();
  return getFormAnalysisById(id);
}

export function updateFormAnalysisFields(id, fields) {
  const existing = getFormAnalysisById(requireId(id));
  if (!existing) {
    throw new Error("Form analysis not found.");
  }
  run(`UPDATE form_analyses SET fields = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(fields),
    nowIso(),
    id,
  ]);
  return getFormAnalysisById(id);
}

export function deleteFormAnalysis(id) {
  const existing = getFormAnalysisById(requireId(id));
  if (!existing) {
    throw new Error("Form analysis not found.");
  }
  run("DELETE FROM form_analyses WHERE id = ?", [id]);
  return { id };
}

function pruneHistory() {
  run(
    `DELETE FROM form_analyses WHERE id NOT IN (
       SELECT id FROM form_analyses ORDER BY created_at DESC LIMIT ?
     )`,
    [MAX_HISTORY]
  );
}
