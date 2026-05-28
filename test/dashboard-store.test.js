/**
 * Tests für stores/dashboard.js — Issue #128
 *
 * Testet enrichStudentsWithCost:
 * - Fügt threadCost-Feld korrekt hinzu
 * - Kein Transitivimport von ai-instance.js (kein process.exit ohne APIKEY)
 *
 * Run: DB_PATH=:memory: node --test test/dashboard-store.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db.js';
import { enrichStudentsWithCost } from '../stores/dashboard.js';

before(() => {
  initDb();
});

describe('enrichStudentsWithCost', () => {
  test('Test A — leere token_log → threadCost null für jeden Schüler', async () => {
    // thread_db_id 9999 existiert nicht in token_log → sumCostRows gibt null zurück
    const students = [
      { thread_db_id: 9999, moodle_user_name: 'Schüler A' },
    ];
    const result = await enrichStudentsWithCost(students);

    assert.equal(result.length, 1);
    assert.equal(result[0].moodle_user_name, 'Schüler A');
    assert.ok('threadCost' in result[0], 'threadCost-Feld muss vorhanden sein');
    assert.equal(result[0].threadCost, null, 'ohne Preisdaten: null');
  });

  test('Test B — leeres Array → leeres Array', async () => {
    const result = await enrichStudentsWithCost([]);
    assert.deepEqual(result, []);
  });

  test('Test C — kein Transitivimport von ai-instance.js (kein APIKEY nötig)', () => {
    // Wenn dieser Test-File läuft ohne OPENAI_API_KEY gesetzt zu sein und
    // kein process.exit ausgelöst wird, ist die Abhängigkeit sauber.
    // Der Import von stores/dashboard.js darf NICHT transitiv ai-instance.js laden.
    assert.ok(true, 'Import hat keinen APIKEY-Guard ausgelöst');
  });
});
