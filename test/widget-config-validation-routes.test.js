/**
 * Integrationstests für objektförmigen validateWidgetConfig-Contract in allen drei Routen
 * Issue #198 (VS2, ADR 0008)
 *
 * Verifiziert pro Route (activity/teacher/admin):
 * - Ungültiger ttsVoice / audioOutput / audioStudentOptions / model → 400
 * - Gültige Werte persistieren unverändert (Roundtrip)
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-5 AVAILABLE_MODELS=gpt-5,gpt-4.1,gpt-4.1-mini \
 *        node --test test/widget-config-validation-routes.test.js
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';

process.env.DB_PATH = ':memory:';
process.env.MODEL_NAME = 'gpt-5';
process.env.AVAILABLE_MODELS = 'gpt-5,gpt-4.1,gpt-4.1-mini';

const { initDb } = await import('../db.js');
const { upsertActivity } = await import('../stores/activity.js');
const { setAdminConfig } = await import('../stores/admin-config.js');
const { addAdmin } = await import('../stores/admin.js');
const { updateCachedConfig } = await import('../stores/prompt.js');
const { createActivityRouter } = await import('../routes/activity.js');
const teacherRouter = (await import('../routes/teacher.js')).default;
const { createAdminRouter } = await import('../routes/admin.js');
const { generateDashboardToken } = await import('../auth-middleware.js');

const lockManager = { lock: () => {}, unlock: () => {} };
const mockRegistry = { broadcastAll: () => {} };

const TEACHER_ID = 'teacher-198';
const ADMIN_ID   = 'admin-198';

let server;
let baseUrl;
let teacherToken;
let adminToken;

before(() => {
  initDb();
  setAdminConfig('available_models', JSON.stringify(['gpt-5', 'gpt-4.1', 'gpt-4.1-mini']));
  addAdmin(ADMIN_ID, 'system');
  updateCachedConfig('Systemprompt', 'gpt-5');

  teacherToken = generateDashboardToken('act-198', TEACHER_ID, 'Frau Test');
  adminToken   = generateDashboardToken('act-198', ADMIN_ID, 'Admin');

  upsertActivity('act-198', 'Test-Aktivität 198');

  const app = express();
  app.use(express.json());
  app.use('/api', createActivityRouter({ lockManager }));
  app.use('/api', teacherRouter);
  app.use('/api', createAdminRouter({ dashboardRegistry: mockRegistry }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}/api`;
    server.unref(); // prevent the open listener from blocking process exit
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

// ── Helpers ───────────────────────────────────────────────────────────────────

function put(path, token, body) {
  return fetch(`${baseUrl}${path}?token=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function post(path, token, body) {
  return fetch(`${baseUrl}${path}?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_CFG = {
  uploadMode: 'off', botIcon: 'grw', opener: 'Hallo', title: 'Test',
  audioInput: 'off', audioOutput: 'off', ttsVoice: 'nova',
  audioStudentOptions: 'off', mathMode: 'off', model: 'gpt-4.1',
  chatTemperature: 0.5, assistModel: 'gpt-4.1-mini', assistTemperature: 0.3,
};

const VALID_TEACHER_BODY = { ...VALID_CFG, name: 'VS2-Test-Vorlage', hintsTemplate: '' };

// ── routes/activity.js ────────────────────────────────────────────────────────

describe('PUT /activity-config/:id — Validierung (Issue #198)', () => {
  test('ungültiger ttsVoice → 400', async () => {
    const res = await put('/activity-config/act-198', teacherToken, {
      ...VALID_CFG, ttsVoice: 'robot-voice',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, 'Fehlermeldung erwartet');
  });

  test('ungültiger audioOutput → 400', async () => {
    const res = await put('/activity-config/act-198', teacherToken, {
      ...VALID_CFG, audioOutput: 'bad-value',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültige audioStudentOptions → 400', async () => {
    const res = await put('/activity-config/act-198', teacherToken, {
      ...VALID_CFG, audioStudentOptions: 'maybe',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültiges model → 400', async () => {
    const res = await put('/activity-config/act-198', teacherToken, {
      ...VALID_CFG, model: 'schadhafte-ki',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('gültige Werte → 200 ok:true (Roundtrip)', async () => {
    const res = await put('/activity-config/act-198', teacherToken, VALID_CFG);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

// ── routes/teacher.js — POST /teacher/templates ───────────────────────────────

describe('POST /teacher/templates — Validierung (Issue #198)', () => {
  test('ungültiger ttsVoice → 400', async () => {
    const res = await post('/teacher/templates', teacherToken, {
      ...VALID_TEACHER_BODY, ttsVoice: 'ghost',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, 'Fehlermeldung erwartet');
  });

  test('ungültiger audioOutput → 400', async () => {
    const res = await post('/teacher/templates', teacherToken, {
      ...VALID_TEACHER_BODY, audioOutput: 'blast',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültige audioStudentOptions → 400', async () => {
    const res = await post('/teacher/templates', teacherToken, {
      ...VALID_TEACHER_BODY, audioStudentOptions: 'partial',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültiges model → 400', async () => {
    const res = await post('/teacher/templates', teacherToken, {
      ...VALID_TEACHER_BODY, model: 'unknown-model',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('gültige Werte → 200 ok:true (Roundtrip)', async () => {
    const res = await post('/teacher/templates', teacherToken, VALID_TEACHER_BODY);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(typeof body.id === 'number');
  });
});

// ── routes/teacher.js — PUT /teacher/templates/:id ────────────────────────────

describe('PUT /teacher/templates/:id — Validierung (Issue #198)', () => {
  let templateId;

  before(async () => {
    const res = await post('/teacher/templates', teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage',
    });
    const body = await res.json();
    templateId = body.id;
  });

  test('ungültiger ttsVoice → 400', async () => {
    const res = await put(`/teacher/templates/${templateId}`, teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage', ttsVoice: 'broken',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültiger audioOutput → 400', async () => {
    const res = await put(`/teacher/templates/${templateId}`, teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage', audioOutput: 'loud',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültige audioStudentOptions → 400', async () => {
    const res = await put(`/teacher/templates/${templateId}`, teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage', audioStudentOptions: 'sometimes',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültiges model → 400', async () => {
    const res = await put(`/teacher/templates/${templateId}`, teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage', model: 'rogue-ai',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('gültige Werte → 200 ok:true (Roundtrip)', async () => {
    const res = await put(`/teacher/templates/${templateId}`, teacherToken, {
      ...VALID_TEACHER_BODY, name: 'VS2-Put-Vorlage',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

// ── routes/admin.js — PUT /admin/system-template ──────────────────────────────

describe('PUT /admin/system-template — Validierung (Issue #198)', () => {
  const ADMIN_CFG = {
    title: 'System-Vorlage', botIcon: 'grw', opener: 'Hallo',
    uploadMode: 'off', hintsTemplate: '',
    audioInput: 'off', audioOutput: 'off', ttsVoice: 'nova',
    audioStudentOptions: 'off', mathMode: 'off',
    model: null, assistModel: null, chatTemperature: null, assistTemperature: null,
  };

  test('ungültiger ttsVoice → 400', async () => {
    const res = await put('/admin/system-template', adminToken, {
      ...ADMIN_CFG, ttsVoice: 'evil-voice',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, 'Fehlermeldung erwartet');
  });

  test('ungültiger audioOutput → 400', async () => {
    const res = await put('/admin/system-template', adminToken, {
      ...ADMIN_CFG, audioOutput: 'max',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültige audioStudentOptions → 400', async () => {
    const res = await put('/admin/system-template', adminToken, {
      ...ADMIN_CFG, audioStudentOptions: 'auto',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('ungültiges model → 400', async () => {
    const res = await put('/admin/system-template', adminToken, {
      ...ADMIN_CFG, model: 'hax0r',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('gültige Werte → 200 ok:true (Roundtrip)', async () => {
    const res = await put('/admin/system-template', adminToken, ADMIN_CFG);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  test('gültiges model in System-Vorlage → 200 ok:true', async () => {
    const res = await put('/admin/system-template', adminToken, {
      ...ADMIN_CFG, model: 'gpt-4.1',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});
