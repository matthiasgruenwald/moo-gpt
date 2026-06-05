/**
 * services/widget-config-resolver.js — Issue #168, #192
 *
 * Löst die Widget-Konfiguration vollständig über die Kaskade auf:
 *   activities.(field) != NULL
 *     → teacher_default.(field) != NULL
 *     → system_template.(field) != NULL
 *     → hardcoded / globaler Admin-Default / ENV
 *
 * Deckt alle Felder ab inkl. model, assist_model, chat_temperature, assist_temperature.
 * Exportiert resolveWidgetConfig(activityId, userId, deps?).
 * Dependencies sind per optionalem dritten Parameter injizierbar (Vorbild: model-resolver.js).
 */

import { getWidgetConfig as _getWidgetConfig } from '../stores/widget-config.js';
import { getTeacherDefaultTemplate as _getTeacherDefaultTemplate, getSystemTemplate as _getSystemTemplate } from '../stores/teacher.js';
import { getCachedConfig as _getCachedConfig } from '../stores/prompt.js';
import { getAvailableModels as _getAvailableModels } from '../env-config.js';

const HARDCODED = {
  title:               null,
  botIcon:             'grw',
  opener:              null,
  uploadMode:          'off',
  audioInput:          'off',
  audioOutput:         'off',
  ttsVoice:            'nova',
  audioStudentOptions: 'off',
  mathMode:            'off',
  // model and assist_model: no static default — falls to getCachedConfig().model or MODEL_NAME
  chatTemperature:     null,
  assistTemperature:   null,
};

const productionDeps = {
  getWidgetConfig:           _getWidgetConfig,
  getTeacherDefaultTemplate: _getTeacherDefaultTemplate,
  getSystemTemplate:         _getSystemTemplate,
  getCachedConfig:           _getCachedConfig,
  get AVAILABLE_MODELS() { return _getAvailableModels(); },
  get MODEL_NAME()       { return process.env.MODEL_NAME ?? ''; },
};

/**
 * Löst einen einzelnen Feld-Wert über die Kaskade auf.
 * @param {string} dbKey  - DB-Spaltenname (snake_case)
 * @param {object|null} activity
 * @param {object|null} teacherTemplate
 * @param {object|null} systemTemplate
 * @param {*} hardcoded
 */
function resolve(dbKey, activity, teacherTemplate, systemTemplate, hardcoded) {
  if (activity?.[dbKey] != null)        return activity[dbKey];
  if (teacherTemplate?.[dbKey] != null) return teacherTemplate[dbKey];
  if (systemTemplate?.[dbKey] != null)  return systemTemplate[dbKey];
  return hardcoded;
}

/**
 * Löst ein Modellfeld über die Kaskade auf und validiert jeden Wert gegen AVAILABLE_MODELS.
 * Fällt durch ungültige Werte zur nächsten Kaskaden-Stufe durch.
 * Letzter Fallback: getCachedConfig().model → MODEL_NAME.
 *
 * @param {string} dbKey
 * @param {object|null} activity
 * @param {object|null} teacherTemplate
 * @param {object|null} systemTemplate
 * @param {string[]} availableModels
 * @param {string} globalDefault  - getCachedConfig().model || MODEL_NAME
 */
function resolveModel(dbKey, activity, teacherTemplate, systemTemplate, availableModels, globalDefault) {
  for (const row of [activity, teacherTemplate, systemTemplate]) {
    const val = row?.[dbKey];
    if (val != null && availableModels.includes(val)) return val;
  }
  return globalDefault || null;
}

/**
 * Löst die vollständige Widget-Konfiguration für eine Aktivität auf.
 *
 * @param {string|null} activityId
 * @param {string|null} userId  - Lehrer-User-ID; wenn null, wird kein Teacher-Template abgefragt
 * @param {object} [deps]       - optionale Dependency-Injection für Tests
 * @param {Function} deps.getWidgetConfig
 * @param {Function} deps.getTeacherDefaultTemplate
 * @param {Function} deps.getSystemTemplate
 * @param {Function} deps.getCachedConfig
 * @param {string[]} deps.AVAILABLE_MODELS
 * @param {string}   deps.MODEL_NAME
 * @returns {{ title, botIcon, opener, uploadMode, audioInput, audioOutput,
 *             ttsVoice, audioStudentOptions, model, assistModel,
 *             chatTemperature, assistTemperature, mathMode, needsConfig }}
 */
export function resolveWidgetConfig(activityId, userId, deps = productionDeps) {
  const { getWidgetConfig, getTeacherDefaultTemplate, getSystemTemplate, getCachedConfig, AVAILABLE_MODELS, MODEL_NAME } = deps;

  const activity        = activityId ? getWidgetConfig(activityId) : null;
  const teacherTemplate = userId     ? getTeacherDefaultTemplate(userId) : null;
  const systemTemplate  = getSystemTemplate();

  const globalModelDefault = getCachedConfig().model || MODEL_NAME;

  const title               = resolve('title',               activity, teacherTemplate, systemTemplate, HARDCODED.title);
  const botIcon             = resolve('bot_icon',            activity, teacherTemplate, systemTemplate, HARDCODED.botIcon);
  const opener              = resolve('opener',              activity, teacherTemplate, systemTemplate, HARDCODED.opener);
  const uploadMode          = resolve('upload_mode',         activity, teacherTemplate, systemTemplate, HARDCODED.uploadMode);
  const audioInput          = resolve('audio_input',         activity, teacherTemplate, systemTemplate, HARDCODED.audioInput);
  const audioOutput         = resolve('audio_output',        activity, teacherTemplate, systemTemplate, HARDCODED.audioOutput);
  const ttsVoice            = resolve('tts_voice',           activity, teacherTemplate, systemTemplate, HARDCODED.ttsVoice);
  const audioStudentOptions = resolve('audio_student_options', activity, teacherTemplate, systemTemplate, HARDCODED.audioStudentOptions);
  const mathMode            = resolve('math_mode',           activity, teacherTemplate, systemTemplate, HARDCODED.mathMode);
  const chatTemperature     = resolve('chat_temperature',    activity, teacherTemplate, systemTemplate, HARDCODED.chatTemperature);
  const assistTemperature   = resolve('assist_temperature',  activity, teacherTemplate, systemTemplate, HARDCODED.assistTemperature);

  const model               = resolveModel('model',        activity, teacherTemplate, systemTemplate, AVAILABLE_MODELS, globalModelDefault);
  // assist_model fällt auf chat model-Kaskade zurück: eigener assist_model pro Stufe, dann model-Kaskade
  const assistModel         = resolveModel('assist_model', activity, teacherTemplate, systemTemplate, AVAILABLE_MODELS, null)
                           ?? model;

  return {
    title,
    botIcon,
    opener,
    uploadMode,
    audioInput,
    audioOutput,
    ttsVoice,
    audioStudentOptions,
    model,
    assistModel,
    chatTemperature,
    assistTemperature,
    mathMode,
    needsConfig: title === null,
  };
}
