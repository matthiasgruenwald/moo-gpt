/**
 * Tests für routes/criteria.js — Issue #129
 *
 * Testet den Factory-Pattern-Router mit Mock-aiClient und In-Memory-DB.
 * Kein OPENAI_API_KEY nötig.
 *
 * Run: DB_PATH=:memory: node --test test/criteria-route.test.js
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

});
