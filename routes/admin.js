import { Router } from 'express';
import { execFileSync, execFile } from 'child_process';
import { requireAdminAuth, requireTeacherAuth } from '../auth-middleware.js';
import { isAdmin, addAdmin, removeAdmin, getAdmins } from '../stores/admin.js';
import { saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry } from '../stores/prompt.js';
import { getSystemTemplate, setSystemTemplate } from '../stores/teacher.js';
import { getCachedConfig, updateCachedConfig } from '../config-cache.js';
import { AVAILABLE_MODELS, GEN_MODELS } from '../env-config.js';
import { validateWidgetConfig } from '../validators.js';

export function createAdminRouter({ dashboardRegistry }) {
  const router = Router();

  router.get('/admin/config', requireTeacherAuth, (req, res) => {
    const { userId } = req;
    const config = getCachedConfig();
    res.json({
      systemPrompt:    config.content,
      model:           config.model,
      availableModels: AVAILABLE_MODELS,
      genModels:       GEN_MODELS,
      isAdmin:         isAdmin(userId),
    });
  });

  router.put('/admin/config', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { systemPrompt, model } = req.body;
    if (typeof systemPrompt !== 'string') return res.status(400).json({ error: 'systemPrompt fehlt' });
    if (!model || !AVAILABLE_MODELS.includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });
    saveSystemPrompt(systemPrompt, model, userId);
    updateCachedConfig(systemPrompt, model);
    dashboardRegistry.broadcastAll({ type: 'configUpdated', model, updatedBy: userId });
    console.log(`[Admin] Systemprompt + Modell gespeichert von ${userId}, Modell: ${model}`);
    res.json({ ok: true });
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
      title:         tpl?.title          ?? '',
      botIcon:       tpl?.bot_icon       ?? 'grw',
      opener:        tpl?.opener         ?? '',
      uploadMode:    tpl?.upload_mode    ?? 'off',
      hintsTemplate: tpl?.hints_template ?? '',
    });
  });

  router.put('/admin/system-template', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon);
    if (validErr) return res.status(400).json({ error: validErr });
    setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate });
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

  return router;
}
