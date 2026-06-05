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

// ── Issue #184: Werkzeug-Modell-Getter ───────────────────────────────────────

/**
 * Modell für Generierungs-Calls (Kriterien, Personas, Äußerungen, Evaluation, Bugreport).
 * Fallback-Kette: admin_config(gen_model) → GEN_MODEL-Env → 'gpt-4.1-nano'
 */
export function getGenModel() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('gen_model');
    if (row?.value) return row.value;
  } catch (_) {}
  return process.env.GEN_MODEL || 'gpt-4.1-nano';
}

/**
 * Modell für GPT-Preprocessing vor TTS (Markdown/LaTeX bereinigen).
 * Fallback-Kette: admin_config(tts_prep_model) → 'gpt-4o-mini'
 */
export function getTtsPrepModel() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('tts_prep_model');
    if (row?.value) return row.value;
  } catch (_) {}
  return 'gpt-4o-mini';
}

/**
 * Modell für TTS-Ausgabe.
 * Fallback-Kette: admin_config(tts_model) → 'tts-1-hd'
 */
export function getTtsModel() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('tts_model');
    if (row?.value) return row.value;
  } catch (_) {}
  return 'tts-1-hd';
}

/**
 * Modell für Whisper-Transkription.
 * Fallback-Kette: admin_config(transcription_model) → 'whisper-1'
 */
export function getTranscriptionModel() {
  try {
    const row = getDb()?.prepare('SELECT value FROM admin_config WHERE key = ?').get('transcription_model');
    if (row?.value) return row.value;
  } catch (_) {}
  return 'whisper-1';
}
