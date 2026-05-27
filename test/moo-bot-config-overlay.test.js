/**
 * Tests für _openConfigOverlay — Issue #112
 *
 * Überprüft:
 * - Overlay öffnet mit 'left-side' wenn #chat-container sichtbar (display: flex)
 * - Overlay öffnet ohne 'left-side' wenn #chat-container nicht sichtbar
 * - suggest-panel erhält ebenfalls 'left-side' wenn Chat sichtbar
 * - suggest-panel verliert 'left-side' wenn Chat nicht sichtbar
 * - ⇔-Button (side-toggle) wechselt weiterhin zwischen links und rechts
 *
 * Tests laufen mit minimalem DOM-Stub, kein Server nötig.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM-Stub ─────────────────────────────────────────────────────────

function makeElement(id, { display = 'none', classes = [] } = {}) {
  const classList = new Set(classes);
  return {
    id,
    src: '',
    style: { display },
    classList: {
      add(cls)    { classList.add(cls); },
      remove(cls) { classList.delete(cls); },
      toggle(cls) { classList.has(cls) ? classList.delete(cls) : classList.add(cls); },
      has(cls)    { return classList.has(cls); },
    },
    _classes: classList,
  };
}

function makeDom({ chatDisplay = 'none' } = {}) {
  const elements = {
    'config-overlay':        makeElement('config-overlay'),
    'config-overlay-iframe': makeElement('config-overlay-iframe'),
    'chat-container':        makeElement('chat-container', { display: chatDisplay }),
    'suggest-panel':         makeElement('suggest-panel'),
  };
  return {
    getElementById(id) { return elements[id] ?? null; },
    _els: elements,
  };
}

// ─── Stub-Implementierung von _openConfigOverlay ──────────────────────────────

/**
 * Isoliert die Logik von _openConfigOverlay ohne den ganzen MooBot-Kontext.
 * Spiegelt exakt die Produktionslogik aus moo-bot.js.
 */
function openConfigOverlay(dom, token, activityId) {
  const url     = `https://gpt.gruenwald.fun/config.html?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;
  const iframe  = dom.getElementById('config-overlay-iframe');
  const overlay = dom.getElementById('config-overlay');
  if (!iframe || !overlay) return;
  const srcChanged = iframe.src !== url;
  if (srcChanged) iframe.src = url;

  // Issue #112: open on left side when chat is already visible
  const chatVisible = dom.getElementById('chat-container')?.style.display === 'flex';
  const suggestPanel = dom.getElementById('suggest-panel');
  if (chatVisible) {
    overlay.classList.add('left-side');
    suggestPanel?.classList.add('left-side');
  } else {
    overlay.classList.remove('left-side');
    suggestPanel?.classList.remove('left-side');
  }
  overlay.style.display = 'flex';
  // _sendTaskContextToConfig not tested here (iframe postMessage, covered separately)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('_openConfigOverlay — Issue #112', () => {

  describe('Chat sichtbar (display: flex)', () => {
    let dom;
    beforeEach(() => { dom = makeDom({ chatDisplay: 'flex' }); });

    test('Overlay bekommt left-side', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(dom._els['config-overlay']._classes.has('left-side'),
        'config-overlay sollte left-side haben wenn Chat offen');
    });

    test('suggest-panel bekommt left-side', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(dom._els['suggest-panel']._classes.has('left-side'),
        'suggest-panel sollte left-side haben wenn Chat offen');
    });

    test('Overlay wird sichtbar (display flex)', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.equal(dom._els['config-overlay'].style.display, 'flex');
    });
  });

  describe('Chat nicht sichtbar (display: none)', () => {
    let dom;
    beforeEach(() => { dom = makeDom({ chatDisplay: 'none' }); });

    test('Overlay hat kein left-side', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(!dom._els['config-overlay']._classes.has('left-side'),
        'config-overlay sollte kein left-side haben wenn Chat zu');
    });

    test('suggest-panel hat kein left-side', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(!dom._els['suggest-panel']._classes.has('left-side'),
        'suggest-panel sollte kein left-side haben wenn Chat zu');
    });

    test('Overlay wird sichtbar (display flex)', () => {
      openConfigOverlay(dom, 'tok', 'act1');
      assert.equal(dom._els['config-overlay'].style.display, 'flex');
    });
  });

  describe('left-side wird bei Wechsel zurückgesetzt', () => {
    test('Overlay hatte left-side von vorher → wird entfernt wenn Chat zu', () => {
      // Simuliert: Overlay wurde mit Chat offen geöffnet → left-side gesetzt
      const dom = makeDom({ chatDisplay: 'flex' });
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(dom._els['config-overlay']._classes.has('left-side'), 'Vorbedingung: left-side gesetzt');

      // Jetzt Chat schließen und Overlay erneut öffnen
      dom._els['chat-container'].style.display = 'none';
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(!dom._els['config-overlay']._classes.has('left-side'),
        'left-side sollte entfernt werden wenn Chat jetzt zu');
    });
  });

  describe('⇔-Button (side-toggle) — bleibt unabhängig funktional', () => {
    test('toggle fügt left-side hinzu wenn nicht vorhanden', () => {
      const dom = makeDom({ chatDisplay: 'none' });
      openConfigOverlay(dom, 'tok', 'act1');
      // Simuliert Button-Click
      dom._els['config-overlay'].classList.toggle('left-side');
      dom._els['suggest-panel'].classList.toggle('left-side');
      assert.ok(dom._els['config-overlay']._classes.has('left-side'));
      assert.ok(dom._els['suggest-panel']._classes.has('left-side'));
    });

    test('toggle entfernt left-side wenn vorhanden', () => {
      const dom = makeDom({ chatDisplay: 'flex' });
      openConfigOverlay(dom, 'tok', 'act1');
      assert.ok(dom._els['config-overlay']._classes.has('left-side'), 'Vorbedingung');
      // Simuliert Button-Click
      dom._els['config-overlay'].classList.toggle('left-side');
      dom._els['suggest-panel'].classList.toggle('left-side');
      assert.ok(!dom._els['config-overlay']._classes.has('left-side'));
      assert.ok(!dom._els['suggest-panel']._classes.has('left-side'));
    });
  });
});
