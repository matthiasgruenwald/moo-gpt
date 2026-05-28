/**
 * Tests für Issue #102: POST /api/speak
 *
 * Integration-Tests mit gemocktem OpenAI-Client und In-Memory-SQLite.
 * Testet: Erfolg, Origin-Fehler, Validierung, TTS-Fehler, graceful degradation.
 *
 * Run: DB_PATH=:memory: node --test test/speak.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { initDb } from '../db.js';
import { createSpeakRouter } from '../routes/speak.js';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function buildApp({ aiClient, fetchFn = buildFetchMock(), allowedOrigin = null }) {
  const app = express();
  app.use(express.json());
  if (allowedOrigin) process.env.ALLOWED_ORIGIN = allowedOrigin;
  else delete process.env.ALLOWED_ORIGIN;
  const router = createSpeakRouter({ aiClient, fetchFn });
  app.use('/api', router);
  return app;
}

/**
 * Sendet einen echten HTTP-Request mit JSON-Body an den Express-App.
 */
async function postSpeak(app, { origin = null, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const bodyStr = JSON.stringify(body);

      const headers = {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      };
      if (origin) headers['origin'] = origin;

      const req = http.request(
        { hostname: 'localhost', port, path: '/api/speak', method: 'POST', headers },
        (res) => {
          const chunks = [];
          res.on('data', c => { chunks.push(c); });
          res.on('end', () => {
            server.close();
            const raw = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
              try {
                resolve({ status: res.statusCode, body: JSON.parse(raw.toString()), headers: res.headers });
              } catch {
                resolve({ status: res.statusCode, body: raw.toString(), headers: res.headers });
              }
            } else {
              resolve({ status: res.statusCode, body: raw, headers: res.headers });
            }
          });
        }
      );
      req.on('error', (e) => { server.close(); reject(e); });
      req.write(bodyStr);
      req.end();
    });
  });
}

// ── Gemockter AIClient + fetch ───────────────────────────────────────────────

/**
 * Erstellt einen Mock-aiClient mit konfigurierbarem Preprocessing-Verhalten.
 * Simuliert AIClient.textCall(instructions, userMessage, model, opts) → { text, usage }.
 */
function buildAiClientMock({
  prepText  = 'Bereinigter Text ohne Markdown.',
  prepError = null,   // Error → wirft Fehler beim Preprocessing
} = {}) {
  return {
    textCall: async () => {
      if (prepError) throw prepError;
      return {
        text:  prepText,
        usage: { input_tokens: 50, output_tokens: 20 },
      };
    },
  };
}

/**
 * Erstellt einen Mock-fetch für die TTS-API.
 * Gibt entweder einen audio/mpeg-Stream oder einen Fehler zurück.
 */
