import { getDb } from '../db.js';

/**
 * Gibt den globalen Memory-Eintrag eines Schülers zurück.
 * @returns {{ preference_text: string, preferred_voice: string, tts_autoplay: number, updated_at: string } | null}
 */
export function getStudentMemory(studentId) {
  return getDb().prepare(`
    SELECT preference_text, preferred_voice, tts_autoplay, updated_at
    FROM student_memory
    WHERE student_id = ?
  `).get(studentId) ?? null;
}

/**
 * Gibt alle globalen Memory-Einträge zurück (für Dashboard).
 * @returns {Array<{ student_id: string, preference_text: string, preferred_voice: string, tts_autoplay: number, updated_at: string }>}
 */
export function getAllMemory() {
  return getDb().prepare(`
    SELECT student_id, preference_text, preferred_voice, tts_autoplay, updated_at
    FROM student_memory
    ORDER BY updated_at DESC
  `).all();
}

/**
 * Legt einen globalen Memory-Eintrag an oder überschreibt ihn (UPSERT).
 * @param {string} studentId
 * @param {string} preferenceText
 * @param {{ preferred_voice?: string, tts_autoplay?: number }} [opts]
 */
export function upsertStudentMemory(studentId, preferenceText, opts = {}) {
  const voice    = opts.preferred_voice ?? 'nova';
  const autoplay = opts.tts_autoplay    ?? 0;
  getDb().prepare(`
    INSERT INTO student_memory (student_id, preference_text, preferred_voice, tts_autoplay, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(student_id) DO UPDATE SET
      preference_text = excluded.preference_text,
      preferred_voice = excluded.preferred_voice,
      tts_autoplay    = excluded.tts_autoplay,
      updated_at      = excluded.updated_at
  `).run(studentId, preferenceText, voice, autoplay);
}

/**
 * Löscht den globalen Memory-Eintrag eines Schülers.
 */
export function deleteStudentMemory(studentId) {
  getDb().prepare(`
    DELETE FROM student_memory WHERE student_id = ?
  `).run(studentId);
}
