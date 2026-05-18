import { getDb } from '../db.js';

export function getTeacherPreference(userId) {
  if (!userId) return null;
  return getDb().prepare(
    'SELECT preferred_model FROM teacher_preferences WHERE moodle_user_id = ?'
  ).get(userId) || null;
}

export function setTeacherPreference(userId, preferredModel) {
  getDb().prepare(`
    INSERT INTO teacher_preferences (moodle_user_id, preferred_model) VALUES (?, ?)
    ON CONFLICT(moodle_user_id) DO UPDATE SET preferred_model = excluded.preferred_model
  `).run(userId, preferredModel || null);
}

export function getTeacherTemplates(userId) {
  if (!userId) return [];
  return getDb().prepare(
    'SELECT * FROM teacher_templates WHERE moodle_user_id = ? ORDER BY created_at ASC'
  ).all(userId);
}

export function getTeacherDefaultTemplate(userId) {
  if (!userId) return null;
  return getDb().prepare(
    'SELECT * FROM teacher_templates WHERE moodle_user_id = ? AND is_default = 1 LIMIT 1'
  ).get(userId) || null;
}

export function createTeacherTemplate(userId, { name, title, botIcon, opener, uploadMode, hintsTemplate } = {}) {
  const result = getDb().prepare(`
    INSERT INTO teacher_templates (moodle_user_id, name, title, bot_icon, opener, upload_mode, hints_template)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, name, title ?? null, botIcon ?? 'grw', opener ?? null, uploadMode ?? 'off', hintsTemplate ?? null);
  return result.lastInsertRowid;
}

export function updateTeacherTemplate(id, userId, { name, title, botIcon, opener, uploadMode, hintsTemplate } = {}) {
  getDb().prepare(`
    UPDATE teacher_templates
    SET name = ?, title = ?, bot_icon = ?, opener = ?, upload_mode = ?, hints_template = ?
    WHERE id = ? AND moodle_user_id = ?
  `).run(name, title ?? null, botIcon ?? 'grw', opener ?? null, uploadMode ?? 'off', hintsTemplate ?? null, id, userId);
}

export function deleteTeacherTemplate(id, userId) {
  getDb().prepare(
    'DELETE FROM teacher_templates WHERE id = ? AND moodle_user_id = ?'
  ).run(id, userId);
}

export function setTeacherTemplateDefault(id, userId) {
  getDb().transaction(() => {
    getDb().prepare('UPDATE teacher_templates SET is_default = 0 WHERE moodle_user_id = ?').run(userId);
    getDb().prepare('UPDATE teacher_templates SET is_default = 1 WHERE id = ? AND moodle_user_id = ?').run(id, userId);
  })();
}

export function getSystemTemplate() {
  return getDb().prepare('SELECT * FROM system_template WHERE id = 1').get() || null;
}

export function setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate } = {}) {
  getDb().prepare(`
    INSERT INTO system_template (id, title, bot_icon, opener, upload_mode, hints_template, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title          = excluded.title,
      bot_icon       = excluded.bot_icon,
      opener         = excluded.opener,
      upload_mode    = excluded.upload_mode,
      hints_template = excluded.hints_template,
      updated_at     = CURRENT_TIMESTAMP
  `).run(title ?? null, botIcon ?? 'grw', opener ?? null, uploadMode ?? 'off', hintsTemplate ?? null);
}
