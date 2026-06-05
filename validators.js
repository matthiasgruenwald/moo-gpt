import { getAvailableBotIcons } from './env-config.js';

export const VALID_UPLOAD_MODES          = ['off', 'images', 'files'];
export const VALID_BOT_ICONS             = ['grw', 'grw2', 'weiblich', 'grwdev'];
export const VALID_AUDIO_INPUTS          = ['off', 'on'];
export const VALID_AUDIO_OUTPUTS         = ['off', 'on'];
export const VALID_TTS_VOICES            = ['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy'];
export const VALID_AUDIO_STUDENT_OPTIONS = ['off', 'on'];
export const VALID_MATH_MODES            = ['on', 'off'];

export function validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode, audioOutput, ttsVoice, audioStudentOptions, allowedBotIcons) {
  const validBotIcons = allowedBotIcons ?? getAvailableBotIcons();
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
  return null;
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
