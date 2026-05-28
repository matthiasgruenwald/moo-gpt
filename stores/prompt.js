import { getDb } from '../db.js';

// ── In-Memory Config Cache ────────────────────────────────────────────────────
// (absorbed from config-cache.js, Issue #133)

let _config = { content: '', model: '' };

export const getCachedConfig = () => Object.freeze({ ..._config });

export function updateCachedConfig(content, model) {
  _config = { content, model };
}

// ── DB Prompt Functions ───────────────────────────────────────────────────────

export function getActiveSystemPrompt() {
  return getDb().prepare(`
    SELECT content, model, version, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 1
  `).get() || null;
}

export function saveSystemPrompt(content, model, createdBy) {
  const last = getDb().prepare(
    `SELECT version FROM prompts WHERE scope = 'global' AND type = 'system' ORDER BY id DESC LIMIT 1`
  ).get();
  const version = last ? last.version + 1 : 1;
  getDb().prepare(`
    INSERT INTO prompts (scope, type, model, content, version, created_by)
    VALUES ('global', 'system', ?, ?, ?, ?)
  `).run(model, content, version, createdBy || null);
}

export function getPromptHistory() {
  return getDb().prepare(`
    SELECT id, version, model, content, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 20
  `).all();
}

export function deletePromptHistoryEntry(id) {
  const latest = getDb().prepare(
    `SELECT id FROM prompts WHERE scope = 'global' AND type = 'system' ORDER BY id DESC LIMIT 1`
  ).get();
  if (!latest || latest.id === id) return { ok: false, error: 'Aktuelle Version kann nicht gelöscht werden' };
  getDb().prepare(`DELETE FROM prompts WHERE id = ? AND scope = 'global' AND type = 'system'`).run(id);
  return { ok: true };
}

export function getActiveErfahrungsprompt(activityId) {
  if (!activityId) return null;
  return getDb().prepare(`
    SELECT content, version, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 1
  `).get(activityId) || null;
}

export function saveErfahrungsprompt(activityId, content, createdBy) {
  const last = getDb().prepare(
    `SELECT version FROM prompts WHERE scope = ? AND type = 'erfahrung' ORDER BY id DESC LIMIT 1`
  ).get(activityId);
  const version = last ? last.version + 1 : 1;
  getDb().prepare(`
    INSERT INTO prompts (scope, type, content, version, created_by)
    VALUES (?, 'erfahrung', ?, ?, ?)
  `).run(activityId, content, version, createdBy || null);
}

export function getErfahrungspromptHistory(activityId) {
  if (!activityId) return [];
  return getDb().prepare(`
    SELECT id, version, content, created_by, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 10
  `).all(activityId);
}

export function deleteErfahrungspromptHistoryEntry(activityId, id) {
  const latest = getDb().prepare(
    `SELECT id FROM prompts WHERE scope = ? AND type = 'erfahrung' ORDER BY id DESC LIMIT 1`
  ).get(activityId);
  if (!latest || latest.id === id) return { ok: false, error: 'Aktuelle Version kann nicht gelöscht werden' };
  getDb().prepare(`DELETE FROM prompts WHERE id = ? AND scope = ? AND type = 'erfahrung'`).run(id, activityId);
  return { ok: true };
}
