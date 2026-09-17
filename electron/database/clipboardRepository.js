import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const MAX_CONTENT_LENGTH = 100_000;

const LIST_SQL = `
  SELECT
    items.id AS id,
    items.content AS content,
    items.is_pinned AS is_pinned,
    items.created_at AS created_at,
    items.updated_at AS updated_at,
    usage.copy_count AS copy_count,
    usage.last_copied_at AS last_copied_at
  FROM clipboard_items items
  INNER JOIN clipboard_usage usage ON usage.clipboard_item_id = items.id
`;

function nowIso() {
  return new Date().toISOString();
}

function requireId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Clipboard item id is required.");
  }
  return id;
}

export function normalizeClipboardContent(content) {
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
    content: row.content,
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    copyCount: Number(row.copy_count ?? 0),
    lastCopiedAt: row.last_copied_at,
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

function withTransaction(work) {
  const db = getDb();
  db.run("BEGIN");
  try {
    work(db);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  schedulePersist();
}

export function getAllClipboardItems() {
  return queryAll(
    `${LIST_SQL}
     ORDER BY items.is_pinned DESC, usage.copy_count DESC, usage.last_copied_at DESC`
  ).map(mapRow);
}

export function getClipboardItemById(id) {
  const row = queryOne(`${LIST_SQL} WHERE items.id = ?`, [requireId(id)]);
  return row ? mapRow(row) : null;
}

export function getClipboardItemByContent(content) {
  const row = queryOne(`${LIST_SQL} WHERE items.content = ?`, [content]);
  return row ? mapRow(row) : null;
}

function insertClipboardItem(content) {
  const timestamp = nowIso();
  const itemId = crypto.randomUUID();
  const usageId = crypto.randomUUID();

  withTransaction((db) => {
    db.run(
      `INSERT INTO clipboard_items (id, content, is_pinned, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      [itemId, content, timestamp, timestamp]
    );
    db.run(
      `INSERT INTO clipboard_usage (id, clipboard_item_id, copy_count, last_copied_at)
       VALUES (?, ?, 1, ?)`,
      [usageId, itemId, timestamp]
    );
  });

  return getClipboardItemById(itemId);
}

export function incrementClipboardUsage(id) {
  const existing = getClipboardItemById(requireId(id));
  if (!existing) {
    throw new Error("Clipboard item not found.");
  }

  const timestamp = nowIso();
  withTransaction((db) => {
    db.run(
      `UPDATE clipboard_usage
       SET copy_count = copy_count + 1, last_copied_at = ?
       WHERE clipboard_item_id = ?`,
      [timestamp, id]
    );
    db.run(`UPDATE clipboard_items SET updated_at = ? WHERE id = ?`, [timestamp, id]);
  });

  return getClipboardItemById(id);
}

export function recordExternalClipboardCopy(content) {
  const normalized = normalizeClipboardContent(content);
  if (!normalized) {
    return null;
  }

  const existing = getClipboardItemByContent(normalized);
  if (existing) {
    return incrementClipboardUsage(existing.id);
  }

  try {
    return insertClipboardItem(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("unique")) {
      throw error;
    }
    const raced = getClipboardItemByContent(normalized);
    if (!raced) {
      throw error;
    }
    return incrementClipboardUsage(raced.id);
  }
}

export function copyClipboardItemAgain(id) {
  return incrementClipboardUsage(id);
}

export function toggleClipboardPin(id) {
  const existing = getClipboardItemById(requireId(id));
  if (!existing) {
    throw new Error("Clipboard item not found.");
  }

  const timestamp = nowIso();
  withTransaction((db) => {
    db.run(`UPDATE clipboard_items SET is_pinned = ?, updated_at = ? WHERE id = ?`, [
      existing.isPinned ? 0 : 1,
      timestamp,
      id,
    ]);
  });

  return getClipboardItemById(id);
}

export function deleteClipboardItem(id) {
  const existing = getClipboardItemById(requireId(id));
  if (!existing) {
    throw new Error("Clipboard item not found.");
  }

  withTransaction((db) => {
    db.run("DELETE FROM clipboard_items WHERE id = ?", [id]);
  });

  return { id };
}
