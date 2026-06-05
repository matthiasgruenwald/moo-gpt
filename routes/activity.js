import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { setWidgetConfig } from '../stores/widget-config.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
import { getAvailableModels, getAvailableBotIcons } from '../env-config.js';
import { getEffectiveModel, getEffectiveAssistModel } from '../model-resolver.js';
import { validateWidgetConfig, validateAssistModel, validateChatTemperature } from '../validators.js';
import { resolveWidgetConfig } from '../services/widget-config-resolver.js';

export function createActivityRouter({ lockManager }) {
  const router = Router();

  router.get('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const act  = getActivity(activityId);
    const cfg  = resolveWidgetConfig(activityId, userId);
    const erf  = getActiveErfahrungsprompt(activityId);
    const pref = getTeacherPreference(userId);
    res.json({
      activityId,
      activityName:           act?.activity_name              || '',
      title:                  cfg.title                       ?? '',
      botIcon:                cfg.botIcon,
      opener:                 cfg.opener                      || '',
      uploadMode:             cfg.uploadMode,
      audioInput:             cfg.audioInput,
      audioOutput:            cfg.audioOutput,
      ttsVoice:               cfg.ttsVoice,
      audioStudentOptions:    cfg.audioStudentOptions,
      mathMode:               cfg.mathMode,
      chatTemperature:        act?.chat_temperature           ?? null,
      erfahrungsprompt:       erf?.content                    || '',
      model:                  cfg.model,
      effectiveModel:         getEffectiveModel(activityId),
      assistModel:            act?.assist_model               ?? null,
      assistTemperature:      act?.assist_temperature         ?? null,
      effectiveAssistModel:   getEffectiveAssistModel(activityId),
      availableModels:        getAvailableModels(),
      availableBotIcons:      getAvailableBotIcons(),
      preferSuggestQuestions: pref?.prefer_suggest_questions  ?? 1,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode, audioOutput, ttsVoice, audioStudentOptions);
    if (validErr) return res.status(400).json({ error: validErr });
    const tempErr = validateChatTemperature(chatTemperature);
    if (tempErr) return res.status(400).json({ error: tempErr });
    const availableModels = getAvailableModels();
    const validModel = (!model || model === '') ? null : (availableModels.includes(model) ? model : null);
    if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
    const assistModelErr = validateAssistModel(assistModel, availableModels);
    if (assistModelErr) return res.status(400).json({ error: assistModelErr });
    const validAssistModel = (!assistModel || assistModel === '') ? null : assistModel;
    const validTemp = (chatTemperature === null || chatTemperature === undefined || chatTemperature === '') ? null : Number(chatTemperature);
    const configUpdate = { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel, mathMode };
    if ('chatTemperature' in req.body) configUpdate.chatTemperature = validTemp;
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
