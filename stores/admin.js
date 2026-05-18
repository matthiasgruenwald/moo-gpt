import { getDb } from '../db.js';

export function isAdmin(userId) {
  if (!userId) return false;
  return !!getDb().prepare('SELECT 1 FROM admin_users WHERE moodle_user_id = ?').get(userId);
}

export function addAdmin(userId, grantedBy = null) {
  getDb().prepare(`
    INSERT OR IGNORE INTO admin_users (moodle_user_id, granted_by) VALUES (?, ?)
  `).run(userId, grantedBy);
}

export function removeAdmin(userId) {
  getDb().prepare('DELETE FROM admin_users WHERE moodle_user_id = ?').run(userId);
}

export function getAdmins() {
  return getDb().prepare('SELECT * FROM admin_users ORDER BY granted_at ASC').all();
}
