import { Router } from 'express';
import { execFileSync, execFile } from 'child_process';
import { requireAdminAuth, requireTeacherAuth } from '../auth-middleware.js';
import { isAdmin, addAdmin, removeAdmin, getAdmins } from '../stores/admin.js';
import { saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry } from '../stores/prompt.js';
import { getSystemTemplate, setSystemTemplate } from '../stores/teacher.js';
import { getCachedConfig, updateCachedConfig } from '../stores/prompt.js';
import { getAvailableModels, getAvailableBotIcons, GEN_MODELS } from '../env-config.js';
import { getAdminConfig, setAdminConfig, deleteAdminConfig } from '../stores/admin-config.js';
import { validateWidgetConfig, validateAssistModel, validateChatTemperature, validateAssistTemperature, normalizeTemperature } from '../validators.js';

// 1-Stunden-Cache für die OpenAI-Modellliste
let openaiModelsCache = null;
let openaiModelsCachedAt = 0;
const OPENAI_MODELS_TTL_MS = 60 * 60 * 1000;

export function createAdminRouter({ dashboardRegistry, oai: oaiOverride } = {}) {
  const router = Router();

  router.get('/admin/config', requireTeacherAuth, (req, res) => {
    const { userId } = req;
    const config = getCachedConfig();
    res.json({
      systemPrompt:      config.content,
      model:             config.model,
      availableModels:   getAvailableModels(),
      availableBotIcons: getAvailableBotIcons(),
      genModels:         GEN_MODELS,
      isAdmin:           isAdmin(userId),
    });
  });

  router.put('/admin/config', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { systemPrompt, model } = req.body;
    if (typeof systemPrompt !== 'string') return res.status(400).json({ error: 'systemPrompt fehlt' });
    if (!model || !getAvailableModels().includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });
    saveSystemPrompt(systemPrompt, model, userId);
    updateCachedConfig(systemPrompt, model);
    dashboardRegistry.broadcastAll({ type: 'configUpdated', model, updatedBy: userId });
    console.log(`[Admin] Systemprompt + Modell gespeichert von ${userId}, Modell: ${model}`);
    res.json({ ok: true });
  });

  // POST /admin/config — speichert available_models und/oder available_bot_icons in admin_config-Tabelle
  router.post('/admin/config', requireAdminAuth, (req, res) => {
    const { available_models, available_bot_icons } = req.body;

    if (available_models !== undefined) {
      if (!Array.isArray(available_models)) {
        return res.status(400).json({ error: 'available_models muss ein Array sein' });
      }
      const models = available_models.map(m => String(m).trim()).filter(Boolean);
      setAdminConfig('available_models', JSON.stringify(models));
      console.log(`[Admin] available_models gespeichert: ${models.join(', ')}`);
    }

    if (available_bot_icons !== undefined) {
      if (!Array.isArray(available_bot_icons)) {
        return res.status(400).json({ error: 'available_bot_icons muss ein Array sein' });
      }
      const icons = available_bot_icons.map(b => String(b).trim()).filter(Boolean);
      if (icons.length === 0) {
        return res.status(400).json({ error: 'Mindestens ein Bot-Icon muss gesetzt sein' });
      }
      setAdminConfig('available_bot_icons', JSON.stringify(icons));
      console.log(`[Admin] available_bot_icons gespeichert: ${icons.join(', ')}`);
    }

    if (available_models === undefined && available_bot_icons === undefined) {
      return res.status(400).json({ error: 'available_models muss ein Array sein' });
    }

    res.json({ ok: true });
  });

  // GET /admin/openai-models — ruft OpenAI-Modellliste ab (1h gecacht)
  router.get('/admin/openai-models', requireAdminAuth, async (req, res) => {
    const now = Date.now();
    if (openaiModelsCache && (now - openaiModelsCachedAt) < OPENAI_MODELS_TTL_MS) {
      return res.json({ models: openaiModelsCache, cached: true });
    }
    try {
      let oaiInstance = oaiOverride;
      if (!oaiInstance) {
        const { oai } = await import('../ai-instance.js');
        oaiInstance = oai;
      }
      const response = await oaiInstance.models.list();
      const models = response.data.map(m => m.id).sort();
      openaiModelsCache = models;
      openaiModelsCachedAt = now;
      res.json({ models, cached: false });
    } catch (e) {
      res.status(500).json({ error: `OpenAI-Modellliste konnte nicht geladen werden: ${e.message}` });
    }
  });

  router.get('/admin/prompt-history', requireAdminAuth, (req, res) => {
    res.json({ history: getPromptHistory() });
  });

  router.delete('/admin/prompt-history/:id', requireAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Ungültige ID' });
    const result = deletePromptHistoryEntry(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, history: getPromptHistory() });
  });

  router.get('/admin/admins', requireAdminAuth, (req, res) => {
    res.json({ admins: getAdmins() });
  });

  router.post('/admin/admins', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { newUserId } = req.body;
    if (!newUserId || typeof newUserId !== 'string') return res.status(400).json({ error: 'newUserId fehlt' });
    addAdmin(newUserId.trim(), userId);
    console.log(`[Admin] ${newUserId} als Admin eingetragen von ${userId}`);
    res.json({ ok: true, admins: getAdmins() });
  });

  router.delete('/admin/admins/:targetId', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const targetId = req.params.targetId;
    if (targetId === userId) return res.status(400).json({ error: 'Eigene Admin-Rechte nicht entziehbar' });
    removeAdmin(targetId);
    console.log(`[Admin] ${targetId} als Admin entfernt von ${userId}`);
    res.json({ ok: true, admins: getAdmins() });
  });

  router.get('/admin/system-template', requireTeacherAuth, (req, res) => {
    const tpl = getSystemTemplate();
    res.json({
      title:               tpl?.title                ?? '',
      botIcon:             tpl?.bot_icon             ?? 'grwdev',
      opener:              tpl?.opener               ?? '',
      uploadMode:          tpl?.upload_mode          ?? 'off',
      hintsTemplate:       tpl?.hints_template       ?? '',
      audioInput:          tpl?.audio_input          ?? 'off',
      audioOutput:         tpl?.audio_output         ?? 'off',
      ttsVoice:            tpl?.tts_voice            ?? 'nova',
      audioStudentOptions: tpl?.audio_student_options ?? 'off',
      mathMode:            tpl?.math_mode            ?? 'off',
      model:               tpl?.model               ?? null,
      assistModel:         tpl?.assist_model         ?? null,
      assistTemperature:   tpl?.assist_temperature   ?? null,
      chatTemperature:     tpl?.chat_temperature     ?? null,
    });
  });

  router.put('/admin/system-template', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode);
    if (validErr) return res.status(400).json({ error: validErr });
    const tempErr = validateChatTemperature(chatTemperature);
    if (tempErr) return res.status(400).json({ error: tempErr });
    const availableModels = getAvailableModels();
    const validModel = (!model || model === '') ? null : (availableModels.includes(model) ? model : null);
    const assistModelErr = validateAssistModel(assistModel, availableModels);
    if (assistModelErr) return res.status(400).json({ error: assistModelErr });
    const validAssistModel = (!assistModel || assistModel === '') ? null : assistModel;
    const assistTempErr = validateAssistTemperature(assistTemperature);
    if (assistTempErr) return res.status(400).json({ error: assistTempErr });
    const validAssistTemperature = normalizeTemperature(assistTemperature);
    const validTemp = normalizeTemperature(chatTemperature);
    setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel, mathMode, assistModel: validAssistModel, assistTemperature: validAssistTemperature, chatTemperature: validTemp });
    console.log(`[P5b] Systemvorlage gespeichert von ${userId}`);
    res.json({ ok: true });
  });

  router.get('/admin/logs', requireAdminAuth, (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.n) || 100, 1), 2000);
    try {
      const out = execFileSync(
        'journalctl',
        ['-u', 'moo-gpt', '-n', String(n), '--no-pager', '--output=short-iso'],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      res.json({ lines: out.split('\n').filter(l => l.length > 0) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/restart', requireAdminAuth, (req, res) => {
    res.json({ ok: true });
    setTimeout(() => execFile('systemctl', ['restart', 'moo-gpt'], () => {}), 500);
  });

  // GET /admin/config/tool-models — liest die vier Werkzeug-Modell-Schlüssel aus admin_config
  router.get('/admin/config/tool-models', requireAdminAuth, (req, res) => {
    const KEYS = {
      genModel:           'gen_model',
      ttsPrepModel:       'tts_prep_model',
      ttsModel:           'tts_model',
      transcriptionModel: 'transcription_model',
    };
    const result = {};
    for (const [field, key] of Object.entries(KEYS)) {
      result[field] = getAdminConfig(key) ?? '';
    }
    res.json(result);
  });

  // PUT /admin/config/tool-models — speichert / löscht die vier Werkzeug-Modell-Schlüssel
  router.put('/admin/config/tool-models', requireAdminAuth, (req, res) => {
    const KEYS = {
      genModel:           'gen_model',
      ttsPrepModel:       'tts_prep_model',
      ttsModel:           'tts_model',
      transcriptionModel: 'transcription_model',
    };
    for (const [field, key] of Object.entries(KEYS)) {
      if (!(field in req.body)) continue;
      const value = String(req.body[field] ?? '').trim();
      if (value === '') {
        deleteAdminConfig(key);
      } else {
        setAdminConfig(key, value);
      }
    }
    res.json({ ok: true });
  });

  return router;
}
