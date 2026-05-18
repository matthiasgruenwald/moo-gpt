import { getDb } from '../db.js';

export function saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy }) {
  getDb().prepare(`
    INSERT INTO message_feedback (message_id, thread_id, activity_id, rating, comment, improved_text, rated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      rating        = excluded.rating,
      comment       = excluded.comment,
      improved_text = excluded.improved_text,
      rated_by      = excluded.rated_by
  `).run(messageId, threadId, activityId || null, rating, comment || null, improvedText || null, ratedBy || null);
}

export function getFeedbackByActivity(activityId) {
  return getDb().prepare(`
    SELECT f.*, m.content AS message_content, m.created_at AS message_created_at,
           t.moodle_user_name, t.moodle_user_id
    FROM message_feedback f
    JOIN messages m ON m.id = f.message_id
    JOIN threads  t ON t.id = f.thread_id
    WHERE f.activity_id = ?
    ORDER BY f.created_at DESC
  `).all(activityId);
}
