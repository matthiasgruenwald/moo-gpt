import { buildInstructions } from './prompt-builder.js';

const SIMULATION_TIMEOUT_MS = 90_000;

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