function buildFetchMock({
  ttsStatus  = 200,
  ttsBuffer  = Buffer.from('fake-audio-data'),
} = {}) {
  return async (url) => {
    if (!url.includes('audio/speech')) throw new Error(`Unerwarteter fetch-Aufruf: ${url}`);
    if (ttsStatus !== 200) {
      return { ok: false, status: ttsStatus, text: async () => 'TTS error' };
    }
    const { Readable } = await import('node:stream');
    const webStream = Readable.toWeb(Readable.from([ttsBuffer]));
    return { ok: true, status: 200, body: webStream };
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

before(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/speak', () => {

  test('Erfolg: gibt Audio-Blob zurück (audio/mpeg)', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status, headers } = await postSpeak(app, {
      body: { text: 'Hallo, das ist ein Test.', speed: 1.0, activityId: 'act-1', threadId: '42', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200, bekam ${status}`);
    assert.ok(
      (headers['content-type'] || '').includes('audio/mpeg'),
      `Erwartet audio/mpeg, bekam ${headers['content-type']}`
    );
  });

  test('Origin-Fehler: 403 wenn Origin nicht erlaubt', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient, allowedOrigin: 'https://example.com' });

    const { status } = await postSpeak(app, {
      origin: 'https://evil.com',
      body: { text: 'Test', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 403, `Erwartet 403, bekam ${status}`);
  });

  test('Validierung: 400 wenn text fehlt', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status, body } = await postSpeak(app, {
      body: { speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn text leer ist', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status, body } = await postSpeak(app, {
      body: { text: '  ', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn speed zu klein (< 0.5)', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 0.4, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn speed zu groß (> 1.5)', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 1.6, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('TTS-Fehler: HTTP 500 ohne Stack-Trace', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient, fetchFn: buildFetchMock({ ttsStatus: 500 }) });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 500, `Erwartet 500, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
    assert.ok(!body.stack, 'Stack-Trace darf nicht in Antwort enthalten sein');
  });

  test('Graceful degradation: Preprocessing-Fehler → Audio-Response mit unverändertem Text', async () => {
    const aiClient = buildAiClientMock({ prepError: new Error('GPT-mini down') });
    const app = buildApp({ aiClient });

    // Preprocessing schlägt fehl, aber TTS läuft durch
    const { status, headers } = await postSpeak(app, {
      body: { text: 'Hallo **Welt**', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200 (graceful degradation), bekam ${status}`);
    assert.ok(
      (headers['content-type'] || '').includes('audio/mpeg'),
      `Erwartet audio/mpeg, bekam ${headers['content-type']}`
    );
  });

  test('speed fehlt → Fallback 1.0 (kein Fehler)', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status } = await postSpeak(app, {
      body: { text: 'Test ohne speed', activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200 mit speed-Fallback, bekam ${status}`);
  });

  test('voice fehlt → Fallback nova', async () => {
    const aiClient = buildAiClientMock();
    const app = buildApp({ aiClient });

    const { status } = await postSpeak(app, {
      body: { text: 'Test ohne voice', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200 mit voice-Fallback nova, bekam ${status}`);
  });

  test('Preprocessing übersprungen bei reinem Buchstabentext (keine Ziffern/Markdown)', async () => {
    let prepCalled = false;
    const aiClient = {
      textCall: async () => { prepCalled = true; return { text: 'ignored', usage: {} }; },
    };
    const app = buildApp({ aiClient });

    await postSpeak(app, {
      body: { text: 'Hallo Welt, alles gut?', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.ok(!prepCalled, 'Preprocessing darf bei Plaintext ohne Ziffern nicht aufgerufen werden');
  });

  test('Preprocessing aufgerufen bei Markdown-Text', async () => {
    let prepCalled = false;
    const aiClient = {
      textCall: async () => {
        prepCalled = true;
        return { text: 'Hallo Welt', usage: { input_tokens: 10, output_tokens: 5 } };
      },
    };
    const app = buildApp({ aiClient });

    const { status } = await postSpeak(app, {
      body: { text: 'Hallo **Welt**', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.ok(prepCalled, 'Preprocessing muss bei Markdown-Text aufgerufen werden');
    assert.equal(status, 200);
  });

  test('Preprocessing aufgerufen wenn Text Ziffern enthält (spracherhaltend, nicht deutsch-erzwungen)', async () => {
    // Zahlen werden in der Sprache des Textes ausgeschrieben — GPT-mini entscheidet,
    // nicht hart auf Deutsch gezwungen (damit Englischunterricht nicht gebrochen wird).
    let capturedInstructions = null;
    const aiClient = {
      // textCall(instructions, userMessage, model, opts) → { text, usage }
      textCall: async (instructions) => {
        capturedInstructions = instructions;
        return { text: 'Pong zwölf', usage: { input_tokens: 10, output_tokens: 5 } };
      },
    };
    const app = buildApp({ aiClient });

    await postSpeak(app, {
      body: { text: 'Pong 12', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.ok(capturedInstructions, 'Preprocessing muss bei Ziffern aufgerufen werden');
    // Instruktion darf Zahlen NICHT hart auf Deutsch zwingen
    assert.ok(
      !capturedInstructions.toLowerCase().includes('deutschen zahlwörter') &&
      !capturedInstructions.toLowerCase().includes('auf deutsch'),
      'Instruktion darf nicht hart auf Deutsch zwingen — sonst bricht Englischunterricht'
    );
    // Instruktion soll sprachsensitiv sein
    assert.ok(
      capturedInstructions.includes('Sprache'),
      'Instruktion soll auf Sprache des Textes verweisen'
    );
  });
});
