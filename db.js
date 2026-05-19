/**
 * db.js – SQLite-Datenbankmodul für moo-gpt
 * Pfad über DB_PATH-Env überschreibbar (Default: /opt/moo-gpt/chats.db)
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/moo-gpt/chats.db';

let db;

export function getDb() { return db; }

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // Explizit OFF – Migration bricht sonst FK-Referenz in messages

  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      moodle_user_id  TEXT,
      moodle_user_name TEXT,
      activity_id     TEXT,
      openai_thread_id TEXT NOT NULL UNIQUE,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id  INTEGER NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      activity_id   TEXT PRIMARY KEY,
      activity_name TEXT,
      opener        TEXT,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teacher_templates (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      moodle_user_id TEXT NOT NULL,
      name           TEXT NOT NULL,
      title          TEXT,
      bot_icon       TEXT DEFAULT 'grw',
      opener         TEXT,
      upload_mode    TEXT DEFAULT 'off',
      hints_template TEXT,
      is_default     INTEGER DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_template (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      title          TEXT,
      bot_icon       TEXT DEFAULT 'grw',
      opener         TEXT,
      upload_mode    TEXT DEFAULT 'off',
      hints_template TEXT,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id          INTEGER,
      activity_id        TEXT,
      model              TEXT,
      prompt_tokens      INTEGER,
      completion_tokens  INTEGER,
      total_tokens       INTEGER,
      created_at         DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      moodle_user_id TEXT PRIMARY KEY,
      granted_by     TEXT,
      granted_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      scope       TEXT NOT NULL,
      type        TEXT NOT NULL,
      model       TEXT,
      content     TEXT NOT NULL,
      version     INTEGER DEFAULT 1,
      created_by  TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teacher_preferences (
      moodle_user_id  TEXT PRIMARY KEY,
      preferred_model TEXT
    );

    CREATE TABLE IF NOT EXISTS message_feedback (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id    INTEGER NOT NULL,
      thread_id     INTEGER NOT NULL,
      activity_id   TEXT,
      rating        TEXT NOT NULL,
      comment       TEXT,
      improved_text TEXT,
      rated_by      TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id   TEXT,
      teacher_name TEXT,
      name         TEXT NOT NULL,
      description  TEXT,
      example_msgs TEXT,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS erkenntnisse (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id  TEXT,
      content      TEXT NOT NULL,
      source       TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrationen für bestehende DBs
  try { db.exec(`ALTER TABLE activities ADD COLUMN opener TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN upload_mode TEXT DEFAULT 'off'`); } catch (_) {}
  // P5a: Aktivitäts-Config aus DB
  try { db.exec(`ALTER TABLE activities ADD COLUMN title TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN bot_icon TEXT DEFAULT 'grw'`); } catch (_) {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'`); } catch (_) {}
  // Issue #12: message_id in token_log für Kostenanzeige pro Nachrichtenrunde
  try { db.exec(`ALTER TABLE token_log ADD COLUMN message_id INTEGER`); } catch (_) {}
  // Issue #19: Unique-Index damit saveFeedback ON CONFLICT funktioniert
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_msgid ON message_feedback (message_id)`); } catch (_) {}
  // P2: Soft-Delete für Kriterien
  try { db.exec(`ALTER TABLE erkenntnisse ADD COLUMN status TEXT DEFAULT 'active'`); } catch (_) {}
  // Issue #13: openai_thread_id nullable machen (Responses API braucht keinen Thread)
  {
    const col = db.pragma('table_info(threads)').find(c => c.name === 'openai_thread_id');
    if (col && col.notnull === 1) {
      db.exec(`
        ALTER TABLE threads RENAME TO threads_old;
        CREATE TABLE threads (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          moodle_user_id   TEXT,
          moodle_user_name TEXT,
          activity_id      TEXT,
          openai_thread_id TEXT,
          created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO threads SELECT * FROM threads_old;
        DROP TABLE threads_old;
      `);
      console.log('[DB] Migration: openai_thread_id ist jetzt nullable');
    }
  }

  // P6: Personas-Umbau – alte activity_id-Struktur durch teacher_id-Struktur ersetzen
  {
    const cols = db.pragma('table_info(personas)').map(c => c.name);
    if (cols.includes('activity_id')) {
      db.exec(`
        DROP TABLE IF EXISTS personas;
        CREATE TABLE personas (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          teacher_id   TEXT,
          teacher_name TEXT,
          name         TEXT NOT NULL,
          description  TEXT,
          example_msgs TEXT,
          created_by   TEXT,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DB] Migration P6: personas-Tabelle auf teacher_id-Schema migriert');
    }
  }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_personas_teacher_id ON personas (teacher_id)`); } catch (_) {}

  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return db;
}

/**
 * Legt einen neuen Thread-Eintrag an.
 * Gibt die interne DB-ID zurück.
 * openai_thread_id ist optional (Responses API braucht keinen Thread).
 */
