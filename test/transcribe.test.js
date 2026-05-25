/**
 * Tests für Issue #91: POST /api/transcribe
 *
 * Integration-Tests mit gemocktem Whisper-Client und In-Memory-SQLite.
 * Testet: Erfolg, Origin-Fehler, Whisper-Fehler.
 *
 * Run: DB_PATH=:memory: node --test test/transcribe.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { initDb } from '../db.js';
import { createTranscribeRouter } from '../routes/transcribe.js';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function buildApp({ oai, allowedOrigin = null }) {
  const app = express();
  if (allowedOrigin) process.env.ALLOWED_ORIGIN = allowedOrigin;
  const router = createTranscribeRouter({ oai });
  app.use('/api', router);
  return app;
}

/**
 * Sendet einen echten HTTP-Request mit Multipart-FormData an den Express-App.
 * Baut manuell einen multipart/form-data Body zusammen (kein fetch/FormData im Node-Test).
 */
async function postAudio(app, { origin = null, audio = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const boundary = '----MockBoundary';

      let body = '';
      if (audio) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="audio"; filename="audio.webm"\r\n`;
        body += `Content-Type: audio/webm\r\n\r\n`;
        body += audio; // fake audio data (string)
        body += '\r\n';
      }
      body += `--${boundary}--\r\n`;

      const bodyBuffer = Buffer.from(body, 'latin1');

      const headers = {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
      };
      if (origin) headers['origin'] = origin;

      const req = http.request(
        { hostname: 'localhost', port, path: '/api/transcribe', method: 'POST', headers },
        (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        }
      );
      req.on('error', (e) => { server.close(); reject(e); });
      req.write(bodyBuffer);
      req.end();
    });
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

before(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/transcribe', () => {

  test('Erfolg: gibt text und duration_seconds zurück', async () => {
    // Gemockter Whisper-Client
    const oaiMock = {
      audio: {
        transcriptions: {
          create: async () => ({
            text:     'Hallo, das ist ein Test.',
            duration: 3.5,
          }),
        },
      },
    };

    delete process.env.ALLOWED_ORIGIN;
    const app = buildApp({ oai: oaiMock });
    const { status, body } = await postAudio(app, { audio: 'fake-audio-bytes' });

    assert.equal(status, 200, `Erwartet 200, bekam ${status}`);
    assert.equal(body.text, 'Hallo, das ist ein Test.');
    assert.equal(body.duration_seconds, 3.5);
  });

  test('Origin-Fehler: 403 wenn Origin nicht erlaubt', async () => {
    const oaiMock = {
      audio: { transcriptions: { create: async () => ({ text: 'x', duration: 1 }) } },
    };

    process.env.ALLOWED_ORIGIN = 'https://example.com';
    const app = buildApp({ oai: oaiMock, allowedOrigin: 'https://example.com' });

    // Request ohne passende Origin → 403
    const { status } = await postAudio(app, { audio: 'fake', origin: 'https://evil.com' });
    assert.equal(status, 403, `Erwartet 403, bekam ${status}`);

    delete process.env.ALLOWED_ORIGIN;
  });

  test('Whisper-Fehler: HTTP 500 ohne Stack-Trace', async () => {
    const oaiMock = {
      audio: {
        transcriptions: {
          create: async () => { throw new Error('Whisper API down'); },
        },
      },
    };

    delete process.env.ALLOWED_ORIGIN;
    const app = buildApp({ oai: oaiMock });
    const { status, body } = await postAudio(app, { audio: 'fake-audio-bytes' });

    assert.equal(status, 500, `Erwartet 500, bekam ${status}`);
    assert.equal(body.error, 'Transkription fehlgeschlagen');
    assert.ok(!body.stack, 'Stack-Trace darf nicht in Antwort enthalten sein');
  });

  test('Fehlende Audio-Datei: HTTP 400', async () => {
    const oaiMock = {
      audio: { transcriptions: { create: async () => ({ text: 'x', duration: 1 }) } },
    };

    delete process.env.ALLOWED_ORIGIN;
    const app = buildApp({ oai: oaiMock });

    // Kein audio-Feld im Form
    const { status } = await postAudio(app, { audio: null });
    assert.equal(status, 400, `Erwartet 400, bekam ${status}`);
  });
});
