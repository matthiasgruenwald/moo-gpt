/**
 * Tests für das Side-by-Side Prompt-Vergleichs-Panel (config.js, Issue #40 redesign)
 *
 * Framework: Node.js 22 node:test
 *
 * Die Logik aus config.js (runPromptCheck, close-handler, useAndSave) wird
 * hier als Fabrik-Funktion gespiegelt und isoliert getestet.
 * postMessage wird über einen sentMessages-Array nachverfolgt.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimaler DOM-Stub ───────────────────────────────────────────────────────

function makeDomStub({ hintsValue = 'Aktueller Prompt' } = {}) {
  const elements = {
    'cfg-check-btn':             { disabled: false, textContent: '🔍 Prompt prüfen & verbessern' },
    'cfg-hints':                 { value: hintsValue },
    'cfg-compare-panel':         { style: { display: 'none' } },
    'cfg-compare-suggestion':    { value: '' },
    'cfg-compare-original':      { value: '' },
    'cfg-status':                { className: '', textContent: '' },
  };
  return {
    getElementById(id) {
      if (!(id in elements)) throw new Error(`Unbekannte Element-ID im Test: ${id}`);
      return elements[id];
    },
    _els: elements,
  };
}

// ─── postMessage-Capture ──────────────────────────────────────────────────────

function makeParentStub() {
  const sent = [];
  return {
    postMessage(data, _target) { sent.push(data); },
    _sent: sent,
  };
}

// ─── Isolierte Fabrik: spiegelt die Logik aus config.js ──────────────────────

function makeHandlers({ dom, fetchFn, parentStub, activityId = '42', token = 'tok', taskContext = { task: null, images: [] } }) {
  function showStatus(msg, cls) {
    const status = dom.getElementById('cfg-status');
    status.className   = 'cfg-status ' + cls;
    status.textContent = msg;
  }

  async function saveConfig() {
    // Stub: immer erfolgreich; sendet moogpt:configSaved
    parentStub.postMessage({ type: 'moogpt:configSaved' }, '*');
  }

  async function runPromptCheck() {
    const btn         = dom.getElementById('cfg-check-btn');
    const currentHints = dom.getElementById('cfg-hints').value;

    btn.disabled    = true;
    btn.textContent = '⏳ Prüft…';

    try {
      const res = await fetchFn(
        `/api/activity/${encodeURIComponent(activityId)}/prompt-check?token=${encodeURIComponent(token)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ task: taskContext.task, currentHints, taskImages: taskContext.images }),
        }
      );
      if (!res.ok) throw new Error(`Server-Fehler ${res.status}`);
      const data = await res.json();

      dom.getElementById('cfg-compare-suggestion').value = data.suggestion || '';
      dom.getElementById('cfg-compare-original').value   = currentHints;
      dom.getElementById('cfg-compare-panel').style.display = '';

      parentStub.postMessage({ type: 'moogpt:expandOverlay' }, '*');
    } catch (err) {
      showStatus(`Fehler: ${err.message}`, 'err');
    } finally {
      btn.disabled    = false;
      btn.textContent = '🔍 Prompt prüfen & verbessern';
    }
  }

  function closeComparePanel() {
    dom.getElementById('cfg-compare-panel').style.display = 'none';
    parentStub.postMessage({ type: 'moogpt:collapseOverlay' }, '*');
    // cfg-hints unverändert; Save-Button unverändert
  }

  async function useAndSave(promptText) {
    dom.getElementById('cfg-hints').value = promptText;
    await saveConfig();
  }

  return { runPromptCheck, closeComparePanel, useAndSave };
}

// ─── Tests: runPromptCheck ────────────────────────────────────────────────────

describe('runPromptCheck (neue Side-by-Side Logik)', () => {
  test('Erfolg → Panel sichtbar, beide Textareas befüllt', async () => {
    const dom    = makeDomStub({ hintsValue: 'Alter Prompt' });
    const parent = makeParentStub();
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ suggestion: 'Verbesserter Prompt' }),
    });

    const { runPromptCheck } = makeHandlers({ dom, fetchFn: mockFetch, parentStub: parent });
    await runPromptCheck();

    assert.equal(dom._els['cfg-compare-panel'].style.display, '', 'Panel muss sichtbar sein');
    assert.equal(dom._els['cfg-compare-suggestion'].value, 'Verbesserter Prompt', 'Suggestion-Textarea muss befüllt sein');
    assert.equal(dom._els['cfg-compare-original'].value, 'Alter Prompt', 'Original-Textarea muss aktuellen Prompt enthalten');
  });

  test('Erfolg → postMessage expandOverlay gesendet', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ suggestion: 'X' }),
    });

    const { runPromptCheck } = makeHandlers({ dom, fetchFn: mockFetch, parentStub: parent });
    await runPromptCheck();

    const expand = parent._sent.find(m => m.type === 'moogpt:expandOverlay');
    assert.ok(expand, 'expandOverlay muss gesendet werden');
  });

  test('Fehler (res.ok=false) → Panel bleibt zu, showStatus aufgerufen', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();
    const mockFetch = async () => ({ ok: false, status: 502 });

    const { runPromptCheck } = makeHandlers({ dom, fetchFn: mockFetch, parentStub: parent });
    await runPromptCheck();

    assert.equal(dom._els['cfg-compare-panel'].style.display, 'none', 'Panel muss zu bleiben');
    assert.ok(dom._els['cfg-status'].textContent.includes('Server-Fehler 502'), 'Fehlermeldung muss gesetzt sein');
    const expand = parent._sent.find(m => m.type === 'moogpt:expandOverlay');
    assert.ok(!expand, 'expandOverlay darf bei Fehler nicht gesendet werden');
  });

  test('Netzwerkfehler (fetch wirft) → Panel bleibt zu, showStatus aufgerufen', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();
    const mockFetch = async () => { throw new Error('Netzwerk ausgefallen'); };

    const { runPromptCheck } = makeHandlers({ dom, fetchFn: mockFetch, parentStub: parent });
    await runPromptCheck();

    assert.equal(dom._els['cfg-compare-panel'].style.display, 'none', 'Panel muss zu bleiben');
    assert.ok(dom._els['cfg-status'].textContent.includes('Netzwerk ausgefallen'));
  });

  test('Button ist während Fetch deaktiviert und zeigt Ladetext', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();
    let btnStateWhileFetching = null;

    const mockFetch = async () => {
      btnStateWhileFetching = {
        disabled:    dom._els['cfg-check-btn'].disabled,
        textContent: dom._els['cfg-check-btn'].textContent,
      };
      return { ok: true, json: async () => ({ suggestion: 'X' }) };
    };

    const { runPromptCheck } = makeHandlers({ dom, fetchFn: mockFetch, parentStub: parent });
    await runPromptCheck();

    assert.equal(btnStateWhileFetching.disabled, true, 'Button muss während Fetch deaktiviert sein');
    assert.equal(btnStateWhileFetching.textContent, '⏳ Prüft…');
    assert.equal(dom._els['cfg-check-btn'].disabled, false, 'Button muss danach wieder aktiv sein');
    assert.equal(dom._els['cfg-check-btn'].textContent, '🔍 Prompt prüfen & verbessern');
  });
});

// ─── Tests: Close-Handler ─────────────────────────────────────────────────────

describe('closeComparePanel', () => {
  test('Panel wird versteckt', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();
    // Panel erst öffnen
    dom._els['cfg-compare-panel'].style.display = '';

    const { closeComparePanel } = makeHandlers({ dom, fetchFn: async () => {}, parentStub: parent });
    closeComparePanel();

    assert.equal(dom._els['cfg-compare-panel'].style.display, 'none', 'Panel muss nach Close versteckt sein');
  });

  test('collapseOverlay postMessage gesendet', () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();

    const { closeComparePanel } = makeHandlers({ dom, fetchFn: async () => {}, parentStub: parent });
    closeComparePanel();

    const collapse = parent._sent.find(m => m.type === 'moogpt:collapseOverlay');
    assert.ok(collapse, 'collapseOverlay muss gesendet werden');
  });

  test('cfg-hints bleibt unverändert', () => {
    const dom    = makeDomStub({ hintsValue: 'Unverändert' });
    const parent = makeParentStub();

    const { closeComparePanel } = makeHandlers({ dom, fetchFn: async () => {}, parentStub: parent });
    closeComparePanel();

    assert.equal(dom._els['cfg-hints'].value, 'Unverändert', 'cfg-hints muss unverändert bleiben');
  });
});

// ─── Tests: useAndSave ────────────────────────────────────────────────────────

describe('useAndSave', () => {
  test('schreibt Prompt in cfg-hints', async () => {
    const dom    = makeDomStub({ hintsValue: 'Alt' });
    const parent = makeParentStub();

    const { useAndSave } = makeHandlers({ dom, fetchFn: async () => {}, parentStub: parent });
    await useAndSave('Neuer Prompt');

    assert.equal(dom._els['cfg-hints'].value, 'Neuer Prompt', 'cfg-hints muss neuen Prompt enthalten');
  });

  test('ruft saveConfig auf (sendet moogpt:configSaved)', async () => {
    const dom    = makeDomStub();
    const parent = makeParentStub();

    const { useAndSave } = makeHandlers({ dom, fetchFn: async () => {}, parentStub: parent });
    await useAndSave('Irgendwas');

    const saved = parent._sent.find(m => m.type === 'moogpt:configSaved');
    assert.ok(saved, 'moogpt:configSaved muss gesendet werden');
  });
});
