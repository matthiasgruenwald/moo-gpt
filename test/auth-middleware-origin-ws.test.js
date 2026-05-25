/**
 * Tests für checkOriginWs in auth-middleware.js — Issue #77
 *
 * Prüft das WS-Pendant zu isOriginAllowed:
 * - Kein ALLOWED_ORIGIN → immer next()
 * - Erlaubte Origin → next()
 * - Verbotene Origin → Fehler-Frame + ws.close(1008)
 *
 * Run: node --test test/auth-middleware-origin-ws.test.js
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkOriginWs } from '../auth-middleware.js';

function makeWs() {
  const sent = [];
  let closed = null;
  return {
    send(msg)        { sent.push(JSON.parse(msg)); },
    close(code, msg) { closed = { code, msg }; },
    get _sent()   { return sent; },
    get _closed() { return closed; },
  };
}

function makeReq(origin) {
  return { headers: { origin } };
}

describe('checkOriginWs', () => {
  const originalEnv = process.env.ALLOWED_ORIGIN;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ALLOWED_ORIGIN;
    else process.env.ALLOWED_ORIGIN = originalEnv;
  });

  test('kein ALLOWED_ORIGIN → next() aufgerufen', () => {
    delete process.env.ALLOWED_ORIGIN;
    let called = false;
    const ws = makeWs();
    checkOriginWs(ws, makeReq('https://example.com'), () => { called = true; });
    assert.ok(called, 'next() soll aufgerufen sein');
    assert.equal(ws._closed, null, 'WS soll nicht geschlossen sein');
  });

  test('erlaubte Origin → next() aufgerufen', () => {
    process.env.ALLOWED_ORIGIN = 'https://moodle.example.com';
    let called = false;
    const ws = makeWs();
    checkOriginWs(ws, makeReq('https://moodle.example.com/course'), () => { called = true; });
    assert.ok(called, 'next() soll aufgerufen sein');
    assert.equal(ws._closed, null);
  });

  test('verbotene Origin → Fehler-Frame gesendet + WS geschlossen', () => {
    process.env.ALLOWED_ORIGIN = 'https://moodle.example.com';
    let called = false;
    const ws = makeWs();
    checkOriginWs(ws, makeReq('https://evil.com'), () => { called = true; });
    assert.ok(!called, 'next() soll NICHT aufgerufen sein');
    assert.equal(ws._sent.length, 1, 'Fehler-Frame soll gesendet sein');
    assert.equal(ws._sent[0].end, true);
    assert.ok(ws._sent[0].messages.includes('Origin'), 'Fehlermeldung soll "Origin" enthalten');
    assert.deepEqual(ws._closed, { code: 1008, msg: 'Origin not allowed' });
  });

  test('mehrere erlaubte Origins (kommagetrennt) — eine passt → next()', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com,https://b.com,https://c.com';
    let called = false;
    const ws = makeWs();
    checkOriginWs(ws, makeReq('https://b.com/path'), () => { called = true; });
    assert.ok(called);
    assert.equal(ws._closed, null);
  });

  test('mehrere erlaubte Origins — keine passt → gesperrt', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com,https://b.com';
    let called = false;
    const ws = makeWs();
    checkOriginWs(ws, makeReq('https://c.com'), () => { called = true; });
    assert.ok(!called);
    assert.ok(ws._closed !== null);
  });
});
