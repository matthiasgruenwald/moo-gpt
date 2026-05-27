import { getDb } from '../db.js';

export function upsertActivity(activity_id, activity_name, opener, upload_mode, title, botIcon) {
  if (!activity_id || !activity_name) return;
  getDb().prepare(`
    INSERT INTO activities (activity_id, activity_name, opener, upload_mode, title, bot_icon, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      activity_name = excluded.activity_name,
      opener        = COALESCE(excluded.opener, activities.opener),
      upload_mode   = COALESCE(excluded.upload_mode, activities.upload_mode, 'off'),
      title         = COALESCE(excluded.title, activities.title),
      bot_icon      = COALESCE(excluded.bot_icon, activities.bot_icon, 'grw'),
      updated_at    = CURRENT_TIMESTAMP
  `).run(activity_id, activity_name, opener ?? null, upload_mode ?? null, title ?? null, botIcon ?? null);
}

export function getActivity(activity_id) {
  return getDb().prepare(
    'SELECT activity_name, opener, upload_mode, audio_input, audio_output, tts_voice, audio_student_options, title, bot_icon, model FROM activities WHERE activity_id = ?'
  ).get(activity_id) || null;
}

export function setTeacherIfUnset(activity_id, teacher_id, teacher_name) {
  if (!activity_id || !teacher_id) return;
  getDb().prepare(`
    UPDATE activities SET teacher_id = ?, teacher_name = ?
    WHERE activity_id = ? AND teacher_id IS NULL
  `).run(teacher_id, teacher_name ?? null, activity_id);
}

export function setActivityConfig(activity_id, opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model) {
  getDb().prepare(`
    INSERT INTO activities (activity_id, opener, upload_mode, title, bot_icon, audio_input, audio_output, tts_voice, audio_student_options, model, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'off'), COALESCE(?, 'nova'), COALESCE(?, 'off'), ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      opener               = COALESCE(excluded.opener, activities.opener),
      upload_mode          = COALESCE(excluded.upload_mode, activities.upload_mode),
      title                = COALESCE(excluded.title, activities.title),
      bot_icon             = COALESCE(excluded.bot_icon, activities.bot_icon),
      audio_input          = COALESCE(excluded.audio_input, activities.audio_input, 'off'),
      audio_output         = COALESCE(excluded.audio_output, activities.audio_output, 'off'),
      tts_voice            = COALESCE(excluded.tts_voice, activities.tts_voice, 'nova'),
      audio_student_options = COALESCE(excluded.audio_student_options, activities.audio_student_options, 'off'),
      model                = excluded.model,
      updated_at           = CURRENT_TIMESTAMP
  `).run(activity_id, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null, audioInput ?? null, audioOutput ?? null, ttsVoice ?? null, audioStudentOptions ?? null, model ?? null);
}
