import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { setWidgetConfig } from '../stores/widget-config.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
import { AVAILABLE_MODELS } from '../env-config.js';
import { getEffectiveModel } from '../model-resolver.js';
import { validateWidgetConfig } from '../validators.js';

export function createActivityRouter({ lockManager }) {
  const router = Router();

  router.get('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const act  = getActivity(activityId);
    const erf  = getActiveErfahrungsprompt(activityId);
    const pref = getTeacherPreference(userId);
    res.json({
      activityId,
      activityName:           act?.activity_name              || '',
      title:                  act?.title                      ?? '',
      botIcon:                act?.bot_icon                   ?? 'grw',
      opener:                 act?.opener                     || '',
      uploadMode:             act?.upload_mode                || 'off',
      audioInput:             act?.audio_input                || 'off',
      audioOutput:            act?.audio_output               || 'off',
      ttsVoice:               act?.tts_voice                  || 'nova',
      audioStudentOptions:    act?.audio_student_options      || 'off',
      erfahrungsprompt:       erf?.content                    || '',
      model:                  act?.model                      ?? null,
      effectiveModel:         getEffectiveModel(activityId),
      availableModels:        AVAILABLE_MODELS,
      preferSuggestQuestions: pref?.prefer_suggest_questions  ?? 1,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput);
    if (validErr) return res.status(400).json({ error: validErr });
    const validModel = (!model || model === '') ? null : (AVAILABLE_MODELS.includes(model) ? model : null);
    if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
    setWidgetConfig(activityId, { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel });
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

  router.put('/activity-config/:activityId/suggest-preference', requireDashboardAuth, (req, res) => {
    const { userId } = req;
    const { preferSuggestQuestions } = req.body;
    setTeacherSuggestPreference(userId, preferSuggestQuestions);
    res.json({ ok: true });
  });

  return router;
}
