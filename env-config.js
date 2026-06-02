import { getDb } from './db.js';

export const GEN_MODEL  = process.env.GEN_MODEL || 'gpt-4.1-nano';

/**
 * GEN_MODELS: statische Liste der Generierungs-Modelle.
 * Enthält immer gpt-4.1-nano und gpt-4.1 als Basis.
 */
export const GEN_MODELS = ['gpt-4.1-nano', 'gpt-4.1'];

/**
 * Gibt die aktuell verfügbaren Chat-Modelle zurück.
 * Liest aus admin_config (DB). Gibt leeres Array zurück wenn kein DB-Eintrag.
 * Sicher auch vor DB-Initialisierung (getDb() gibt null zurück).
 */
export function getAvailableModels() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('available_models');
    if (row?.value) return JSON.parse(row.value);
  } catch (_) {}
  return [];
}

/**
 * Gibt die aktuell verfügbaren Bot-Icons zurück.
 * Liest aus admin_config (DB), fällt auf eingebauten Default zurück.
 * Sicher auch vor DB-Initialisierung (getDb() gibt null zurück).
 */
export function getAvailableBotIcons() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('available_bot_icons');
    if (row?.value) return JSON.parse(row.value);
  } catch (_) {}
  return ['grw', 'grw2', 'weiblich', 'grwdev'];
}
