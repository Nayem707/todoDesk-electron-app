import { getDb, schedulePersist } from "./connection.js";

const ALLOWED_KEYS = new Set(["theme", "confirmBeforeDelete"]);

function parseValue(key, raw) {
  if (key === "confirmBeforeDelete") {
    return raw === "true";
  }
  return raw;
}

function serializeValue(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export function getSettings() {
  const stmt = getDb().prepare("SELECT key, value FROM settings");
  const settings = {
    theme: "system",
    confirmBeforeDelete: true,
  };

  while (stmt.step()) {
    const row = stmt.getAsObject();
    settings[row.key] = parseValue(row.key, row.value);
  }
  stmt.free();
  return settings;
}

export function updateSettings(patch = {}) {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(key)) {
      continue;
    }
    if (key === "theme" && !["light", "dark", "system"].includes(value)) {
      throw new Error("Theme must be light, dark, or system.");
    }
    if (key === "confirmBeforeDelete" && typeof value !== "boolean") {
      throw new Error("confirmBeforeDelete must be a boolean.");
    }
    stmt.run([key, serializeValue(value)]);
  }

  stmt.free();
  schedulePersist();
  return getSettings();
}
