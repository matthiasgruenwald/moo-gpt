import { getDb } from '../db.js';

export function getGlobalPersonas() {
  return getDb().prepare('SELECT * FROM personas WHERE teacher_id IS NULL ORDER BY name ASC').all();
}

export function getTeacherPersonas(userId) {
  return getDb().prepare('SELECT * FROM personas WHERE teacher_id = ? ORDER BY name ASC').all(userId);
}

export function getAllPersonasForUser(userId) {
  return getDb().prepare(`
    SELECT * FROM personas
    WHERE teacher_id IS NULL OR teacher_id = ?
    ORDER BY (teacher_id IS NULL) DESC, name ASC
  `).all(userId);
}

export function createPersona({ teacherId, teacherName, name, description, example_msgs, createdBy }) {
  const result = getDb().prepare(`
    INSERT INTO personas (teacher_id, teacher_name, name, description, example_msgs, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(teacherId || null, teacherName || null, name, description || null, example_msgs || null, createdBy || null);
  return result.lastInsertRowid;
}

export function deletePersona(id, userId, adminOverride = false) {
  if (adminOverride) {
    getDb().prepare('DELETE FROM personas WHERE id = ?').run(id);
  } else {
    getDb().prepare('DELETE FROM personas WHERE id = ? AND teacher_id = ?').run(id, userId);
  }
}

export function promotePersonaToGlobal(id, adminId) {
  getDb().prepare('UPDATE personas SET teacher_id = NULL, teacher_name = NULL, created_by = ? WHERE id = ?').run(adminId, id);
}

export function getAllTeacherPersonasGrouped() {
  return getDb().prepare(`
    SELECT * FROM personas WHERE teacher_id IS NOT NULL ORDER BY COALESCE(teacher_name, teacher_id) ASC, name ASC
  `).all();
}

export function getStudentMessages(activityId) {
  return getDb().prepare(`
    SELECT m.content, t.moodle_user_name
    FROM messages m
    JOIN threads t ON t.id = m.thread_id
    WHERE t.activity_id = ? AND m.role = 'user'
      AND COALESCE(m.content_type, 'text') = 'text'
      AND length(m.content) > 10
    ORDER BY m.created_at DESC
    LIMIT 80
  `).all(activityId);
}
