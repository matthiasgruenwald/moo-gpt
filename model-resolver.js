/**
 * model-resolver.js — Issue #74
 *
 * Löst das effektive Modell für einen AI-Call auf.
 * Priorität: persönliche Lehrer-Präferenz > globaler Config-Cache-Wert > MODEL_NAME aus Env.
 *
 * Importiert env-config.js NICHT direkt, um Tests ohne MODEL_NAME-Env zu ermöglichen
 * (env-config.js ruft process.exit(1) wenn MODEL_NAME fehlt, was Tests brechen würde).
 * Production: _getEnvAvailableModels()/_getEnvModelName() lesen process.env direkt.
 * Tests: deps-Objekt übergeben.
 */

import { getTeacherPreference as _getTeacherPreference } from './stores/teacher.js';
import { getCachedConfig as _getCachedConfig } from './config-cache.js';

function _getEnvModelName() {
  return process.env.MODEL_NAME ?? '';
}

function _getEnvAvailableModels() {
  return process.env.AVAILABLE_MODELS
    ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : [process.env.MODEL_NAME ?? ''];
}

const productionDeps = {
  getTeacherPreference: _getTeacherPreference,
  getCachedConfig: _getCachedConfig,
  get AVAILABLE_MODELS() { return _getEnvAvailableModels(); },
  get MODEL_NAME()       { return _getEnvModelName(); },
};

/**
 * Gibt das effektive Modell zurück: persönliche Präferenz > globaler DB-Wert > MODEL_NAME.
 *
 * @param {boolean} isTeacher
 * @param {string|null} userId
 * @param {object} [deps] - Optionale Dependency-Injection für Tests
 * @param {Function} deps.getTeacherPreference
 * @param {Function} deps.getCachedConfig
 * @param {string[]} deps.AVAILABLE_MODELS
 * @param {string} deps.MODEL_NAME
 */
export function getEffectiveModel(isTeacher, userId, deps = productionDeps) {
  const { getTeacherPreference, getCachedConfig, AVAILABLE_MODELS, MODEL_NAME } = deps;
  if (isTeacher && userId) {
    const pref = getTeacherPreference(userId);
    if (pref?.preferred_model && AVAILABLE_MODELS.includes(pref.preferred_model)) {
      return pref.preferred_model;
    }
  }
  return getCachedConfig().model || MODEL_NAME;
}
