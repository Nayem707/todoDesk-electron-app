import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const MAX_HISTORY = 100;

function nowIso() {
  return new Date().toISOString();
}

function requireId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Web audit id is required.");
  }
  return id;
}

function parseReport(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
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
    overallScore: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score),
    criticalCount: Number(row.critical_count) || 0,
    warningCount: Number(row.warning_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRow(row) {
  return {
    ...mapSummary(row),
    report: parseReport(row.report),
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

export function getWebAudits() {
  return queryAll(
    `SELECT id, url, final_url, title, status, error_code, error_message, overall_score,
            critical_count, warning_count, created_at, updated_at
     FROM web_audits ORDER BY created_at DESC`
  ).map(mapSummary);
}

export function getWebAuditById(id) {
  const row = queryOne("SELECT * FROM web_audits WHERE id = ?", [requireId(id)]);
  return row ? mapRow(row) : null;
}

/**
 * @param {{ url: string, status: 'completed' | 'failed', report?: any, errorCode?: string | null,
 *   errorMessage?: string | null }} input
 */
export function createWebAudit(input) {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const report = input.report ?? null;
  run(
    `INSERT INTO web_audits
       (id, url, final_url, title, status, error_code, error_message, overall_score,
        critical_count, warning_count, report, duration_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.url,
      report?.finalUrl ?? null,
      report?.title ?? "",
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      report?.overallScore ?? null,
      report?.totals?.critical ?? 0,
      report?.totals?.warnings ?? 0,
      report ? JSON.stringify(report) : null,
      report?.durationMs ?? null,
      timestamp,
      timestamp,
    ]
  );
  pruneHistory();
  return getWebAuditById(id);
}

export function deleteWebAudit(id) {
  const existing = getWebAuditById(requireId(id));
  if (!existing) {
    throw new Error("Web audit not found.");
  }
  run("DELETE FROM web_audits WHERE id = ?", [id]);
  return { id };
}

function pruneHistory() {
  run(
    `DELETE FROM web_audits WHERE id NOT IN (
       SELECT id FROM web_audits ORDER BY created_at DESC LIMIT ?
     )`,
    [MAX_HISTORY]
  );
}
