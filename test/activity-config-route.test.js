/**
 * Tests für GET /activity-config/:activityId — Issue #195 (ADR 0008)
 *
 * Verifiziert, dass effectiveModel/effectiveAssistModel aus resolveWidgetConfig
 * gelesen werden (einzige Auflösungs-Seam, kein model-resolver.js mehr).
 *
 * Acceptance: Lehrer-Template setzt model → frische Aktivität nutzt es im
 * effectiveModel/effectiveAssistModel-Feld der JSON-Antwort.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-5 AVAILABLE_MODELS=gpt-5,gpt-4.1,gpt-4.1-mini node --test test/activity-config-route.test.js
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
const { setWidgetConfig } = await import('../stores/widget-config.js');
const { setAdminConfig } = await import('../stores/admin-config.js');
const { createTeacherTemplate, setTeacherTemplateDefault } = await import('../stores/teacher.js');
const { createActivityRouter } = await import('../routes/activity.js');
const { generateDashboardToken } = await import('../auth-middleware.js');

// Minimal lockManager stub
const lockManager = { lock: () => {}, unlock: () => {} };

const TEACHER_ID = 'teacher-195';

let server;
let baseUrl;

/**
 * Creates a token and activity registered for the given activityId.
 * Returns a fetch helper for that specific activity.
 */
function setupActivity(activityId, activityName) {
  upsertActivity(activityId, activityName);
  const token = generateDashboardToken(activityId, TEACHER_ID, 'Frau Test');
  return token;
}

function get(activityId, token) {
  return fetch(`${baseUrl}/activity-config/${activityId}?token=${token}`);
}

/** Helper: set teacher-195 default template with given fields */
function setTeacherTemplate(fields) {
  const id = createTeacherTemplate(TEACHER_ID, { name: 'Test-Vorlage', ...fields });
  setTeacherTemplateDefault(id, TEACHER_ID);
  return id;
}

before(() => {
  initDb();
  setAdminConfig('available_models', JSON.stringify(['gpt-5', 'gpt-4.1', 'gpt-4.1-mini']));

  const app = express();
  app.use(express.json());
  app.use('/api', createActivityRouter({ lockManager }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}/api`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

describe('GET /activity-config/:activityId — effectiveModel aus resolveWidgetConfig (Issue #195)', () => {

  test('Aktivität ohne Template: effectiveModel fällt auf MODEL_NAME zurück', async () => {
    const token = setupActivity('act-195-a', 'Aktivität A');

    const res = await get('act-195-a', token);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.effectiveModel, 'gpt-5',
      'Ohne Template muss effectiveModel auf MODEL_NAME fallen');
    assert.equal(data.effectiveAssistModel, 'gpt-5',
      'Ohne Template muss effectiveAssistModel auf MODEL_NAME fallen');
  });

  test('Lehrer-Template setzt model → effectiveModel im Response zeigt Template-Modell', async () => {
    const token = setupActivity('act-195-b', 'Aktivität B');
    // Aktivität hat kein eigenes model
    setWidgetConfig('act-195-b', { model: null, assistModel: null });
    // Lehrer-Template setzt model auf gpt-4.1
    setTeacherTemplate({ model: 'gpt-4.1' });

    const res = await get('act-195-b', token);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.effectiveModel, 'gpt-4.1',
      'Lehrer-Template.model muss als effectiveModel erscheinen');
    assert.equal(data.effectiveAssistModel, 'gpt-4.1',
      'Ohne assist_model erbt effectiveAssistModel das effectiveModel vom Template');
  });

  test('Lehrer-Template setzt model + assistModel → beide im Response korrekt', async () => {
    const token = setupActivity('act-195-c', 'Aktivität C');
    setWidgetConfig('act-195-c', { model: null, assistModel: null });
    setTeacherTemplate({ model: 'gpt-4.1', assistModel: 'gpt-4.1-mini' });

    const res = await get('act-195-c', token);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.effectiveModel, 'gpt-4.1',
      'effectiveModel muss Lehrer-Template.model sein');
    assert.equal(data.effectiveAssistModel, 'gpt-4.1-mini',
      'effectiveAssistModel muss Lehrer-Template.assistModel sein');
  });

  test('Aktivität überschreibt Lehrer-Template model → effectiveModel aus Aktivität', async () => {
    const token = setupActivity('act-195-d', 'Aktivität D');
    setWidgetConfig('act-195-d', { model: 'gpt-4.1-mini' });
    setTeacherTemplate({ model: 'gpt-4.1' });

    const res = await get('act-195-d', token);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.effectiveModel, 'gpt-4.1-mini',
      'Aktivitäts-model hat Vorrang vor Lehrer-Template');
  });

  test('needsConfig-Signal: Aktivität ohne title → cfg.needsConfig true, Response title leer', async () => {
    const token = setupActivity('act-195-e', 'Aktivität E');
    setWidgetConfig('act-195-e', { title: null });

    const res = await get('act-195-e', token);
    const data = await res.json();

    assert.equal(res.status, 200);
    // title null → '' in Response (needsConfig = true intern im Resolver)
    assert.equal(data.title, '', 'title null → leerer String im Response');
  });
});
