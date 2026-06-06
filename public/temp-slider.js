/**
 * public/temp-slider.js — Temperatur-Slider-Helfer für config.js
 *
 * Kanonische Quelle für Reasoning-Modell-Erkennung im Frontend.
 * Serverseitige Quelle: validators.js → isReasoningModel (Node-Modul, nicht importierbar im Browser).
 * Muster muss mit validators.js synchron gehalten werden (VS2-Ticket: #197).
 *
 * Exportiert als ES-Modul — in config.js per import eingebunden;
 * in Tests direkt importierbar (keine DOM-Abhängigkeit in isReasoningModel).
 */

// Effektive Spurbreite des Sliders: Wrapper (140px) minus halber Thumb (16px)
export const SLIDER_TRACK_WIDTH_PX = 124;

/**
 * Prüft ob ein Modellname ein Reasoning-Modell bezeichnet.
 * Synchron mit validators.js → isReasoningModel (serverseitige Quelle, VS2/#197).
 * @param {string} modelName
 * @returns {boolean}
 */
export function isReasoningModel(modelName) {
  return /^(o1|o3|o4-|gpt-5)/.test(modelName || '');
}

/**
 * Gibt den Temperaturwert zurück oder null wenn Standard/disabled.
 * @param {Document} doc - Seiten-Dokument (für Testbarkeit injizierbar)
 * @param {string} prefix - 'assist-' oder '' (leer für Chat-Slider)
 * @returns {number|null}
 */
export function getTempValue(doc, prefix) {
  const defaultCb = doc.getElementById(`cfg-${prefix}temperature-default`);
  if (!defaultCb || defaultCb.checked) return null;
  const el = doc.getElementById(`cfg-${prefix}temperature`);
  if (!el || el.disabled) return null;
  return Number(el.value);
}

/**
 * Aktualisiert Bubble-Position und Sichtbarkeit eines Temperatur-Sliders.
 * @param {Document} doc - Seiten-Dokument
 * @param {string} prefix - 'assist-' oder ''
 * @param {number|null} value - Schiebereglerwert (0–1) oder null = Standard (versteckt)
 */
export function setTempSlider(doc, prefix, value) {
  const display = doc.getElementById(`cfg-${prefix}temperature-display`);
  const wrapper = doc.getElementById(`cfg-${prefix}temperature-wrapper`);
  if (!display || !wrapper) return;

  const isDefault = value === null;
  display.style.visibility = isDefault ? 'hidden' : '';
  if (!isDefault) {
    display.textContent = Number(value).toFixed(1);
    wrapper.style.setProperty('--val', value);
  }
}

/**
 * Rendert das Slider-Markup in den Platzhalter-Container.
 * Einmaliger Aufruf pro Prefix beim Start.
 * @param {Document} doc - Seiten-Dokument
 * @param {string} prefix - 'assist-' oder ''
 * @param {string} hintText - Initialer Hint-Text
 */
export function renderTempSlider(doc, prefix, hintText) {
  const field = doc.getElementById(`cfg-${prefix}temperature-field`);
  if (!field) return;
  field.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">
      <label class="cfg-label" style="margin-bottom:0">Temperatur</label>
      <span style="font-size:10px;color:#bbb" id="cfg-${prefix}temperature-hint">${hintText}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;color:#aaa;flex-shrink:0">Pr&auml;zise</span>
      <div id="cfg-${prefix}temperature-wrapper" style="position:relative;width:140px;flex-shrink:0;--val:0.5">
        <span id="cfg-${prefix}temperature-display" style="position:absolute;top:50%;font-size:11px;background:#003366;color:white;padding:1px 6px;border-radius:3px;transform:translate(-50%,-50%);pointer-events:none;left:calc(var(--val) * ${SLIDER_TRACK_WIDTH_PX}px + 8px);white-space:nowrap;visibility:hidden">0.5</span>
        <input class="cfg-input" type="range" id="cfg-${prefix}temperature" min="0" max="1" step="0.1" value="0.5" style="width:100%;margin:0;display:block">
      </div>
      <span style="font-size:10px;color:#aaa;flex-shrink:0">Kreativ</span>
      <label style="font-size:11px;color:#888;display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;flex-shrink:0">
        <input type="checkbox" id="cfg-${prefix}temperature-default">Standard
      </label>
    </div>`;
}

/**
 * Setzt Slider-Wert und Standard-Checkbox beim Laden von Serverdaten.
 * @param {Document} doc - Seiten-Dokument
 * @param {string} prefix - 'assist-' oder ''
 * @param {number|null} value - Geladener Temperaturwert oder null = Standard
 */
export function loadTempState(doc, prefix, value) {
  const el = doc.getElementById(`cfg-${prefix}temperature`);
  const cb = doc.getElementById(`cfg-${prefix}temperature-default`);
  if (!el || !cb) return;
  if (value != null) {
    el.value   = value;
    cb.checked = false;
  } else {
    el.value   = 1;
    cb.checked = true;
  }
}

/**
 * Synchronisiert Slider-Status (disabled, hint, bubble, visibility) mit Modellwahl und Checkbox.
 * Einheitliche Funktion für Chat- (prefix='') und Assist-Slider (prefix='assist-').
 * @param {Document} doc - Seiten-Dokument
 * @param {string} prefix - 'assist-' oder ''
 */
export function updateTempField(doc, prefix) {
  const modelSelId = prefix === 'assist-' ? 'cfg-assist-model' : 'cfg-model';
  const modelSel   = doc.getElementById(modelSelId);
  const tempInput  = doc.getElementById(`cfg-${prefix}temperature`);
  const tempHint   = doc.getElementById(`cfg-${prefix}temperature-hint`);
  const defaultCb  = doc.getElementById(`cfg-${prefix}temperature-default`);
  const field      = doc.getElementById(`cfg-${prefix}temperature-field`);
  if (!modelSel || !tempInput || !defaultCb) return;

  const selectedModel = modelSel.value
    || (prefix === 'assist-' ? doc.getElementById('cfg-model')?.value : '')
    || '';
  const reasoning  = isReasoningModel(selectedModel);
  const useDefault = defaultCb.checked;

  if (field) field.style.display = reasoning ? 'none' : '';

  tempInput.disabled = reasoning || useDefault;
  defaultCb.disabled = false;

  if (tempHint) {
    tempHint.textContent = prefix === 'assist-'
      ? 'Antwort-Stil: 0 = präzise/gleichförmig, 1 = kreativ/variabel · leer = OpenAI-Standard'
      : '0–1, Standard = OpenAI-Vorgabe';
  }

  setTempSlider(doc, prefix, (reasoning || useDefault) ? null : Number(tempInput.value));
}
