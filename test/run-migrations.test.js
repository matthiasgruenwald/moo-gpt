/**
 * Tests für runMigrations() – Issue #169
 *
 * Prüft:
 * - schema_migrations-Tabelle wird angelegt
 * - frische DB: alle Migrationen werden ausgeführt, Versions-Einträge landen in schema_migrations
 * - bereits migrierte DB: runMigrations() läuft durch, keine Fehler, keine doppelte Ausführung
 * - neue Migration wird nachgezogen, bereits angewandte werden übersprungen
 *
 * Run: node --test test/run-migrations.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations, MIGRATIONS } from '../db.js';

/**
 * Erstellt eine In-Memory-DB mit dem Basis-Schema (entspricht dem CREATE TABLE
 * IF NOT EXISTS-Block in initDb). runMigrations() setzt auf diesem Schema auf.
 */
function buildFreshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  // Basis-Schema – identisch mit dem CREATE TABLE-Block in initDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      moodle_user_id   TEXT,
      moodle_user_name TEXT,
      activity_id      TEXT,
      openai_thread_id TEXT NOT NULL UNIQUE,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
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
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id         INTEGER,
      activity_id       TEXT,
      model             TEXT,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      total_tokens      INTEGER,
      created_at        DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      moodle_user_id TEXT PRIMARY KEY,
      granted_by     TEXT,
      granted_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      scope      TEXT NOT NULL,
      type       TEXT NOT NULL,
      model      TEXT,
      content    TEXT NOT NULL,
      version    INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id TEXT,
      content     TEXT NOT NULL,
      source      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS message_edits (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      content    TEXT NOT NULL,
      version    INTEGER NOT NULL DEFAULT 1,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS student_memory (
      student_id      TEXT PRIMARY KEY,
      preference_text TEXT NOT NULL DEFAULT '',
      preferred_voice TEXT NOT NULL DEFAULT 'nova',
      tts_autoplay    INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function getAppliedVersions(db) {
  return db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version);
}

function getColumns(db, table) {
  return db.pragma(`table_info(${table})`).map(c => c.name);
}

describe('runMigrations()', () => {
  test('schema_migrations-Tabelle wird angelegt', () => {
    const db = buildFreshDb();
    runMigrations(db);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).all();
    assert.equal(tables.length, 1, 'schema_migrations muss existieren');
  });

  test('frische DB: alle Migrations-Versionen werden eingetragen', () => {
    const db = buildFreshDb();
    runMigrations(db);

    const applied = getAppliedVersions(db);
    assert.equal(applied.length, MIGRATIONS.length, 'Alle Migrationen müssen eingetragen sein');
    assert.equal(applied[0], 1, 'Version 1 muss enthalten sein');
    assert.equal(applied[applied.length - 1], MIGRATIONS.length, `Letzte Version muss ${MIGRATIONS.length} sein`);
  });

  test('bereits migrierte DB: runMigrations() ist idempotent', () => {
    const db = buildFreshDb();
    runMigrations(db);
    const afterFirst = getAppliedVersions(db);

    // zweiter Aufruf darf keinen Fehler werfen und darf keine Duplikate erzeugen
    assert.doesNotThrow(() => runMigrations(db), 'zweiter Aufruf darf nicht werfen');
    const afterSecond = getAppliedVersions(db);
    assert.deepEqual(afterFirst, afterSecond, 'schema_migrations darf keine doppelten Einträge haben');
  });

  test('neue Migration wird nachgezogen, angewandte werden übersprungen', () => {
    const db = buildFreshDb();
    const last = MIGRATIONS[MIGRATIONS.length - 1];

    // schema_migrations-Tabelle anlegen und alle Versionen außer der letzten als angewandt markieren
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )`);
    for (const { version } of MIGRATIONS.slice(0, -1)) {
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(version);
    }

    // runMigrations muss die letzte Migration nachziehen
    runMigrations(db);

    const applied = getAppliedVersions(db);
    assert.ok(applied.includes(last.version), `Version ${last.version} muss nach runMigrations in schema_migrations sein`);
    assert.equal(applied.length, MIGRATIONS.length, 'Genau alle Versionen müssen eingetragen sein');
  });

  test('frische DB: activities enthält alle erwarteten Spalten nach Migrationen', () => {
    const db = buildFreshDb();
    runMigrations(db);

    const cols = getColumns(db, 'activities');
    assert.ok(cols.includes('opener'),               'opener muss in activities sein');
    assert.ok(cols.includes('upload_mode'),          'upload_mode muss in activities sein');
    assert.ok(cols.includes('title'),                'title muss in activities sein');
    assert.ok(cols.includes('bot_icon'),             'bot_icon muss in activities sein');
    assert.ok(cols.includes('teacher_id'),           'teacher_id muss in activities sein');
    assert.ok(cols.includes('teacher_name'),         'teacher_name muss in activities sein');
    assert.ok(cols.includes('audio_input'),          'audio_input muss in activities sein');
    assert.ok(cols.includes('audio_output'),         'audio_output muss in activities sein');
    assert.ok(cols.includes('tts_voice'),            'tts_voice muss in activities sein');
    assert.ok(cols.includes('audio_student_options'),'audio_student_options muss in activities sein');
    assert.ok(cols.includes('model'),                'model muss in activities sein');
    assert.ok(cols.includes('math_mode'),            'math_mode muss in activities sein');
  });

  test('frische DB: token_log enthält alle erwarteten Spalten nach Migrationen', () => {
    const db = buildFreshDb();
    runMigrations(db);

    const cols = getColumns(db, 'token_log');
    assert.ok(cols.includes('message_id'),    'message_id muss in token_log sein');
    assert.ok(cols.includes('call_type'),     'call_type muss in token_log sein');
    assert.ok(cols.includes('audio_seconds'), 'audio_seconds muss in token_log sein');
    assert.ok(cols.includes('tts_characters'),'tts_characters muss in token_log sein');
  });

  test('frische DB: keine Fehler durch Duplikat-Migrationen (audio_output etc.)', () => {
    const db = buildFreshDb();
    // Früher hätte zweimaliges ALTER TABLE audio_output einen Fehler geworfen.
    // Mit schema_migrations passiert das nicht mehr.
    assert.doesNotThrow(() => runMigrations(db), 'Keine Fehler durch Duplikat-Migrationen');

    // Spalte genau einmal vorhanden (PRAGMA gibt jede Spalte nur einmal zurück)
    const cols = getColumns(db, 'activities');
    const audioOutputCount = cols.filter(c => c === 'audio_output').length;
    assert.equal(audioOutputCount, 1, 'audio_output darf nur einmal in activities vorkommen');
  });
});
