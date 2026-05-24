/**
 * Tests für Issue #67 — Simulation Cost Recording
 *
 * Prüft:
 * 1. runSimulation gibt totalUsage zurück (Summe aller 3 AI-Calls)
 * 2. recordWerkzeugUsage mit call_type='simulation' legt genau 1 Eintrag an
 *
 * Run: DB_PATH=:memory: node --test test/simulation-cost.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { runSimulation } from '../simulation.js';
import { recordWerkzeugUsage } from '../cost-service.js';

before(() => {
  initDb();
});

function clearTokenLog() {
  getDb().exec('DELETE FROM token_log');
}

// Mock aiClient: jeder Call gibt feste usage-Werte zurück
const mockClient = {
  textCall: async () => ({ text: 'KI-Antwort', usage: { input_tokens: 10, output_tokens: 5 } }),
  jsonCall: async (_sys, _usr, _model, _opts) => ({
    text: ['Äußerung 1', 'Äußerung 2', 'Äußerung 3', 'Äußerung 4'],
    usage: { input_tokens: 20, output_tokens: 8 },
  }),
};

// Minimal-Fixtures
const persona = { id: 1, name: 'Neugieriger Schüler', description: 'Stellt viele Fragen' };
const config  = { content: 'Du bist ein hilfreicher Assistent.', model: 'gpt-test' };
const models  = { utteranceModel: 'gpt-test', evalModel: 'gpt-test' };

describe('runSimulation gibt totalUsage zurück', () => {
  test('totalUsage enthält input_tokens und output_tokens', async () => {
    const result = await runSimulation({
      persona,
      config,
      erfahrungsprompt: '',
      criteria: [],
      models,
      aiClient: mockClient,
    });

    assert.ok(result.totalUsage, 'totalUsage muss im Rückgabewert enthalten sein');
    assert.ok(typeof result.totalUsage.input_tokens  === 'number', 'input_tokens muss eine Zahl sein');
    assert.ok(typeof result.totalUsage.output_tokens === 'number', 'output_tokens muss eine Zahl sein');
  });

  test('totalUsage akkumuliert Token aus allen AI-Calls', async () => {
    // Mock-Aufrufe pro runSimulation:
    //   - 1x jsonCall für generateSimulatedUtterances → 4 Äußerungen
    //     usage: { input_tokens: 20, output_tokens: 8 }
    //   - 4x textCall für generateAIResponse
    //     usage je: { input_tokens: 10, output_tokens: 5 }
    //   - 4x jsonCall für evaluateResponse
    //     usage je: { input_tokens: 20, output_tokens: 8 }
    //
    // Erwartete Summen:
    //   input_tokens:  20 + (4 * 10) + (4 * 20) = 20 + 40 + 80 = 140
    //   output_tokens:  8 + (4 *  5) + (4 *  8) =  8 + 20 + 32 =  60

    const result = await runSimulation({
      persona,
      config,
      erfahrungsprompt: '',
      criteria: [],
      models,
      aiClient: mockClient,
    });

    assert.equal(result.totalUsage.input_tokens,  140, 'input_tokens muss Summe aller Calls sein');
    assert.equal(result.totalUsage.output_tokens,  60, 'output_tokens muss Summe aller Calls sein');
  });

  test('pairs und simResultsText sind weiterhin im Rückgabewert', async () => {
    const result = await runSimulation({
      persona,
      config,
      erfahrungsprompt: '',
      criteria: [],
      models,
      aiClient: mockClient,
    });

    assert.ok(Array.isArray(result.pairs),          'pairs muss ein Array sein');
    assert.ok(typeof result.simResultsText === 'string', 'simResultsText muss ein String sein');
    assert.equal(result.pairs.length, 4, '4 Äußerungen → 4 pairs');
  });
});

describe('recordWerkzeugUsage mit totalUsage aus runSimulation', () => {
  test('legt genau 1 Eintrag mit call_type simulation an', async () => {
    clearTokenLog();

    const result = await runSimulation({
      persona,
      config,
      erfahrungsprompt: '',
      criteria: [],
      models,
      aiClient: mockClient,
    });

    recordWerkzeugUsage('act-sim', 'simulation', 'gpt-test', result.totalUsage);

    const rows = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).all('act-sim', 'simulation');

    assert.equal(rows.length, 1, 'genau 1 Eintrag in token_log');
  });

  test('Eintrag enthält korrekte akkumulierte Token', async () => {
    clearTokenLog();

    const result = await runSimulation({
      persona,
      config,
      erfahrungsprompt: '',
      criteria: [],
      models,
      aiClient: mockClient,
    });

    recordWerkzeugUsage('act-sim', 'simulation', 'gpt-test', result.totalUsage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-sim', 'simulation');

    assert.ok(row,                            'Eintrag muss existieren');
    assert.equal(row.call_type,   'simulation');
    assert.equal(row.prompt_tokens,     140,  'input_tokens → prompt_tokens summiert');
    assert.equal(row.completion_tokens,  60,  'output_tokens → completion_tokens summiert');
    assert.equal(row.total_tokens,      200,  'total_tokens = 140 + 60');
  });

  test('mehrere Durchläufe erzeugen je 1 Eintrag (kein Zusammenführen)', async () => {
    clearTokenLog();

    for (let i = 0; i < 3; i++) {
      const result = await runSimulation({
        persona,
        config,
        erfahrungsprompt: '',
        criteria: [],
        models,
        aiClient: mockClient,
      });
      recordWerkzeugUsage('act-sim', 'simulation', 'gpt-test', result.totalUsage);
    }

    const count = getDb().prepare(
      `SELECT COUNT(*) as n FROM token_log WHERE activity_id = ? AND call_type = ?`
    ).get('act-sim', 'simulation').n;

    assert.equal(count, 3, '3 Simulation-Durchläufe → 3 Einträge');
  });
});
