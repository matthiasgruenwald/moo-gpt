import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity, setActivityConfig } from '../stores/activity.js';
import { getActiveErfahrungsprompt, getTeacherPreference } from '../db.js';
import { AVAILABLE_MODELS } from '../env-config.js';
import { validateTemplateFields } from './validators.js';

export function createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks }) {
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
    const validErr = validateTemplateFields(uploadMode, botIcon);
    if (validErr) return res.status(400).json({ error: validErr });
    setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
    console.log(`[Config] Aktivität ${activityId} aktualisiert von ${userId}`);
    res.json({ ok: true });
  });

  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const existing = activityLocks.get(String(activityId));
    if (existing?.timerHandle) clearTimeout(existing.timerHandle);

    const entry = {};
    const durationMinutes = Math.min(120, Math.max(0, Number(req.body.durationMinutes) || 0));
    if (durationMinutes > 0) {
      entry.timerHandle = setTimeout(() => {
        activityLocks.delete(String(activityId));
        chatRegistry.broadcast(activityId, { type: 'unlocked' });
        dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
        console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${durationMinutes} min`);
      }, durationMinutes * 60 * 1000);
    }

    activityLocks.set(String(activityId), entry);
    chatRegistry.broadcast(activityId, { type: 'locked' });
    dashboardRegistry.broadcast(activityId, { type: 'locked' });
    console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
    res.json({ ok: true, locked: true });
  });

  router.delete('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const existing = activityLocks.get(String(activityId));
    if (existing?.timerHandle) clearTimeout(existing.timerHandle);
    activityLocks.delete(String(activityId));
    chatRegistry.broadcast(activityId, { type: 'unlocked' });
    dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
    console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
    res.json({ ok: true, locked: false });
  });

  return router;
}
