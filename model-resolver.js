/**
 * model-resolver.js — Issue #107 (ADR 0004)
 *
 * Löst das effektive Modell für einen AI-Call auf.
 * Priorität: activities.model → prompts.model (globaler Config-Cache) → MODEL_NAME aus Env.
 *
 * Production: _getEnvAvailableModels() liest über getAvailableModels() aus admin_config (DB)
 * mit Fallback auf Env-Variable. Da MODEL_NAME kein process.exit mehr auslöst,
 * kann env-config.js sicher importiert werden.
 * Tests: deps-Objekt übergeben.
 */

import { getActivity as _getActivity } from './stores/activity.js';
import { getCachedConfig as _getCachedConfig } from './stores/prompt.js';
import { getAvailableModels as _getAvailableModels, MODEL_NAME as _MODEL_NAME } from './env-config.js';

const productionDeps = {
  getActivity:     _getActivity,
  getCachedConfig: _getCachedConfig,
  get AVAILABLE_MODELS() { return _getAvailableModels(); },
  get MODEL_NAME()       { return _MODEL_NAME ?? ''; },
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
