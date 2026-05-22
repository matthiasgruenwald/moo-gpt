import { getDb } from '../db.js';

/**
 * Gibt die Memory-Einträge eines Schülers für eine Aktivität zurück.
 * @returns {{ preference_text: string, updated_at: string } | null}
 */
export function getStudentMemory(studentId, activityId) {
  return getDb().prepare(`
    SELECT preference_text, updated_at
    FROM student_memory
    WHERE student_id = ? AND activity_id = ?
  `).get(studentId, activityId) ?? null;
}

/**
 * Gibt alle Memory-Einträge einer Aktivität zurück (für Dashboard).
 * @returns {Array<{ student_id: string, preference_text: string, updated_at: string }>}
 */
export function getAllMemoryForActivity(activityId) {
  return getDb().prepare(`
    SELECT student_id, preference_text, updated_at
    FROM student_memory
    WHERE activity_id = ?
    ORDER BY updated_at DESC
  `).all(activityId);
}

/**
 * Legt einen Memory-Eintrag an oder überschreibt ihn (UPSERT).
 */
export function upsertStudentMemory(studentId, activityId, preferenceText) {
  getDb().prepare(`
    INSERT INTO student_memory (student_id, activity_id, preference_text, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(student_id, activity_id) DO UPDATE SET
      preference_text = excluded.preference_text,
      updated_at      = excluded.updated_at
  `).run(studentId, activityId, preferenceText);
}

/**
 * Löscht den Memory-Eintrag eines Schülers für eine Aktivität.
 */
export function deleteStudentMemory(studentId, activityId) {
  getDb().prepare(`
    DELETE FROM student_memory
    WHERE student_id = ? AND activity_id = ?
  `).run(studentId, activityId);
}
