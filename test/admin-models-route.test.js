/**
 * Tests für POST /admin/config (available_models) — Issue #179
 *
 * Testet das Speichern von available_models über POST /admin/config.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/admin-models-route.test.js
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
  adminToken  = generateDashboardToken('any-activity', 'admin-1', 'Admin');
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

describe('POST /admin/config (available_models)', () => {
  test('403 ohne Token', async () => {
    const res = await fetch(`${baseUrl}/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: ['gpt-4o'] }),
    });
    assert.equal(res.status, 403);
  });

  test('403 für Nicht-Admin', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: ['gpt-4o'] }),
    });
    assert.equal(res.status, 403);
  });

  test('400 wenn available_models kein Array ist', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: 'kein-array' }),
    });
    assert.equal(res.status, 400);
  });

  test('400 wenn available_models fehlt', async () => {
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  test('200 mit gültigem available_models Array', async () => {
    const models = ['gpt-4o', 'gpt-4.1'];
    const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: models }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
  });

  test('GET /admin/config enthält availableModels nach dem Speichern', async () => {
    const models = ['gpt-saved-model'];
    await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_models: models }),
    });
    const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`);
    const data = await res.json();
    assert.ok(Array.isArray(data.availableModels), 'availableModels muss Array sein');
  });
});
