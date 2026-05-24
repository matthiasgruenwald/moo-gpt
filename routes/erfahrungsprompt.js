import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getActiveErfahrungsprompt, saveErfahrungsprompt,
  getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry,
} from '../stores/prompt.js';
import { getErkenntnisse } from '../stores/criteria.js';
import { getFeedbackByActivity } from '../stores/feedback.js';
import { generateOptimizeProposal } from '../optimize.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';
import { recordWerkzeugUsage } from '../cost-service.js';

const router = Router();

router.get('/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const erf = getActiveErfahrungsprompt(activityId);
  res.json({ content: erf?.content || '', version: erf?.version || 0 });
});

router.post('/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content fehlt' });
  saveErfahrungsprompt(activityId, content, userId);
  console.log(`[Erfahrungsprompt] Gespeichert für ${activityId} von ${userId}`);
  res.json({ ok: true });
});

router.get('/erfahrungsprompt-history/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ history: getErfahrungspromptHistory(activityId) });
});

router.delete('/erfahrungsprompt-history/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deleteErfahrungspromptHistoryEntry(activityId, id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getErfahrungspromptHistory(activityId) });
});

router.post('/optimize-prompt', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const erf          = getActiveErfahrungsprompt(activityId);
    const erkenntnisse = getErkenntnisse(activityId);
    const feedbacks    = getFeedbackByActivity(activityId);
    const config       = getCachedConfig();
    const result = await generateOptimizeProposal({
      erfahrungsprompt: erf?.content || null,
      erkenntnisse,
      feedbacks,
      simResultsText: '',
      config,
      aiClient,
    });
    recordWerkzeugUsage(activityId, 'optimize', config.model, result.usage);
    console.log(`[Optimize] Vorschlag für ${activityId} generiert (${result.kausalkette.length} Kausalketten-Einträge)`);
    const { usage: _usage, ...resultWithoutUsage } = result;
    res.json({
      ...resultWithoutUsage,
      cost: { promptTokens: result.usage?.input_tokens ?? null, completionTokens: result.usage?.output_tokens ?? null },
    });
  } catch (e) {
    console.error('[Optimize] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
