import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import {
  getAllPersonasForUser, getGlobalPersonas, getTeacherPersonas,
  getCriteria, saveErkenntnisse,
} from '../db.js';
import { runSimulation } from '../simulation.js';
import { generateOptimizeProposal } from '../optimize.js';
import { augmentCriteria } from '../criteria.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';
import { GEN_MODEL } from '../env-config.js';

const ONE_CLICK_FALLBACK_NAMES = ['Der Musterschüler', 'Der Stille', 'Die Pragmatikerin', 'Der Zweifler'];

function selectPersonasForOneClick(userId, count = 4) {
  const own    = getTeacherPersonas(userId);
  const global = getGlobalPersonas();

  function selectDiverse(pool, n) {
    if (pool.length <= n) return [...pool];
    const words   = p => new Set((p.description || p.name).toLowerCase().split(/\W+/).filter(Boolean));
    const overlap = (a, b) => {
      const wa = words(a), wb = words(b);
      let common = 0;
      wa.forEach(w => { if (wb.has(w)) common++; });
      return common / Math.max(wa.size, wb.size, 1);
    };
    const selected = [pool[0]];
    while (selected.length < n) {
      let best = null, bestScore = Infinity;
      for (const p of pool) {
        if (selected.includes(p)) continue;
        const score = Math.max(...selected.map(s => overlap(p, s)));
        if (score < bestScore) { bestScore = score; best = p; }
      }
      if (!best) break;
      selected.push(best);
    }
    return selected;
  }

  const chosen = selectDiverse(own, count);

  if (chosen.length < count) {
    const fallbacks = ONE_CLICK_FALLBACK_NAMES
      .map(name => global.find(p => p.name === name))
      .filter(Boolean)
      .filter(p => !chosen.find(c => c.id === p.id));
    for (const p of fallbacks) {
      if (chosen.length >= count) break;
      chosen.push(p);
    }
    for (const p of global) {
      if (chosen.length >= count) break;
      if (!chosen.find(c => c.id === p.id)) chosen.push(p);
    }
  }

  return chosen.slice(0, count);
}

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

    const { pairs, simResultsText } = await runSimulation({
      persona,
      config:           getCachedConfig(),
      erfahrungsprompt: erfahrungsprompt?.content || '',
      criteria,
      models:           { utteranceModel: uModel, evalModel: eModel },
      aiClient,
    });

    console.log(`[Simulate] ${pairs.length} Paare abgeschlossen, generiere Erfahrungsprompt-Vorschlag`);
    for (let i = 0; i < pairs.length; i++) {
      sendEvent('pair', { index: i, pair: pairs[i], personaName: persona.name });
    }

    sendEvent('progress', { label: 'Generiere Erfahrungsprompt-Vorschlag…' });

    try {
      const suggestion = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
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
    const existing    = getCriteria(activityId);
    const newCriteria = await augmentCriteria(activityId, existing, getCachedConfig(), aiClient);
    for (const c of newCriteria) saveErkenntnisse(activityId, c, 'criteria');
    sendEvent('criteria', { added: newCriteria.length, total: existing.length + newCriteria.length });
    console.log(`[OneClick] Kriterien: ${existing.length} vorhanden, ${newCriteria.length} ergänzt`);

    const personas = selectPersonasForOneClick(userId);
    if (!personas.length) throw new Error('Keine Personas verfügbar');
    sendEvent('personas', { selected: personas.map(p => p.name) });
    console.log(`[OneClick] Personas: ${personas.map(p => p.name).join(', ')}`);

    const currentCriteria  = getCriteria(activityId);
    const erfahrungsprompt = getActiveErfahrungsprompt(activityId);
    const allPairs         = [];
    const total            = personas.length * 4;
    let   pairsEmitted     = 0;

    sendEvent('sim_start', { total });

    await Promise.allSettled(personas.map(async (persona) => {
      let result;
      try {
        result = await runSimulation({
          persona,
          config:           getCachedConfig(),
          erfahrungsprompt: erfahrungsprompt?.content || '',
          criteria:         currentCriteria,
          models:           { utteranceModel: GEN_MODEL, evalModel: GEN_MODEL },
          aiClient,
        });
      } catch (e) {
        console.warn(`[OneClick] Simulation fehlgeschlagen für ${persona.name}:`, e.message);
        return;
      }
      for (let i = 0; i < result.pairs.length; i++) {
        const pair = result.pairs[i];
        allPairs.push({ personaName: persona.name, pair });
        pairsEmitted++;
        sendEvent('sim_pair', { personaName: persona.name, index: i, pair, emitted: pairsEmitted, total });
      }
    }));

    if (allPairs.length === 0) throw new Error('Alle Simulationen fehlgeschlagen – bitte erneut versuchen.');
    console.log(`[OneClick] ${allPairs.length} Paare simuliert, generiere Vorschlag`);

    const simResultsText = allPairs.map(r =>
      `[${r.personaName}] ${r.pair.utterance}\n` +
      `KI-Antwort: ${r.pair.aiResponse.slice(0, 400)}\n` +
      `Bewertung: ${r.pair.evaluation.overall} (Score ${r.pair.evaluation.score}/5) – ${r.pair.evaluation.summary || ''}`
    ).join('\n---\n');

    const proposal = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
    sendEvent('optimize_done', proposal);
    console.log(`[OneClick] Fertig für ${activityId}`);

  } catch (e) {
    console.error('[OneClick] Fehler:', e);
    sendEvent('error', { message: e.message });
  }

  res.end();
});

export default router;
