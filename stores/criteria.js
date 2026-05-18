import { getDb } from '../db.js';

export function getErkenntnisse(activityId) {
  return getDb().prepare(`
    SELECT id, activity_id, content, source, created_at
    FROM erkenntnisse
    WHERE activity_id = ? OR activity_id IS NULL
    ORDER BY created_at DESC LIMIT 50
  `).all(activityId || '');
}

export function saveErkenntnisse(activityId, content, source) {
  getDb().prepare(`
    INSERT INTO erkenntnisse (activity_id, content, source) VALUES (?, ?, ?)
  `).run(activityId || null, content, source || 'ai');
}

export function getCriteria(activityId) {
  return getDb().prepare(`
    SELECT * FROM erkenntnisse
    WHERE source = 'criteria' AND COALESCE(status, 'active') = 'active'
      AND (activity_id = ? OR activity_id IS NULL)
    ORDER BY created_at ASC
  `).all(activityId);
}

export function getDeletedCriteria(activityId) {
  return getDb().prepare(`
    SELECT * FROM erkenntnisse
    WHERE source = 'criteria' AND status = 'deleted'
      AND (activity_id = ? OR activity_id IS NULL)
    ORDER BY created_at ASC
  `).all(activityId);
}

export function softDeleteCriterion(id) {
  getDb().prepare(
    `UPDATE erkenntnisse SET status = 'deleted' WHERE id = ? AND source = 'criteria'`
  ).run(id);
}

export function restoreCriterion(id) {
  getDb().prepare(
    `UPDATE erkenntnisse SET status = 'active' WHERE id = ? AND source = 'criteria'`
  ).run(id);
}
