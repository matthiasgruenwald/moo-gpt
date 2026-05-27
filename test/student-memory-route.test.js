/**
 * Route-Tests für routes/student-memory.js — Issue #109 Followup
 *
 * Reproduziert den Bug: Dashboard-Calls (GET/POST/DELETE mit ?token=...)
 * schlugen mit 403 fehl, weil requireDashboardAuth activityId verlangt,
 * die bei globaler student_memory nicht vorhanden ist.
 *
 * Run: DB_PATH=:memory: node --test test/student-memory-route.test.js
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

process.env.DB_PATH = ':memory:';
delete process.env.ALLOWED_ORIGIN;

const { initDb, getDb } = await import('../db.js');
const { generateDashboardToken } = await import('../auth-middleware.js');
const studentMemoryRouter = (await import('../routes/student-memory.js')).default;

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', studentMemoryRouter);
  return app;
}

async function request(app, { method = 'GET', path, body = null, origin = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const bodyStr = body ? JSON.stringify(body) : null;
      const headers = {};
      if (bodyStr) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }
      if (origin) headers['origin'] = origin;

      const req = http.request(
        { hostname: 'localhost', port, path, method, headers },
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
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

before(() => {
  initDb();
});

beforeEach(() => {
  getDb().prepare('DELETE FROM student_memory').run();
});

// ── Schüler-Pfad (kein Token) ─────────────────────────────────────────────────

describe('Schüler-Pfad (kein token)', () => {
  const app = buildApp();

  test('GET ?userId=... gibt null zurück wenn kein Eintrag', async () => {
    const r = await request(app, { path: '/api/student-memory?userId=schueler-1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.memory, null);
  });

  test('POST speichert Eintrag und gibt ok:true zurück', async () => {
    const r = await request(app, {
      method: 'POST',
      path: '/api/student-memory',
      body: { userId: 'schueler-1', preferenceText: 'Kurze Antworten' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });

  test('GET nach POST gibt preference_text zurück', async () => {
    await request(app, {
      method: 'POST',
      path: '/api/student-memory',
      body: { userId: 'schueler-1', preferenceText: 'Kurze Antworten' },
    });
    const r = await request(app, { path: '/api/student-memory?userId=schueler-1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.memory?.preference_text, 'Kurze Antworten');
  });

  test('DELETE löscht Eintrag und gibt ok:true zurück', async () => {
    await request(app, {
      method: 'POST',
      path: '/api/student-memory',
      body: { userId: 'schueler-1', preferenceText: 'Text' },
    });
    const r = await request(app, {
      method: 'DELETE',
      path: '/api/student-memory?userId=schueler-1',
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });
});

// ── Dashboard-Pfad (mit token, ohne activityId) ───────────────────────────────

describe('Dashboard-Pfad (token ohne activityId) — Kern-Bug', () => {
  const app = buildApp();

  test('GET ?token=... ohne activityId gibt 200 und alle Memory-Einträge zurück', async () => {
    const token = generateDashboardToken('act-42', 'lehrer-1');
    const r = await request(app, {
      path: `/api/student-memory?token=${token}`,
    });
    // BUG: Gibt 403 wenn requireDashboardAuth activityId erfordert
    assert.equal(r.status, 200, `Erwartet 200, bekam ${r.status}: ${JSON.stringify(r.body)}`);
    assert.ok(Array.isArray(r.body.memory), 'memory muss ein Array sein');
  });

  test('POST ?token=... speichert Schüler-Memory ohne activityId', async () => {
    const token = generateDashboardToken('act-42', 'lehrer-1');
    const r = await request(app, {
      method: 'POST',
      path: `/api/student-memory?token=${token}`,
      body: { studentId: 'schueler-5', preferenceText: 'Langsame Erklärungen' },
    });
    // BUG: Gibt 403 wenn requireDashboardAuth activityId erfordert
    assert.equal(r.status, 200, `Erwartet 200, bekam ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, true);
  });

  test('DELETE ?token=&studentId=... löscht Schüler-Memory ohne activityId', async () => {
    const token = generateDashboardToken('act-42', 'lehrer-1');
    // Erst anlegen
    await request(app, {
      method: 'POST',
      path: `/api/student-memory?token=${token}`,
      body: { studentId: 'schueler-6', preferenceText: 'Text' },
    });
    const r = await request(app, {
      method: 'DELETE',
      path: `/api/student-memory?token=${token}&studentId=schueler-6`,
    });
    // BUG: Gibt 403 wenn requireDashboardAuth activityId erfordert
    assert.equal(r.status, 200, `Erwartet 200, bekam ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, true);
  });

  test('Ungültiger token gibt 403', async () => {
    const r = await request(app, {
      path: '/api/student-memory?token=ungueltig-token',
    });
    assert.equal(r.status, 403);
  });

  test('Dashboard: GET → POST → GET zeigt gespeicherten Eintrag', async () => {
    const token = generateDashboardToken('act-42', 'lehrer-1');
    // Anlegen
    await request(app, {
      method: 'POST',
      path: `/api/student-memory?token=${token}`,
      body: { studentId: 'schueler-7', preferenceText: 'Bitte Beispiele' },
    });
    // Alle laden
    const r = await request(app, {
      path: `/api/student-memory?token=${token}`,
    });
    assert.equal(r.status, 200);
    const entry = r.body.memory.find(e => e.student_id === 'schueler-7');
    assert.ok(entry, 'Eintrag muss in der Liste sein');
    assert.equal(entry.preference_text, 'Bitte Beispiele');
  });
});
