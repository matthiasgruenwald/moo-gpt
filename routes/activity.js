import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { setWidgetConfig } from '../stores/widget-config.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
import { getAvailableModels, getAvailableBotIcons } from '../env-config.js';
import { validateWidgetConfig, sanitizeWidgetConfig, validateChatTemperature, validateAssistTemperature } from '../validators.js';
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
      // effectiveModel/effectiveAssistModel come from resolveWidgetConfig (ADR 0008):
      // the single cascade seam that honours activity → teacher template → system template.
      effectiveModel:         cfg.model,
      assistModel:            act?.assist_model               ?? null,
      assistTemperature:      act?.assist_temperature         ?? null,
      effectiveAssistModel:   cfg.assistModel,
      availableModels:        getAvailableModels(),
      availableBotIcons:      getAvailableBotIcons(),
      preferSuggestQuestions: pref?.prefer_suggest_questions  ?? 1,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice,
      audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature } = req.body;

    const availableModels = getAvailableModels();
    const validErr = validateWidgetConfig(req.body, { availableModels });
    if (validErr) return res.status(400).json({ error: validErr });

    const tempErr = validateChatTemperature(chatTemperature);
    if (tempErr) return res.status(400).json({ error: tempErr });

    if ('assistTemperature' in req.body) {
      const assistTempErr = validateAssistTemperature(assistTemperature);
      if (assistTempErr) return res.status(400).json({ error: assistTempErr });
    }

    const sanitized = sanitizeWidgetConfig(
      { opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice,
        audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature },
      { availableModels }
    );

    const configUpdate = {
      opener: sanitized.opener,
      uploadMode: sanitized.uploadMode,
      title: sanitized.title,
      botIcon: sanitized.botIcon,
      audioInput: sanitized.audioInput,
      audioOutput: sanitized.audioOutput,
      ttsVoice: sanitized.ttsVoice,
      audioStudentOptions: sanitized.audioStudentOptions,
      model: sanitized.model,
      mathMode: sanitized.mathMode,
    };
    if ('chatTemperature' in req.body)    configUpdate.chatTemperature    = sanitized.chatTemperature;
    if ('assistModel' in req.body)        configUpdate.assistModel        = sanitized.assistModel;
    if ('assistTemperature' in req.body)  configUpdate.assistTemperature  = sanitized.assistTemperature;

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
