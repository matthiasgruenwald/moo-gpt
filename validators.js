import { getAvailableBotIcons, getAvailableModels } from './env-config.js';

export const VALID_UPLOAD_MODES          = ['off', 'images', 'files'];
export const VALID_BOT_ICONS             = ['grw', 'grw2', 'weiblich', 'grwdev'];
export const VALID_AUDIO_INPUTS          = ['off', 'on'];
export const VALID_AUDIO_OUTPUTS         = ['off', 'on'];
export const VALID_TTS_VOICES            = ['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy'];
export const VALID_AUDIO_STUDENT_OPTIONS = ['off', 'on'];
export const VALID_MATH_MODES            = ['on', 'off'];

/**
 * Kanonische Präfix-Liste für Reasoning-Modelle.
 * Frontend-Kopie: public/temp-slider.js → isReasoningModel (kann das Node-Modul nicht importieren).
 * Beide Listen müssen synchron gehalten werden (VS2 / Issue #198).
 */
export const REASONING_MODEL_PREFIXES = ['o1', 'o3', 'o4-', 'gpt-5'];

/**
 * Prüft, ob ein Modellname ein Reasoning-Modell bezeichnet.
 * Nutzt REASONING_MODEL_PREFIXES als kanonische Quelle.
 * @param {string|null|undefined} modelName
 * @returns {boolean}
 */
export function isReasoningModel(modelName) {
  if (!modelName) return false;
  return REASONING_MODEL_PREFIXES.some(prefix => modelName.startsWith(prefix));
}

/**
 * Validiert ein Widget-Konfig-Objekt gegen den einheitlichen Contract (ADR 0008).
 *
 * Nimmt ein Konfig-Objekt (cfg) statt Positionsargumenten, damit kein Feld beim
 * Aufruf vergessen werden kann. Prüft nur Felder, die im cfg-Objekt vorhanden sind
 * (undefined wird als "nicht gesetzt" behandelt).
 *
 * @param {object} cfg - Konfig-Felder (alle optional)
 * @param {object} [options]
 * @param {string[]} [options.availableModels] - Erlaubte Modell-IDs
 * @param {string[]} [options.allowedBotIcons] - Erlaubte Bot-Icons
 * @returns {string|null} Fehlermeldung oder null wenn valide
 */
export function validateWidgetConfig(cfg, { availableModels, allowedBotIcons } = {}) {
  const validBotIcons    = allowedBotIcons  ?? getAvailableBotIcons();
  const validModels      = availableModels  ?? getAvailableModels();
  const {
    uploadMode, botIcon, audioInput, audioOutput,
    ttsVoice, audioStudentOptions, mathMode, model,
  } = cfg;

  if (uploadMode          !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return 'Ungültiger uploadMode';
  if (botIcon             !== undefined && botIcon !== '' && !validBotIcons.includes(botIcon))
    return 'Ungültiges botIcon';
  if (audioInput          !== undefined && audioInput !== '' && !VALID_AUDIO_INPUTS.includes(audioInput))
    return 'Ungültiger audioInput';
  if (audioOutput         !== undefined && audioOutput !== '' && !VALID_AUDIO_OUTPUTS.includes(audioOutput))
    return 'Ungültiger audioOutput';
  if (ttsVoice            !== undefined && ttsVoice !== '' && !VALID_TTS_VOICES.includes(ttsVoice))
    return 'Ungültige ttsVoice';
  if (audioStudentOptions !== undefined && audioStudentOptions !== '' && !VALID_AUDIO_STUDENT_OPTIONS.includes(audioStudentOptions))
    return 'Ungültige audioStudentOptions';
  if (mathMode            !== undefined && mathMode !== '' && !VALID_MATH_MODES.includes(mathMode))
    return 'Ungültiger mathMode';
  if (model               !== undefined && model !== null && model !== '' && !validModels.includes(model))
    return 'Ungültiges Modell';
  return null;
}

/**
 * Normalisiert und bereinigt ein Widget-Konfig-Objekt für das Persistieren.
 * Gibt ein neues Objekt zurück (keine Mutation).
 *
 * - model / assistModel: ungültig oder leer → null
 * - chatTemperature / assistTemperature: normalizeTemperature anwenden
 * - alle anderen Felder: unverändert durchgereicht
 *
 * Setzt voraus, dass validateWidgetConfig bereits aufgerufen wurde.
 *
 * @param {object} cfg - Rohe Konfig-Felder aus dem Request-Body
 * @param {object} [options]
 * @param {string[]} [options.availableModels] - Erlaubte Modell-IDs
 * @returns {object} Bereinigtes Konfig-Objekt
 */
export function sanitizeWidgetConfig(cfg, { availableModels } = {}) {
  const validModels = availableModels ?? getAvailableModels();
  const { model, assistModel, chatTemperature, assistTemperature, ...rest } = cfg;

  const sanitizedModel      = (model       && model !== ''       && validModels.includes(model))
    ? model : null;
  const sanitizedAssistModel = (assistModel && assistModel !== '' && validModels.includes(assistModel))
    ? assistModel : null;

  return {
    ...rest,
    model:             sanitizedModel,
    assistModel:       sanitizedAssistModel,
    chatTemperature:   normalizeTemperature(chatTemperature),
    assistTemperature: normalizeTemperature(assistTemperature),
  };
}

/**
 * Validiert assist_model gegen die Liste erlaubter Modelle.
 * null/'' bedeutet "kein explizites Modell gesetzt" — ist erlaubt.
 * @param {string|null|undefined} assistModel
 * @param {string[]} availableModels
 * @returns {string|null} Fehlermeldung oder null wenn valide
 */
export function validateAssistModel(assistModel, availableModels) {
  if (assistModel === undefined || assistModel === null || assistModel === '')
    return null;
  if (!availableModels.includes(assistModel))
    return 'Ungültiges assist_model';
  return null;
}

export function normalizeTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

/**
 * Validiert chat_temperature: muss null oder ein Float 0–1 sein.
 * @param {*} value
 * @returns {string|null} Fehlermeldung oder null
 */
export function validateChatTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 1) return 'Ungültige chat_temperature (0–1)';
  return null;
}

/**
 * Validiert assist_temperature: muss null oder ein Float 0–1 sein.
 * Konsistent mit validateChatTemperature — kein stilles Clampen.
 * @param {*} value
 * @returns {string|null} Fehlermeldung oder null
 */
export function validateAssistTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 1) return 'Ungültige assist_temperature (0–1)';
  return null;
}
