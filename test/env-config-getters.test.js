/**
 * Tests für Issue #184: Werkzeug-Modelle als admin_config-Getter
 *
 * Testet getGenModel, getTtsPrepModel, getTtsModel, getTranscriptionModel
 * gegen admin_config (DB-Eintrag vorhanden, fehlend) und Env-Fallback.
 *
 * Run: DB_PATH=:memory: node --test test/env-config-getters.test.js
 */

import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// ── In-Memory-DB-Setup ────────────────────────────────────────────────────────

function buildTestDb() {
  const testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS admin_config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  return testDb;
}

// Getter-Funktionen direkt implementieren wie in env-config.js (kein Singleton-Import)
// damit wir die DB isoliert testen können.
function makeGetters(testDb) {
  function readConfig(key) {
    try {
      const row = testDb.prepare('SELECT value FROM admin_config WHERE key = ?').get(key);
      return row?.value ?? null;
    } catch (_) {
      return null;
    }
  }

  function setConfig(key, value) {
    testDb.prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)').run(key, value);
  }

  function deleteConfig(key) {
    testDb.prepare('DELETE FROM admin_config WHERE key = ?').run(key);
  }

  function getGenModel(envValue) {
    return readConfig('gen_model') ?? envValue ?? 'gpt-4.1-nano';
  }

  function getTtsPrepModel() {
    return readConfig('tts_prep_model') ?? 'gpt-4o-mini';
  }

  function getTtsModel() {
    return readConfig('tts_model') ?? 'tts-1-hd';
  }

  function getTranscriptionModel() {
    return readConfig('transcription_model') ?? 'whisper-1';
  }

  return { getGenModel, getTtsPrepModel, getTtsModel, getTranscriptionModel, setConfig, deleteConfig };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('env-config Werkzeug-Modell-Getter', () => {
  let g;

  before(() => {
    const db = buildTestDb();
    g = makeGetters(db);
  });

  // ── getGenModel ──────────────────────────────────────────────────────────────

  describe('getGenModel', () => {
    afterEach(() => g.deleteConfig('gen_model'));

    test('gibt DB-Wert zurück wenn gesetzt', () => {
      g.setConfig('gen_model', 'gpt-4.1');
      assert.equal(g.getGenModel(undefined), 'gpt-4.1');
    });

    test('gibt Env-Wert zurück wenn kein DB-Eintrag aber Env gesetzt', () => {
      assert.equal(g.getGenModel('gpt-4.1-from-env'), 'gpt-4.1-from-env');
    });

    test('gibt Safety-Net-Default zurück wenn weder DB noch Env gesetzt', () => {
      assert.equal(g.getGenModel(undefined), 'gpt-4.1-nano');
    });

    test('DB-Wert hat Vorrang vor Env-Wert', () => {
      g.setConfig('gen_model', 'gpt-4.1-db');
      assert.equal(g.getGenModel('gpt-4.1-env'), 'gpt-4.1-db');
    });
  });

  // ── getTtsPrepModel ──────────────────────────────────────────────────────────

  describe('getTtsPrepModel', () => {
    afterEach(() => g.deleteConfig('tts_prep_model'));

    test('gibt DB-Wert zurück wenn gesetzt', () => {
      g.setConfig('tts_prep_model', 'gpt-4o');
      assert.equal(g.getTtsPrepModel(), 'gpt-4o');
    });

    test('gibt Safety-Net-Default zurück wenn kein DB-Eintrag', () => {
      assert.equal(g.getTtsPrepModel(), 'gpt-4o-mini');
    });
  });

  // ── getTtsModel ──────────────────────────────────────────────────────────────

  describe('getTtsModel', () => {
    afterEach(() => g.deleteConfig('tts_model'));

    test('gibt DB-Wert zurück wenn gesetzt', () => {
      g.setConfig('tts_model', 'tts-1');
      assert.equal(g.getTtsModel(), 'tts-1');
    });

    test('gibt Safety-Net-Default zurück wenn kein DB-Eintrag', () => {
      assert.equal(g.getTtsModel(), 'tts-1-hd');
    });
  });

  // ── getTranscriptionModel ────────────────────────────────────────────────────

  describe('getTranscriptionModel', () => {
    afterEach(() => g.deleteConfig('transcription_model'));

    test('gibt DB-Wert zurück wenn gesetzt', () => {
      g.setConfig('transcription_model', 'whisper-2');
      assert.equal(g.getTranscriptionModel(), 'whisper-2');
    });

    test('gibt Safety-Net-Default zurück wenn kein DB-Eintrag', () => {
      assert.equal(g.getTranscriptionModel(), 'whisper-1');
    });
  });
});
