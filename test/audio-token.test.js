/**
 * Tests für Issue #87: DB-Migration + Token-Log Audio-Datenschicht
 *
 * Nutzt direkt better-sqlite3 (:memory:) ohne den db.js-Singleton.
 * Testet DB-Migration, saveAudioUsage und beide Aggregationsabfragen.
 *
 * Run: DB_PATH=:memory: node --test test/audio-token.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS token_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id          INTEGER,
      activity_id        TEXT,
      model              TEXT,
      prompt_tokens      INTEGER,
      completion_tokens  INTEGER,
      total_tokens       INTEGER,
      call_type          TEXT,
      created_at         DATETIME DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function runMigration87(db) {
  try { db.exec(`ALTER TABLE token_log ADD COLUMN audio_seconds REAL`); } catch (_) {}
}

function saveAudioUsage(db, threadId, activityId, audioSeconds) {
  db.prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, audio_seconds)
    VALUES (?, ?, 'transcription', ?)
  `).run(threadId || null, activityId || null, audioSeconds);
}

function getThreadAudioSeconds(db, threadDbId) {
  return db.prepare(`
    SELECT COALESCE(SUM(audio_seconds), 0) AS total_seconds
    FROM token_log
    WHERE thread_id = ? AND call_type = 'transcription' AND audio_seconds IS NOT NULL
  `).get(threadDbId);
}

function getActivityAudioSeconds(db, activityId) {
  return db.prepare(`
    SELECT COALESCE(SUM(audio_seconds), 0) AS total_seconds
    FROM token_log
    WHERE activity_id = ? AND call_type = 'transcription' AND audio_seconds IS NOT NULL
  `).get(activityId);
}

// ── Tests: DB-Migration ────────────────────────────────────────────────────────

describe('DB-Migration #87: audio_seconds', () => {
  test('token_log erhält Spalte audio_seconds nach Migration', () => {
    const db = buildTestDb();
    runMigration87(db);

    const cols = db.pragma('table_info(token_log)').map(c => c.name);
    assert.ok(cols.includes('audio_seconds'), 'audio_seconds muss in token_log existieren');
  });

  test('Migration ist idempotent – zweimaliger Aufruf wirft keinen Fehler', () => {
    const db = buildTestDb();
    runMigration87(db);
    assert.doesNotThrow(() => runMigration87(db));
  });

  test('Bestehende Token-Einträge bleiben nach Migration unverändert', () => {
    const db = buildTestDb();
    db.prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens)
      VALUES ('act-1', 'gpt-5', 100, 50)
    `).run();

    runMigration87(db);

    const row = db.prepare(`SELECT * FROM token_log WHERE activity_id = 'act-1'`).get();
    assert.equal(row.prompt_tokens, 100);
    assert.equal(row.completion_tokens, 50);
    assert.equal(row.audio_seconds, null, 'audio_seconds soll NULL für bestehende Einträge sein');
  });
});

// ── Tests: saveAudioUsage ─────────────────────────────────────────────────────

describe('saveAudioUsage', () => {
  test('schreibt Eintrag mit call_type=transcription und audio_seconds', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 1, 'act-1', 12.5);

    const row = db.prepare(`SELECT * FROM token_log WHERE call_type = 'transcription'`).get();
    assert.ok(row, 'Eintrag muss existieren');
    assert.equal(row.call_type, 'transcription');
    assert.equal(row.thread_id, 1);
    assert.equal(row.activity_id, 'act-1');
    assert.equal(row.audio_seconds, 12.5);
    assert.equal(row.prompt_tokens, null, 'prompt_tokens muss NULL sein');
    assert.equal(row.completion_tokens, null, 'completion_tokens muss NULL sein');
  });

  test('akzeptiert Sekundenbruchteile (Float)', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 2, 'act-2', 7.34);

    const row = db.prepare(`SELECT audio_seconds FROM token_log`).get();
    assert.equal(row.audio_seconds, 7.34);
  });

  test('NULL threadId wird als NULL gespeichert', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, null, 'act-1', 5.0);

    const row = db.prepare(`SELECT thread_id FROM token_log`).get();
    assert.equal(row.thread_id, null);
  });
});

// ── Tests: Aggregationsabfragen ───────────────────────────────────────────────

describe('getThreadAudioSeconds', () => {
  test('summiert Audio-Sekunden mehrerer Einträge eines Threads', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 10, 'act-1', 12.0);
    saveAudioUsage(db, 10, 'act-1', 8.5);
    saveAudioUsage(db, 10, 'act-1', 3.0);

    const { total_seconds } = getThreadAudioSeconds(db, 10);
    assert.equal(total_seconds, 23.5, 'Summe muss 23.5 s sein');
  });

  test('gibt 0 zurück wenn kein Eintrag vorhanden', () => {
    const db = buildTestDb();
    runMigration87(db);

    const { total_seconds } = getThreadAudioSeconds(db, 999);
    assert.equal(total_seconds, 0);
  });

  test('mischt keine Einträge anderer Threads', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 1, 'act-1', 10.0);
    saveAudioUsage(db, 2, 'act-1', 20.0);

    const { total_seconds } = getThreadAudioSeconds(db, 1);
    assert.equal(total_seconds, 10.0, 'Nur Thread 1 darf gezählt werden');
  });
});

describe('getActivityAudioSeconds', () => {
  test('summiert Audio-Sekunden aller Threads einer Aktivität', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 1, 'act-A', 15.0);
    saveAudioUsage(db, 2, 'act-A', 25.0);
    saveAudioUsage(db, 3, 'act-B', 100.0); // andere Aktivität

    const { total_seconds } = getActivityAudioSeconds(db, 'act-A');
    assert.equal(total_seconds, 40.0, 'Summe für act-A muss 40 s sein');
  });

  test('gibt 0 zurück wenn keine Audio-Einträge', () => {
    const db = buildTestDb();
    runMigration87(db);

    // Chat-Eintrag (kein Audio)
    db.prepare(`INSERT INTO token_log (activity_id, model, prompt_tokens) VALUES ('act-X', 'gpt-5', 10)`).run();

    const { total_seconds } = getActivityAudioSeconds(db, 'act-X');
    assert.equal(total_seconds, 0);
  });

  test('mischt keine Einträge anderer Aktivitäten', () => {
    const db = buildTestDb();
    runMigration87(db);

    saveAudioUsage(db, 1, 'act-1', 5.0);
    saveAudioUsage(db, 2, 'act-2', 50.0);

    const { total_seconds } = getActivityAudioSeconds(db, 'act-1');
    assert.equal(total_seconds, 5.0);
  });
});
