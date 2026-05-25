/**
 * Tests für routes/dashboard-ws.js — Issue #75
 *
 * Testet den Dashboard-WebSocket-Handler mit Mock-Objekten.
 * Kein echter WebSocket-Server, keine DB.
 *
 * Run: node --test test/dashboard-ws.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock-Factories ────────────────────────────────────────────────────────────

function makeWs() {
  const ws = {
    _sent: [],
    _closed: null,
    send(data) { this._sent.push(JSON.parse(data)); },
    close(code, reason) { this._closed = { code, reason }; },
    on(event, fn) { this._handlers = this._handlers || {}; this._handlers[event] = fn; },
    emit(event, ...args) { this._handlers?.[event]?.(...args); },
  };
  return ws;
}

function makeReq({ origin = 'https://allowed.example.com', query = '' } = {}) {
  return {
    headers: { origin },
    url: `/api/dashboard-ws${query ? '?' + query : ''}`,
  };
}

// ── Stub-Module über Dependency-Injection bereitstellen ───────────────────────

function makeRegistry() {
  const store = new Map(); // activityId → Set<ws>
  return {
    _store: store,
    register(activityId, ws) {
      if (!store.has(activityId)) store.set(activityId, new Set());
      store.get(activityId).add(ws);
    },
    unregister(activityId, ws) {
      store.get(activityId)?.delete(ws);
    },
    broadcast(activityId, msg) {
      store.get(activityId)?.forEach(c => c.send(JSON.stringify(msg)));
    },
  };
}

function makeLockManager(locked = false) {
  return { isLocked: (_activityId) => locked };
}

// ── Importiere den Handler-Builder ────────────────────────────────────────────

// Wir bauen die Deps komplett gemockt, damit keine DB nötig ist.
// createDashboardWsHandler(deps) gibt einen (ws, req)-Handler zurück.

async function loadHandler(overrides = {}) {
  // Dynamischer Import des Moduls — Modul-interne Imports werden über
  // den Trick mit globalem Object-Mocking nicht abgefangen; stattdessen
  // exportiert das Modul eine testbare Factory-Funktion.
  const mod = await import('../routes/dashboard-ws.js');
  return mod;
}

// ── Handler-Test-Helfer ───────────────────────────────────────────────────────

/**
 * Baut einen Handler-Aufruf mit vollem Stub-Kontext.
 *
 * @param {object} opts
 * @param {string} opts.activityId
 * @param {string} opts.token            — wird von validateDashboardToken akzeptiert wenn = 'valid-token'
 * @param {boolean} opts.originAllowed
 * @param {boolean} opts.locked
 * @param {object[]} opts.students
 */
