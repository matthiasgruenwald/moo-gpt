/**
 * Tests für DB-Migrationen: #61
 * - token_log.call_type
 * - activities.teacher_id + activities.teacher_name
 *
 * Nutzt direkt better-sqlite3 (:memory:), kein Singleton aus db.js.
 * So können Migrationen isoliert und idempotent getestet werden.
 *
 * Run: DB_PATH=:memory: node --test test/db-migration.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Hilfsfunktion: erzeugt eine frische In-Memory-DB mit demselben Schema
// und denselben Migrationsschritten wie db.js
function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Basis-Schema (relevante Tabellen)
  db.exec(`
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
  `);

  // Bestehende Spalten, die vor den neuen Migrationen schon da sind
  try { db.exec(`ALTER TABLE activities ADD COLUMN opener TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN upload_mode TEXT DEFAULT 'off'`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN title TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN bot_icon TEXT DEFAULT 'grw'`); } catch (_) {}
  try { db.exec(`ALTER TABLE token_log ADD COLUMN message_id INTEGER`); } catch (_) {}

  return db;
}

// Führt die Migrationen für #61 auf einer vorhandenen DB aus (wie in db.js)
function runMigration61(db) {
  try { db.exec(`ALTER TABLE token_log ADD COLUMN call_type TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN teacher_id TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE activities ADD COLUMN teacher_name TEXT`); } catch (_) {}
}

function getColumns(db, table) {
  return db.pragma(`table_info(${table})`).map(c => c.name);
}

describe('DB-Migration #61', () => {
  test('token_log erhält Spalte call_type', () => {
    const db = buildTestDb();
    runMigration61(db);

    const cols = getColumns(db, 'token_log');
    assert.ok(cols.includes('call_type'), 'call_type muss in token_log existieren');
  });

  test('activities erhält Spalten teacher_id und teacher_name', () => {
    const db = buildTestDb();
    runMigration61(db);

    const cols = getColumns(db, 'activities');
    assert.ok(cols.includes('teacher_id'),   'teacher_id muss in activities existieren');
    assert.ok(cols.includes('teacher_name'), 'teacher_name muss in activities existieren');
  });

  test('Migration ist idempotent — zweimaliger Aufruf kein Fehler', () => {
    const db = buildTestDb();
    runMigration61(db);
    assert.doesNotThrow(() => runMigration61(db), 'zweite Migration darf nicht werfen');
  });

  test('Eintrag mit call_type speichern und abrufen', () => {
    const db = buildTestDb();
    runMigration61(db);

    db.prepare(`
      INSERT INTO token_log (activity_id, model, call_type, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('act-1', 'gpt-4.1-nano', 'live-summary', 10, 5, 15);

    const row = db.prepare(`SELECT * FROM token_log WHERE call_type = ?`).get('live-summary');
    assert.equal(row.call_type, 'live-summary');
    assert.equal(row.activity_id, 'act-1');
    assert.equal(row.prompt_tokens, 10);
  });

  test('Chat-Einträge (call_type IS NULL) bleiben unverändert abfragbar', () => {
    const db = buildTestDb();
    runMigration61(db);

    // Chat-Eintrag ohne call_type
    db.prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?)
    `).run('act-1', 'gpt-5', 100, 50, 150);

    const rows = db.prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type IS NULL
    `).all('act-1');
    assert.equal(rows.length, 1, 'Chat-Eintrag muss gefunden werden');
  });

  test('Werkzeug-Einträge werden von Chat-Abfrage nicht zurückgegeben', () => {
    const db = buildTestDb();
    runMigration61(db);

    db.prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?)
    `).run('act-1', 'gpt-5', 100, 50, 150);

    db.prepare(`
      INSERT INTO token_log (activity_id, model, call_type, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('act-1', 'gpt-4.1-nano', 'criteria', 20, 10, 30);

    const chatRows = db.prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type IS NULL
    `).all('act-1');
    assert.equal(chatRows.length, 1, 'Nur Chat-Eintrag darf zurückkommen');
    assert.equal(chatRows[0].model, 'gpt-5');
  });

  test('teacher_id in activities setzen (UPSERT-Logik)', () => {
    const db = buildTestDb();
    runMigration61(db);

    db.prepare(`INSERT INTO activities (activity_id, activity_name) VALUES (?, ?)`).run('act-1', 'Mathe');

    // Ersten Aufruf: teacher_id setzen
    db.prepare(`
      UPDATE activities SET teacher_id = ?, teacher_name = ?
      WHERE activity_id = ? AND teacher_id IS NULL
    `).run('user-42', 'Frau Müller', 'act-1');

    const act = db.prepare(`SELECT * FROM activities WHERE activity_id = ?`).get('act-1');
    assert.equal(act.teacher_id,   'user-42');
    assert.equal(act.teacher_name, 'Frau Müller');

    // Zweiter Aufruf: teacher_id soll nicht überschrieben werden
    db.prepare(`
      UPDATE activities SET teacher_id = ?, teacher_name = ?
      WHERE activity_id = ? AND teacher_id IS NULL
    `).run('user-99', 'Herr Schmidt', 'act-1');

    const actAfter = db.prepare(`SELECT * FROM activities WHERE activity_id = ?`).get('act-1');
    assert.equal(actAfter.teacher_id,   'user-42', 'teacher_id darf nicht überschrieben werden');
    assert.equal(actAfter.teacher_name, 'Frau Müller');
  });
});
