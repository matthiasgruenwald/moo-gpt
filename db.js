/**
 * db.js – SQLite-Datenbankmodul für mmbbs-gpt (Issue #2)
 * Spiegelt alle Threads und Nachrichten lokal in /opt/mmbbs-gpt/chats.db
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/mmbbs-gpt/chats.db';

let db;

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

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
  `);

  // Migrationen für bestehende DBs
  try { db.exec(`ALTER TABLE activities ADD COLUMN opener TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN upload_mode TEXT DEFAULT 'off'`); } catch (_) {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'`); } catch (_) {}

  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return db;
}

/**
 * Legt einen neuen Thread-Eintrag an.
 * Gibt die interne DB-ID zurück.
 */
export function saveThread({ moodle_user_id, moodle_user_name, activity_id, openai_thread_id }) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO threads (moodle_user_id, moodle_user_name, activity_id, openai_thread_id)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    moodle_user_id   || null,
    moodle_user_name || null,
    activity_id      || null,
    openai_thread_id
  );
  // Falls IGNORE griff (Thread existiert schon), trotzdem ID zurückgeben
  if (result.lastInsertRowid === 0) {
    return getThreadDbId(openai_thread_id);
  }
  return result.lastInsertRowid;
}

/** Gibt die interne DB-ID für eine OpenAI-Thread-ID zurück. */
export function getThreadDbId(openai_thread_id) {
  const row = db.prepare('SELECT id FROM threads WHERE openai_thread_id = ?').get(openai_thread_id);
  return row ? row.id : null;
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
 * Gibt alle Nachrichten eines Threads zurück (chronologisch).
 * Maximal 100 Einträge, um das Chat-Fenster nicht zu überfluten.
 * Issue #3: Chatverlauf beim Reconnect
 */
export function getMessages(thread_db_id) {
  return db.prepare(`
    SELECT role, content, content_type, created_at FROM messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
    LIMIT 100
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
 * Speichert oder aktualisiert Aufgabentitel, Opener und Upload-Modus (Issue #5/#10).
 * upload_mode: 'off' | 'images' | 'files'
 */
export function upsertActivity(activity_id, activity_name, opener, upload_mode) {
  if (!activity_id || !activity_name) return;
  db.prepare(`
    INSERT INTO activities (activity_id, activity_name, opener, upload_mode, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      activity_name = excluded.activity_name,
      opener        = COALESCE(excluded.opener, activities.opener),
      upload_mode   = COALESCE(excluded.upload_mode, activities.upload_mode, 'off'),
      updated_at    = CURRENT_TIMESTAMP
  `).run(activity_id, activity_name, opener || null, upload_mode || 'off');
}

/** Gibt activity_name, opener und upload_mode zurück (oder null). */
export function getActivity(activity_id) {
  return db.prepare('SELECT activity_name, opener, upload_mode FROM activities WHERE activity_id = ?').get(activity_id) || null;
}

/** Abwärtskompatibilität */
export function getActivityName(activity_id) {
  const row = getActivity(activity_id);
  return row ? row.activity_name : null;
}

/**
 * Gibt alle Schüler einer Aktivität zurück (Issue #5: Teacher-Dashboard).
 * Enthält Name, User-ID, letzte Aktivität, Nachrichtenanzahl.
 */
export function getStudents(activity_id) {
  return db.prepare(`
    SELECT t.id              AS thread_db_id,
           t.moodle_user_id,
           t.moodle_user_name,
           t.updated_at,
           COUNT(m.id)       AS message_count
    FROM threads t
    LEFT JOIN messages m ON m.thread_id = t.id
    WHERE t.activity_id = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(activity_id);
}
