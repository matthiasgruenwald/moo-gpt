/**
 * Tests für GET/PUT /admin/config/tool-models — Issue #188
 *
 * Testet das Laden und Speichern der vier Werkzeug-Modell-Schlüssel
 * über die neue Route.
 *
 * Run: DB_PATH=:memory: node --test test/admin-tool-models-route.test.js
 */

process.env.MODEL_NAME = process.env.MODEL_NAME || 'gpt-test';

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';
import { initDb } from '../db.js';
import { addAdmin } from '../stores/admin.js';
import { updateCachedConfig } from '../stores/prompt.js';
import { generateDashboardToken } from '../auth-middleware.js';
import { createAdminRouter } from '../routes/admin.js';

// ── Mock dashboardRegistry ─────────────────────────────────────────────────────

const mockRegistry = {
  broadcastAll: (_msg) => {},
};

// ── Test-Server-Setup ─────────────────────────────────────────────────────────

let server;
let baseUrl;
let adminToken;
let teacherToken;

before(() => {
  initDb();

  addAdmin('admin-1', 'system');
  adminToken   = generateDashboardToken('any-activity', 'admin-1', 'Admin');
  teacherToken = generateDashboardToken('any-activity', 'teacher-1', 'Lehrer');
  updateCachedConfig('Test-Systemprompt', 'gpt-test');

  const app = express();
  app.use(express.json());
  app.use('/', createAdminRouter({ dashboardRegistry: mockRegistry }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /admin/config/tool-models', () => {
  test('403 ohne Token', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models`);
    assert.equal(res.status, 403);
  });

  test('403 für Nicht-Admin', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${teacherToken}`);
    assert.equal(res.status, 403);
  });

  test('200 für Admin — gibt vier Felder zurück', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok('genModel' in data,             'genModel fehlt');
    assert.ok('ttsPrepModel' in data,         'ttsPrepModel fehlt');
    assert.ok('ttsModel' in data,             'ttsModel fehlt');
    assert.ok('transcriptionModel' in data,   'transcriptionModel fehlt');
  });

  test('leere Felder wenn kein DB-Eintrag vorhanden', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`);
    const data = await res.json();
    // Frische DB → keine admin_config-Einträge → leere Strings
    assert.equal(data.genModel,           '');
    assert.equal(data.ttsPrepModel,       '');
    assert.equal(data.ttsModel,           '');
    assert.equal(data.transcriptionModel, '');
  });
});

describe('PUT /admin/config/tool-models', () => {
  test('403 ohne Token', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: 'gpt-4.1-nano' }),
    });
    assert.equal(res.status, 403);
  });

  test('403 für Nicht-Admin', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${teacherToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: 'gpt-4.1-nano' }),
    });
    assert.equal(res.status, 403);
  });

  test('200 speichert Werte (Happy Path)', async () => {
    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        genModel:           'gpt-4.1-nano',
        ttsPrepModel:       'gpt-4o-mini',
        ttsModel:           'tts-1-hd',
        transcriptionModel: 'whisper-1',
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
  });

  test('gespeicherte Werte per GET abrufbar', async () => {
    // Werte setzen
    await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        genModel:           'gpt-custom',
        ttsPrepModel:       'gpt-4o-mini',
        ttsModel:           'tts-1',
        transcriptionModel: 'whisper-1',
      }),
    });

    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`);
    const data = await res.json();
    assert.equal(data.genModel,           'gpt-custom');
    assert.equal(data.ttsPrepModel,       'gpt-4o-mini');
    assert.equal(data.ttsModel,           'tts-1');
    assert.equal(data.transcriptionModel, 'whisper-1');
  });

  test('leeres Feld löscht DB-Eintrag (Fallback greift wieder)', async () => {
    // Erst setzen
    await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: 'gpt-custom-to-delete' }),
    });

    // Dann mit leerem Wert überschreiben
    await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: '' }),
    });

    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`);
    const data = await res.json();
    // Leeres Feld → Eintrag gelöscht → leer zurückgegeben
    assert.equal(data.genModel, '');
  });

  test('fehlende Felder im Body werden ignoriert (partial update)', async () => {
    // Erst alle setzen
    await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        genModel:           'model-a',
        ttsPrepModel:       'model-b',
        ttsModel:           'model-c',
        transcriptionModel: 'model-d',
      }),
    });

    // Dann nur eines ändern
    await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: 'model-x' }),
    });

    const res = await fetch(`${baseUrl}/admin/config/tool-models?token=${adminToken}`);
    const data = await res.json();
    assert.equal(data.genModel,     'model-x');
    assert.equal(data.ttsPrepModel, 'model-b');
    assert.equal(data.ttsModel,     'model-c');
    assert.equal(data.transcriptionModel, 'model-d');
  });
});
