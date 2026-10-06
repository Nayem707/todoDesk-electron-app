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
  {
    version: 2,
    name: "create-clipboard-history",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS clipboard_items (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL UNIQUE,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS clipboard_usage (
          id TEXT PRIMARY KEY,
          clipboard_item_id TEXT NOT NULL UNIQUE,
          copy_count INTEGER NOT NULL DEFAULT 0,
          last_copied_at TEXT NOT NULL,
          FOREIGN KEY (clipboard_item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
        );
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_clipboard_items_pinned
          ON clipboard_items(is_pinned);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_clipboard_usage_copy_count
          ON clipboard_usage(copy_count);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_clipboard_usage_last_copied
          ON clipboard_usage(last_copied_at);
      `);
    },
  },
  {
    version: 3,
    name: "create-markdown-documents",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS markdown_documents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_markdown_documents_updated
          ON markdown_documents(updated_at);
      `);
    },
  },
  {
    version: 4,
    name: "create-ai-conversations",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS ai_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL
            CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
        );
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated
          ON ai_conversations(updated_at);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
          ON ai_messages(conversation_id);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_messages_created
          ON ai_messages(created_at);
      `);
    },
  },
  {
    version: 5,
    name: "add-ai-message-images",
    up(db) {
      db.run(`
        ALTER TABLE ai_messages ADD COLUMN image_path TEXT;
      `);
      db.run(`
        ALTER TABLE ai_messages ADD COLUMN image_mime TEXT;
      `);
    },
  },
  {
    version: 6,
    name: "create-form-analyses",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS form_analyses (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          final_url TEXT,
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL
            CHECK (status IN ('completed', 'failed')),
          error_code TEXT,
          error_message TEXT,
          fields TEXT NOT NULL DEFAULT '[]',
          forms TEXT NOT NULL DEFAULT '[]',
          warnings TEXT NOT NULL DEFAULT '[]',
          field_count INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_form_analyses_created
          ON form_analyses(created_at);
      `);
    },
  },
  {
    version: 7,
    name: "create-web-audits",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS web_audits (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          final_url TEXT,
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL
            CHECK (status IN ('completed', 'failed')),
          error_code TEXT,
          error_message TEXT,
          overall_score INTEGER,
          critical_count INTEGER NOT NULL DEFAULT 0,
          warning_count INTEGER NOT NULL DEFAULT 0,
          report TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_web_audits_created
          ON web_audits(created_at);
      `);
    },
  },
  {
    version: 8,
    name: "create-quiz-system",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          topic TEXT NOT NULL,
          difficulty TEXT NOT NULL
            CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
          question_types TEXT NOT NULL DEFAULT '[]',
          question_count INTEGER NOT NULL,
          time_mode TEXT NOT NULL
            CHECK (time_mode IN ('none', 'total', 'per_question')),
          total_seconds INTEGER,
          per_question_seconds INTEGER,
          focus TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS quiz_questions (
          id TEXT PRIMARY KEY,
          quiz_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          type TEXT NOT NULL
            CHECK (type IN ('single_choice', 'multiple_choice', 'true_false', 'coding')),
          question TEXT NOT NULL,
          code TEXT,
          options TEXT NOT NULL,
          correct_answers TEXT NOT NULL,
          explanation TEXT NOT NULL DEFAULT '',
          concept TEXT NOT NULL DEFAULT '',
          difficulty TEXT NOT NULL,
          estimated_seconds INTEGER NOT NULL,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS quiz_attempts (
          id TEXT PRIMARY KEY,
          quiz_id TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('in_progress', 'completed')),
          time_mode TEXT NOT NULL
            CHECK (time_mode IN ('none', 'total', 'per_question')),
          total_seconds INTEGER,
          per_question_seconds INTEGER,
          started_at INTEGER NOT NULL,
          deadline_at INTEGER,
          current_index INTEGER NOT NULL DEFAULT 0,
          active_since INTEGER,
          submitted_at INTEGER,
          submit_reason TEXT
            CHECK (submit_reason IS NULL OR submit_reason IN ('manual', 'timeout')),
          score INTEGER,
          total INTEGER,
          correct_count INTEGER,
          wrong_count INTEGER,
          skipped_count INTEGER,
          accuracy INTEGER,
          time_used_ms INTEGER,
          time_remaining_ms INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS quiz_answers (
          attempt_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          selected TEXT NOT NULL DEFAULT '[]',
          marked INTEGER NOT NULL DEFAULT 0,
          is_correct INTEGER,
          time_spent_ms INTEGER NOT NULL DEFAULT 0,
          started_at INTEGER,
          ended_at INTEGER,
          locked INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (attempt_id, question_id),
          FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
          FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS quiz_performance (
          attempt_id TEXT PRIMARY KEY,
          analysis TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_configuration (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL DEFAULT 'ollama'
            CHECK (provider IN ('ollama')),
          base_url TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT '',
          temperature REAL NOT NULL DEFAULT 0.4,
          updated_at TEXT NOT NULL
        );
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz
          ON quiz_questions(quiz_id, position);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_status
          ON quiz_attempts(status);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz
          ON quiz_attempts(quiz_id);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt
          ON quiz_answers(attempt_id, position);
      `);
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
