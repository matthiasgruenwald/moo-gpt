import { saveTokenUsage, getThreadCostByModel, getActivityCostByModel } from './stores/token.js';
import {
  computeTokenCost,
  computeAudioCost,
  computeTtsCost,
  getCachedEurRate,
  getCachedPricing,
} from './pricing.js';

// Re-Exporte für Abwärtskompatibilität (Callers in routes/ und Tests)
export { computeAudioCost, computeTtsCost };

/**
 * Summiert Kosten über alle Zeilen.
 * - Zeilen mit audio_seconds (IS NOT NULL) → computeAudioCost (Issue #90)
 * - Alle anderen Zeilen → computeTokenCost (Token-basiert)
 *
 * Wird von cost-service.js genutzt.
 */
export async function sumCostRows(rows) {
  if (!rows || rows.length === 0) return null;
  let totalEur = 0;
  let inputEur = 0;
  let outputEur = 0;
  let hasAny = false;
  for (const row of rows) {
    if (row.audio_seconds != null) {
      // Audio-Zweig: Whisper-Kosten per Sekunde
      const audioEur = await computeAudioCost(row.audio_seconds);
      if (audioEur != null) {
        totalEur += audioEur;
        hasAny = true;
      }
    } else {
      // Token-Zweig: Chat- und Werkzeug-Kosten
      const c = await computeTokenCost(row.prompt_tokens, row.completion_tokens, row.model);
      if (c) {
        totalEur  += c.totalEur;
        inputEur  += c.inputEur;
        outputEur += c.outputEur;
        hasAny = true;
      }
    }
  }
  return hasAny ? { totalEur, inputEur, outputEur } : null;
}

// Bleibt als sync-Wrapper für Abwärtskompatibilität (nutzt gecachte Preise aus pricing.js)
// Issue #125 konsolidiert diesen Wrapper
export function computeRunCost(promptTokens, completionTokens, model) {
  const eurRate = getCachedEurRate();
  if (!eurRate) return null;
  const pricing = getCachedPricing(model);
  if (!pricing) return null;
  const inputUsd  = (promptTokens     || 0) * pricing.input_cost_per_token;
  const outputUsd = (completionTokens || 0) * pricing.output_cost_per_token;
  return {
    inputEur:  inputUsd  * eurRate,
    outputEur: outputUsd * eurRate,
    totalEur:  (inputUsd + outputUsd) * eurRate,
  };
}

export async function computeThreadCost(threadDbId) {
  const rows = getThreadCostByModel(threadDbId);
  return sumCostRows(rows);
}

export async function computeActivityCost(actId) {
  const rows = getActivityCostByModel(actId);
  return sumCostRows(rows);
}

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