export function saveThread({ moodle_user_id, moodle_user_name, activity_id, openai_thread_id = null }) {
  const stmt = db.prepare(`
    INSERT INTO threads (moodle_user_id, moodle_user_name, activity_id, openai_thread_id)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    moodle_user_id   || null,
    moodle_user_name || null,
    activity_id      || null,
    openai_thread_id || null
  );
  return result.lastInsertRowid;
}

/** updated_at aktualisieren, wenn neue Nachrichten kommen */
export function touchThread(thread_db_id) {
  db.prepare(`UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(thread_db_id);
}

/**
 * Sucht den zuletzt aktualisierten Thread für einen Nutzer + Aktivität.
 * Gibt das komplette row-Objekt zurück oder null.
 * Issue #3: Thread-Persistenz
 */
export function findThread({ moodle_user_id, activity_id }) {
  if (!moodle_user_id || !activity_id) return null;
  const row = db.prepare(`
    SELECT * FROM threads
    WHERE moodle_user_id = ? AND activity_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(moodle_user_id, activity_id);
  return row || null;
}

/**
 * Gibt die anzeigbaren Nachrichten eines Threads zurück (chronologisch).
 * Filtert task_image-Einträge heraus (Aufgabenbilder – nur für API-Input relevant).
 * Issue #3: Chatverlauf beim Reconnect
 * Issue #12: Kosten-Spalten (cost_prompt, cost_completion) via JOIN mit token_log
 */
export function getMessages(thread_db_id) {
  return db.prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion,
           mf.rating            AS fb_rating,
           mf.comment           AS fb_comment,
           mf.improved_text     AS fb_improved
    FROM messages m
    LEFT JOIN token_log tl        ON tl.message_id = m.id
    LEFT JOIN message_feedback mf ON mf.message_id = m.id
    WHERE m.thread_id = ? AND COALESCE(m.content_type, 'text') != 'task_image'
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(thread_db_id);
}

/**
 * Wie getMessages, aber inkl. task_image-Einträge.
 * Wird von streamResponse genutzt, um die vollständige History für die API zu bauen.
 */
export function getMessagesAll(thread_db_id) {
  return db.prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion
    FROM messages m
    LEFT JOIN token_log tl ON tl.message_id = m.id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC
    LIMIT 150
  `).all(thread_db_id);
}

/**
 * Speichert eine Nachricht (role: 'user' | 'assistant').
 * content_type: 'text' | 'image' | 'pdf'
 */
export function saveMessage({ thread_db_id, role, content, content_type = 'text' }) {
  const stmt = db.prepare(`
    INSERT INTO messages (thread_id, role, content, content_type) VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(thread_db_id, role, content, content_type);
  touchThread(thread_db_id);
  return result.lastInsertRowid;
}

/**
 * Füllt einen fehlenden Namen in einem bestehenden Thread nach (Issue #5).
 * Überschreibt nur, wenn moodle_user_name noch NULL oder leer ist.
 */
export function updateThreadName(thread_db_id, moodle_user_name) {
  if (!thread_db_id || !moodle_user_name) return;
  db.prepare(`
    UPDATE threads
    SET moodle_user_name = ?
    WHERE id = ? AND (moodle_user_name IS NULL OR moodle_user_name = '')
  `).run(moodle_user_name, thread_db_id);
}



/**
 * Gibt alle Schüler einer Aktivität zurück (Issue #5: Teacher-Dashboard).
 * Enthält Name, User-ID, letzte Aktivität, Nachrichtenanzahl + Kosten-Tokens (Issue #12).
 */
export function getStudents(activity_id) {
  return db.prepare(`
    SELECT t.id              AS thread_db_id,
           t.moodle_user_id,
           t.moodle_user_name,
           t.updated_at,
           COUNT(m.id)                             AS message_count,
           COALESCE(tl_agg.cost_prompt, 0)         AS cost_prompt,
           COALESCE(tl_agg.cost_completion, 0)     AS cost_completion
    FROM threads t
    LEFT JOIN messages m ON m.thread_id = t.id
    LEFT JOIN (
      SELECT thread_id,
             SUM(prompt_tokens)     AS cost_prompt,
             SUM(completion_tokens) AS cost_completion
      FROM token_log
      GROUP BY thread_id
    ) tl_agg ON tl_agg.thread_id = t.id
    WHERE t.activity_id = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(activity_id);
}
