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

function buildApp({ oai, allowedOrigin = null }) {
  const app = express();
  app.use(express.json());
  if (allowedOrigin) process.env.ALLOWED_ORIGIN = allowedOrigin;
  else delete process.env.ALLOWED_ORIGIN;
  const router = createSpeakRouter({ oai });
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

// ── Gemockter OpenAI-Client ───────────────────────────────────────────────────

/**
 * Erstellt einen Mock-oai mit konfigurierbarem Verhalten.
 */
function buildOaiMock({
  prepResponse = null,   // null → Standardantwort
  prepError    = null,   // Error → wirft Fehler beim Preprocessing
  ttsError     = null,   // Error → wirft Fehler bei TTS
  ttsBuffer    = Buffer.from('fake-audio-data'),
} = {}) {
  return {
    responses: {
      create: async ({ input }) => {
        if (prepError) throw prepError;
        return prepResponse ?? {
          output_text: 'Bereinigter Text ohne Markdown.',
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        };
      },
    },
    audio: {
      speech: {
        create: async () => {
          if (ttsError) throw ttsError;
          // OpenAI SDK gibt ein Response-Objekt zurück, dessen Body ein ArrayBuffer ist
          return {
            arrayBuffer: async () => ttsBuffer.buffer.slice(
              ttsBuffer.byteOffset,
              ttsBuffer.byteOffset + ttsBuffer.byteLength
            ),
          };
        },
      },
    },
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
    const oai = buildOaiMock();
    const app = buildApp({ oai });

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
    const oai = buildOaiMock();
    const app = buildApp({ oai, allowedOrigin: 'https://example.com' });

    const { status } = await postSpeak(app, {
      origin: 'https://evil.com',
      body: { text: 'Test', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 403, `Erwartet 403, bekam ${status}`);
  });

  test('Validierung: 400 wenn text fehlt', async () => {
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status, body } = await postSpeak(app, {
      body: { speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn text leer ist', async () => {
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status, body } = await postSpeak(app, {
      body: { text: '  ', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn speed zu klein (< 0.5)', async () => {
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 0.4, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('Validierung: 400 wenn speed zu groß (> 1.5)', async () => {
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 1.6, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
  });

  test('TTS-Fehler: HTTP 500 ohne Stack-Trace', async () => {
    const oai = buildOaiMock({ ttsError: new Error('TTS API down') });
    const app = buildApp({ oai });

    const { status, body } = await postSpeak(app, {
      body: { text: 'Test', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 500, `Erwartet 500, bekam ${status}`);
    assert.ok(body.error, 'Fehlermeldung muss vorhanden sein');
    assert.ok(!body.stack, 'Stack-Trace darf nicht in Antwort enthalten sein');
  });

  test('Graceful degradation: Preprocessing-Fehler → Audio-Response mit unverändertem Text', async () => {
    const oai = buildOaiMock({ prepError: new Error('GPT-mini down') });
    const app = buildApp({ oai });

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
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status } = await postSpeak(app, {
      body: { text: 'Test ohne speed', activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200 mit speed-Fallback, bekam ${status}`);
  });

  test('voice fehlt → Fallback nova', async () => {
    const oai = buildOaiMock();
    const app = buildApp({ oai });

    const { status } = await postSpeak(app, {
      body: { text: 'Test ohne voice', speed: 1.0, activityId: 'act-1', threadId: '1', userId: 'u1' },
    });

    assert.equal(status, 200, `Erwartet 200 mit voice-Fallback nova, bekam ${status}`);
  });
});
