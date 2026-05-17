import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion,
  saveErkenntnisse, saveFeedback, getFeedbackByActivity,
} from '../db.js';
import { suggestCriteriaList } from '../criteria.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';

const router = Router();

router.get('/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

router.post('/criteria-suggest/:activityId', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const suggestions = await suggestCriteriaList(activityId, getCachedConfig(), req.body.genModel, aiClient);
    res.json({ suggestions });
  } catch (e) {
    console.error('[Criteria] Suggest-Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content fehlt' });
  saveErkenntnisse(activityId, content, 'criteria');
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.delete('/criteria/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  softDeleteCriterion(parseInt(req.params.id));
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.patch('/criteria/:id/restore', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  restoreCriterion(parseInt(req.params.id));
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.post('/erkenntnisse', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items-Array fehlt' });
  for (const item of items) {
    const text = [item.problem, item.ursache, item.aenderung].filter(Boolean).join(' → ');
    if (text) saveErkenntnisse(activityId, text, 'ai');
  }
  res.json({ ok: true, saved: items.length });
});

router.post('/feedback', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { messageId, threadId, rating, comment, improvedText } = req.body;
  if (!messageId || !['gut', 'schlecht'].includes(rating))
    return res.status(400).json({ error: 'messageId und rating (gut|schlecht) erforderlich' });
  try {
    saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy: userId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Feedback] Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.get('/feedback/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  try {
    res.json({ feedback: getFeedbackByActivity(activityId) });
  } catch (e) {
    console.error('[Feedback] Ladefehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

export default router;
