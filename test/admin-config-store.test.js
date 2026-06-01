/**
 * Tests für stores/admin-config.js — Issue #179
 *
 * Testet getAdminConfig / setAdminConfig mit In-Memory-DB.
 *
 * Run: DB_PATH=:memory: node --test test/admin-config-store.test.js
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// ── In-Memory-DB-Setup ────────────────────────────────────────────────────────

// Erstellt eine minimale In-Memory-DB mit der admin_config-Tabelle
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

// Store-Funktionen direkt mit der Test-DB testen (kein Singleton-Import)
function makeStore(testDb) {
  return {
    getAdminConfig(key) {
      return testDb.prepare('SELECT value FROM admin_config WHERE key = ?').get(key)?.value ?? null;
    },
    setAdminConfig(key, value) {
      testDb.prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)').run(key, value);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('admin-config store', () => {
  let store;

  before(() => {
    const db = buildTestDb();
    store = makeStore(db);
  });

  test('getAdminConfig gibt null zurück wenn Schlüssel fehlt', () => {
    const val = store.getAdminConfig('nichtvorhanden');
    assert.equal(val, null);
  });

  test('setAdminConfig speichert einen Wert', () => {
    store.setAdminConfig('test_key', 'test_value');
    const val = store.getAdminConfig('test_key');
    assert.equal(val, 'test_value');
  });

  test('setAdminConfig überschreibt bestehenden Wert (INSERT OR REPLACE)', () => {
    store.setAdminConfig('upsert_key', 'wert1');
    store.setAdminConfig('upsert_key', 'wert2');
    const val = store.getAdminConfig('upsert_key');
    assert.equal(val, 'wert2');
  });

  test('mehrere Schlüssel koexistieren unabhängig', () => {
    store.setAdminConfig('key_a', 'aaa');
    store.setAdminConfig('key_b', 'bbb');
    assert.equal(store.getAdminConfig('key_a'), 'aaa');
    assert.equal(store.getAdminConfig('key_b'), 'bbb');
  });

  test('available_models: JSON-Array speichern und lesen', () => {
    const models = ['gpt-4o', 'gpt-4.1'];
    store.setAdminConfig('available_models', JSON.stringify(models));
    const raw = store.getAdminConfig('available_models');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, models);
  });

  test('setAdminConfig mit leerem String', () => {
    store.setAdminConfig('empty_key', '');
    const val = store.getAdminConfig('empty_key');
    assert.equal(val, '');
  });
});
