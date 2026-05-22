import { getDb } from '../db.js';

export function saveTokenUsage(threadId, activityId, model, usage, messageId = null) {
  if (!usage) return;
  getDb().prepare(`
    INSERT INTO token_log (thread_id, activity_id, model, prompt_tokens, completion_tokens, total_tokens, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    threadId   || null,
    activityId || null,
    model      || null,
    usage.prompt_tokens      ?? null,
    usage.completion_tokens  ?? null,
    usage.total_tokens       ?? null,
    messageId  || null
  );
}

export function getThreadCostByModel(threadDbId) {
  return getDb().prepare(`
    SELECT model,
           COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE thread_id = ?
    GROUP BY model
  `).all(threadDbId);
}

export function getActivityCostByModel(activityId) {
  return getDb().prepare(`
    SELECT model,
           COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE activity_id = ?
    GROUP BY model
  `).all(activityId);
}
