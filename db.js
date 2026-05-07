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
      activity_id  TEXT NOT NULL,
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
  try { db.exec(`ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'`); } catch (_) {}
  // Issue #12: message_id in token_log für Kostenanzeige pro Nachrichtenrunde
  try { db.exec(`ALTER TABLE token_log ADD COLUMN message_id INTEGER`); } catch (_) {}
  // Issue #19: Unique-Index damit saveFeedback ON CONFLICT funktioniert
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_msgid ON message_feedback (message_id)`); } catch (_) {}
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

/**
 * Speichert Token-Verbrauch nach einem Run (Issue #11).
 * usage: { prompt_tokens, completion_tokens, total_tokens } aus OpenAI-Response
 * messageId: DB-ID der zugehörigen Assistenten-Nachricht (Issue #12, für Kostenanzeige)
 */
export function saveTokenUsage(threadId, activityId, model, usage, messageId = null) {
  if (!usage) return;
  db.prepare(`
    INSERT INTO token_log (thread_id, activity_id, model, prompt_tokens, completion_tokens, total_tokens, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    threadId       || null,
    activityId     || null,
    model          || null,
    usage.prompt_tokens      ?? null,
    usage.completion_tokens  ?? null,
    usage.total_tokens       ?? null,
    messageId      || null
  );
}

/**
 * Aggregierte Token-Summen für einen Thread (Issue #12).
 * Rückgabe: { prompt_tokens, completion_tokens }
 */
export function getThreadCostTokens(threadDbId) {
  return db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE thread_id = ?
  `).get(threadDbId) || { prompt_tokens: 0, completion_tokens: 0 };
}

/**
 * Aggregierte Token-Summen für eine Aktivität (Issue #12).
 * Rückgabe: { prompt_tokens, completion_tokens }
 */
export function getActivityCostTokens(activityId) {
  return db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE activity_id = ?
  `).get(activityId) || { prompt_tokens: 0, completion_tokens: 0 };
}

// ── Admin-Verwaltung (Issue #17) ─────────────────────────────────────────────

export function isAdmin(userId) {
  if (!userId) return false;
  return !!db.prepare('SELECT 1 FROM admin_users WHERE moodle_user_id = ?').get(userId);
}

export function addAdmin(userId, grantedBy = null) {
  db.prepare(`
    INSERT OR IGNORE INTO admin_users (moodle_user_id, granted_by) VALUES (?, ?)
  `).run(userId, grantedBy);
}

export function removeAdmin(userId) {
  db.prepare('DELETE FROM admin_users WHERE moodle_user_id = ?').run(userId);
}

export function getAdmins() {
  return db.prepare('SELECT * FROM admin_users ORDER BY granted_at ASC').all();
}

// ── Prompt-Verwaltung (Issue #17/#18) ────────────────────────────────────────

export function getActiveSystemPrompt() {
  return db.prepare(`
    SELECT content, model, version, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 1
  `).get() || null;
}

export function saveSystemPrompt(content, model, createdBy) {
  const last = db.prepare(`
    SELECT version FROM prompts WHERE scope = 'global' AND type = 'system' ORDER BY id DESC LIMIT 1
  `).get();
  const version = last ? last.version + 1 : 1;
  db.prepare(`
    INSERT INTO prompts (scope, type, model, content, version, created_by)
    VALUES ('global', 'system', ?, ?, ?, ?)
  `).run(model, content, version, createdBy || null);
}

export function getPromptHistory() {
  return db.prepare(`
    SELECT id, version, model, content, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 20
  `).all();
}

export function getActiveErfahrungsprompt(activityId) {
  if (!activityId) return null;
  return db.prepare(`
    SELECT content, version, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 1
  `).get(activityId) || null;
}

export function saveErfahrungsprompt(activityId, content, createdBy) {
  const last = db.prepare(`
    SELECT version FROM prompts WHERE scope = ? AND type = 'erfahrung' ORDER BY id DESC LIMIT 1
  `).get(activityId);
  const version = last ? last.version + 1 : 1;
  db.prepare(`
    INSERT INTO prompts (scope, type, content, version, created_by)
    VALUES (?, 'erfahrung', ?, ?, ?)
  `).run(activityId, content, version, createdBy || null);
}

