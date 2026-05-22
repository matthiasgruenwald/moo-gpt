const DEFAULT_GEN_MODEL = 'gpt-4.1-nano';

export async function suggestCriteriaList({ config, erfahrungsprompt, genModel, aiClient }) {
  const promptSource = erfahrungsprompt
    ? `Aufgabenprompt:\n${erfahrungsprompt}`
    : `Systemprompt:\n${config.content}`;
  const result = await aiClient.jsonCall(
    `Du leitest Bewertungskriterien für eine KI-Tutoring-Anwendung aus einem Prompt ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "criteria": ["Kriterium 1", "Kriterium 2", ...] }
Leite 5–8 präzise, prüfbare Kriterien ab. Formuliere sie als positive Aussagen (was die KI TUN soll).`,
    promptSource,
    genModel || DEFAULT_GEN_MODEL
  );
  return result.criteria || [];
}

export async function augmentCriteria({ config, erfahrungsprompt, existingCriteria, aiClient }) {
  const suggestions = await suggestCriteriaList({ config, erfahrungsprompt, genModel: undefined, aiClient });
  if (!existingCriteria.length) return suggestions;

  const existingTexts = existingCriteria.map(c => c.content.toLowerCase());
  return suggestions.filter(s => {
    const words = s.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    return !existingTexts.some(e => {
      const matches = words.filter(w => e.includes(w)).length;
      return matches >= Math.max(2, words.length * 0.5);
    });
  });
}
