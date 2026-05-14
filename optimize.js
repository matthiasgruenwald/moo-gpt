import { getFeedbackByActivity, getErkenntnisse, getActiveErfahrungsprompt } from './db.js';

export async function generateOptimizeProposal(activityId, simResultsText = '', config, aiClient) {
  const feedbacks    = getFeedbackByActivity(activityId);
  const erkenntnisse = getErkenntnisse(activityId);
  const erf          = getActiveErfahrungsprompt(activityId);

  const feedbackText = feedbacks.length === 0
    ? 'Noch keine Bewertungen vorhanden.'
    : feedbacks.map(f => {
        const lines = [`[${f.rating.toUpperCase()}] ${(f.message_content || '').slice(0, 300)}`];
        if (f.comment) lines.push(`Kommentar: ${f.comment}`);
        if (f.improved_text) lines.push(`Verbesserter Vorschlag: ${f.improved_text.slice(0, 300)}`);
        return lines.join('\n');
      }).join('\n---\n');

  const erkenntnisText = erkenntnisse.length === 0
    ? 'Keine Erkenntnisse vorhanden.'
    : erkenntnisse.map(e => `- ${e.content}`).join('\n');

  const instructions = `Du bist Experte für pädagogisches Prompt-Engineering an einer IGS (Klasse 9).
Deine Aufgabe: Erstelle einen verbesserten Erfahrungsprompt basierend auf Feedback-Daten.

Der Erfahrungsprompt ist ein kurzer Zusatz zum globalen Systemprompt – aktivitätsspezifisch, max. 200 Wörter.
Er wiederholt den Systemprompt NICHT, sondern ergänzt ihn mit konkreten Hinweisen für diese Aufgabe.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Blöcke:
{
  "erfahrungsprompt_neu": "...",
  "kausalkette": [
    { "problem": "...", "ursache": "...", "aenderung": "..." }
  ]
}`;

  const userMessage = `Globaler Systemprompt:\n${config.content}\n\n` +
    `Aktueller Erfahrungsprompt:\n${erf?.content || '(noch keiner)'}\n\n` +
    `Feedback zu KI-Antworten dieser Aufgabe:\n${feedbackText}\n\n` +
    (simResultsText ? `Simulations-Ergebnisse (frisch):\n${simResultsText}\n\n` : '') +
    `Bisherige Erkenntnisse:\n${erkenntnisText}\n\n` +
    `Erstelle einen verbesserten Erfahrungsprompt für diese Aufgabe.`;

  const parsed = await aiClient.jsonCall(instructions, userMessage, config.model, { timeout: 120_000 });
  if (!parsed.erfahrungsprompt_neu || !Array.isArray(parsed.kausalkette))
    throw new Error('Unvollständige KI-Antwort');

  return {
    erfahrungsprompt_alt: erf?.content || '',
    erfahrungsprompt_neu: parsed.erfahrungsprompt_neu,
    kausalkette:          parsed.kausalkette,
  };
}
