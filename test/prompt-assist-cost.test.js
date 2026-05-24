/**
 * Tests für Issue #65 — Prompt-Assistent Cost Recording
 *
 * Smoke-Test: recordWerkzeugUsage mit call_type='prompt-assist' + Response-Shape
 * des buildSuggestPromptHandler (cost-Objekt im Response-Body).
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-5 node --test test/prompt-assist-cost.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { recordWerkzeugUsage } from '../cost-service.js';
import { buildSuggestPromptHandler } from '../routes/activity.js';

before(() => {
  initDb();
});

function clearTokenLog() {
  getDb().exec('DELETE FROM token_log');
}

function makeReqRes(body = {}, activityId = '99') {
  const req = {
    body,
    params: { activityId },
    query: { token: 'test-token' },
    userId: 'teacher-1',
    activityId,
  };
  let statusCode = 200;
  let responseBody;
  const res = {
    status(code) { statusCode = code; return res; },
    json(data)  { responseBody = data; return res; },
    getStatusCode() { return statusCode; },
    getBody()       { return responseBody; },
  };
  return { req, res };
}

describe('recordWerkzeugUsage — prompt-assist (unit)', () => {
  test('speichert prompt-assist Eintrag korrekt in token_log', () => {
    clearTokenLog();

    const usage = { input_tokens: 300, output_tokens: 120 };
    recordWerkzeugUsage('act-pa', 'prompt-assist', 'gpt-5', usage);

    const row = getDb().prepare(`
      SELECT * FROM token_log WHERE activity_id = ? AND call_type = ?
    `).get('act-pa', 'prompt-assist');

    assert.ok(row,                              'Eintrag muss existieren');
    assert.equal(row.call_type,         'prompt-assist');
    assert.equal(row.activity_id,       'act-pa');
    assert.equal(row.model,             'gpt-5');
    assert.equal(row.prompt_tokens,     300);
    assert.equal(row.completion_tokens, 120);
    assert.equal(row.total_tokens,      420);
  });

  test('zwei separate Calls erzeugen zwei eigene token_log-Einträge', () => {
    clearTokenLog();

    recordWerkzeugUsage('act-pa', 'prompt-assist', 'gpt-5', { input_tokens: 100, output_tokens: 40 });
    recordWerkzeugUsage('act-pa', 'prompt-assist', 'gpt-5', { input_tokens: 200, output_tokens: 80 });

    const count = getDb().prepare(
      `SELECT COUNT(*) as n FROM token_log WHERE activity_id = 'act-pa' AND call_type = 'prompt-assist'`
    ).get().n;

    assert.equal(count, 2, 'Jeder Call muss einen eigenen Eintrag erzeugen (nicht akkumulieren)');
  });

  test('kein Eintrag bei fehlendem activityId (Guard bleibt aktiv)', () => {
    clearTokenLog();

    recordWerkzeugUsage(null, 'prompt-assist', 'gpt-5', { input_tokens: 10, output_tokens: 5 });

    const count = getDb().prepare('SELECT COUNT(*) as n FROM token_log').get().n;
    assert.equal(count, 0, 'Guard: kein Eintrag bei fehlendem activityId');
  });
});

describe('buildSuggestPromptHandler — cost recording (integration)', () => {
  test('direct=true: Einzel-Call speichert token_log und gibt cost-Objekt zurück', async () => {
    clearTokenLog();

    const mockUsage = { input_tokens: 250, output_tokens: 90 };
    const mockAiClient = {
      textCall: async () => ({
        text: JSON.stringify({ type: 'final', prompt: 'Fertiger Prompt' }),
        usage: mockUsage,
      }),
    };

    const handler = buildSuggestPromptHandler({ aiClient: mockAiClient });
    const { req, res } = makeReqRes({ currentPrompt: 'Alt-Prompt', direct: true }, '77');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200, 'Handler muss 200 zurückgeben');
    const body = res.getBody();
    assert.equal(body.type, 'final', 'Response-Typ muss final sein');

    // cost-Objekt im Response
    assert.ok(body.cost,                         'cost-Objekt muss in Response sein');
    assert.equal(body.cost.promptTokens,     250, 'promptTokens = input_tokens');
    assert.equal(body.cost.completionTokens,  90, 'completionTokens = output_tokens');

    // DB-Eintrag
    const row = getDb().prepare(
      `SELECT * FROM token_log WHERE activity_id = '77' AND call_type = 'prompt-assist'`
    ).get();
    assert.ok(row,                              'DB-Eintrag muss existieren');
    assert.equal(row.prompt_tokens,     250);
    assert.equal(row.completion_tokens,  90);
    assert.equal(row.total_tokens,       340);
  });

  test('dialog-Mode (messages): Rückfrage-Call speichert token_log und gibt cost-Objekt zurück', async () => {
    clearTokenLog();

    const mockUsage = { input_tokens: 180, output_tokens: 60 };
    const mockAiClient = {
      textCall: async () => ({
        text: JSON.stringify({ type: 'question', question: 'Welche Klasse?' }),
        usage: mockUsage,
      }),
    };

    const handler = buildSuggestPromptHandler({ aiClient: mockAiClient });
    const { req, res } = makeReqRes({
      currentPrompt: '',
      messages: [{ role: 'user', content: 'Hilf mir bitte.' }],
      direct: false,
    }, '88');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    const body = res.getBody();
    assert.equal(body.type, 'question');

    assert.ok(body.cost,                         'cost-Objekt muss in Response sein');
    assert.equal(body.cost.promptTokens,     180);
    assert.equal(body.cost.completionTokens,  60);

    const row = getDb().prepare(
      `SELECT * FROM token_log WHERE activity_id = '88' AND call_type = 'prompt-assist'`
    ).get();
    assert.ok(row, 'DB-Eintrag für Rückfrage-Call muss existieren');
    assert.equal(row.prompt_tokens,     180);
    assert.equal(row.completion_tokens,  60);
  });

  test('KI-Fehler → HTTP 502, kein token_log-Eintrag', async () => {
    clearTokenLog();

    const mockAiClient = {
      textCall: async () => { throw new Error('Verbindungsfehler'); },
    };

    const handler = buildSuggestPromptHandler({ aiClient: mockAiClient });
    const { req, res } = makeReqRes({ currentPrompt: '', direct: true }, '55');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 502, 'Fehlerfall muss HTTP 502 liefern');

    const count = getDb().prepare('SELECT COUNT(*) as n FROM token_log').get().n;
    assert.equal(count, 0, 'Bei Fehler darf kein token_log-Eintrag entstehen');
  });
});
