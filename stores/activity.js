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
    'SELECT activity_name, opener, upload_mode, title, bot_icon FROM activities WHERE activity_id = ?'
  ).get(activity_id) || null;
}

export function setActivityConfig(activity_id, opener, uploadMode, title, botIcon) {
  getDb().prepare(`
    INSERT INTO activities (activity_id, opener, upload_mode, title, bot_icon, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      opener      = COALESCE(excluded.opener, activities.opener),
      upload_mode = COALESCE(excluded.upload_mode, activities.upload_mode),
      title       = COALESCE(excluded.title, activities.title),
      bot_icon    = COALESCE(excluded.bot_icon, activities.bot_icon),
      updated_at  = CURRENT_TIMESTAMP
  `).run(activity_id, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
}
