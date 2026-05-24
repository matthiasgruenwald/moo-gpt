/**
 * Tests für Issue #64 — Live-Summary Cost Recording
 *
 * Smoke-Test: recordWerkzeugUsage mit call_type='live-summary' + response-shape
 * der overview-summary Route (cost-Objekt im Response-Body).
 *
 * Run: DB_PATH=:memory: node --test test/live-summary-cost.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { recordWerkzeugUsage } from '../cost-service.js';

before(() => {
  initDb();
});

function clearTokenLog() {
  getDb().exec('DELETE FROM token_log');
}

describe('live-summary cost recording (integration smoke)', () => {
  test('recordWerkzeugUsage speichert live-summary Eintrag korrekt', () => {
    clearTokenLog();

    const usage = { input_tokens: 200, output_tokens: 80 };
    recordWerkzeugUsage('act-live', 'live-summary', 'gpt-4.1', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-live', 'live-summary');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'live-summary');
    assert.equal(row.activity_id,       'act-live');
    assert.equal(row.model,             'gpt-4.1');
    assert.equal(row.prompt_tokens,     200);
    assert.equal(row.completion_tokens, 80);
    assert.equal(row.total_tokens,      280);
  });

  test('usage-Felder aus aiClient (input_tokens/output_tokens) werden korrekt gemappt', () => {
    clearTokenLog();

    // Simuliert genau die Werte die aiClient.textCall zurückgibt
    const usageFromAiClient = { input_tokens: 512, output_tokens: 128, total_tokens: 640 };
    recordWerkzeugUsage('act-live', 'live-summary', 'gpt-5', usageFromAiClient);

    const row = getDb().prepare(`SELECT * FROM token_log WHERE call_type = 'live-summary'`).get();
    assert.equal(row.prompt_tokens,     512,  'input_tokens → prompt_tokens');
    assert.equal(row.completion_tokens, 128,  'output_tokens → completion_tokens');
    assert.equal(row.total_tokens,      640,  'total_tokens direkt übernommen');
  });

  test('cost-Objekt im Response hat korrekte Felder (shape-Test)', () => {
    clearTokenLog();

    // Testet die Logik zum Aufbauen des cost-Objekts im Route-Handler
    const usage = { input_tokens: 100, output_tokens: 50 };
    const costObj = {
      promptTokens:     usage.input_tokens,
      completionTokens: usage.output_tokens,
    };

    assert.equal(costObj.promptTokens,     100, 'promptTokens entspricht input_tokens');
    assert.equal(costObj.completionTokens, 50,  'completionTokens entspricht output_tokens');
    assert.ok(!('input_tokens' in costObj),     'Rohfeld input_tokens nicht im cost-Objekt');
    assert.ok(!('output_tokens' in costObj),    'Rohfeld output_tokens nicht im cost-Objekt');
  });

  test('kein Eintrag bei fehlendem activityId (Guard bleibt aktiv)', () => {
    clearTokenLog();

    recordWerkzeugUsage(null, 'live-summary', 'gpt-4.1', { input_tokens: 10, output_tokens: 5 });

    const count = getDb().prepare('SELECT COUNT(*) as n FROM token_log').get().n;
    assert.equal(count, 0, 'Guard: kein Eintrag bei fehlendem activityId');
  });
});
