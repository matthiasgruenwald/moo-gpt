/**
 * Tests für routes/erfahrungsprompt.js — Issue #130
 *
 * Testet den Factory-Pattern-Router mit Mock-aiClient und In-Memory-DB.
 * Kein OPENAI_API_KEY nötig.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/erfahrungsprompt-route.test.js
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';
import { initDb } from '../db.js';
import { createErfahrungspromptRouter } from '../routes/erfahrungsprompt.js';
import { generateDashboardToken } from '../auth-middleware.js';

// ── Mock aiClient ─────────────────────────────────────────────────────────────

function makeMockAiClient(overrides = {}) {
  return {
    async jsonCall(_sys, _user, _model, _opts) {
      return {
        text: {
          erfahrungsprompt_neu: 'Verbesserter Prompt',
          kausalkette: [{ problem: 'P', ursache: 'U', aenderung: 'A' }],
        },
        usage: { input_tokens: 80, output_tokens: 30 },
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
  validToken = generateDashboardToken('act-erf', 'teacher-1', 'Frau Test');

  const app = express();
  app.use(express.json());
  app.use('/api', createErfahrungspromptRouter({ aiClient: makeMockAiClient() }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}/api`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('erfahrungsprompt-route', () => {

  describe('Auth-Schutz', () => {
    test('403 ohne Token', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt/act-erf`);
      assert.equal(res.status, 403);
    });

    test('403 mit falschem Token', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt/act-erf?token=ungueltig`);
      assert.equal(res.status, 403);
    });
  });

  describe('GET /erfahrungsprompt/:activityId', () => {
    test('gibt leeren Erfahrungsprompt zurück für unbekannte Aktivität', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt/act-erf?token=${validToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.content, '');
      assert.equal(data.version, 0);
    });
  });

  describe('POST /erfahrungsprompt/:activityId', () => {
    test('speichert Erfahrungsprompt und gibt ok:true zurück', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt/act-erf?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Mein Erfahrungsprompt' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
    });

    test('400 wenn content fehlt', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt/act-erf?token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other: 'field' }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /erfahrungsprompt-history/:activityId', () => {
    test('gibt Versionshistorie zurück', async () => {
      const res = await fetch(`${baseUrl}/erfahrungsprompt-history/act-erf?token=${validToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.history), 'history muss Array sein');
    });
  });

  describe('POST /optimize-prompt', () => {
    test('ruft aiClient auf und gibt Vorschlag mit Kosten zurück', async () => {
      const res = await fetch(`${baseUrl}/optimize-prompt?activityId=act-erf&token=${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok('erfahrungsprompt_neu' in data, 'Antwort muss erfahrungsprompt_neu enthalten');
      assert.ok(Array.isArray(data.kausalkette), 'kausalkette muss Array sein');
      assert.ok('cost' in data, 'Antwort muss cost-Feld enthalten');
      assert.equal(data.cost.promptTokens, 80);
      assert.equal(data.cost.completionTokens, 30);
    });

    test('500 wenn aiClient wirft', async () => {
      const failClient = makeMockAiClient({
        jsonCall: async () => { throw new Error('KI nicht verfügbar'); },
      });
      const failApp = express();
      failApp.use(express.json());
      const failToken = generateDashboardToken('act-fail', 'teacher-1', 'Frau Test');
      failApp.use('/api', createErfahrungspromptRouter({ aiClient: failClient }));
      const failServer = createServer(failApp);
      await new Promise(r => failServer.listen(0, r));
      const failBase = `http://localhost:${failServer.address().port}/api`;

      const res = await fetch(`${failBase}/optimize-prompt?activityId=act-fail&token=${failToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 500);

      await new Promise(r => failServer.close(r));
    });

    test('403 ohne Token bei optimize-prompt', async () => {
      const res = await fetch(`${baseUrl}/optimize-prompt?activityId=act-erf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 403);
    });
  });

});
