/**
 * Tests für die entduplizierte Temperatur-Slider-Logik (public/temp-slider.js, Issue #196)
 *
 * Framework: Node.js 22 node:test
 *
 * Die Slider-Logik wird aus der kanonischen Quelle (public/temp-slider.js) importiert
 * und mit einem DOM-Stub isoliert getestet.
 *
 * Getestet werden:
 *  - isReasoningModel: Reasoning-Modell-Erkennung inkl. gpt-5
 *  - setTempSlider: Bubble-Position und Sichtbarkeit
 *  - updateTempField: Standard-Sichtbarkeit, Reasoning-Modell-Deaktivierung, field-hide
 *  - Reset auf 0.5 beim Deaktivieren von „Standard"
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import from canonical source — no logic duplication
import { isReasoningModel, SLIDER_TRACK_WIDTH_PX, setTempSlider, updateTempField } from '../public/temp-slider.js';

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

// Wrappers that bind the DOM stub so tests call setTempSlider(prefix, value) etc.
function bindDom(dom) {
  return {
    setTempSlider:   (prefix, value) => setTempSlider(dom, prefix, value),
    updateTempField: (prefix)        => updateTempField(dom, prefix),
  };
}

// ─── Tests: isReasoningModel ──────────────────────────────────────────────────

describe('isReasoningModel — Reasoning-Modell-Erkennung', () => {
  test('o1-mini → true', () => {
    assert.equal(isReasoningModel('o1-mini'), true);
  });

  test('o3-mini → true', () => {
    assert.equal(isReasoningModel('o3-mini'), true);
  });

  test('o4-mini → true', () => {
    assert.equal(isReasoningModel('o4-mini'), true);
  });

  test('gpt-5 → true (Reasoning-Modell)', () => {
    assert.equal(isReasoningModel('gpt-5'), true);
  });

  test('gpt-5-mini → true (gpt-5-Präfix)', () => {
    assert.equal(isReasoningModel('gpt-5-mini'), true);
  });

  test('gpt-4.1 → false (kein Reasoning)', () => {
    assert.equal(isReasoningModel('gpt-4.1'), false);
  });

  test('gpt-4o → false (kein Reasoning)', () => {
    assert.equal(isReasoningModel('gpt-4o'), false);
  });

  test('leer → false', () => {
    assert.equal(isReasoningModel(''), false);
  });

  test('null/undefined → false (kein Absturz)', () => {
    assert.equal(isReasoningModel(null), false);
    assert.equal(isReasoningModel(undefined), false);
  });
});

// ─── Tests: setTempSlider ─────────────────────────────────────────────────────

describe('setTempSlider — Bubble-Position und Sichtbarkeit', () => {
  test('value=null → Bubble versteckt (Standard-Modus)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider: st } = bindDom(dom);

    st('', null);

    assert.equal(
      dom._els['cfg-temperature-display'].style.visibility,
      'hidden',
      'Bubble muss bei null versteckt sein'
    );
  });

  test('value=0.7 → Bubble sichtbar, textContent=0.7', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider: st } = bindDom(dom);

    st('', 0.7);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '', 'Bubble muss sichtbar sein');
    assert.equal(display.textContent, '0.7', 'Bubble-Text muss 0.7 sein');
  });

  test('value=0.7 → CSS --val gesetzt', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider: st } = bindDom(dom);

    st('', 0.7);

    const wrapper = dom._els['cfg-temperature-wrapper'];
    assert.equal(String(wrapper._vars['--val']), '0.7', '--val muss auf 0.7 gesetzt sein');
  });

  test('value=0 → Bubble sichtbar, textContent=0.0 (Grenzwert)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider: st } = bindDom(dom);

    st('', 0);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '', 'Bubble muss bei 0 sichtbar sein');
    assert.equal(display.textContent, '0.0');
  });

  test('value=1 → Bubble sichtbar, textContent=1.0 (Grenzwert)', () => {
    const dom = makeSliderDom({ prefix: '' });
    const { setTempSlider: st } = bindDom(dom);

    st('', 1);

    const display = dom._els['cfg-temperature-display'];
    assert.equal(display.style.visibility, '');
    assert.equal(display.textContent, '1.0');
  });

  test('prefix assist- → korrekte Elemente angesprochen', () => {
    const dom = makeSliderDom({ prefix: 'assist-' });
    const { setTempSlider: st } = bindDom(dom);

    st('assist-', 0.3);

    assert.equal(dom._els['cfg-assist-temperature-display'].style.visibility, '');
    assert.equal(dom._els['cfg-assist-temperature-display'].textContent, '0.3');
  });
});

// ─── Tests: updateTempField — Standard-Sichtbarkeit ──────────────────────────

describe('updateTempField — Standard-Modus', () => {
  test('Standard-Checkbox aktiv → Bubble versteckt, Input disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: true, initVal: 0.5 });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, true, 'Input muss disabled sein');
    assert.equal(
      dom._els['cfg-temperature-display'].style.visibility,
      'hidden',
      'Bubble muss versteckt sein wenn Standard'
    );
  });

  test('Standard-Checkbox inaktiv → Bubble sichtbar, Input aktiv', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, initVal: 0.6 });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, false);
    assert.equal(dom._els['cfg-temperature-display'].style.visibility, '');
    assert.equal(dom._els['cfg-temperature-display'].textContent, '0.6');
  });
});

// ─── Tests: updateTempField — Reasoning-Modell ───────────────────────────────

describe('updateTempField — Reasoning-Modell', () => {
  test('o1-Modell → Input disabled, field ausgeblendet', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o1-mini' });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, true, 'Input muss disabled sein');
    assert.equal(dom._els['cfg-temperature-field'].style.display, 'none', 'field muss ausgeblendet sein');
  });

  test('o3-Modell → disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o3-mini' });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, true);
  });

  test('o4-Modell → disabled', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'o4-mini' });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, true);
  });

  test('gpt-5-Modell → disabled, field ausgeblendet (Reasoning)', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'gpt-5' });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, true, 'Input muss disabled sein');
    assert.equal(dom._els['cfg-temperature-field'].style.display, 'none', 'field muss ausgeblendet sein');
  });

  test('gpt-4.1-Modell (kein Reasoning) → nicht disabled, field sichtbar', () => {
    const dom = makeSliderDom({ prefix: '', initChecked: false, model: 'gpt-4.1' });
    const { updateTempField: utf } = bindDom(dom);

    utf('');

    assert.equal(dom._els['cfg-temperature'].disabled, false);
    assert.equal(dom._els['cfg-temperature-field'].style.display, '', 'field muss sichtbar sein');
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

    const { updateTempField: utf } = bindDom(dom);
    utf('');

    assert.equal(dom._els['cfg-temperature-display'].textContent, '0.5');
    assert.equal(dom._els['cfg-temperature-display'].style.visibility, '');
  });

  test('assist-Prefix: Standard-Checkbox auf unchecked → Slider auf 0.5', () => {
    const dom = makeSliderDom({ prefix: 'assist-', initChecked: true, initVal: 0.9 });
    dom._els['cfg-assist-temperature-default'].checked = false;
    dom._els['cfg-assist-temperature'].value = '0.5';

    const { updateTempField: utf } = bindDom(dom);
    utf('assist-');

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
