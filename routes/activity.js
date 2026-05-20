import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity, setActivityConfig } from '../stores/activity.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference } from '../stores/teacher.js';
import { AVAILABLE_MODELS } from '../env-config.js';
import { validateWidgetConfig } from '../validators.js';

export function createActivityRouter({ chatRegistry, dashboardRegistry, lockManager }) {
  const router = Router();

  router.get('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const act  = getActivity(activityId);
    const erf  = getActiveErfahrungsprompt(activityId);
    const pref = getTeacherPreference(userId);
    res.json({
      activityId,
      activityName:     act?.activity_name   || '',
      title:            act?.title           ?? '',
      botIcon:          act?.bot_icon        ?? 'grw',
      opener:           act?.opener          || '',
      uploadMode:       act?.upload_mode     || 'off',
      erfahrungsprompt: erf?.content         || '',
      myModel:          pref?.preferred_model || null,
      availableModels:  AVAILABLE_MODELS,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon);
    if (validErr) return res.status(400).json({ error: validErr });
    setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
    console.log(`[Config] Aktivität ${activityId} aktualisiert von ${userId}`);
    res.json({ ok: true });
  });

  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const durationMinutes = Number(req.body.durationMinutes) || 0;
    lockManager.lock(activityId, durationMinutes);
    console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
    res.json({ ok: true, locked: true });
  });

  router.delete('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    lockManager.unlock(activityId);
    console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
    res.json({ ok: true, locked: false });
  });

  return router;
}
