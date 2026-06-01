/**
 * services/widget-config-resolver.js — Issue #168
 *
 * Löst die Widget-Konfiguration vollständig über die Kaskade auf:
 *   activities.(field) != NULL
 *     → teacher_default.(field) != NULL
 *     → system_template.(field) != NULL
 *     → hardcoded
 *
 * Exportiert resolveWidgetConfig(activityId, userId, deps?).
 * Dependencies sind per optionalem dritten Parameter injizierbar (Vorbild: model-resolver.js).
 */

import { getWidgetConfig as _getWidgetConfig } from '../stores/widget-config.js';
import { getTeacherDefaultTemplate as _getTeacherDefaultTemplate, getSystemTemplate as _getSystemTemplate } from '../stores/teacher.js';

const HARDCODED = {
  title:               null,
  botIcon:             'grw',
  opener:              null,
  uploadMode:          'off',
  audioInput:          'off',
  audioOutput:         'off',
  ttsVoice:            'nova',
  audioStudentOptions: 'off',
  model:               null,
  mathMode:            'off',
};

const productionDeps = {
  getWidgetConfig:           _getWidgetConfig,
  getTeacherDefaultTemplate: _getTeacherDefaultTemplate,
  getSystemTemplate:         _getSystemTemplate,
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
  if (activity?.[dbKey] != null)       return activity[dbKey];
  if (teacherTemplate?.[dbKey] != null) return teacherTemplate[dbKey];
  if (systemTemplate?.[dbKey] != null)  return systemTemplate[dbKey];
  return hardcoded;
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
 * @returns {{ title, botIcon, opener, uploadMode, audioInput, audioOutput,
 *             ttsVoice, audioStudentOptions, model, mathMode, needsConfig }}
 */
export function resolveWidgetConfig(activityId, userId, deps = productionDeps) {
  const { getWidgetConfig, getTeacherDefaultTemplate, getSystemTemplate } = deps;

  const activity        = activityId ? getWidgetConfig(activityId) : null;
  const teacherTemplate = userId     ? getTeacherDefaultTemplate(userId) : null;
  const systemTemplate  = getSystemTemplate();

  const title               = resolve('title',               activity, teacherTemplate, systemTemplate, HARDCODED.title);
  const botIcon             = resolve('bot_icon',            activity, teacherTemplate, systemTemplate, HARDCODED.botIcon);
  const opener              = resolve('opener',              activity, teacherTemplate, systemTemplate, HARDCODED.opener);
  const uploadMode          = resolve('upload_mode',         activity, teacherTemplate, systemTemplate, HARDCODED.uploadMode);
  const audioInput          = resolve('audio_input',         activity, teacherTemplate, systemTemplate, HARDCODED.audioInput);
  const audioOutput         = resolve('audio_output',        activity, teacherTemplate, systemTemplate, HARDCODED.audioOutput);
  const ttsVoice            = resolve('tts_voice',           activity, teacherTemplate, systemTemplate, HARDCODED.ttsVoice);
  const audioStudentOptions = resolve('audio_student_options', activity, teacherTemplate, systemTemplate, HARDCODED.audioStudentOptions);
  const model               = resolve('model',               activity, teacherTemplate, systemTemplate, HARDCODED.model);
  const mathMode            = resolve('math_mode',           activity, teacherTemplate, systemTemplate, HARDCODED.mathMode);

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
    mathMode,
    needsConfig: title == null,
  };
}
