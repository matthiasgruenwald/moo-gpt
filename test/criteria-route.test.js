/**
 * Tests für routes/criteria.js — Issue #129
 *
 * Testet den Factory-Pattern-Router mit Mock-aiClient und In-Memory-DB.
 * Kein OPENAI_API_KEY nötig.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/criteria-route.test.js
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';
import { initDb } from '../db.js';
import { createCriteriaRouter } from '../routes/criteria.js';
import { generateDashboardToken } from '../auth-middleware.js';

// ── Mock aiClient ─────────────────────────────────────────────────────────────

function makeMockAiClient(overrides = {}) {
  return {
    async jsonCall(_sys, _user, _model, _opts) {
      return {
        text: { criteria: ['Kriterium A', 'Kriterium B'] },
        usage: { input_tokens: 100, output_tokens: 40 },
      };
    },
    ...overrides,
  };
}

// ── Test-Server-Setup ─────────────────────────────────────────────────────────

let server;
let baseUrl;
let validToken;

before(() => {
  initDb();
  validToken = generateDashboardToken('act-test', 'teacher-1', 'Frau Test');

  const app = express();
  app.use(express.json());
  app.use('/api', createCriteriaRouter({ aiClient: makeMockAiClient() }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}/api`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('criteria-route', () => {

  describe('Auth-Schutz', () => {
    test('403 ohne Token', async () => {
      const res = await fetch(`${baseUrl}/criteria/act-test`);
      assert.equal(res.status, 403);
    });

    test('403 mit falschem Token', async () => {
      const res = await fetch(`${baseUrl}/criteria/act-test?token=ungueltig`);
      assert.equal(res.status, 403);
    });
  });

  describe('GET /criteria/:activityId', () => {
    test('gibt leere Listen zurück für unbekannte Aktivität', async () => {
      const res = await fetch(`${baseUrl}/criteria/act-test?token=${validToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.criteria), 'criteria muss Array sein');
      assert.ok(Array.isArray(data.deletedCriteria), 'deletedCriteria muss Array sein');
    });
  });

  describe('POST /criteria-suggest/:activityId', () => {
    test('gibt Vorschläge und Kosten zurück', async () => {
      const res = await fetch(`${baseUrl}/criteria-suggest/act-test?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(data.suggestions, ['Kriterium A', 'Kriterium B']);
      assert.ok('cost' in data, 'Antwort muss cost-Feld enthalten');
      assert.equal(data.cost.promptTokens, 100);
      assert.equal(data.cost.completionTokens, 40);
    });

    test('500 wenn aiClient wirft', async () => {
      // Zweiter Server mit brechendem aiClient
      const failClient = makeMockAiClient({
        jsonCall: async () => { throw new Error('KI nicht verfügbar'); },
      });
      const failApp = express();
      failApp.use(express.json());
      const failToken = generateDashboardToken('act-fail', 'teacher-1', 'Frau Test');
      failApp.use('/api', createCriteriaRouter({ aiClient: failClient }));
      const failServer = createServer(failApp);
      await new Promise(r => failServer.listen(0, r));
      const failBase = `http://localhost:${failServer.address().port}/api`;

      const res = await fetch(`${failBase}/criteria-suggest/act-fail?token=${failToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 500);

      await new Promise(r => failServer.close(r));
    });
  });

  describe('POST /feedback', () => {
    test('speichert Feedback und gibt ok:true zurück', async () => {
      const res = await fetch(`${baseUrl}/feedback?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'msg-1', threadId: 'thr-1', rating: 'gut' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
    });

    test('400 bei fehlendem messageId', async () => {
      const res = await fetch(`${baseUrl}/feedback?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 'gut' }),
      });
      assert.equal(res.status, 400);
    });

    test('400 bei ungültigem rating', async () => {
      const res = await fetch(`${baseUrl}/feedback?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'msg-2', rating: 'hmm' }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /feedback/:activityId', () => {
    test('gibt Feedback-Liste zurück', async () => {
      const res = await fetch(`${baseUrl}/feedback/act-test?token=${validToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.feedback), 'feedback muss Array sein');
    });
  });

  describe('POST /criteria/:activityId', () => {
    test('speichert Kriterium und gibt aktualisierte Listen zurück', async () => {
      const res = await fetch(`${baseUrl}/criteria/act-test?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Testkriterium 1' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.ok(Array.isArray(data.criteria), 'criteria muss Array sein');
      assert.ok(Array.isArray(data.deletedCriteria), 'deletedCriteria muss Array sein');
      assert.ok(data.criteria.some(c => c.content === 'Testkriterium 1'), 'gespeichertes Kriterium muss in criteria erscheinen');
    });

    test('400 bei fehlendem content', async () => {
      const res = await fetch(`${baseUrl}/criteria/act-test?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error, 'Fehlerantwort muss error-Feld enthalten');
    });
  });

  describe('DELETE /criteria/:id', () => {
    test('Soft-Delete: Kriterium erscheint danach in deletedCriteria', async () => {
      // Erst ein Kriterium anlegen, um dessen ID zu kennen
      const postRes = await fetch(`${baseUrl}/criteria/act-test?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Zu löschendes Kriterium' }),
      });
      const postData = await postRes.json();
      const created = postData.criteria.find(c => c.content === 'Zu löschendes Kriterium');
      assert.ok(created, 'Kriterium muss nach POST in criteria vorhanden sein');

      const delRes = await fetch(
        `${baseUrl}/criteria/${created.id}?activityId=act-test&token=${validToken}`,
        { method: 'DELETE' },
      );
      const delData = await delRes.json();
      assert.equal(delRes.status, 200);
      assert.equal(delData.ok, true);
      assert.ok(Array.isArray(delData.criteria), 'criteria muss Array sein');
      assert.ok(Array.isArray(delData.deletedCriteria), 'deletedCriteria muss Array sein');
      assert.ok(!delData.criteria.some(c => c.id === created.id), 'gelöschtes Kriterium darf nicht mehr in criteria stehen');
      assert.ok(delData.deletedCriteria.some(c => c.id === created.id), 'gelöschtes Kriterium muss in deletedCriteria erscheinen');
    });
  });

  describe('PATCH /criteria/:id/restore', () => {
    test('Wiederherstellen: Kriterium erscheint danach wieder in criteria', async () => {
      // Kriterium anlegen und dann löschen
      const postRes = await fetch(`${baseUrl}/criteria/act-test?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Wiederherzustellendes Kriterium' }),
      });
      const postData = await postRes.json();
      const created = postData.criteria.find(c => c.content === 'Wiederherzustellendes Kriterium');
      assert.ok(created, 'Kriterium muss nach POST vorhanden sein');

      await fetch(
        `${baseUrl}/criteria/${created.id}?activityId=act-test&token=${validToken}`,
        { method: 'DELETE' },
      );

      const restoreRes = await fetch(
        `${baseUrl}/criteria/${created.id}/restore?activityId=act-test&token=${validToken}`,
        { method: 'PATCH' },
      );
      const restoreData = await restoreRes.json();
      assert.equal(restoreRes.status, 200);
      assert.equal(restoreData.ok, true);
      assert.ok(restoreData.criteria.some(c => c.id === created.id), 'wiederhergestelltes Kriterium muss in criteria erscheinen');
      assert.ok(!restoreData.deletedCriteria.some(c => c.id === created.id), 'wiederhergestelltes Kriterium darf nicht mehr in deletedCriteria stehen');
    });
  });

  describe('POST /erkenntnisse', () => {
    test('speichert mehrere Erkenntnisse und gibt ok:true zurück', async () => {
      const items = [
        { problem: 'Problem A', ursache: 'Ursache A', aenderung: 'Änderung A' },
        { problem: 'Problem B', ursache: '', aenderung: 'Änderung B' },
      ];
      const res = await fetch(`${baseUrl}/erkenntnisse?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.saved, items.length);
    });

    test('400 bei fehlendem items-Array', async () => {
      const res = await fetch(`${baseUrl}/erkenntnisse?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: 'kein-array' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error, 'Fehlerantwort muss error-Feld enthalten');
    });

    test('400 wenn items fehlt komplett', async () => {
      const res = await fetch(`${baseUrl}/erkenntnisse?activityId=act-test&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });
  });

});
