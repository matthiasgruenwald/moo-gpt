/**
 * app-init.js — Issue #79
 *
 * App-Initialisierung: DB-Setup + Admin-Seed + Config-Load.
 * Extrahiert aus server.js.
 *
 * Design: Alle Dependencies optional per Parameter injizierbar (Tests).
 * In Production: Default-Import aus den echten Modulen.
 */

import { initDb as _initDb } from './db.js';
import { addAdmin as _addAdmin } from './stores/admin.js';
import {
  getActiveSystemPrompt as _getActiveSystemPrompt,
  saveSystemPrompt as _saveSystemPrompt,
} from './stores/prompt.js';
import { getCachedConfig as _getCachedConfig, updateCachedConfig as _updateCachedConfig } from './stores/prompt.js';

// env-config.js wird NICHT importiert, um process.exit(1) bei fehlendem MODEL_NAME
// in Tests zu vermeiden. Stattdessen: process.env direkt lesen.

const productionDeps = {
  initDb:                _initDb,
  addAdmin:              _addAdmin,
  getActiveSystemPrompt: _getActiveSystemPrompt,
  saveSystemPrompt:      _saveSystemPrompt,
  getCachedConfig:       _getCachedConfig,
  updateCachedConfig:    _updateCachedConfig,
  get MODEL_NAME()    { return process.env.MODEL_NAME ?? ''; },
  get SYSTEM_PROMPT() { return process.env.SYSTEM_PROMPT ?? ''; },
  get ADMIN_USER_IDS() { return process.env.ADMIN_USER_IDS ?? ''; },
};

/**
 * Initialisiert die Applikation:
 * 1. SQLite-DB anlegen/migrieren
 * 2. Admins aus ADMIN_USER_IDS-Env seeden (idempotent)
 * 3. System-Prompt + Modell aus DB laden; bei Erststart aus Env migrieren
 *
 * @param {object} [deps] — optionale Dependency-Injection für Tests
 */
export function initApp(deps = productionDeps) {
  const {
    initDb,
    addAdmin,
    getActiveSystemPrompt,
    saveSystemPrompt,
    getCachedConfig,
    updateCachedConfig,
    MODEL_NAME,
    SYSTEM_PROMPT,
    ADMIN_USER_IDS,
  } = deps;

  // 1. SQLite-DB initialisieren
  initDb();

  // 2. Admins aus ADMIN_USER_IDS-Env seeden (idempotent via INSERT OR IGNORE)
  const adminIds = ADMIN_USER_IDS
    ? ADMIN_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  for (const uid of adminIds) addAdmin(uid, 'env');
  if (adminIds.length > 0) console.log(`[Admin] ${adminIds.length} Admin(s) aus ADMIN_USER_IDS eingetragen`);

  // 3. Systemprompt + Modell aus DB laden; bei Erststart aus Env migrieren
  const dbPrompt = getActiveSystemPrompt();
  if (dbPrompt) {
    updateCachedConfig(dbPrompt.content, dbPrompt.model || MODEL_NAME);
    console.log(`[Config] Systemprompt aus DB (v${dbPrompt.version}), Modell: ${getCachedConfig().model}`);
  } else {
    saveSystemPrompt(SYSTEM_PROMPT || '', MODEL_NAME, 'env-migration');
    updateCachedConfig(SYSTEM_PROMPT || '', MODEL_NAME);
    console.log(`[Config] Systemprompt aus ENV in DB migriert, Modell: ${MODEL_NAME}`);
  }
}
