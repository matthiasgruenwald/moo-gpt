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

// ── Issue #87: Audio-Datenschicht ────────────────────────────────────────────

/**
 * Speichert einen Audio-Transkriptions-Eintrag in token_log.
 * Prompt-/Completion-Tokens sind NULL (nur audio_seconds relevant).
 *
 * @param {number} threadId  - DB-ID des Threads
 * @param {string} activityId
 * @param {number} audioSeconds - Dauer der Transkription in Sekunden (Float)
 */
export function saveAudioUsage(threadId, activityId, audioSeconds) {
  if (audioSeconds == null) return;
  getDb().prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, audio_seconds)
    VALUES (?, ?, 'transcription', ?)
  `).run(threadId || null, activityId || null, audioSeconds);
}

/**
 * Summiert Audio-Sekunden pro Thread (für Kostenberechnung).
 * @param {number} threadDbId
 * @returns {{ total_seconds: number }}
 */
export function getThreadAudioSeconds(threadDbId) {
  return getDb().prepare(`
    SELECT COALESCE(SUM(audio_seconds), 0) AS total_seconds
    FROM token_log
    WHERE thread_id = ? AND call_type = 'transcription' AND audio_seconds IS NOT NULL
  `).get(threadDbId);
}

/**
 * Summiert Audio-Sekunden pro Aktivität (für Kostenberechnung).
 * @param {string} activityId
 * @returns {{ total_seconds: number }}
 */
export function getActivityAudioSeconds(activityId) {
  return getDb().prepare(`
    SELECT COALESCE(SUM(audio_seconds), 0) AS total_seconds
    FROM token_log
    WHERE activity_id = ? AND call_type = 'transcription' AND audio_seconds IS NOT NULL
  `).get(activityId);
}

// ── Issue #96: TTS-Datenschicht ───────────────────────────────────────────────

/**
 * Speichert GPT-mini-Preprocessing-Kosten für TTS in token_log.
 *
 * @param {number} threadId  - DB-ID des Threads
 * @param {string} activityId
 * @param {number} promptTokens     - Eingabe-Token des GPT-mini-Calls
 * @param {number} completionTokens - Ausgabe-Token des GPT-mini-Calls
 */
export function saveTtsPrepUsage(threadId, activityId, promptTokens, completionTokens) {
  getDb().prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, model, prompt_tokens, completion_tokens)
    VALUES (?, ?, 'tts-prep', 'gpt-4o-mini', ?, ?)
  `).run(
    threadId   || null,
    activityId || null,
    promptTokens      ?? null,
    completionTokens  ?? null
  );
}

/**
 * Speichert TTS-Synthesekosten in token_log.
 *
 * @param {number} threadId  - DB-ID des Threads
 * @param {string} activityId
 * @param {number} ttsCharacters - Anzahl der synthetisierten Zeichen
 */
export function saveTtsUsage(threadId, activityId, ttsCharacters) {
  if (ttsCharacters == null) return;
  getDb().prepare(`
    INSERT INTO token_log (thread_id, activity_id, call_type, model, tts_characters)
    VALUES (?, ?, 'tts', 'tts-1-hd', ?)
  `).run(threadId || null, activityId || null, ttsCharacters);
}
