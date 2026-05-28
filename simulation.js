import { buildInstructions } from './prompt-builder.js';
import { getTeacherPersonas, getGlobalPersonas } from './stores/persona.js';
import { augmentCriteria } from './criteria.js';
import { getCriteria, saveErkenntnisse, getErkenntnisse } from './stores/criteria.js';
import { getFeedbackByActivity } from './stores/feedback.js';
import { getActiveErfahrungsprompt } from './stores/prompt.js';
import { generateOptimizeProposal } from './optimize.js';
import { getCachedConfig } from './stores/prompt.js';
import { recordWerkzeugUsage } from './cost-service.js';

const SIMULATION_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Persona-Auswahl (war persona-selector.js)
// ---------------------------------------------------------------------------

const ONE_CLICK_FALLBACK_NAMES = ['Der Musterschüler', 'Der Stille', 'Die Pragmatikerin', 'Der Zweifler'];

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

export function selectPersonasForOneClick(userId, count = 4) {
  const own    = getTeacherPersonas(userId);
  const global = getGlobalPersonas();

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

async function generateSimulatedUtterances(persona, count, model, aiClient) {
  const { text, usage } = await aiClient.jsonCall(
    `Du simulierst Schüleräußerungen für Prompt-Engineering-Tests an einer IGS (Klasse 9).
Generiere exakt ${count} kurze Schüleräußerungen für den beschriebenen Schüler-Typ.
Antworte NUR mit einem JSON-Array von Strings: ["Äußerung 1", "Äußerung 2", ...]`,
    `Schüler-Typ: ${persona.name}\nBeschreibung: ${persona.description || '–'}\n` +
    (persona.example_msgs ? `Typische Formulierungen: ${persona.example_msgs}` : ''),
    model,
    { timeout: SIMULATION_TIMEOUT_MS }
  );
  return { text, usage };
}

async function generateAIResponse(config, erfahrungContent, utterance, aiClient) {
  const instructions = buildInstructions({ systemContent: config.content, erfahrungContent });
  const { text, usage } = await aiClient.textCall(instructions, utterance, config.model, { timeout: SIMULATION_TIMEOUT_MS });
  return { text, usage };
}

async function evaluateResponse(utterance, aiResponse, criteria, model, aiClient) {
  const criteriaText = criteria.length
    ? criteria.map(c => `- ${c.content}`).join('\n')
    : '- Gibt keine fertigen Lösungen\n- Stellt Rückfragen\n- Fördert eigenständiges Denken';

  const { text, usage } = await aiClient.jsonCall(
    `Du bewertest KI-Antworten nach pädagogischen Kriterien.
Antworte AUSSCHLIESSLICH mit validem JSON (keine Markdown-Blöcke):
{
  "overall": "gut|gemischt|problematisch",
  "score": 1-5,
  "highlights": [{ "quote": "exakter Wortlaut aus der KI-Antwort", "type": "gut|schlecht", "reason": "Begründung" }],
  "summary": "Kurzes Gesamturteil"
}
Wähle nur Highlights deren Wortlaut EXAKT so in der KI-Antwort steht.`,
    `Kriterien:\n${criteriaText}\n\nSchüler-Äußerung: ${utterance}\n\nKI-Antwort:\n${aiResponse}`,
    model,
    { timeout: SIMULATION_TIMEOUT_MS }
  );
  return { text, usage };
}

export async function runSimulation({ persona, config, erfahrungsprompt, criteria, models, aiClient, onPair }) {
  const { utteranceModel, evalModel } = models;
  const count = 4;

  // Akkumulierter Token-Verbrauch aller AI-Calls dieser Simulation
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  function accUsage(usage) {
    if (!usage) return;
    totalUsage.input_tokens  += usage.input_tokens  ?? 0;
    totalUsage.output_tokens += usage.output_tokens ?? 0;
  }

  const { text: utterancesText, usage: utteranceUsage } =
    await generateSimulatedUtterances(persona, count, utteranceModel, aiClient);
  accUsage(utteranceUsage);

  const pairs = [];
  for (const utterance of utterancesText) {
    const { text: aiResponseText, usage: responseUsage } =
      await generateAIResponse(config, erfahrungsprompt, utterance, aiClient);
    accUsage(responseUsage);

    let evaluation;
    try {
      const { text: evalText, usage: evalUsage } =
        await evaluateResponse(utterance, aiResponseText, criteria, evalModel, aiClient);
      accUsage(evalUsage);
      evaluation = evalText;
    } catch (_) {
      evaluation = { overall: 'gemischt', score: 3, highlights: [], summary: 'Evaluierung nicht möglich.' };
    }
    const pair = { utterance, aiResponse: aiResponseText, evaluation };
    pairs.push(pair);
    onPair?.(pair, pairs.length - 1);
  }

  const simResultsText = pairs.map((r, i) =>
    `Äußerung ${i + 1}: ${r.utterance}\n` +
    `KI-Antwort: ${r.aiResponse.slice(0, 400)}\n` +
    `Bewertung: ${r.evaluation.overall} (Score ${r.evaluation.score}/5) – ${r.evaluation.summary || ''}`
  ).join('\n---\n');

  return { pairs, simResultsText, totalUsage };
}

// ---------------------------------------------------------------------------
// One-Click-Orchestrierung
// ---------------------------------------------------------------------------

/**
 * Orchestriert die komplette One-Click-Optimierung ohne HTTP-Kenntnisse.
 * onProgress(type, data) — Route mapped das 1:1 auf sendEvent(type, data).
 * genModel — Modell für Äußerungs- und Evaluierungscalls (default: gpt-4.1-nano).
 * Wirft Error wenn alle Simulationen fehlschlagen oder keine Personas verfügbar.
 */
export async function runOneClickOptimization({ activityId, userId, aiClient, onProgress, genModel = 'gpt-4.1-nano' }) {
  const existing    = getCriteria(activityId);
  const erf         = getActiveErfahrungsprompt(activityId);
  const newCriteria = await augmentCriteria({
    config: getCachedConfig(),
    erfahrungsprompt: erf?.content || null,
    existingCriteria: existing,
    aiClient,
  });
  for (const c of newCriteria) saveErkenntnisse(activityId, c, 'criteria');
  onProgress('criteria', { added: newCriteria.length, total: existing.length + newCriteria.length });
  console.log(`[OneClick] Kriterien: ${existing.length} vorhanden, ${newCriteria.length} ergänzt`);

  const personas = selectPersonasForOneClick(userId);
  if (!personas.length) throw new Error('Keine Personas verfügbar');
  onProgress('personas', { selected: personas.map(p => p.name) });
  console.log(`[OneClick] Personas: ${personas.map(p => p.name).join(', ')}`);

  const currentCriteria = getCriteria(activityId);
  const allPairs        = [];
  const total           = personas.length * 4;
  let   pairsEmitted    = 0;

  onProgress('sim_start', { total });

  await Promise.allSettled(personas.map(async (persona) => {
    try {
      const { totalUsage: simUsage } = await runSimulation({
        persona,
        config:           getCachedConfig(),
        erfahrungsprompt: erf?.content || '',
        criteria:         currentCriteria,
        models:           { utteranceModel: genModel, evalModel: genModel },
        aiClient,
        onPair: (pair, index) => {
          allPairs.push({ personaName: persona.name, pair });
          pairsEmitted++;
          onProgress('sim_pair', { personaName: persona.name, index, pair, emitted: pairsEmitted, total });
        },
      });
      recordWerkzeugUsage(activityId, 'simulation', genModel, simUsage);
    } catch (e) {
      console.warn(`[OneClick] Simulation fehlgeschlagen für ${persona.name}:`, e.message);
    }
  }));

  if (allPairs.length === 0) throw new Error('Alle Simulationen fehlgeschlagen – bitte erneut versuchen.');
  console.log(`[OneClick] ${allPairs.length} Paare simuliert, generiere Vorschlag`);

  const simResultsText = allPairs.map(r =>
    `[${r.personaName}] ${r.pair.utterance}\n` +
    `KI-Antwort: ${r.pair.aiResponse.slice(0, 400)}\n` +
    `Bewertung: ${r.pair.evaluation.overall} (Score ${r.pair.evaluation.score}/5) – ${r.pair.evaluation.summary || ''}`
  ).join('\n---\n');

  const erkenntnisse = getErkenntnisse(activityId);
  const feedbacks    = getFeedbackByActivity(activityId);
  const proposal     = await generateOptimizeProposal({
    erfahrungsprompt: erf?.content || null,
    erkenntnisse,
    feedbacks,
    simResultsText,
    config: getCachedConfig(),
    aiClient,
  });
  onProgress('optimize_done', proposal);
  console.log(`[OneClick] Fertig für ${activityId}`);
}
