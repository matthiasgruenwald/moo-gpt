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
  `);

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
 * Speichert eine Nachricht (role: 'user' | 'assistant').
 */
export function saveMessage({ thread_db_id, role, content }) {
  const stmt = db.prepare(`
    INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)
  `);
  const result = stmt.run(thread_db_id, role, content);
  touchThread(thread_db_id);
  return result.lastInsertRowid;
}
