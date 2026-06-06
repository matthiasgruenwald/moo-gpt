/**
 * Tests für effectiveModel/effectiveAssistModel im Config-Overlay — Issue #195 (ADR 0008)
 *
 * Verifiziert, dass die Config-Overlay-Füll-Logik das effectiveModel und
 * effectiveAssistModel aus der API-Antwort in die entsprechenden DOM-Elemente
 * schreibt (#cfg-effective-model, #cfg-effective-assist-model).
 *
 * Tests laufen mit minimalem DOM-Stub, kein Server nötig.
 *
 * Run: node --test test/config-overlay-effective-model.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM-Stub ─────────────────────────────────────────────────────────

function makeTextElement(id) {
  return { id, textContent: '' };
}

function makeSelectElement(id, options = []) {
  const _options = [...options];
  return {
    id,
    value: '',
    innerHTML: '',
    _options,
    appendChild(opt) { _options.push(opt); },
    get options() { return _options; },
  };
}

function makeDom() {
  const elements = {
    'cfg-effective-model':        makeTextElement('cfg-effective-model'),
    'cfg-effective-assist-model': makeTextElement('cfg-effective-assist-model'),
    'cfg-model':                  makeSelectElement('cfg-model'),
    'cfg-assist-model':           makeSelectElement('cfg-assist-model'),
  };
  return {
    getElementById(id) { return elements[id] ?? null; },
    createElement(tag) {
      if (tag === 'option') return { value: '', textContent: '' };
      return {};
    },
    _els: elements,
  };
}

// ─── Stub-Implementierung der Config-Overlay-Füll-Logik ───────────────────────
//
// Spiegelt exakt die Produktionslogik aus config.js (populateEffectiveModelHints).
// Dieses Muster entspricht moo-bot-config-overlay.test.js.

/**
 * Setzt die "Effektives Modell"-Hinweis-Elemente im Config-Overlay.
 * @param {object} dom  - document-artiges DOM-Objekt
 * @param {string} effectiveModel       - aus API data.effectiveModel
 * @param {string} effectiveAssistModel - aus API data.effectiveAssistModel
 */
function populateEffectiveModelHints(dom, effectiveModel, effectiveAssistModel) {
  const modelHint = dom.getElementById('cfg-effective-model');
  if (modelHint) {
    modelHint.textContent = effectiveModel || '';
  }
  const assistHint = dom.getElementById('cfg-effective-assist-model');
  if (assistHint) {
    assistHint.textContent = effectiveAssistModel || '';
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Config-Overlay: effectiveModel-Hinweise (Issue #195)', () => {
  let dom;

  beforeEach(() => {
    dom = makeDom();
  });

  test('effectiveModel wird in #cfg-effective-model geschrieben', () => {
    populateEffectiveModelHints(dom, 'gpt-4.1', 'gpt-4.1');

    assert.equal(dom._els['cfg-effective-model'].textContent, 'gpt-4.1',
      '#cfg-effective-model muss effectiveModel anzeigen');
  });

  test('effectiveAssistModel wird in #cfg-effective-assist-model geschrieben', () => {
    populateEffectiveModelHints(dom, 'gpt-4.1', 'gpt-4.1-mini');

    assert.equal(dom._els['cfg-effective-assist-model'].textContent, 'gpt-4.1-mini',
      '#cfg-effective-assist-model muss effectiveAssistModel anzeigen');
  });

  test('Lehrer-Template-Modell landet als effectiveModel im DOM', () => {
    // Simuliert: Aktivität hat kein model, Lehrer-Template hat gpt-4.1
    // API liefert effectiveModel: 'gpt-4.1', data.model: ''
    populateEffectiveModelHints(dom, 'gpt-4.1', 'gpt-4.1');

    assert.equal(dom._els['cfg-effective-model'].textContent, 'gpt-4.1',
      'Lehrer-Template-Modell muss als effektives Modell im Overlay erscheinen');
    assert.equal(dom._els['cfg-effective-assist-model'].textContent, 'gpt-4.1',
      'Lehrer-Template-Modell wird für assistModel geerbt');
  });

  test('leere effectiveModel-Werte → textContent bleibt leer', () => {
    populateEffectiveModelHints(dom, '', '');

    assert.equal(dom._els['cfg-effective-model'].textContent, '');
    assert.equal(dom._els['cfg-effective-assist-model'].textContent, '');
  });

  test('null/undefined effectiveModel → textContent bleibt leer (kein Crash)', () => {
    populateEffectiveModelHints(dom, null, undefined);

    assert.equal(dom._els['cfg-effective-model'].textContent, '');
    assert.equal(dom._els['cfg-effective-assist-model'].textContent, '');
  });
});
