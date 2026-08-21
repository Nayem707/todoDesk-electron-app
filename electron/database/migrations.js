const MIGRATIONS = [
  {
    version: 1,
    name: "create-todos-and-settings",
    up(db) {
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

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_todos_dueDate ON todos(dueDate);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_todos_createdAt ON todos(createdAt);
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      const defaults = [
        ["theme", "system"],
        ["confirmBeforeDelete", "true"],
      ];

      const insert = db.prepare(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
      );
      for (const [key, value] of defaults) {
        insert.run([key, value]);
      }
      insert.free();
    },
  },
];

/**
 * @param {import('sql.js').Database} db
 */
export function runMigrations(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL
    );
  `);

  const applied = new Set();
  const result = db.exec("SELECT version FROM schema_migrations");
  if (result[0]) {
    for (const row of result[0].values) {
      applied.add(row[0]);
    }
  }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    db.run("BEGIN");
    try {
      migration.up(db);
      db.run(
        "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()]
      );
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      console.error(`[migrations] failed: ${migration.name}`, error);
      throw error;
    }
  }
}
