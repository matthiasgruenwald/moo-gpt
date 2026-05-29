/**
 * Tests für Issue #141 — Aufgabenkontext vollständig im Rückfragen-Modus
 *
 * Verifiziert, dass buildSuggestPromptHandler in jedem Turn (Turn 1 und Turn 2+)
 * die initiale Kontextnachricht vorranstellt — und Bilder korrekt einbettet.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/prompt-assist-suggest.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db.js';
import { buildSuggestPromptHandler } from '../routes/prompt-assist.js';

before(() => {
  initDb();
});

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

/** Hilfsfunktion: gibt input zurück das der Mock-aiClient zuletzt erhalten hat */
function capturingMock(response = { type: 'question', question: 'Welche Klasse?' }) {
  let capturedInput = null;
  const aiClient = {
    textCall: async (_system, _text, _model, opts) => {
      capturedInput = opts?.input ?? null;
      return { text: JSON.stringify(response), usage: { input_tokens: 100, output_tokens: 30 } };
    },
    getLastInput: () => capturedInput,
  };
  return aiClient;
}

describe('buildSuggestPromptHandler — Kontext-Vorranstellung (#141)', () => {

  test('Turn 1 (keine messages): initiale Kontextnachricht wird als erstes input-Element übergeben', async () => {
    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: 'Erkläre den Aufbau einer Pflanzenzelle.',
      messages: [],
      direct: false,
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200, 'Handler muss 200 zurückgeben');
    const input = mock.getLastInput();
    assert.ok(Array.isArray(input) && input.length >= 1, 'input muss mindestens 1 Element haben');
    const first = input[0];
    assert.equal(first.role, 'user', 'Erstes input-Element muss role=user haben');
    const text = typeof first.content === 'string' ? first.content : first.content?.[0]?.text ?? '';
    assert.ok(text.includes('Erkläre den Aufbau'), 'Prompt der Lehrkraft muss in Turn-1-Nachricht stehen');
    assert.ok(text.includes('Frage 1 von 5'), 'Aufforderung "Frage 1 von 5" muss enthalten sein');
  });

  test('Turn 2 (messages vorhanden): initiale Kontextnachricht wird TROTZDEM vorrangestellt', async () => {
    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: 'Erkläre den Aufbau einer Pflanzenzelle.',
      messages: [
        { role: 'assistant', content: 'Für welche Klassenstufe ist die Aufgabe?' },
        { role: 'user',      content: 'Klasse 9.' },
      ],
      direct: false,
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    const input = mock.getLastInput();
    assert.ok(Array.isArray(input) && input.length >= 3, 'input muss Kontext + 2 messages enthalten');
    const first = input[0];
    assert.equal(first.role, 'user', 'Erstes Element muss role=user (Kontext) sein');
    const text = typeof first.content === 'string' ? first.content : first.content?.[0]?.text ?? '';
    assert.ok(text.includes('Erkläre den Aufbau'), 'Prompt muss im Turn-2-Kontext-Element stehen');
    // Turn-2-messages werden danach angehängt
    assert.equal(input[1].content, 'Für welche Klassenstufe ist die Aufgabe?', 'Zweites Element = erste Assistant-Message');
    assert.equal(input[2].content, 'Klasse 9.', 'Drittes Element = User-Antwort');
  });

  test('Turn 1 mit taskImages: input_image wird in initialem content-Array eingebettet', async () => {
    const fakeImage = 'data:image/png;base64,iVBORw0KGgo=';
    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: 'Pflanzenzelle',
      messages: [],
      direct: false,
      taskImages: [fakeImage],
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    const input = mock.getLastInput();
    const first = input[0];
    assert.ok(Array.isArray(first.content), 'content muss Array sein wenn Bilder vorhanden');
    const textPart  = first.content.find(p => p.type === 'input_text');
    const imagePart = first.content.find(p => p.type === 'input_image');
    assert.ok(textPart,  'input_text-Teil muss in content sein');
    assert.ok(imagePart, 'input_image-Teil muss in content sein');
    assert.equal(imagePart.image_url, fakeImage, 'image_url muss exakt dem übergebenen Bild entsprechen');
  });

  test('Turn 2 mit taskImages: Bilder werden trotzdem in Turn-1-Kontext eingebettet', async () => {
    const fakeImage = 'data:image/png;base64,abc=';
    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: '',
      messages: [
        { role: 'assistant', content: 'Welches Fach?' },
        { role: 'user',      content: 'Biologie.' },
      ],
      direct: false,
      taskImages: [fakeImage],
    });

    await handler(req, res);

    const input = mock.getLastInput();
    assert.ok(input.length >= 3, 'Mindestens 3 Elemente: Kontext + 2 messages');
    const first = input[0];
    assert.ok(Array.isArray(first.content), 'Kontext-Element muss Array-content haben (Bilder)');
    assert.ok(first.content.some(p => p.type === 'input_image'), 'input_image muss in Turn-2-Kontext sein');
  });

  test('taskImages mit null-Einträgen werden herausgefiltert', async () => {
    const fakeImage = 'data:image/png;base64,valid=';
    const mock = capturingMock();
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: '',
      messages: [],
      direct: false,
      taskImages: [null, fakeImage, null],
    });

    await handler(req, res);

    const input = mock.getLastInput();
    const first = input[0];
    assert.ok(Array.isArray(first.content), 'Gültige Bilder werden erkannt');
    const images = first.content.filter(p => p.type === 'input_image');
    assert.equal(images.length, 1, 'Nur 1 gültiges Bild, 2 null-Einträge müssen gefiltert werden');
    assert.equal(images[0].image_url, fakeImage);
  });

  test('direct=true bleibt unverändert — kein taskImages-Handling', async () => {
    const mock = capturingMock({ type: 'final', prompt: 'Finaler Prompt' });
    const handler = buildSuggestPromptHandler({ aiClient: mock });
    const { req, res } = makeReqRes({
      currentPrompt: 'Pflanzenzelle',
      messages: [],
      direct: true,
      taskImages: ['data:image/png;base64,abc='],
    });

    await handler(req, res);

    assert.equal(res.getStatusCode(), 200);
    const body = res.getBody();
    assert.equal(body.type, 'final', 'direct=true muss finalen Prompt liefern');
    // direct-Zweig soll Bilder NICHT einbetten (kein Regression)
    const input = mock.getLastInput();
    const first = input[0];
    assert.equal(typeof first.content, 'string', 'direct-Zweig: content bleibt string, kein image-Array');
  });
});
