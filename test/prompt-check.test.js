/**
 * Tests für POST /api/activity/:activityId/prompt-check
 *
 * Nutzt Node.js 22 built-in node:test.
 * aiClient wird per Dependency Injection in createActivityRouter übergeben.
 * requireDashboardAuth wird per bypassAuth-Option umgangen.
 *
 * Nach Issue #40 Redesign: Backend gibt nur { suggestion }, kein weaknesses.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Minimaler Express-Mock-Request/Response-Helper
function makeReqRes(body = {}, params = {}) {
  const req = {
    body,
    params: { activityId: '42', ...params },
    query: { token: 'test-token' },
    userId: 'test-user',
    activityId: '42',
  };
  let statusCode = 200;
  let responseBody;
  const res = {
    status(code) { statusCode = code; return res; },
    json(data) { responseBody = data; return res; },
    getStatusCode() { return statusCode; },
    getBody() { return responseBody; },
  };
  return { req, res };
}

// Importiere die zu testende Funktion — sie erwartet { aiClient } als Teil der Deps
import { buildPromptCheckHandler } from '../routes/activity.js';

describe('POST /activity/:activityId/prompt-check', () => {
  test('valider Input → korrekte JSON-Response mit suggestion (kein weaknesses)', async () => {
    const mockAiClient = {
      jsonCall: async (instructions, userMessage, model, opts) => ({
        suggestion: 'Verbesserter Prompt',
      }),
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({
      task: 'Schreibe einen Aufsatz über Klimawandel.',
      currentHints: 'Hilf dem Schüler.',
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    const body = res.getBody();
    assert.equal(body.suggestion, 'Verbesserter Prompt', 'suggestion muss zurückgegeben werden');
    assert.ok(!('weaknesses' in body), 'weaknesses darf nicht in der Response sein');
  });

  test('aiClient wirft Fehler → HTTP 502', async () => {
    const mockAiClient = {
      jsonCall: async () => { throw new Error('OpenAI Verbindungsfehler'); },
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({
      task: 'Aufgabe',
      currentHints: 'Hinweis',
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 502, 'bei KI-Fehler muss HTTP 502 zurückkommen');
    const body = res.getBody();
    assert.ok(body.error, 'Fehler-Response muss ein error-Feld haben');
  });

  test('fehlender task-Body → wird toleriert (kein 400, KI entscheidet)', async () => {
    let capturedUserMessage;
    const mockAiClient = {
      jsonCall: async (instructions, userMessage, model, opts) => {
        capturedUserMessage = userMessage;
        return { suggestion: 'Prompt ohne Aufgabe' };
      },
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({ currentHints: 'Hinweis ohne Aufgabe' });
    // task ist undefined

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200, 'fehlender task darf kein 400 auslösen');
    assert.ok(capturedUserMessage.includes('(keine)'), 'fehlender task soll als "(keine)" in Prompt erscheinen');
  });

  // Test: taskImages mit validen Strings → opts.input enthält input_image-Einträge
  test('taskImages mit validen Base64-Strings → opts.input enthält input_image-Einträge', async () => {
    let capturedOpts;
    const mockAiClient = {
      jsonCall: async (instructions, userMessage, model, opts) => {
        capturedOpts = opts;
        return { suggestion: 'Mit Bildern' };
      },
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({
      task: 'Aufgabe mit Bild',
      currentHints: 'Hinweis',
      taskImages: ['data:image/png;base64,abc123', 'data:image/jpeg;base64,xyz456'],
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.ok(capturedOpts?.input, 'opts.input muss gesetzt sein');
    const content = capturedOpts.input[0].content;
    const imageItems = content.filter(c => c.type === 'input_image');
    assert.equal(imageItems.length, 2, 'Beide Bilder müssen als input_image übergeben werden');
    assert.equal(imageItems[0].image_url, 'data:image/png;base64,abc123');
    assert.equal(imageItems[1].image_url, 'data:image/jpeg;base64,xyz456');
  });

  // Test: taskImages mit null-Einträgen → null-Einträge werden gefiltert
  test('taskImages mit null-Einträgen → null-Einträge werden gefiltert', async () => {
    let capturedOpts;
    const mockAiClient = {
      jsonCall: async (instructions, userMessage, model, opts) => {
        capturedOpts = opts;
        return { suggestion: 'Mit Bildern ohne null' };
      },
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({
      task: 'Aufgabe',
      currentHints: 'Hinweis',
      taskImages: [null, 'data:image/png;base64,valid', null],
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.ok(capturedOpts?.input, 'opts.input muss gesetzt sein');
    const content = capturedOpts.input[0].content;
    const imageItems = content.filter(c => c.type === 'input_image');
    assert.equal(imageItems.length, 1, 'Nur das valide Bild darf übergeben werden');
    assert.equal(imageItems[0].image_url, 'data:image/png;base64,valid');
  });

  // Test: taskImages leer → kein input_image im Call
  test('taskImages leer → kein input_image im Call, kein opts.input', async () => {
    let capturedOpts;
    const mockAiClient = {
      jsonCall: async (instructions, userMessage, model, opts) => {
        capturedOpts = opts;
        return { suggestion: 'Ohne Bilder' };
      },
    };

    const handler = buildPromptCheckHandler({ aiClient: mockAiClient, genModel: 'test-model' });
    const { req, res } = makeReqRes({
      task: 'Aufgabe ohne Bilder',
      currentHints: 'Hinweis',
      taskImages: [],
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    assert.ok(!capturedOpts?.input, 'opts.input darf bei leeren Bildern nicht gesetzt sein');
  });
});
