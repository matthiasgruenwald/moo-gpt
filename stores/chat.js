import { getDb } from '../db.js';

export function saveThread({ moodle_user_id, moodle_user_name, activity_id, openai_thread_id = null }) {
  const result = getDb().prepare(`
    INSERT INTO threads (moodle_user_id, moodle_user_name, activity_id, openai_thread_id)
    VALUES (?, ?, ?, ?)
  `).run(moodle_user_id || null, moodle_user_name || null, activity_id || null, openai_thread_id || null);
  return result.lastInsertRowid;
}

export function touchThread(thread_db_id) {
  getDb().prepare('UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(thread_db_id);
}

export function findThread({ moodle_user_id, activity_id }) {
  if (!moodle_user_id || !activity_id) return null;
  return getDb().prepare(`
    SELECT * FROM threads
    WHERE moodle_user_id = ? AND activity_id = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(moodle_user_id, activity_id) || null;
}

export function updateThreadName(thread_db_id, moodle_user_name) {
  if (!thread_db_id || !moodle_user_name) return;
  getDb().prepare(`
    UPDATE threads
    SET moodle_user_name = ?
    WHERE id = ? AND (moodle_user_name IS NULL OR moodle_user_name = '')
  `).run(moodle_user_name, thread_db_id);
}

export function deleteTaskImages(thread_db_id) {
  getDb().prepare(`DELETE FROM messages WHERE thread_id = ? AND content_type = 'task_image'`).run(thread_db_id);
}

export function saveMessage({ thread_db_id, role, content, content_type = 'text' }) {
  const result = getDb().prepare(`
    INSERT INTO messages (thread_id, role, content, content_type) VALUES (?, ?, ?, ?)
  `).run(thread_db_id, role, content, content_type);
  touchThread(thread_db_id);
  return result.lastInsertRowid;
}

export function getMessages(thread_db_id) {
  return getDb().prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion,
           mf.rating            AS fb_rating,
           mf.comment           AS fb_comment,
           mf.improved_text     AS fb_improved
    FROM messages m
    LEFT JOIN token_log tl        ON tl.message_id = m.id
    LEFT JOIN message_feedback mf ON mf.message_id = m.id
    WHERE m.thread_id = ? AND COALESCE(m.content_type, 'text') != 'task_image'
    ORDER BY m.created_at ASC LIMIT 100
  `).all(thread_db_id);
}

export function getMessagesAll(thread_db_id) {
  return getDb().prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion
    FROM messages m
    LEFT JOIN token_log tl ON tl.message_id = m.id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC LIMIT 150
  `).all(thread_db_id);
}
