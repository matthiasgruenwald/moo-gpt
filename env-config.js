import { getDb } from './db.js';

export const MODEL_NAME = process.env.MODEL_NAME;

if (!MODEL_NAME) {
  console.warn('[Config] MODEL_NAME ist nicht gesetzt. Chat-Endpoint gibt Fehlermeldung zurück.');
}

/**
 * Gibt die aktuell verfügbaren Chat-Modelle zurück.
 * Liest zuerst aus admin_config (DB), fällt auf AVAILABLE_MODELS-Env zurück.
 * Sicher auch vor DB-Initialisierung (getDb() gibt null zurück).
 */
export function getAvailableModels() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('available_models');
    if (row?.value) return JSON.parse(row.value);
  } catch (_) {}
  if (process.env.AVAILABLE_MODELS) {
    return process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean);
  }
  return MODEL_NAME ? [MODEL_NAME] : [];
}

export function getAvailableBotIcons() {
  return process.env.AVAILABLE_BOT_ICONS
    ? process.env.AVAILABLE_BOT_ICONS.split(',').map(b => b.trim()).filter(Boolean)
    : ['grw', 'grw2', 'weiblich', 'grwdev'];
}

export const AVAILABLE_BOT_ICONS = process.env.AVAILABLE_BOT_ICONS
  ? process.env.AVAILABLE_BOT_ICONS.split(',').map(b => b.trim()).filter(Boolean)
  : ['grw', 'grw2', 'weiblich', 'grwdev'];

export const GEN_MODEL  = process.env.GEN_MODEL || 'gpt-4.1-nano';

/**
 * GEN_MODELS: statische Liste der Generierungs-Modelle.
 * Enthält immer gpt-4.1-nano und gpt-4.1 als Basis.
 * Wird einmalig beim Modulimport berechnet (nur Env, kein DB-Zugriff).
 */
export const GEN_MODELS = (() => {
  const envModels = process.env.AVAILABLE_MODELS
    ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : (MODEL_NAME ? [MODEL_NAME] : []);
  return [...new Set(['gpt-4.1-nano', 'gpt-4.1', ...envModels])];
})();
