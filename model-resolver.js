/**
 * model-resolver.js — Issue #107 (ADR 0004)
 *
 * Löst das effektive Modell für einen AI-Call auf.
 * Priorität: activities.model → prompts.model (globaler Config-Cache) → MODEL_NAME aus Env.
 *
 * Importiert env-config.js NICHT direkt, um Tests ohne MODEL_NAME-Env zu ermöglichen
 * (env-config.js ruft process.exit(1) wenn MODEL_NAME fehlt, was Tests brechen würde).
 * Production: _getEnvAvailableModels()/_getEnvModelName() lesen process.env direkt.
 * Tests: deps-Objekt übergeben.
 */

import { getActivity as _getActivity } from './stores/activity.js';
import { getCachedConfig as _getCachedConfig } from './stores/prompt.js';

function _getEnvModelName() {
  return process.env.MODEL_NAME ?? '';
}

function _getEnvAvailableModels() {
  return process.env.AVAILABLE_MODELS
    ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : [process.env.MODEL_NAME ?? ''];
}

const productionDeps = {
  getActivity:    _getActivity,
  getCachedConfig: _getCachedConfig,
  get AVAILABLE_MODELS() { return _getEnvAvailableModels(); },
  get MODEL_NAME()       { return _getEnvModelName(); },
};

/**
 * Gibt das effektive Modell zurück: activities.model → globaler DB-Wert → MODEL_NAME.
 *
 * @param {string|null} activityId
 * @param {object} [deps] - Optionale Dependency-Injection für Tests
 * @param {Function} deps.getActivity
 * @param {Function} deps.getCachedConfig
 * @param {string[]} deps.AVAILABLE_MODELS
 * @param {string} deps.MODEL_NAME
 */
export function getEffectiveModel(activityId, deps = productionDeps) {
  const { getActivity, getCachedConfig, AVAILABLE_MODELS, MODEL_NAME } = deps;
  if (activityId) {
    const act = getActivity(activityId);
    if (act?.model && AVAILABLE_MODELS.includes(act.model)) {
      return act.model;
    }
  }
  return getCachedConfig().model || MODEL_NAME;
}
