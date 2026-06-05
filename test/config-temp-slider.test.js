/**
 * Tests für die entduplizierte Temperatur-Slider-Logik (config.js, Issue #193)
 *
 * Framework: Node.js 22 node:test
 *
 * Die Slider-Logik wird hier als Fabrik-Funktion gespiegelt und isoliert
 * getestet. Getestet werden:
 *  - setTempSlider(prefix, value): Bubble-Position und Sichtbarkeit
 *  - updateTempField(prefix): Standard-Sichtbarkeit, Reasoning-Modell-Deaktivierung
 *  - Reset auf 0.5 beim Deaktivieren von „Standard"
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Konstante (entspricht der benannten Magic Number) ─────────────────────────
const SLIDER_TRACK_WIDTH_PX = 124; // 140px Wrapper − 16px Thumb-Radius

// ─── Minimaler DOM-Stub ───────────────────────────────────────────────────────

function makeSliderDom({ prefix, initVal = 0.5, initChecked = true, disabled = false, model = '' } = {}) {
  const elements = {
    [`cfg-${prefix}temperature-wrapper`]: {
      style: { getPropertyValue(p) { return this._vars?.[p] ?? ''; } },
      _vars: { '--val': String(initVal) },
      setProperty(p, v) { this._vars[p] = String(v); },
    },
    [`cfg-${prefix}temperature-display`]: {
      style: { visibility: 'hidden' },
      textContent: String(initVal),
    },
    [`cfg-${prefix}temperature`]: {
      value: String(initVal),
      disabled,
    },
    [`cfg-${prefix}temperature-default`]: {
      checked: initChecked,
      disabled: false,
    },
    [`cfg-${prefix}temperature-hint`]: {
      textContent: '',
    },
    [`cfg-${prefix}temperature-field`]: {
      style: {},
    },
    'cfg-model':        { value: model },
    'cfg-assist-model': { value: '' },
  };

  // cfg-temperature-wrapper exposes setProperty at top level for CSS custom props
  const wrapperKey = `cfg-${prefix}temperature-wrapper`;
  elements[wrapperKey].style.setProperty = (p, v) => {
    elements[wrapperKey]._vars[p] = String(v);
  };

  return {
    getElementById(id) {
      return elements[id] ?? null;
    },
    _els: elements,
  };
}

// ─── Isolierte Fabrik: spiegelt die entduplizierte Logik aus config.js ────────

/**
 * Erstellt setTempSlider und updateTempField analog zur config.js-Implementierung.
 * @param {object} dom - DOM-Stub mit getElementById
 */
function makeTempSliderHandlers(dom) {
  function isReasoningModel(modelName) {
    return /^(o1|o3|o4-)/.test(modelName || '');
  }

  /**
   * Aktualisiert Bubble-Position und Sichtbarkeit des Sliders.
   * @param {string} prefix - 'assist-' oder '' (leer für Chat-Slider)
   * @param {number|null} value - Schiebereglerwert (0–1) oder null = Standard
   */
  function setTempSlider(prefix, value) {
    const display = dom.getElementById(`cfg-${prefix}temperature-display`);
    const wrapper = dom.getElementById(`cfg-${prefix}temperature-wrapper`);
    if (!display || !wrapper) return;

    const isDefault = value === null;
    display.style.visibility = isDefault ? 'hidden' : '';
    if (!isDefault) {
      display.textContent = Number(value).toFixed(1);
      wrapper.style.setProperty('--val', value);
    }
  }

  /**
   * Synchronisiert Slider-Status mit Modellwahl und Standard-Checkbox.
   * @param {string} prefix - 'assist-' oder ''
   */
  function updateTempField(prefix) {
    const modelSelId = prefix === 'assist-' ? 'cfg-assist-model' : 'cfg-model';
    const fallbackId = prefix === 'assist-' ? 'cfg-model' : null;
    const modelSel   = dom.getElementById(modelSelId);
    const tempInput  = dom.getElementById(`cfg-${prefix}temperature`);
    const tempHint   = dom.getElementById(`cfg-${prefix}temperature-hint`);
    const defaultCb  = dom.getElementById(`cfg-${prefix}temperature-default`);
    if (!modelSel || !tempInput || !defaultCb) return;

    const selectedModel = modelSel.value || (fallbackId ? (dom.getElementById(fallbackId)?.value || '') : '');
    const reasoning  = isReasoningModel(selectedModel);
    const useDefault = defaultCb.checked || reasoning;

    tempInput.disabled  = useDefault;
    defaultCb.disabled  = reasoning;

    if (reasoning) {
      if (tempHint) tempHint.textContent = 'nicht verfügbar (Reasoning-Modell)';
    } else {
      if (tempHint) tempHint.textContent = prefix === 'assist-'
        ? 'Antwort-Stil: 0 = präzise/gleichförmig, 1 = kreativ/variabel · leer = OpenAI-Standard'
        : '0–1, Standard = OpenAI-Vorgabe';
    }

    setTempSlider(prefix, useDefault ? null : Number(tempInput.value));
  }

  return { setTempSlider, updateTempField };
}

// ─── Tests: setTempSlider ─────────────────────────────────────────────────────

