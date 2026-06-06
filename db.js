/**
 * db.js – SQLite-Datenbankmodul für moo-gpt
 * Pfad über DB_PATH-Env überschreibbar (Default: /opt/moo-gpt/chats.db)
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/moo-gpt/chats.db';

/**
 * Adds a column to a table if it does not already exist.
 * Idempotent: uses PRAGMA table_info to check before issuing ALTER TABLE.
 * Real errors (e.g. invalid SQL, missing table) propagate to the caller.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} table - table name
 * @param {string} column - column name to add
 * @param {string} definition - column type and optional constraints, e.g. 'TEXT' or 'REAL DEFAULT 0'
 */
export function addColumn(db, table, column, definition) {
  const exists = db.pragma(`table_info(${table})`).some(c => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

let db;

export function getDb() { return db; }

/**
 * Versionierte Migrations-Liste – Issue #169.
 * Jeder Eintrag wird genau einmal ausgeführt; die angewandte Version wird in
 * schema_migrations protokolliert. Doppelte ALTER-Versuche (audio_output,
 * tts_voice, audio_student_options) sind auf je eine Versions-Nummer reduziert.
 */
export const MIGRATIONS = [
  // v1–v8: P5a / frühe Spalten-Erweiterungen
  // addColumn() makes each migration idempotent: skips ALTER if column already exists in base schema.
  { version: 1,  up: (db) => addColumn(db, 'activities', 'opener',       'TEXT') },
  { version: 2,  up: (db) => addColumn(db, 'activities', 'upload_mode',  `TEXT DEFAULT 'off'`) },
  { version: 3,  up: (db) => addColumn(db, 'activities', 'title',        'TEXT') },
  { version: 4,  up: (db) => addColumn(db, 'activities', 'bot_icon',     `TEXT DEFAULT 'grw'`) },
  { version: 5,  up: (db) => addColumn(db, 'messages',   'content_type', `TEXT DEFAULT 'text'`) },
  // Issue #12: message_id in token_log für Kostenanzeige pro Nachrichtenrunde
  { version: 6,  up: (db) => addColumn(db, 'token_log',  'message_id',   'INTEGER') },
  // Issue #19: Unique-Index damit saveFeedback ON CONFLICT funktioniert
  { version: 7,  up: (db) => db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_msgid ON message_feedback (message_id)`) },
  // P2: Soft-Delete für Kriterien
  { version: 8,  up: (db) => addColumn(db, 'erkenntnisse', 'status', `TEXT DEFAULT 'active'`) },

  // Issue #13: openai_thread_id nullable machen (Responses API braucht keinen Thread)
  {
    version: 9,
    up: (db) => {
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
        console.log('[DB] Migration v9: openai_thread_id ist jetzt nullable');
      }
    },
  },

  // P6: Personas-Umbau – alte activity_id-Struktur durch teacher_id-Struktur ersetzen
  {
    version: 10,
    up: (db) => {
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
        console.log('[DB] Migration v10 (P6): personas-Tabelle auf teacher_id-Schema migriert');
      }
    },
  },
  { version: 11, up: (db) => db.exec(`CREATE INDEX IF NOT EXISTS idx_personas_teacher_id ON personas (teacher_id)`) },

  // P7: student_memory globalisieren (ADR 0003) — alte activity_id-Spalte erkannt → Tabelle neu anlegen
  {
    version: 12,
    up: (db) => {
      const cols = db.pragma('table_info(student_memory)').map(c => c.name);
      if (cols.includes('activity_id')) {
        db.exec(`
          DROP TABLE IF EXISTS student_memory;
          CREATE TABLE student_memory (
            student_id      TEXT PRIMARY KEY,
            preference_text TEXT NOT NULL DEFAULT '',
            preferred_voice TEXT NOT NULL DEFAULT 'nova',
            tts_autoplay    INTEGER NOT NULL DEFAULT 0,
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        console.log('[DB] Migration v12 (P7): student_memory auf globales Schema migriert (activity_id entfernt)');
      }
    },
  },

  // Issue #55: Rückfragen-Präferenz pro Lehrkraft
  { version: 13, up: (db) => addColumn(db, 'teacher_preferences', 'prefer_suggest_questions', 'INTEGER DEFAULT 1') },

  // Issue #61: Werkzeug-Kosten — call_type in token_log, teacher_id/name in activities
  { version: 14, up: (db) => addColumn(db, 'token_log',  'call_type',    'TEXT') },
  { version: 15, up: (db) => addColumn(db, 'activities', 'teacher_id',   'TEXT') },
  { version: 16, up: (db) => addColumn(db, 'activities', 'teacher_name', 'TEXT') },

  // Issue #87: Audio-Transkription — Sekunden in token_log
  { version: 17, up: (db) => addColumn(db, 'token_log',  'audio_seconds',   'REAL') },
  // Issue #89: Mikrofon-Opt-in pro Aktivität
  { version: 18, up: (db) => addColumn(db, 'activities', 'audio_input',      `TEXT DEFAULT 'off'`) },
  // P8: TTS-Kosten — Zeichenanzahl in token_log (Issue #96)
  { version: 19, up: (db) => addColumn(db, 'token_log',  'tts_characters',   'INTEGER') },
  // P9 / Issue #94/#104: TTS-Konfiguration pro Aktivität (doppelte Blöcke auf eine Version reduziert)
  { version: 20, up: (db) => addColumn(db, 'activities', 'audio_output',         `TEXT DEFAULT 'off'`) },
  { version: 21, up: (db) => addColumn(db, 'activities', 'tts_voice',            `TEXT DEFAULT 'nova'`) },
  { version: 22, up: (db) => addColumn(db, 'activities', 'audio_student_options', `TEXT DEFAULT 'off'`) },

  // Issue #107: Modell pro Aktivität (ADR 0004)
  { version: 23, up: (db) => addColumn(db, 'activities',        'model', 'TEXT') },
  { version: 24, up: (db) => addColumn(db, 'teacher_templates', 'model', 'TEXT') },
  { version: 25, up: (db) => addColumn(db, 'system_template',   'model', 'TEXT') },

  // Issue #111: Audio-Felder in teacher_templates und system_template
  { version: 26, up: (db) => addColumn(db, 'teacher_templates', 'audio_input',           `TEXT DEFAULT 'off'`) },
  { version: 27, up: (db) => addColumn(db, 'teacher_templates', 'audio_output',          `TEXT DEFAULT 'off'`) },
  { version: 28, up: (db) => addColumn(db, 'teacher_templates', 'tts_voice',             `TEXT DEFAULT 'nova'`) },
  { version: 29, up: (db) => addColumn(db, 'teacher_templates', 'audio_student_options', `TEXT DEFAULT 'off'`) },
  { version: 30, up: (db) => addColumn(db, 'system_template',   'audio_input',           `TEXT DEFAULT 'off'`) },
  { version: 31, up: (db) => addColumn(db, 'system_template',   'audio_output',          `TEXT DEFAULT 'off'`) },
  { version: 32, up: (db) => addColumn(db, 'system_template',   'tts_voice',             `TEXT DEFAULT 'nova'`) },
  { version: 33, up: (db) => addColumn(db, 'system_template',   'audio_student_options', `TEXT DEFAULT 'off'`) },

  // Issue #166: mathMode
  { version: 34, up: (db) => addColumn(db, 'activities',        'math_mode', `TEXT DEFAULT 'off'`) },
  { version: 35, up: (db) => addColumn(db, 'teacher_templates', 'math_mode', `TEXT DEFAULT 'off'`) },
  { version: 36, up: (db) => addColumn(db, 'system_template',   'math_mode', `TEXT DEFAULT 'off'`) },

  // Issue #183: assist_model, chat_temperature, assist_temperature
  // Previously applied as naked try/catch blocks after runMigrations() – now properly versioned.
  { version: 37, up: (db) => addColumn(db, 'activities',        'assist_model',       'TEXT') },
  { version: 38, up: (db) => addColumn(db, 'activities',        'chat_temperature',   'REAL') },
  { version: 39, up: (db) => addColumn(db, 'activities',        'assist_temperature', 'REAL') },
  { version: 40, up: (db) => addColumn(db, 'teacher_templates', 'assist_model',       'TEXT') },
  { version: 41, up: (db) => addColumn(db, 'teacher_templates', 'chat_temperature',   'REAL') },
  { version: 42, up: (db) => addColumn(db, 'teacher_templates', 'assist_temperature', 'REAL') },
  { version: 43, up: (db) => addColumn(db, 'system_template',   'assist_model',       'TEXT') },
  { version: 44, up: (db) => addColumn(db, 'system_template',   'chat_temperature',   'REAL') },
  { version: 45, up: (db) => addColumn(db, 'system_template',   'assist_temperature', 'REAL') },
];

/**
 * Runs all pending migrations in order.
 * Creates schema_migrations if absent; records each applied version.
 *
 * Migrations must be idempotent by design (use addColumn / IF NOT EXISTS / etc.).
 * Real errors propagate to the caller — no catch-all that silently marks a
 * broken migration as applied.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  for (const { version, up } of MIGRATIONS) {
    if (!applied.has(version)) {
      up(db); // errors propagate — a broken migration must not be silently marked as applied
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    }
  }
}

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

    CREATE TABLE IF NOT EXISTS message_edits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL,
      content     TEXT NOT NULL,
      version     INTEGER NOT NULL DEFAULT 1,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_memory (
      student_id      TEXT PRIMARY KEY,
      preference_text TEXT NOT NULL DEFAULT '',
      preferred_voice TEXT NOT NULL DEFAULT 'nova',
      tts_autoplay    INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  runMigrations(db);

  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return db;
}
