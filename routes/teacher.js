import { Router } from 'express';
import { requireTeacherAuth } from '../auth-middleware.js';
import {
  getTeacherPreference, setTeacherPreference,
  getTeacherTemplates, createTeacherTemplate, updateTeacherTemplate,
  deleteTeacherTemplate, setTeacherTemplateDefault,
} from '../stores/teacher.js';
import { getAvailableModels } from '../env-config.js';
import { validateWidgetConfig, validateAssistModel, validateChatTemperature } from '../validators.js';

const router = Router();

router.get('/teacher/preferences', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const pref = getTeacherPreference(userId);
  res.json({ myModel: pref?.preferred_model || null, availableModels: getAvailableModels() });
});

router.put('/teacher/preferences', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { model } = req.body;
  const validModel = (!model || model === '') ? null : (getAvailableModels().includes(model) ? model : null);
  if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
  setTeacherPreference(userId, validModel);
  console.log(`[Teacher] ${userId} setzt Modell-Präferenz: ${validModel || 'Standard'}`);
  res.json({ ok: true, myModel: validModel });
});

router.get('/teacher/templates', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const templates = getTeacherTemplates(userId).map(tpl => ({
    ...tpl,
    mathMode: tpl.math_mode ?? 'off',
  }));
  res.json({ templates });
});

router.post('/teacher/templates', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { name, title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode);
  if (validErr) return res.status(400).json({ error: validErr });
  const tempErr = validateChatTemperature(chatTemperature);
  if (tempErr) return res.status(400).json({ error: tempErr });
  const availableModels = getAvailableModels();
  const validModel = (!model || model === '') ? null : (availableModels.includes(model) ? model : null);
  const assistModelErr = validateAssistModel(assistModel, availableModels);
  if (assistModelErr) return res.status(400).json({ error: assistModelErr });
  const validAssistModel = (!assistModel || assistModel === '') ? null : assistModel;
  const validAssistTemperature = (assistTemperature === null || assistTemperature === undefined || assistTemperature === '')
    ? null
    : Math.min(1, Math.max(0, Number(assistTemperature)));
  const validTemp = (chatTemperature === null || chatTemperature === undefined || chatTemperature === '') ? null : Number(chatTemperature);
  const id = createTeacherTemplate(userId, { name: name.trim(), title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel, mathMode, assistModel: validAssistModel, assistTemperature: validAssistTemperature, chatTemperature: validTemp });
  res.json({ ok: true, id });
});

router.put('/teacher/templates/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const { name, title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model, mathMode, assistModel, assistTemperature, chatTemperature } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const validErr = validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode);
  if (validErr) return res.status(400).json({ error: validErr });
  const tempErr = validateChatTemperature(chatTemperature);
  if (tempErr) return res.status(400).json({ error: tempErr });
  const availableModels2 = getAvailableModels();
  const validModel = (!model || model === '') ? null : (availableModels2.includes(model) ? model : null);
  const assistModelErr = validateAssistModel(assistModel, availableModels2);
  if (assistModelErr) return res.status(400).json({ error: assistModelErr });
  const validAssistModel = (!assistModel || assistModel === '') ? null : assistModel;
  const validAssistTemperature = (assistTemperature === null || assistTemperature === undefined || assistTemperature === '')
    ? null
    : Math.min(1, Math.max(0, Number(assistTemperature)));
  const validTemp = (chatTemperature === null || chatTemperature === undefined || chatTemperature === '') ? null : Number(chatTemperature);
  updateTeacherTemplate(id, userId, { name: name.trim(), title, botIcon, opener, uploadMode, hintsTemplate, audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel, mathMode, assistModel: validAssistModel, assistTemperature: validAssistTemperature, chatTemperature: validTemp });
  res.json({ ok: true });
});

router.delete('/teacher/templates/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  deleteTeacherTemplate(id, userId);
  res.json({ ok: true });
});

router.put('/teacher/templates/:id/set-default', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  setTeacherTemplateDefault(id, userId);
  res.json({ ok: true });
});

export default router;
