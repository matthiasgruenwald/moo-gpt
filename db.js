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

    CREATE TABLE IF NOT EXISTS message_edits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL,
      content     TEXT NOT NULL,
      version     INTEGER NOT NULL DEFAULT 1,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_memory (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id      TEXT NOT NULL,
      activity_id     TEXT NOT NULL,
      preference_text TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, activity_id)
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

  // Issue #55: Rückfragen-Präferenz pro Lehrkraft
  try { db.exec(`ALTER TABLE teacher_preferences ADD COLUMN prefer_suggest_questions INTEGER DEFAULT 1`); } catch (_) {}

  // Issue #61: Werkzeug-Kosten — call_type in token_log, teacher_id/name in activities
  try { db.exec(`ALTER TABLE token_log ADD COLUMN call_type TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN teacher_id TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN teacher_name TEXT`); } catch (_) {}

  // Issue #87: Audio-Transkription — Sekunden in token_log
  try { db.exec(`ALTER TABLE token_log ADD COLUMN audio_seconds REAL`); } catch (_) {}

  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return db;
}
