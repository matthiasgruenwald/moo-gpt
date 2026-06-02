/**
 * Tests für POST /admin/config (available_bot_icons) — Issue #180
 *
 * Testet das Speichern von available_bot_icons über POST /admin/config.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/admin-bot-icons-route.test.js
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

describe('POST /admin/config (available_bot_icons)', () => {
  test('403 ohne Token', async () => {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: ['grw'] }),
    });
    assert.equal(res.status, 403);
  });

  test('403 für Nicht-Admin', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: ['grw'] }),
    });
    assert.equal(res.status, 403);
  });

  test('400 wenn available_bot_icons kein Array ist', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: 'kein-array' }),
    });
    assert.equal(res.status, 400);
  });

  test('400 wenn available_bot_icons leer ist', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: [] }),
    });
    assert.equal(res.status, 400);
  });

  test('200 mit gültigem available_bot_icons Array', async () => {
    const icons = ['grw', 'grw2', 'weiblich'];
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: icons }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
  });

  test('GET /admin/config enthält availableBotIcons nach dem Speichern', async () => {
    const icons = ['custom-icon', 'another-icon'];
    await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: icons }),
    });
    const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`);
    const data = await res.json();
    assert.ok(Array.isArray(data.availableBotIcons), 'availableBotIcons muss Array sein');
    assert.deepEqual(data.availableBotIcons, icons);
  });

  test('available_models bleibt unberührt wenn nur available_bot_icons gesetzt wird', async () => {
    // Erst models setzen
    await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: ['gpt-4o'] }),
    });
    // Dann nur icons setzen
    await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_bot_icons: ['grw'] }),
    });
    const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`);
    const data = await res.json();
    assert.ok(Array.isArray(data.availableModels), 'availableModels muss Array sein');
    assert.ok(Array.isArray(data.availableBotIcons), 'availableBotIcons muss Array sein');
    assert.deepEqual(data.availableBotIcons, ['grw']);
  });
});
