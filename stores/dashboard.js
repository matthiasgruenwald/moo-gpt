import { getDb } from '../db.js';

export function getStudents(activity_id) {
  return getDb().prepare(`
    SELECT t.id              AS thread_db_id,
           t.moodle_user_id,
           t.moodle_user_name,
           t.updated_at,
           COUNT(m.id)                             AS message_count,
           COALESCE(tl_agg.cost_prompt, 0)         AS cost_prompt,
           COALESCE(tl_agg.cost_completion, 0)     AS cost_completion
    FROM threads t
    LEFT JOIN messages m ON m.thread_id = t.id
    LEFT JOIN (
      SELECT thread_id,
             SUM(prompt_tokens)     AS cost_prompt,
             SUM(completion_tokens) AS cost_completion
      FROM token_log GROUP BY thread_id
    ) tl_agg ON tl_agg.thread_id = t.id
    WHERE t.activity_id = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(activity_id);
}
