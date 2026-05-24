/**
 * Tests für Issue #66 — Criteria + Optimize + Persona Cost Recording
 *
 * Smoke-Tests: recordWerkzeugUsage wird mit den richtigen Parametern aufgerufen.
 * Direkte DB-Prüfung, kein HTTP.
 *
 * Run: DB_PATH=:memory: node --test test/criteria-optimize-persona-cost.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { recordWerkzeugUsage } from '../cost-service.js';

// Minimaler Fake-aiClient der usage zurückgibt
function makeAiClient(inputTokens = 100, outputTokens = 40) {
  return {
    async jsonCall(_instructions, _userMsg, _model, _opts) {
      return {
        text: { criteria: ['Kriterium 1', 'Kriterium 2'], erfahrungsprompt_neu: 'neu', kausalkette: [] },
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
    },
    async textCall(_instructions, _userMsg, _model) {
      return {
        text: JSON.stringify({ personas: [{ name: 'Typ A', description: 'desc', example_msgs: 'a|b|c' }] }),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
    },
  };
}

before(() => {
  initDb();
});

function clearTokenLog() {
  getDb().exec('DELETE FROM token_log');
}

// ---------------------------------------------------------------------------
// 1. criteria — suggestCriteriaList gibt usage zurück
// ---------------------------------------------------------------------------
describe('criteria cost recording', () => {
  test('suggestCriteriaList gibt { suggestions, usage } zurück', async () => {
    const { suggestCriteriaList } = await import('../criteria.js');
    const aiClient = makeAiClient(200, 60);

    const result = await suggestCriteriaList({
      config: { content: 'System-Prompt-Inhalt' },
      erfahrungsprompt: null,
      genModel: 'gpt-4.1-nano',
      aiClient,
    });

    assert.ok(Array.isArray(result.suggestions), 'suggestions muss ein Array sein');
    assert.ok(result.usage,                      'usage muss zurückgegeben werden');
    assert.equal(result.usage.input_tokens,  200, 'input_tokens korrekt');
    assert.equal(result.usage.output_tokens,  60, 'output_tokens korrekt');
  });

  test('recordWerkzeugUsage speichert criteria-Eintrag', () => {
    clearTokenLog();

    const usage = { input_tokens: 200, output_tokens: 60 };
    recordWerkzeugUsage('act-crit', 'criteria', 'gpt-4.1-nano', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-crit', 'criteria');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'criteria');
    assert.equal(row.activity_id,       'act-crit');
    assert.equal(row.prompt_tokens,     200);
    assert.equal(row.completion_tokens,  60);
    assert.equal(row.total_tokens,       260);
  });
});

// ---------------------------------------------------------------------------
// 2. optimize — generateOptimizeProposal gibt usage zurück
// ---------------------------------------------------------------------------
describe('optimize cost recording', () => {
  test('generateOptimizeProposal gibt { ..., usage } zurück', async () => {
    const { generateOptimizeProposal } = await import('../optimize.js');
    const aiClient = makeAiClient(500, 150);

    const result = await generateOptimizeProposal({
      erfahrungsprompt: 'alter prompt',
      erkenntnisse: [],
      feedbacks: [],
      simResultsText: '',
      config: { content: 'System-Prompt-Inhalt', model: 'gpt-4.1' },
      aiClient,
    });

    assert.ok(result.erfahrungsprompt_neu !== undefined, 'erfahrungsprompt_neu muss vorhanden sein');
    assert.ok(result.usage,                              'usage muss zurückgegeben werden');
    assert.equal(result.usage.input_tokens,  500, 'input_tokens korrekt');
    assert.equal(result.usage.output_tokens, 150, 'output_tokens korrekt');
  });

  test('recordWerkzeugUsage speichert optimize-Eintrag', () => {
    clearTokenLog();

    const usage = { input_tokens: 500, output_tokens: 150 };
    recordWerkzeugUsage('act-opt', 'optimize', 'gpt-4.1', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-opt', 'optimize');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'optimize');
    assert.equal(row.activity_id,       'act-opt');
    assert.equal(row.prompt_tokens,     500);
    assert.equal(row.completion_tokens, 150);
    assert.equal(row.total_tokens,      650);
  });
});

// ---------------------------------------------------------------------------
// 3. persona — personas-suggest Route
// ---------------------------------------------------------------------------
describe('persona cost recording', () => {
  test('recordWerkzeugUsage speichert persona-Eintrag wenn activityId vorhanden', () => {
    clearTokenLog();

    const usage = { input_tokens: 120, output_tokens: 45 };
    recordWerkzeugUsage('act-pers', 'persona', 'gpt-4.1-nano', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-pers', 'persona');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'persona');
    assert.equal(row.activity_id,       'act-pers');
    assert.equal(row.prompt_tokens,     120);
    assert.equal(row.completion_tokens,  45);
    assert.equal(row.total_tokens,       165);
  });

  test('kein Eintrag wenn activityId fehlt (globale Persona)', () => {
    clearTokenLog();

    // Guard in recordWerkzeugUsage: null activityId → kein Insert
    recordWerkzeugUsage(null, 'persona', 'gpt-4.1-nano', { input_tokens: 10, output_tokens: 5 });

    const count = getDb().prepare('SELECT COUNT(*) as n FROM token_log').get().n;
    assert.equal(count, 0, 'kein Eintrag bei fehlender activityId');
  });
});
