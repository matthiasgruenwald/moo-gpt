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
import { getAdminConfig as _getAdminConfig, setAdminConfig as _setAdminConfig } from './stores/admin-config.js';
import {
  getActiveSystemPrompt as _getActiveSystemPrompt,
  saveSystemPrompt as _saveSystemPrompt,
} from './stores/prompt.js';
import { getCachedConfig as _getCachedConfig, updateCachedConfig as _updateCachedConfig } from './stores/prompt.js';

// Hinweis: env-config.js kann nun sicher importiert werden (kein process.exit mehr),
// aber wir lesen Env-Vars hier direkt für maximale Testbarkeit ohne Modul-Import.

const productionDeps = {
  initDb:                _initDb,
  addAdmin:              _addAdmin,
  getAdminConfig:        _getAdminConfig,
  setAdminConfig:        _setAdminConfig,
  getActiveSystemPrompt: _getActiveSystemPrompt,
  saveSystemPrompt:      _saveSystemPrompt,
  getCachedConfig:       _getCachedConfig,
  updateCachedConfig:    _updateCachedConfig,
  get MODEL_NAME()       { return process.env.MODEL_NAME ?? ''; },
  get SYSTEM_PROMPT()    { return process.env.SYSTEM_PROMPT ?? ''; },
  get ADMIN_USER_IDS()   { return process.env.ADMIN_USER_IDS ?? ''; },
  get AVAILABLE_MODELS() { return process.env.AVAILABLE_MODELS ?? ''; },
};

/**
 * Initialisiert die Applikation:
 * 1. SQLite-DB anlegen/migrieren
 * 2. Admins aus ADMIN_USER_IDS-Env seeden (idempotent)
 * 3. available_models aus Env in admin_config seeden (idempotent — nur wenn DB leer)
 * 4. System-Prompt + Modell aus DB laden; bei Erststart aus Env migrieren
 *
 * @param {object} [deps] — optionale Dependency-Injection für Tests
 */
export function initApp(deps = productionDeps) {
  const {
    initDb,
    addAdmin,
    getAdminConfig,
    setAdminConfig,
    getActiveSystemPrompt,
    saveSystemPrompt,
    getCachedConfig,
    updateCachedConfig,
    MODEL_NAME,
    SYSTEM_PROMPT,
    ADMIN_USER_IDS,
    AVAILABLE_MODELS,
  } = deps;

  // 1. SQLite-DB initialisieren
  initDb();

  // 2. Admins aus ADMIN_USER_IDS-Env seeden (idempotent via INSERT OR IGNORE)
  const adminIds = ADMIN_USER_IDS
    ? ADMIN_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  for (const uid of adminIds) addAdmin(uid, 'env');
  if (adminIds.length > 0) console.log(`[Admin] ${adminIds.length} Admin(s) aus ADMIN_USER_IDS eingetragen`);

  // 3. available_models aus Env in admin_config seeden (idempotent — nur wenn kein DB-Wert)
  const existingModels = getAdminConfig('available_models');
  if (!existingModels && AVAILABLE_MODELS) {
    const models = AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean);
    if (models.length > 0) {
      setAdminConfig('available_models', JSON.stringify(models));
      console.log(`[Config] available_models aus ENV in admin_config gespeichert: ${models.join(', ')}`);
    }
  }

  // 4. Systemprompt + Modell aus DB laden; bei Erststart aus Env migrieren
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
