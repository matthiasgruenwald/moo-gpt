import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getAllPersonasForUser, getGlobalPersonas } from '../stores/persona.js';
import { getCriteria, getErkenntnisse } from '../stores/criteria.js';
import { runSimulation, runOneClickOptimization } from '../simulation.js';
import { generateOptimizeProposal } from '../optimize.js';
import { getFeedbackByActivity } from '../stores/feedback.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';
import { GEN_MODEL } from '../env-config.js';
import { recordWerkzeugUsage } from '../cost-service.js';

const router = Router();

router.post('/simulate', requireDashboardAuth, async (req, res) => {
  const { activityId, userId } = req;
  const { personaId, utteranceModel, evalModel } = req.body;
  const personas = userId ? getAllPersonasForUser(userId) : getGlobalPersonas();
  const persona  = personas.find(p => p.id === parseInt(personaId));
  if (!persona) return res.status(400).json({ error: 'Persona nicht gefunden' });

  const criteria         = getCriteria(activityId);
  const erfahrungsprompt = getActiveErfahrungsprompt(activityId);

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    const uModel = utteranceModel || GEN_MODEL;
    const eModel = evalModel      || GEN_MODEL;
    const total  = 4;
    console.log(`[Simulate] Start für ${activityId}, Persona: ${persona.name}, utteranceModel: ${uModel}, evalModel: ${eModel}`);

    sendEvent('start', { total, personaName: persona.name });
    sendEvent('progress', { label: 'Simulation läuft, dauert typischerweise 30–60 Sekunden…' });

    const { pairs, simResultsText, totalUsage } = await runSimulation({
      persona,
      config:           getCachedConfig(),
      erfahrungsprompt: erfahrungsprompt?.content || '',
      criteria,
      models:           { utteranceModel: uModel, evalModel: eModel },
      aiClient,
      onPair: (pair, index) => sendEvent('pair', { index, pair, personaName: persona.name }),
    });

    recordWerkzeugUsage(activityId, 'simulation', GEN_MODEL, totalUsage);
    console.log(`[Simulate] ${pairs.length} Paare abgeschlossen, generiere Erfahrungsprompt-Vorschlag`);

    sendEvent('progress', { label: 'Generiere Erfahrungsprompt-Vorschlag…' });

    try {
      const erkenntnisse = getErkenntnisse(activityId);
      const feedbacks    = getFeedbackByActivity(activityId);
      const suggestion = await generateOptimizeProposal({
        erfahrungsprompt: erfahrungsprompt?.content || null,
        erkenntnisse,
        feedbacks,
        simResultsText,
        config: getCachedConfig(),
        aiClient,
      });
      sendEvent('suggestion', suggestion);
      console.log(`[Simulate] Erfahrungsprompt-Vorschlag gesendet`);
    } catch (optErr) {
      console.warn('[Simulate] Optimize-Vorschlag fehlgeschlagen:', optErr.message);
    }

    sendEvent('done', { personaName: persona.name });
  } catch (e) {
    console.error('[Simulate] Fehler:', e);
    sendEvent('error', { message: e.message });
  }

  res.end();
});

router.post('/one-click-optimize', requireDashboardAuth, async (req, res) => {
  const { activityId, userId } = req;
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    await runOneClickOptimization({
      activityId,
      userId,
      aiClient,
      onProgress: sendEvent,
      genModel: GEN_MODEL,
    });
  } catch (e) {
    console.error('[OneClick] Fehler:', e);
    sendEvent('error', { message: e.message });
  }

  res.end();
});

export default router;
