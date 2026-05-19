import { buildInstructions } from './prompt-builder.js';

const SIMULATION_TIMEOUT_MS = 90_000;

async function generateSimulatedUtterances(persona, count, model, aiClient) {
  return aiClient.jsonCall(
    `Du simulierst Schüleräußerungen für Prompt-Engineering-Tests an einer IGS (Klasse 9).
Generiere exakt ${count} kurze Schüleräußerungen für den beschriebenen Schüler-Typ.
Antworte NUR mit einem JSON-Array von Strings: ["Äußerung 1", "Äußerung 2", ...]`,
    `Schüler-Typ: ${persona.name}\nBeschreibung: ${persona.description || '–'}\n` +
    (persona.example_msgs ? `Typische Formulierungen: ${persona.example_msgs}` : ''),
    model,
    { timeout: SIMULATION_TIMEOUT_MS }
  );
}

async function generateAIResponse(config, erfahrungContent, utterance, aiClient) {
  const instructions = buildInstructions({ systemContent: config.content, erfahrungContent });
  return aiClient.textCall(instructions, utterance, config.model, { timeout: SIMULATION_TIMEOUT_MS });
}

async function evaluateResponse(utterance, aiResponse, criteria, model, aiClient) {
  const criteriaText = criteria.length
    ? criteria.map(c => `- ${c.content}`).join('\n')
    : '- Gibt keine fertigen Lösungen\n- Stellt Rückfragen\n- Fördert eigenständiges Denken';

  return aiClient.jsonCall(
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
}

export async function runSimulation({ persona, config, erfahrungsprompt, criteria, models, aiClient, onPair }) {
  const { utteranceModel, evalModel } = models;
  const count = 4;

  const utterances = await generateSimulatedUtterances(persona, count, utteranceModel, aiClient);

  const pairs = [];
  for (const utterance of utterances) {
    const aiResponse = await generateAIResponse(config, erfahrungsprompt, utterance, aiClient);
    let evaluation;
    try {
      evaluation = await evaluateResponse(utterance, aiResponse, criteria, evalModel, aiClient);
    } catch (_) {
      evaluation = { overall: 'gemischt', score: 3, highlights: [], summary: 'Evaluierung nicht möglich.' };
    }
    const pair = { utterance, aiResponse, evaluation };
    pairs.push(pair);
    onPair?.(pair, pairs.length - 1);
  }

  const simResultsText = pairs.map((r, i) =>
    `Äußerung ${i + 1}: ${r.utterance}\n` +
    `KI-Antwort: ${r.aiResponse.slice(0, 400)}\n` +
    `Bewertung: ${r.evaluation.overall} (Score ${r.evaluation.score}/5) – ${r.evaluation.summary || ''}`
  ).join('\n---\n');

  return { pairs, simResultsText };
}
