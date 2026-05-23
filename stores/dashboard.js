import { getDb } from '../db.js';

export function getStudents(activity_id) {
  return getDb().prepare(`
    SELECT t.id              AS thread_db_id,
           t.moodle_user_id,
           t.moodle_user_name,
           t.updated_at,
           COUNT(DISTINCT CASE WHEN m.role = 'user' AND m.content_type != 'task_image' THEN m.id END) AS message_count
    FROM threads t
    LEFT JOIN messages m ON m.thread_id = t.id
    WHERE t.activity_id = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(activity_id);
}

