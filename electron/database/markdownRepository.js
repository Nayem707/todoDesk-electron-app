import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const MAX_CONTENT_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 80;

function nowIso() {
  return new Date().toISOString();
}

function requireId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Markdown document id is required.");
  }
  return id;
}

export function titleFromMarkdown(content) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const raw = heading ? heading[1] : line.replace(/^[-*+>\d.`\s]+/, "").trim();
    const cleaned = raw.replace(/[*_`#\[\]]/g, "").trim();
    if (cleaned) {
      return cleaned.slice(0, MAX_TITLE_LENGTH);
    }
  }

  return "Untitled";
}

function normalizeContent(content) {
  if (typeof content !== "string") {
    return null;
  }
  const next = content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) : content;
  if (!next.trim()) {
    return null;
  }
  return next;
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

function run(sql, params = []) {
  getDb().run(sql, params);
  schedulePersist();
}

export function getAllMarkdownDocuments() {
  return queryAll(
    `SELECT * FROM markdown_documents ORDER BY updated_at DESC`
  ).map(mapRow);
}

export function getMarkdownDocumentById(id) {
  const row = queryOne("SELECT * FROM markdown_documents WHERE id = ?", [requireId(id)]);
  return row ? mapRow(row) : null;
}

export function getMarkdownDocumentByContent(content) {
  const row = queryOne("SELECT * FROM markdown_documents WHERE content = ?", [content]);
  return row ? mapRow(row) : null;
}

export function saveMarkdownDocument({ id, content } = {}) {
  const normalized = normalizeContent(content);
  if (!normalized) {
    throw new Error("Markdown content is required.");
  }

  const title = titleFromMarkdown(normalized);
  const timestamp = nowIso();

  if (id) {
    const existing = getMarkdownDocumentById(id);
    if (!existing) {
      throw new Error("Markdown document not found.");
    }
    run(
      `UPDATE markdown_documents
       SET title = ?, content = ?, updated_at = ?
       WHERE id = ?`,
      [title, normalized, timestamp, id]
    );
    return getMarkdownDocumentById(id);
  }

  const duplicate = getMarkdownDocumentByContent(normalized);
  if (duplicate) {
    run(
      `UPDATE markdown_documents SET title = ?, updated_at = ? WHERE id = ?`,
      [title, timestamp, duplicate.id]
    );
    return getMarkdownDocumentById(duplicate.id);
  }

  const nextId = crypto.randomUUID();
  run(
    `INSERT INTO markdown_documents (id, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [nextId, title, normalized, timestamp, timestamp]
  );
  return getMarkdownDocumentById(nextId);
}

export function deleteMarkdownDocument(id) {
  const existing = getMarkdownDocumentById(requireId(id));
  if (!existing) {
    throw new Error("Markdown document not found.");
  }
  run("DELETE FROM markdown_documents WHERE id = ?", [id]);
  return { id };
}
