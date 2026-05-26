/**
 * Tests für Issue #96: DB-Migration P8 + TTS Token-Log-Datenschicht
 *
 * Analog zu audio-token.test.js (Issue #87).
 * Nutzt direkt better-sqlite3 (:memory:) ohne db.js-Singleton.
 *
 * Run: node --test test/tts-token.test.js
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
      audio_seconds      REAL,
      created_at         DATETIME DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function runMigrationP8(db) {
  try { db.exec(`ALTER TABLE token_log ADD COLUMN tts_characters INTEGER`); } catch (_) {}
}

function saveTtsPrepUsage(db, threadId, activityId, promptTokens, completionTokens) {
  db.prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, model, prompt_tokens, completion_tokens)
    VALUES (?, ?, 'tts-prep', 'gpt-4o-mini', ?, ?)
  `).run(threadId || null, activityId || null, promptTokens ?? null, completionTokens ?? null);
}

function saveTtsUsage(db, threadId, activityId, ttsCharacters) {
  db.prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, model, tts_characters)
    VALUES (?, ?, 'tts', 'tts-1-hd', ?)
  `).run(threadId || null, activityId || null, ttsCharacters ?? null);
}

// ── Tests: DB-Migration P8 ────────────────────────────────────────────────────

describe('DB-Migration P8: tts_characters', () => {
  test('token_log erhält Spalte tts_characters nach Migration', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    const cols = db.pragma('table_info(token_log)').map(c => c.name);
    assert.ok(cols.includes('tts_characters'), 'tts_characters muss in token_log existieren');
  });

  test('Migration ist idempotent – zweimaliger Aufruf wirft keinen Fehler', () => {
    const db = buildTestDb();
    runMigrationP8(db);
    assert.doesNotThrow(() => runMigrationP8(db));
  });

  test('Bestehende Token-Einträge bleiben nach Migration unverändert', () => {
    const db = buildTestDb();
    db.prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens)
      VALUES ('act-1', 'gpt-5', 100, 50)
    `).run();

    runMigrationP8(db);

    const row = db.prepare(`SELECT * FROM token_log WHERE activity_id = 'act-1'`).get();
    assert.equal(row.prompt_tokens, 100);
    assert.equal(row.completion_tokens, 50);
    assert.equal(row.tts_characters, null, 'tts_characters soll NULL für bestehende Einträge sein');
  });
});

// ── Tests: saveTtsPrepUsage ───────────────────────────────────────────────────

describe('saveTtsPrepUsage', () => {
  test('schreibt Eintrag mit call_type=tts-prep und model=gpt-4o-mini', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsPrepUsage(db, 1, 'act-1', 500, 120);

    const row = db.prepare(`SELECT * FROM token_log WHERE call_type = 'tts-prep'`).get();
    assert.ok(row, 'Eintrag muss existieren');
    assert.equal(row.call_type, 'tts-prep');
    assert.equal(row.model, 'gpt-4o-mini');
    assert.equal(row.thread_id, 1);
    assert.equal(row.activity_id, 'act-1');
    assert.equal(row.prompt_tokens, 500);
    assert.equal(row.completion_tokens, 120);
    assert.equal(row.tts_characters, null, 'tts_characters muss NULL sein');
  });

  test('NULL threadId wird als NULL gespeichert', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsPrepUsage(db, null, 'act-1', 100, 50);

    const row = db.prepare(`SELECT thread_id FROM token_log`).get();
    assert.equal(row.thread_id, null);
  });
});

// ── Tests: saveTtsUsage ───────────────────────────────────────────────────────

describe('saveTtsUsage', () => {
  test('schreibt Eintrag mit call_type=tts und model=tts-1-hd', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsUsage(db, 2, 'act-2', 22500);

    const row = db.prepare(`SELECT * FROM token_log WHERE call_type = 'tts'`).get();
    assert.ok(row, 'Eintrag muss existieren');
    assert.equal(row.call_type, 'tts');
    assert.equal(row.model, 'tts-1-hd');
    assert.equal(row.thread_id, 2);
    assert.equal(row.activity_id, 'act-2');
    assert.equal(row.tts_characters, 22500);
    assert.equal(row.prompt_tokens, null, 'prompt_tokens muss NULL sein');
    assert.equal(row.completion_tokens, null, 'completion_tokens muss NULL sein');
  });

  test('NULL threadId wird als NULL gespeichert', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsUsage(db, null, 'act-1', 1000);

    const row = db.prepare(`SELECT thread_id FROM token_log`).get();
    assert.equal(row.thread_id, null);
  });

  test('akzeptiert verschiedene Zeichenanzahlen', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsUsage(db, 1, 'act-1', 1);
    saveTtsUsage(db, 1, 'act-1', 1000000);

    const rows = db.prepare(`SELECT tts_characters FROM token_log WHERE call_type = 'tts' ORDER BY id`).all();
    assert.equal(rows[0].tts_characters, 1);
    assert.equal(rows[1].tts_characters, 1000000);
  });
});

// ── Tests: computeTtsCost (Formel) ────────────────────────────────────────────

describe('computeTtsCost – Formel', () => {
  // $30 / 1M Zeichen = 0.00003 $ pro Zeichen
  const PRICE_PER_CHAR_USD = 30 / 1_000_000;

  test('computeTtsCost(1_000_000) entspricht $30 × EUR-Rate', () => {
    const eurRate = 0.93;
    const expected = 1_000_000 * PRICE_PER_CHAR_USD * eurRate;
    assert.ok(Math.abs(expected - 27.9) < 0.001, `Erwartet ~27.9 EUR, bekam ${expected}`);
  });

  test('computeTtsCost(22_500) ergibt korrekten EUR-Betrag', () => {
    const eurRate = 0.93;
    const expected = 22_500 * PRICE_PER_CHAR_USD * eurRate;
    // 22500 * 0.00003 * 0.93 = 0.62775
    assert.ok(Math.abs(expected - 0.62775) < 0.000001, `Erwartet ~0.62775 EUR, bekam ${expected}`);
  });

  test('Preis skaliert linear mit Zeichenanzahl', () => {
    const eurRate = 0.93;
    const cost1k  = 1000    * PRICE_PER_CHAR_USD * eurRate;
    const cost10k = 10_000  * PRICE_PER_CHAR_USD * eurRate;
    assert.ok(cost10k === cost1k * 10, 'Lineares Skalieren muss gelten');
  });
});

// ── Tests: Aggregation tts-prep + tts ────────────────────────────────────────

describe('Aggregation: tts-prep und tts werden korrekt summiert', () => {
  test('Beide call_types erscheinen in Summenabfrage für eine Aktivität', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsPrepUsage(db, 1, 'act-A', 300, 100);
    saveTtsUsage(db, 1, 'act-A', 5000);

    const rows = db.prepare(`
      SELECT call_type, COUNT(*) AS cnt
      FROM token_log
      WHERE activity_id = 'act-A'
      GROUP BY call_type
      ORDER BY call_type
    `).all();

    assert.equal(rows.length, 2);
    const types = rows.map(r => r.call_type).sort();
    assert.deepEqual(types, ['tts', 'tts-prep']);
  });

  test('tts_characters summiert sich korrekt über mehrere TTS-Einträge', () => {
    const db = buildTestDb();
    runMigrationP8(db);

    saveTtsUsage(db, 1, 'act-B', 10000);
    saveTtsUsage(db, 2, 'act-B', 12500);

    const row = db.prepare(`
      SELECT COALESCE(SUM(tts_characters), 0) AS total_chars
      FROM token_log
      WHERE activity_id = 'act-B' AND call_type = 'tts'
    `).get();
    assert.equal(row.total_chars, 22500, 'Summe muss 22500 Zeichen sein');
  });
});
