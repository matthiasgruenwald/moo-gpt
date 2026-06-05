/**
 * model-resolver.js — Issue #107 (ADR 0004)
 *
 * Löst das effektive Modell für einen AI-Call auf.
 * Priorität: activities.model → prompts.model (globaler Config-Cache) → MODEL_NAME aus Env.
 *
 * Production: AVAILABLE_MODELS kommt aus admin_config (DB) via getAvailableModels().
 * MODEL_NAME bleibt als optionaler Env-Fallback (process.env direkt).
 * Tests: deps-Objekt übergeben.
 */

import { getActivity as _getActivity } from './stores/activity.js';
import { getCachedConfig as _getCachedConfig } from './stores/prompt.js';
import { getAvailableModels as _getAvailableModels } from './env-config.js';

const productionDeps = {
  getActivity:     _getActivity,
  getCachedConfig: _getCachedConfig,
  get AVAILABLE_MODELS() { return _getAvailableModels(); },
  get MODEL_NAME()       { return process.env.MODEL_NAME ?? ''; },
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

/**
 * Gibt das effektive Assist-Modell zurück:
 * activities.assist_model → activities.model → MODEL_NAME.
 *
 * Fallback-Kette:
 * 1. activities.assist_model (wenn gesetzt und in AVAILABLE_MODELS)
 * 2. activities.model (wenn gesetzt und in AVAILABLE_MODELS)
 * 3. MODEL_NAME aus Env
 *
 * @param {string|null} activityId
 * @param {object} [deps] - Optionale Dependency-Injection für Tests
 * @param {Function} deps.getActivity
 * @param {string[]} deps.AVAILABLE_MODELS
 * @param {string} deps.MODEL_NAME
 */
export function getEffectiveAssistModel(activityId, deps = productionDeps) {
  const { getActivity, AVAILABLE_MODELS, MODEL_NAME } = deps;
  if (activityId) {
    const act = getActivity(activityId);
    if (act?.assist_model && AVAILABLE_MODELS.includes(act.assist_model)) {
      return act.assist_model;
    }
    if (act?.model && AVAILABLE_MODELS.includes(act.model)) {
      return act.model;
    }
  }
  return MODEL_NAME;
}