// ── Lehrkraft-Präferenzen (Issue #17) ────────────────────────────────────────

export function getTeacherPreference(userId) {
  if (!userId) return null;
  return db.prepare('SELECT preferred_model FROM teacher_preferences WHERE moodle_user_id = ?').get(userId) || null;
}

export function setTeacherPreference(userId, preferredModel) {
  db.prepare(`
    INSERT INTO teacher_preferences (moodle_user_id, preferred_model) VALUES (?, ?)
    ON CONFLICT(moodle_user_id) DO UPDATE SET preferred_model = excluded.preferred_model
  `).run(userId, preferredModel || null);
}

// ── Feedback-Bewertung (Issue #19) ────────────────────────────────────────────

export function saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy }) {
  db.prepare(`
    INSERT INTO message_feedback (message_id, thread_id, activity_id, rating, comment, improved_text, rated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      rating        = excluded.rating,
      comment       = excluded.comment,
      improved_text = excluded.improved_text,
      rated_by      = excluded.rated_by
  `).run(messageId, threadId, activityId || null, rating, comment || null, improvedText || null, ratedBy || null);
}

export function getErfahrungspromptHistory(activityId) {
  if (!activityId) return [];
  return db.prepare(`
    SELECT id, version, content, created_by, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 10
  `).all(activityId);
}

export function getErkenntnisse(activityId) {
  return db.prepare(`
    SELECT id, activity_id, content, source, created_at
    FROM erkenntnisse
    WHERE activity_id = ? OR activity_id IS NULL
    ORDER BY created_at DESC LIMIT 50
  `).all(activityId || '');
}

export function saveErkenntnisse(activityId, content, source) {
  db.prepare(`
    INSERT INTO erkenntnisse (activity_id, content, source) VALUES (?, ?, ?)
  `).run(activityId || null, content, source || 'ai');
}

// ── Personas & Simulation (Issue #21) ────────────────────────────────────────

export function getPersonas(activityId) {
  return db.prepare('SELECT * FROM personas WHERE activity_id = ? ORDER BY created_at ASC').all(activityId);
}

export function upsertPersona({ id, activityId, name, description, example_msgs, createdBy }) {
  if (id) {
    db.prepare(`
      UPDATE personas SET name = ?, description = ?, example_msgs = ?, created_by = ?
      WHERE id = ? AND activity_id = ?
    `).run(name, description || null, example_msgs || null, createdBy || null, id, activityId);
  } else {
    db.prepare(`
      INSERT INTO personas (activity_id, name, description, example_msgs, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(activityId, name, description || null, example_msgs || null, createdBy || null);
  }
}

export function deletePersona(id) {
  db.prepare('DELETE FROM personas WHERE id = ?').run(id);
}

export function getCriteria(activityId) {
  return db.prepare(`
    SELECT * FROM erkenntnisse
    WHERE source = 'criteria' AND (activity_id = ? OR activity_id IS NULL)
    ORDER BY created_at ASC
  `).all(activityId);
}

export function deleteCriterion(id) {
  db.prepare('DELETE FROM erkenntnisse WHERE id = ? AND source = ?').run(id, 'criteria');
}

export function getStudentMessages(activityId) {
  return db.prepare(`
    SELECT m.content, t.moodle_user_name
    FROM messages m
    JOIN threads t ON t.id = m.thread_id
    WHERE t.activity_id = ? AND m.role = 'user'
      AND COALESCE(m.content_type, 'text') = 'text'
      AND length(m.content) > 10
    ORDER BY m.created_at DESC
    LIMIT 80
  `).all(activityId);
}

export function getFeedbackByActivity(activityId) {
  return db.prepare(`
    SELECT f.*, m.content AS message_content, m.created_at AS message_created_at,
           t.moodle_user_name, t.moodle_user_id
    FROM message_feedback f
    JOIN messages m ON m.id = f.message_id
    JOIN threads  t ON t.id = f.thread_id
    WHERE f.activity_id = ?
    ORDER BY f.created_at DESC
  `).all(activityId);
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
