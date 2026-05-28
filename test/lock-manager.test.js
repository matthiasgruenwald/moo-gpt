/**
 * Tests für lock-manager.js — Issue #131
 *
 * Testet LockManager mit Mock-Registries.
 * Kein echter WebSocket-Server, kein OPENAI_API_KEY nötig.
 * Fake Timers via t.mock.timers (Node ≥ 20.4).
 *
 * Run: node --test test/lock-manager.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LockManager } from '../lock-manager.js';

// ── Mock-Factory ──────────────────────────────────────────────────────────────

/**
 * Erstellt eine Registry-Attrappe, die Broadcasts aufzeichnet
 * und optional eingetragene WS-Clients beliefert.
 */
function makeRegistry() {
  const calls = [];
  return {
    /** Aufgezeichnete broadcast()-Aufrufe: [{ activityId, msg }] */
    _calls: calls,
    broadcast(activityId, msg) {
      calls.push({ activityId: String(activityId), msg });
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LockManager', () => {

  // ── lock() ─────────────────────────────────────────────────────────────────

  describe('lock()', () => {

    test('setzt Lock — isLocked() gibt true zurück', () => {
      const lm = new LockManager(makeRegistry(), makeRegistry());
      lm.lock('act-1');
      assert.equal(lm.isLocked('act-1'), true);
    });

    test('sendet "locked"-Broadcast an chatRegistry und dashboardRegistry', () => {
      const chat = makeRegistry();
      const dash = makeRegistry();
      const lm = new LockManager(chat, dash);
      lm.lock('act-1');
      assert.deepEqual(chat._calls, [{ activityId: 'act-1', msg: { type: 'locked' } }]);
      assert.deepEqual(dash._calls, [{ activityId: 'act-1', msg: { type: 'locked' } }]);
    });

    test('activityId wird zu String normalisiert', () => {
      const lm = new LockManager(makeRegistry(), makeRegistry());
      lm.lock(42);
      // isLocked() mit Zahl und String liefert denselben Wert
      assert.equal(lm.isLocked(42),   true);
      assert.equal(lm.isLocked('42'), true);
    });

  });

  // ── unlock() ───────────────────────────────────────────────────────────────

  describe('unlock()', () => {

    test('entsperrt Aktivität — isLocked() gibt false zurück', () => {
      const lm = new LockManager(makeRegistry(), makeRegistry());
      lm.lock('act-2');
      lm.unlock('act-2');
      assert.equal(lm.isLocked('act-2'), false);
    });

    test('sendet "unlocked"-Broadcast an beide Registries', () => {
      const chat = makeRegistry();
      const dash = makeRegistry();
      const lm = new LockManager(chat, dash);
      lm.lock('act-2');
      chat._calls.length = 0;
      dash._calls.length = 0;

      lm.unlock('act-2');

      assert.deepEqual(chat._calls, [{ activityId: 'act-2', msg: { type: 'unlocked' } }]);
      assert.deepEqual(dash._calls, [{ activityId: 'act-2', msg: { type: 'unlocked' } }]);
    });

    test('unlock ohne aktives Lock: kein Absturz, kein Broadcast', () => {
      const chat = makeRegistry();
      const dash = makeRegistry();
      const lm = new LockManager(chat, dash);

      assert.doesNotThrow(() => lm.unlock('act-none'));
      assert.equal(chat._calls.length, 0);
      assert.equal(dash._calls.length, 0);
    });

  });

  // ── isLocked() ─────────────────────────────────────────────────────────────

  describe('isLocked()', () => {

    test('gibt false zurück wenn keine Sperre aktiv', () => {
      const lm = new LockManager(makeRegistry(), makeRegistry());
      assert.equal(lm.isLocked('act-x'), false);
    });

  });

  // ── Timeout ────────────────────────────────────────────────────────────────

  describe('Timeout (automatische Entsperrung)', () => {

    test('entsperrt automatisch nach Ablauf der Dauer', (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const chat = makeRegistry();
      const dash = makeRegistry();
      const lm = new LockManager(chat, dash);

      lm.lock('act-3', 1); // 1 Minute
      assert.equal(lm.isLocked('act-3'), true);

      // Broadcasts aus lock() verwerfen
      chat._calls.length = 0;
      dash._calls.length = 0;

      // Fake-Clock um 60 Sekunden vorrücken
      t.mock.timers.tick(60_000);

      assert.equal(lm.isLocked('act-3'), false);
      assert.deepEqual(chat._calls, [{ activityId: 'act-3', msg: { type: 'unlocked' } }]);
      assert.deepEqual(dash._calls, [{ activityId: 'act-3', msg: { type: 'unlocked' } }]);
    });

    test('kein Timeout bei durationMinutes = 0 — Lock bleibt dauerhaft', (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const lm = new LockManager(makeRegistry(), makeRegistry());

      lm.lock('act-4', 0);
      t.mock.timers.tick(99_999_999); // weit in die Zukunft

      assert.equal(lm.isLocked('act-4'), true,
        'Lock ohne Timeout-Dauer bleibt aktiv');
    });

    test('Duration wird auf maximal 120 Minuten gedeckelt', (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const lm = new LockManager(makeRegistry(), makeRegistry());

      lm.lock('act-5', 200); // 200 min → gedeckelt auf 120

      t.mock.timers.tick(120 * 60_000); // 120 Minuten

      assert.equal(lm.isLocked('act-5'), false,
        'Nach 120 min (gedeckelter Wert) soll Entsperrung erfolgt sein');
    });

  });

  // ── Doppeltes Lock ─────────────────────────────────────────────────────────

  describe('Doppeltes Lock', () => {

    test('zweites Lock setzt laufenden Timer zurück', (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const lm = new LockManager(makeRegistry(), makeRegistry());

      // Erstes Lock — Timer läuft 60 s
      lm.lock('act-6', 1);
      t.mock.timers.tick(59_000); // Fast abgelaufen

      // Zweites Lock — alter Timer wird gecancelt, neuer startet
      lm.lock('act-6', 1);

      // Alter Timer wäre jetzt abgelaufen (1 s fehlen), aber er wurde gecancelt
      t.mock.timers.tick(1_001);
      assert.equal(lm.isLocked('act-6'), true,
        'Nach Timer-Reset noch 58.999 s verbleibend — muss noch gesperrt sein');

      // Neuen Timer ablaufen lassen (58.999 s verbleibend)
      t.mock.timers.tick(60_000);
      assert.equal(lm.isLocked('act-6'), false,
        'Nach Ablauf des neuen Timers entsperrt');
    });

    test('doppeltes Lock ohne Timeout sendet zweimal "locked"-Broadcast', () => {
      const chat = makeRegistry();
      const lm = new LockManager(chat, makeRegistry());
      lm.lock('act-7');
      lm.lock('act-7');
      const lockedCount = chat._calls.filter(c => c.msg.type === 'locked').length;
      assert.equal(lockedCount, 2);
    });

  });

  // ── Lock ohne verbundene Clients ───────────────────────────────────────────

  describe('Lock ohne verbundene Clients', () => {

    test('kein Absturz wenn keine WS-Clients in der Registry registriert sind', () => {
      // Registry die das echte Verhalten nachahmt: no-op für unbekannte activityId
      const registryWithNoClients = {
        _calls: [],
        broadcast(activityId, msg) {
          this._calls.push({ activityId: String(activityId), msg });
          // Leere Map → forEach-Guard greift → kein Fehler
          const clients = new Map();
          clients.get(String(activityId))?.forEach(c => c.send(JSON.stringify(msg)));
        },
      };

      const lm = new LockManager(registryWithNoClients, registryWithNoClients);

      assert.doesNotThrow(() => lm.lock('act-empty'));
      assert.doesNotThrow(() => lm.unlock('act-empty'));
    });

  });

});
