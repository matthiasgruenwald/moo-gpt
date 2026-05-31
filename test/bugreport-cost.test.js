/**
 * Tests für Issue #160 — Bug-Report Cost Recording
 *
 * Smoke-Test: recordWerkzeugUsage mit call_type='bug-report'
 * analog zu live-summary-cost.test.js
 *
 * Run: DB_PATH=:memory: node --test test/bugreport-cost.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { recordWerkzeugUsage, getWerkzeugLog } from '../cost-service.js';

before(() => {
  initDb();
});

function clearTokenLog() {
  getDb().exec('DELETE FROM token_log');
}

describe('bug-report cost recording (integration smoke)', () => {
  test('recordWerkzeugUsage speichert bug-report Eintrag korrekt', () => {
    clearTokenLog();

    const usage = { input_tokens: 300, output_tokens: 120 };
    recordWerkzeugUsage('act-br', 'bug-report', 'gpt-4.1-nano', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-br', 'bug-report');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'bug-report');
    assert.equal(row.activity_id,       'act-br');
    assert.equal(row.model,             'gpt-4.1-nano');
    assert.equal(row.prompt_tokens,     300);
    assert.equal(row.completion_tokens, 120);
    assert.equal(row.total_tokens,      420);
  });

  test('usage-Felder aus aiClient.jsonCall (input_tokens/output_tokens) werden korrekt gemappt', () => {
    clearTokenLog();

    const usageFromAiClient = { input_tokens: 512, output_tokens: 96, total_tokens: 608 };
    recordWerkzeugUsage('act-br', 'bug-report', 'gpt-4.1-nano', usageFromAiClient);

    const row = getDb().prepare(`SELECT * FROM token_log WHERE call_type = 'bug-report'`).get();
    assert.equal(row.prompt_tokens,     512,  'input_tokens → prompt_tokens');
    assert.equal(row.completion_tokens, 96,   'output_tokens → completion_tokens');
    assert.equal(row.total_tokens,      608,  'total_tokens direkt übernommen');
  });

  test('getWerkzeugLog gibt bug-report mit Label Fehler-Meldung zurück', () => {
    clearTokenLog();

    recordWerkzeugUsage('act-br', 'bug-report', 'gpt-4.1-nano', { input_tokens: 100, output_tokens: 40 });

    const log = getWerkzeugLog('act-br');
    assert.equal(log.length, 1, 'genau 1 Eintrag');
    assert.equal(log[0].callType,      'bug-report');
    assert.equal(log[0].callTypeLabel, 'Fehler-Meldung', 'Label aus CALL_TYPE_LABELS');
  });

  test('kein Eintrag bei fehlendem activityId (Guard)', () => {
    clearTokenLog();

    recordWerkzeugUsage(null, 'bug-report', 'gpt-4.1-nano', { input_tokens: 10, output_tokens: 5 });

    const count = getDb().prepare('SELECT COUNT(*) as n FROM token_log').get().n;
    assert.equal(count, 0, 'Guard: kein Eintrag bei fehlendem activityId');
  });
});
