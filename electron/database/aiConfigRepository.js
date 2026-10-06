const CONFIG_ID = "quiz";

/**
 * Stores the user's local AI configuration (provider, Ollama URL, model, temperature).
 * A factory so tests can run it against an in-memory database.
 */
export function createAiConfigRepository({ getDb, persist, defaults }) {
  function read() {
    const stmt = getDb().prepare("SELECT * FROM ai_configuration WHERE id = ?");
    stmt.bind([CONFIG_ID]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  return {
    get() {
      const row = read();
      if (!row) {
        return { ...defaults };
      }
      return {
        provider: row.provider,
        baseUrl: row.base_url,
        model: row.model,
        temperature: Number(row.temperature),
      };
    },

    save(config) {
      getDb().run(
        `INSERT INTO ai_configuration (id, provider, base_url, model, temperature, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url,
           model = excluded.model, temperature = excluded.temperature, updated_at = excluded.updated_at`,
        [CONFIG_ID, config.provider, config.baseUrl, config.model, config.temperature, new Date().toISOString()]
      );
      persist();
      return this.get();
    },
  };
}
