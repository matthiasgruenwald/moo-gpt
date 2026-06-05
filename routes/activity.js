import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { setWidgetConfig } from '../stores/widget-config.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
<<<<<<< HEAD
import { getAvailableModels, getAvailableBotIcons } from '../env-config.js';
import { getEffectiveModel } from '../model-resolver.js';
import { validateWidgetConfig } from '../validators.js';
=======
import { AVAILABLE_MODELS } from '../env-config.js';
import { getEffectiveModel, getEffectiveAssistModel } from '../model-resolver.js';
import { validateWidgetConfig, validateAssistModel } from '../validators.js';
>>>>>>> 5741e0b (feat: assist_model Resolver und Routen-Durchreichung (#185))

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
      botIcon:                act?.bot_icon                   ?? 'grwdev',
      opener:                 act?.opener                     || '',
      uploadMode:             act?.upload_mode                || 'off',
      audioInput:             act?.audio_input                || 'off',
      audioOutput:            act?.audio_output               || 'off',
      ttsVoice:               act?.tts_voice                  || 'nova',
      audioStudentOptions:    act?.audio_student_options      || 'off',
      mathMode:               act?.math_mode                  ?? 'off',
      erfahrungsprompt:       erf?.content                    || '',
      model:                  act?.model                      ?? null,
      effectiveModel:         getEffectiveModel(activityId),
<<<<<<< HEAD
      availableModels:        getAvailableModels(),
      availableBotIcons:      getAvailableBotIcons(),
=======
      assistModel:            act?.assist_model               ?? null,
      assistTemperature:      act?.assist_temperature         ?? null,
      effectiveAssistModel:   getEffectiveAssistModel(activityId),
      availableModels:        AVAILABLE_MODELS,
>>>>>>> 5741e0b (feat: assist_model Resolver und Routen-Durchreichung (#185))
      preferSuggestQuestions: pref?.prefer_suggest_questions  ?? 1,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model, mathMode, assistModel, assistTemperature } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode);
    if (validErr) return res.status(400).json({ error: validErr });
    const validModel = (!model || model === '') ? null : (getAvailableModels().includes(model) ? model : null);
    if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
    const assistModelErr = validateAssistModel(assistModel, AVAILABLE_MODELS);
    if (assistModelErr) return res.status(400).json({ error: assistModelErr });
    const validAssistModel = (!assistModel || assistModel === '') ? null : assistModel;
    const configUpdate = { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel, mathMode };
    if ('assistModel' in req.body) configUpdate.assistModel = validAssistModel;
    if ('assistTemperature' in req.body) {
      const t = req.body.assistTemperature;
      configUpdate.assistTemperature = (t === null || t === '') ? null : Math.min(1, Math.max(0, Number(t)));
    }
    setWidgetConfig(activityId, configUpdate);
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