async function callHandler(opts = {}) {
  const {
    activityId = 'act-1',
    token = 'valid-token',
    originAllowed = true,
    locked = false,
    students = [],
    messages = [],
    threadCost = null,
    activityCost = null,
  } = opts;

  const mod = await loadHandler();

  const dashboardRegistry = makeRegistry();
  const lockManager = makeLockManager(locked);

  // Alle domain-Deps als Stubs injizieren
  const stubs = {
    isOriginAllowed:       () => originAllowed,
    validateDashboardToken: (tok, _actId) => tok === 'valid-token',
    getUserIdFromToken:     () => 'teacher-id-1',
    getUserNameFromToken:   () => 'Frau Test',
    setTeacherIfUnset:     () => {},
    getActivity:           () => ({ activity_name: 'Mathe', opener: 'Hallo!' }),
    getStudents:           () => students,
    enrichStudentsWithCost: async (s) => s,
    computeActivityCost:   async () => activityCost,
    enrichMessagesWithCost: async (m) => m,
    computeThreadCost:     async () => threadCost,
    getMessages:           () => messages,
    dashboardRegistry,
    lockManager,
  };

  const handler = mod.createDashboardWsHandler(stubs);

  const ws = makeWs();
  const query = `activityId=${activityId}&token=${token}`;
  const req = makeReq({ query });

  handler(ws, req);

  return { ws, dashboardRegistry };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard-WS-Handler', () => {

  describe('Origin-Prüfung', () => {
    test('schließt Verbindung wenn Origin nicht erlaubt', async () => {
      const { ws } = await callHandler({ originAllowed: false });
      assert.deepEqual(ws._closed, { code: 1008, reason: 'Origin not allowed' });
    });

    test('registriert nicht in dashboardRegistry wenn Origin abgelehnt', async () => {
      const { ws, dashboardRegistry } = await callHandler({ originAllowed: false });
      assert.equal(dashboardRegistry._store.size, 0);
    });
  });

  describe('Token-Validierung', () => {
    test('schließt Verbindung bei ungültigem Token', async () => {
      const { ws } = await callHandler({ token: 'bad-token' });
      assert.deepEqual(ws._closed, { code: 1008, reason: 'Unauthorized' });
    });

    test('sendet error-Nachricht bei ungültigem Token', async () => {
      const { ws } = await callHandler({ token: 'bad-token' });
      assert.ok(ws._sent.some(m => m.type === 'error' && m.message === 'Unauthorized'),
        'Muss error-Nachricht senden');
    });

    test('registriert nicht bei ungültigem Token', async () => {
      const { ws, dashboardRegistry } = await callHandler({ token: 'bad-token' });
      assert.equal(dashboardRegistry._store.size, 0);
    });
  });

  describe('Verbindungsaufbau (gültiger Token)', () => {
    test('registriert WS in dashboardRegistry', async () => {
      const { ws, dashboardRegistry } = await callHandler({ activityId: 'act-5' });
      // Warte auf asynchrone initiale Sendung
      await new Promise(r => setTimeout(r, 20));
      assert.ok(dashboardRegistry._store.get('act-5')?.has(ws),
        'WS muss in Registry registriert sein');
    });

    test('sendet initiale students-Nachricht', async () => {
      const students = [{ thread_db_id: 1, user_name: 'Alice' }];
      const { ws } = await callHandler({ students, activityCost: 0.05 });
      await new Promise(r => setTimeout(r, 20));
      const studentMsg = ws._sent.find(m => m.type === 'students');
      assert.ok(studentMsg, 'Muss students-Nachricht senden');
      assert.deepEqual(studentMsg.data, students);
      assert.equal(studentMsg.activityName, 'Mathe');
      assert.equal(studentMsg.activityCost, 0.05);
    });

    test('initiale Nachricht enthält locked-Status', async () => {
      const { ws } = await callHandler({ locked: true });
      await new Promise(r => setTimeout(r, 20));
      const studentMsg = ws._sent.find(m => m.type === 'students');
      assert.equal(studentMsg?.locked, true);
    });
  });

  describe('getMessages-Anfrage', () => {
    test('sendet messages-Antwort für bekannten threadDbId', async () => {
      const students = [{ thread_db_id: 42, user_name: 'Bob' }];
      const messages = [{ role: 'user', content: 'Hallo' }];
      const { ws } = await callHandler({ students, messages, threadCost: 0.01 });
      await new Promise(r => setTimeout(r, 20));

      ws.emit('message', JSON.stringify({ type: 'getMessages', threadDbId: 42 }));
      await new Promise(r => setTimeout(r, 20));

      const msgReply = ws._sent.find(m => m.type === 'messages');
      assert.ok(msgReply, 'Muss messages-Antwort senden');
      assert.equal(msgReply.threadDbId, 42);
      assert.deepEqual(msgReply.data, messages);
      assert.equal(msgReply.threadCost, 0.01);
    });

    test('sendet error wenn threadDbId zu unbekanntem Schüler gehört', async () => {
      const students = [{ thread_db_id: 1, user_name: 'Alice' }];
      const { ws } = await callHandler({ students });
      await new Promise(r => setTimeout(r, 20));

      ws.emit('message', JSON.stringify({ type: 'getMessages', threadDbId: 999 }));
      await new Promise(r => setTimeout(r, 20));

      const errMsg = ws._sent.find(m => m.type === 'error' && m.message === 'Forbidden');
      assert.ok(errMsg, 'Muss Forbidden-Error senden');
    });
  });

  describe('Disconnect-Cleanup', () => {
    test('entfernt WS aus Registry bei close', async () => {
      const { ws, dashboardRegistry } = await callHandler({ activityId: 'act-9' });
      await new Promise(r => setTimeout(r, 20));

      assert.ok(dashboardRegistry._store.get('act-9')?.has(ws), 'WS muss registriert sein');

      ws.emit('close');
      assert.ok(!dashboardRegistry._store.get('act-9')?.has(ws), 'WS muss nach close entfernt sein');
    });
  });

});
