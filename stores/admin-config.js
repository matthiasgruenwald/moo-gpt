/**
 * stores/admin-config.js — Issue #179
 *
 * Generischer K/V-Store für Admin-Konfiguration (admin_config-Tabelle).
 */

import { getDb } from '../db.js';

/**
 * Liest einen Konfigurationswert aus admin_config.
 * @param {string} key
 * @returns {string|null}
 */
export function getAdminConfig(key) {
  return getDb().prepare('SELECT value FROM admin_config WHERE key = ?').get(key)?.value ?? null;
}

/**
 * Schreibt oder überschreibt einen Konfigurationswert in admin_config.
 * @param {string} key
 * @param {string} value
 */
export function setAdminConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Löscht einen Konfigurationswert aus admin_config.
 * @param {string} key
 */
export function deleteAdminConfig(key) {
  getDb().prepare('DELETE FROM admin_config WHERE key = ?').run(key);
}
