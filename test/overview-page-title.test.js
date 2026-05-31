/**
 * Tests für initPageTitle — Issue #163
 *
 * Überblick-Seite: Header soll "moo-gpt – {activityName}" anzeigen.
 * Funktion wird als Stub gespiegelt (Pattern wie moo-bot-config-overlay.test.js).
 *
 * Run: node --test test/overview-page-title.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── DOM-Stub ───────────────────────────────────────────────────────────────────

function makeH1(initial = 'moo-gpt') {
  return { textContent: initial };
}

function makeDom(h1) {
  return { getElementById(id) { return id === 'page-title' ? h1 : null; } };
}

// ── Fetch-Stubs ────────────────────────────────────────────────────────────────

function makeFetchOk(activityName) {
  return async (_url) => ({ json: async () => ({ activityName }) });
}

function makeFetchError() {
  return async (_url) => { throw new Error('Netzwerkfehler'); };
}

// ── Produktionslogik (Spiegel von overview.html) ───────────────────────────────
// NOTE: Diese Funktion wird auch inline in overview.html verwendet.

async function initPageTitle(fetchFn, dom, activityId, token) {
  if (!activityId || !token) return;
  try {
    const r    = await fetchFn(`/api/activity-config/${encodeURIComponent(activityId)}?token=${encodeURIComponent(token)}`);
    const data = await r.json();
    const h1   = dom.getElementById('page-title');
    if (!h1) return;
    h1.textContent = data.activityName ? `moo-gpt – ${data.activityName}` : 'moo-gpt';
  } catch (_) { /* silently fail – Header bleibt "moo-gpt" */ }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('initPageTitle', () => {
  test('zeigt "moo-gpt – {name}" wenn activityName vorhanden', async () => {
    const h1 = makeH1();
    await initPageTitle(makeFetchOk('pong-chat'), makeDom(h1), 'act42', 'tok123');
    assert.equal(h1.textContent, 'moo-gpt – pong-chat');
  });

  test('zeigt "moo-gpt" wenn activityName leer', async () => {
    const h1 = makeH1();
    await initPageTitle(makeFetchOk(''), makeDom(h1), 'act42', 'tok123');
    assert.equal(h1.textContent, 'moo-gpt');
  });

  test('lässt Header unverändert bei Fetch-Fehler', async () => {
    const h1 = makeH1();
    await initPageTitle(makeFetchError(), makeDom(h1), 'act42', 'tok123');
    assert.equal(h1.textContent, 'moo-gpt');
  });

  test('ruft fetch nicht auf ohne activityId', async () => {
    const h1 = makeH1();
    let called = false;
    const trackFetch = async () => { called = true; return { json: async () => ({}) }; };
    await initPageTitle(trackFetch, makeDom(h1), '', 'tok123');
    assert.equal(called, false, 'fetch sollte nicht aufgerufen werden');
    assert.equal(h1.textContent, 'moo-gpt');
  });

  test('übergibt korrekten URL mit activityId und token', async () => {
    const h1 = makeH1();
    let capturedUrl = '';
    const captureFetch = async (url) => { capturedUrl = url; return { json: async () => ({ activityName: 'x' }) }; };
    await initPageTitle(captureFetch, makeDom(h1), 'kurs/1', 'mein token');
    assert.equal(capturedUrl, '/api/activity-config/kurs%2F1?token=mein%20token');
  });
});