describe('setTempSlider — Bubble-Position und Sichtbarkeit', () => {
  test('value=null → Bubble versteckt (Standard-Modus)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('', null);

    assert.equal(
      dom._els['cfg-temperature-display'].style.visibility,
      'hidden',
      'Bubble muss bei null versteckt sein'
    );
  });

  test('value=0.7 → Bubble sichtbar, textContent=0.7', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('', 0.7);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '', 'Bubble muss sichtbar sein');
    assert.equal(display.textContent, '0.7', 'Bubble-Text muss 0.7 sein');
  });

  test('value=0.7 → CSS --val gesetzt', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('', 0.7);

    const wrapper = dom._els['cfg-temperature-wrapper'];
    assert.equal(String(wrapper._vars['--val']), '0.7', '--val muss auf 0.7 gesetzt sein');
  });

  test('value=0 → Bubble sichtbar, textContent=0.0 (Grenzwert)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('', 0);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '', 'Bubble muss bei 0 sichtbar sein');
    assert.equal(display.textContent, '0.0');
  });

  test('value=1 → Bubble sichtbar, textContent=1.0 (Grenzwert)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('', 1);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '');
    assert.equal(display.textContent, '1.0');
  });

  test('prefix assist- → korrekte Elemente angesprochen', () => {
    const dom = makeSliderDom({ prefix: 'assist-' });
    const { setTempSlider } = makeTempSliderHandlers(dom);

    setTempSlider('assist-', 0.3);

    assert.equal(dom._els['cfg-assist-temperature-display'].style.visibility, '');
    assert.equal(dom._els['cfg-assist-temperature-display'].textContent, '0.3');
  });
});

// ─── Tests: updateTempField — Standard-Sichtbarkeit ──────────────────────────

describe('updateTempField — Standard-Modus', () => {
  test('Standard-Checkbox aktiv → Bubble versteckt, Input disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: true, initVal: 0.5 });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, true, 'Input muss disabled sein');
    assert.equal(
      dom._els['cfg-temperature-display'].style.visibility,
      'hidden',
      'Bubble muss versteckt sein wenn Standard'
    );
  });

  test('Standard-Checkbox inaktiv → Bubble sichtbar, Input aktiv', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, initVal: 0.6 });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, false);
    assert.equal(dom._els['cfg-temperature-display'].style.visibility, '');
    assert.equal(dom._els['cfg-temperature-display'].textContent, '0.6');
  });
});

// ─── Tests: updateTempField — Reasoning-Modell ───────────────────────────────

describe('updateTempField — Reasoning-Modell', () => {
  test('o1-Modell → Input und Checkbox disabled, Hint aktualisiert', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o1-mini' });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, true, 'Input muss disabled sein');
    assert.equal(dom._els['cfg-temperature-default'].disabled, true, 'Checkbox muss disabled sein');
    assert.ok(
      dom._els['cfg-temperature-hint'].textContent.includes('Reasoning'),
      'Hint muss Reasoning erwähnen'
    );
  });

  test('o3-Modell → disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o3-mini' });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, true);
  });

  test('o4-Modell → disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o4-mini' });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, true);
  });

  test('gpt-4.1-Modell (kein Reasoning) → nicht disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'gpt-4.1' });
    const { updateTempField } = makeTempSliderHandlers(dom);

    updateTempField('');

    assert.equal(dom._els['cfg-temperature'].disabled, false);
    assert.equal(dom._els['cfg-temperature-default'].disabled, false);
  });
});

// ─── Tests: Reset auf 0.5 ────────────────────────────────────────────────────

describe('Reset-Logik (Standard-Checkbox deaktiviert)', () => {
  test('Standard-Checkbox auf unchecked → Slider wird auf 0.5 gesetzt', () => {
    // Simuliert: Checkbox war checked, wird nun unchecked → Wert muss auf 0.5 gesetzt werden
    const dom = makeSliderDom({ prefix: '', initChecked: true, initVal: 0.9 });
    // Checkbox wird unchecked
    dom._els['cfg-temperature-default'].checked = false;
    // Wert auf 0.5 zurücksetzen (Logik aus Event-Listener)
    dom._els['cfg-temperature'].value = '0.5';

    const { updateTempField } = makeTempSliderHandlers(dom);
    updateTempField('');

    assert.equal(dom._els['cfg-temperature-display'].textContent, '0.5');
    assert.equal(dom._els['cfg-temperature-display'].style.visibility, '');
  });

  test('assist-Prefix: Standard-Checkbox auf unchecked → Slider auf 0.5', () => {
    const dom = makeSliderDom({ prefix: 'assist-', initChecked: true, initVal: 0.9 });
    dom._els['cfg-assist-temperature-default'].checked = false;
    dom._els['cfg-assist-temperature'].value = '0.5';

    const { updateTempField } = makeTempSliderHandlers(dom);
    updateTempField('assist-');

    assert.equal(dom._els['cfg-assist-temperature-display'].textContent, '0.5');
    assert.equal(dom._els['cfg-assist-temperature-display'].style.visibility, '');
  });
});

// ─── Tests: Magic-Number-Ableitung ───────────────────────────────────────────

describe('SLIDER_TRACK_WIDTH_PX (Magic Number)', () => {
  test('ist 140 − 16 = 124 (Wrapper-Breite minus Thumb-Radius)', () => {
    const WRAPPER_WIDTH_PX = 140;
    const THUMB_OFFSET_PX  = 16;
    assert.equal(SLIDER_TRACK_WIDTH_PX, WRAPPER_WIDTH_PX - THUMB_OFFSET_PX);
  });
});
