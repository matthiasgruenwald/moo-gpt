import { saveTokenUsage } from './stores/token.js';
import { computeTokenCost } from './pricing.js';
import { computeThreadCost, computeActivityCost } from './cost-service.js';

export async function enrichMessagesWithCost(messages) {
  return Promise.all(messages.map(async m => {
    if (m.role === 'assistant' && m.cost_prompt != null) {
      const cost = await computeTokenCost(m.cost_prompt, m.cost_completion, m.cost_model);
      return { ...m, runCost: cost };
    }
    return m;
  }));
}

export async function recordUsage(threadDbId, activityId, model, usage, msgId) {
  if (!usage || !threadDbId) return null;
  try {
    const promptTokens     = usage.input_tokens  ?? null;
    const completionTokens = usage.output_tokens ?? null;
    const mapped = {
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      total_tokens:      usage.total_tokens
        ?? (promptTokens != null && completionTokens != null
            ? promptTokens + completionTokens
            : null),
    };
    saveTokenUsage(threadDbId, activityId, model, mapped, msgId);
    console.log(`[Token] ${model} – input=${usage.input_tokens} output=${usage.output_tokens}`);
    const [runCost, threadCost, activityCost] = await Promise.all([
      computeTokenCost(mapped.prompt_tokens, mapped.completion_tokens, model),
      computeThreadCost(threadDbId),
      computeActivityCost(activityId),
    ]);
    return { runCost, threadCost, activityCost };
  } catch (e) {
    console.error('[TokenLog] Fehler:', e.message);
    return null;
  }
}
