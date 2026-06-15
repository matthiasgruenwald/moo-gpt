import { getDb } from '../db.js';

export function upsertActivity(activity_id, activity_name, opener, upload_mode, title, botIcon, courseId) {
  if (!activity_id || !activity_name) return;
  getDb().prepare(`
    INSERT INTO activities (activity_id, activity_name, opener, upload_mode, title, bot_icon, course_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      activity_name = excluded.activity_name,
      opener        = COALESCE(excluded.opener, activities.opener),
      upload_mode   = COALESCE(excluded.upload_mode, activities.upload_mode, 'off'),
      title         = COALESCE(excluded.title, activities.title),
      bot_icon      = COALESCE(excluded.bot_icon, activities.bot_icon, 'grwdev'),
      course_id     = COALESCE(excluded.course_id, activities.course_id),
      updated_at    = CURRENT_TIMESTAMP
  `).run(activity_id, activity_name, opener ?? null, upload_mode ?? null, title ?? null, botIcon ?? null, courseId ?? null);
}

export function getActivity(activity_id) {
  return getDb().prepare(
    'SELECT activity_name, opener, upload_mode, audio_input, audio_output, tts_voice, audio_student_options, title, bot_icon, model, math_mode, assist_model, chat_temperature, assist_temperature, course_id FROM activities WHERE activity_id = ?'
  ).get(activity_id) || null;
}

export function setTeacherIfUnset(activity_id, teacher_id, teacher_name) {
  if (!activity_id || !teacher_id) return;
  getDb().prepare(`
    UPDATE activities SET teacher_id = ?, teacher_name = ?
    WHERE activity_id = ? AND teacher_id IS NULL
  `).run(teacher_id, teacher_name ?? null, activity_id);
}
