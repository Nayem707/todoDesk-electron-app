import crypto from "crypto";
import { getDb, schedulePersist } from "./connection.js";

const MAX_TITLE_LENGTH = 60;
const MAX_CONTENT_LENGTH = 12_000;
const MAX_VISION_CONTENT_LENGTH = 100_000;
const HISTORY_LIMIT = 40;

function nowIso() {
  return new Date().toISOString();
}

function requireId(id, label = "id") {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`${label} is required.`);
  }
  return id;
}

function normalizeContent(content, maxLength = MAX_CONTENT_LENGTH) {
  if (typeof content !== "string") {
    return "";
  }
  return content.trim().slice(0, maxLength);
}

export function titleFromPrompt(content) {
  const compact = String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  if (!compact) {
    return "New chat";
  }
  const cleaned = compact.replace(/[.?!]+$/g, "").trim();
  if (cleaned.length <= MAX_TITLE_LENGTH) {
    return cleaned || "New chat";
  }
  return `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trim()}…`;
}

function mapConversation(row) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    imagePath: row.image_path || null,
    imageMime: row.image_mime || null,
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
    const result = work(db);
    db.run("COMMIT");
    schedulePersist();
    return result;
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export function getAllConversations() {
  return queryAll(
    `SELECT * FROM ai_conversations ORDER BY updated_at DESC`
  ).map(mapConversation);
}

export function getConversationById(id) {
  const row = queryOne("SELECT * FROM ai_conversations WHERE id = ?", [
    requireId(id, "Conversation id"),
  ]);
  return row ? mapConversation(row) : null;
}

export function createConversation(title = "New chat") {
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  const nextTitle =
    typeof title === "string" && title.trim()
      ? title.trim().slice(0, MAX_TITLE_LENGTH)
      : "New chat";

  withTransaction((db) => {
    db.run(
      `INSERT INTO ai_conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [id, nextTitle, timestamp, timestamp]
    );
  });

  return getConversationById(id);
}

export function updateConversationTitle(id, title) {
  const existing = getConversationById(id);
  if (!existing) {
    throw new Error("Conversation not found.");
  }
  const nextTitle = titleFromPrompt(title);
  const timestamp = nowIso();
  withTransaction((db) => {
    db.run(`UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`, [
      nextTitle,
      timestamp,
      id,
    ]);
  });
  return getConversationById(id);
}

function touchConversation(db, id, timestamp = nowIso()) {
  db.run(`UPDATE ai_conversations SET updated_at = ? WHERE id = ?`, [timestamp, id]);
}

export function getMessagesByConversation(conversationId, { limit = HISTORY_LIMIT } = {}) {
  requireId(conversationId, "Conversation id");
  const safeLimit = Math.max(1, Math.min(Number(limit) || HISTORY_LIMIT, 200));
  const rows = queryAll(
    `SELECT * FROM ai_messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    [conversationId]
  );
  const mapped = rows.map(mapMessage);
  if (mapped.length <= safeLimit) {
    return mapped;
  }
  return mapped.slice(mapped.length - safeLimit);
}

export function createMessage(
  conversationId,
  role,
  content,
  { imagePath = null, imageMime = null, maxContentLength = MAX_CONTENT_LENGTH } = {}
) {
  const conversation = getConversationById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }
  if (role !== "user" && role !== "assistant" && role !== "system") {
    throw new Error("Message role is invalid.");
  }
  const normalized = normalizeContent(content, maxContentLength);
  if (!normalized && !imagePath) {
    throw new Error("Message content is required.");
  }

  const timestamp = nowIso();
  const id = crypto.randomUUID();
  const messageCount = queryOne(
    "SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?",
    [conversationId]
  );
  const isFirstUser =
    role === "user" && Number(messageCount?.count ?? 0) === 0;
  const storedContent = normalized || "Image attachment";
  const titleSource = normalized || "Image analysis";

  withTransaction((db) => {
    db.run(
      `INSERT INTO ai_messages
        (id, conversation_id, role, content, created_at, image_path, image_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        conversationId,
        role,
        storedContent,
        timestamp,
        imagePath || null,
        imageMime || null,
      ]
    );
    if (isFirstUser) {
      db.run(`UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`, [
        titleFromPrompt(titleSource),
        timestamp,
        conversationId,
      ]);
    } else {
      touchConversation(db, conversationId, timestamp);
    }
  });

  return mapMessage({
    id,
    conversation_id: conversationId,
    role,
    content: storedContent,
    created_at: timestamp,
    image_path: imagePath || null,
    image_mime: imageMime || null,
  });
}

export function deleteConversation(id) {
  const existing = getConversationById(id);
  if (!existing) {
    throw new Error("Conversation not found.");
  }

  const imageRows = queryAll(
    `SELECT image_path FROM ai_messages
     WHERE conversation_id = ? AND image_path IS NOT NULL`,
    [id]
  );

  withTransaction((db) => {
    db.run("DELETE FROM ai_messages WHERE conversation_id = ?", [id]);
    db.run("DELETE FROM ai_conversations WHERE id = ?", [id]);
  });

  return {
    id,
    imagePaths: imageRows
      .map((row) => row.image_path)
      .filter((value) => typeof value === "string" && value),
  };
}

export function getConversationBundle(conversationId) {
  const conversation = getConversationById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }
  return {
    conversation,
    messages: getMessagesByConversation(conversationId),
  };
}

const CHAT_DRAFT_KEY = "aiChatDraft";
const MAX_DRAFT_LENGTH = 12_000;

export function getChatDraft() {
  const row = queryOne("SELECT value FROM settings WHERE key = ?", [CHAT_DRAFT_KEY]);
  return typeof row?.value === "string" ? row.value : "";
}

export function saveChatDraft(content) {
  const next =
    typeof content === "string" ? content.slice(0, MAX_DRAFT_LENGTH) : "";
  withTransaction((db) => {
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [CHAT_DRAFT_KEY, next]
    );
  });
  return next;
}
