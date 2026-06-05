/**
 * Tests für Issue #185 — assist_model und assist_temperature in Prompt-Assistent-Route
 *
 * Verifiziert, dass buildSuggestPromptHandler und buildPromptCheckHandler
 * das assist_model aus der Aktivität verwenden und assist_temperature
 * als temperature-Option an den AI-Client übergeben.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-5 AVAILABLE_MODELS=gpt-5,gpt-4.1,gpt-4.1-mini node --test test/prompt-assist-model.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.MODEL_NAME = 'gpt-5';
process.env.AVAILABLE_MODELS = 'gpt-5,gpt-4.1,gpt-4.1-mini';

const { initDb } = await import('../db.js');
const { upsertActivity } = await import('../stores/activity.js');
const { setWidgetConfig } = await import('../stores/widget-config.js');
const { buildSuggestPromptHandler, buildPromptCheckHandler } = await import('../routes/prompt-assist.js');

before(() => {
  initDb();
});

function makeReqRes(body = {}, activityId = 'test-act') {
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

/** Mock-aiClient der Modell und temperature-Option erfasst */
function capturingMock(response = { type: 'question', question: 'Welche Klasse?' }) {
  let capturedModel = null;
  let capturedOpts = null;
  const aiClient = {
    textCall: async (_system, _text, model, opts) => {
      capturedModel = model;
      capturedOpts = opts;
      return { text: JSON.stringify(response), usage: { input_tokens: 100, output_tokens: 30 } };
    },
    jsonCall: async (_system, _text, model, opts) => {
      capturedModel = model;
      capturedOpts = opts;
      return { text: { suggestion: 'Test' }, usage: { input_tokens: 100, output_tokens: 30 } };
    },
    getLastModel: () => capturedModel,
    getLastOpts:  () => capturedOpts,
  };
  return aiClient;
}

describe('buildSuggestPromptHandler — assist_model (Issue #185)', () => {
  test('Aktivität mit assist_model → wird als Modell für AI-Call verwendet', async () => {
    upsertActivity('act-assist-1', 'TestAktivität 1');
    setWidgetConfig('act-assist-1', { model: 'gpt-5', assistModel: 'gpt-4.1-mini' });

    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ currentPrompt: 'Pflanzenzelle', messages: [], direct: false }, 'act-assist-1');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastModel(), 'gpt-4.1-mini', 'assist_model muss als Modell verwendet werden');
  });

  test('Aktivität ohne assist_model → fällt auf activities.model zurück', async () => {
    upsertActivity('act-assist-2', 'TestAktivität 2');
    setWidgetConfig('act-assist-2', { model: 'gpt-4.1', assistModel: null });

    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ currentPrompt: 'Test', messages: [], direct: false }, 'act-assist-2');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastModel(), 'gpt-4.1', 'Ohne assist_model muss auf activities.model zurückgefallen werden');
  });

  test('Aktivität ohne assist_model und ohne model → fällt auf MODEL_NAME zurück', async () => {
    upsertActivity('act-assist-3', 'TestAktivität 3');
    setWidgetConfig('act-assist-3', { model: null, assistModel: null });

    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ currentPrompt: 'Test', messages: [], direct: false }, 'act-assist-3');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastModel(), 'gpt-5', 'Ohne beide Modelle muss auf MODEL_NAME zurückgefallen werden');
  });

  test('Aktivität mit assist_temperature → wird als temperature-Option übergeben', async () => {
    upsertActivity('act-assist-4', 'TestAktivität 4');
    setWidgetConfig('act-assist-4', { assistModel: 'gpt-4.1', assistTemperature: 0.3 });

    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ currentPrompt: 'Test', messages: [], direct: false }, 'act-assist-4');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastOpts()?.temperature, 0.3, 'assist_temperature muss als temperature-Option übergeben werden');
  });

  test('Aktivität ohne assist_temperature → kein temperature-Key in opts', async () => {
    upsertActivity('act-assist-5', 'TestAktivität 5');
    setWidgetConfig('act-assist-5', { assistModel: 'gpt-4.1', assistTemperature: null });

    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ currentPrompt: 'Test', messages: [], direct: false }, 'act-assist-5');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.ok(!('temperature' in (mock.getLastOpts() ?? {})), 'Ohne assist_temperature darf kein temperature-Key in opts sein');
  });
});

describe('buildPromptCheckHandler — assist_model (Issue #185)', () => {
  test('Aktivität mit assist_model → wird als Modell für jsonCall verwendet', async () => {
    upsertActivity('act-check-1', 'CheckAktivität 1');
    setWidgetConfig('act-check-1', { model: 'gpt-5', assistModel: 'gpt-4.1-mini' });

    const mock = capturingMock();
    const handler = buildPromptCheckHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ task: 'Aufgabe', currentHints: 'Hinweis' }, 'act-check-1');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastModel(), 'gpt-4.1-mini', 'assist_model muss für prompt-check verwendet werden');
  });

  test('Aktivität ohne assist_model → fällt auf activities.model zurück', async () => {
    upsertActivity('act-check-2', 'CheckAktivität 2');
    setWidgetConfig('act-check-2', { model: 'gpt-4.1', assistModel: null });

    const mock = capturingMock();
    const handler = buildPromptCheckHandler({ aiClient: mock });
    const { req, res } = makeReqRes({ task: 'Aufgabe', currentHints: 'Hinweis' }, 'act-check-2');

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.equal(mock.getLastModel(), 'gpt-4.1', 'Ohne assist_model muss auf activities.model zurückgefallen werden');
  });
});
