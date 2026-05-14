import { saveTokenUsage, getThreadCostTokens, getActivityCostTokens } from './db.js';

const MODEL_NAME = process.env.MODEL_NAME;

// Issue #11: LiteLLM-Preise laden und 24 h cachen
let PRICING = null;
let pricingFetchedAt = 0;

async function fetchPricing() {
  const now = Date.now();
  if (PRICING && (now - pricingFetchedAt) < 24 * 60 * 60 * 1000) return PRICING;
  try {
    const res  = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    const data = await res.json();
    const entry = data[MODEL_NAME] || data[`openai/${MODEL_NAME}`] || null;
    PRICING = entry ? {
      input_cost_per_token:  entry.input_cost_per_token  || 0,
      output_cost_per_token: entry.output_cost_per_token || 0,
    } : null;
    pricingFetchedAt = now;
    console.log(`[Pricing] Preise geladen für ${MODEL_NAME}:`, PRICING);
  } catch (e) {
    console.warn('[Pricing] Fehler beim Laden der Preise:', e.message);
  }
  return PRICING;
}

// Issue #12: USD→EUR Wechselkurs (ECB via frankfurter.app), 1h Cache
let EUR_RATE = null;
let eurRateFetchedAt = 0;

async function fetchEurRate() {
  const now = Date.now();
  if (EUR_RATE && (now - eurRateFetchedAt) < 60 * 60 * 1000) return EUR_RATE;
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    const data = await res.json();
    EUR_RATE = data.rates?.EUR ?? null;
    eurRateFetchedAt = now;
    console.log(`[Pricing] EUR/USD: ${EUR_RATE}`);
  } catch (e) {
    console.warn('[Pricing] EUR-Rate Fehler:', e.message);
  }
  return EUR_RATE;
}

export function computeRunCost(promptTokens, completionTokens) {
  if (!PRICING || !EUR_RATE) return null;
  const inputUsd  = (promptTokens     || 0) * PRICING.input_cost_per_token;
  const outputUsd = (completionTokens || 0) * PRICING.output_cost_per_token;
  return {
    inputEur:  inputUsd  * EUR_RATE,
    outputEur: outputUsd * EUR_RATE,
    totalEur:  (inputUsd + outputUsd) * EUR_RATE,
  };
}

export function computeThreadCost(threadDbId) {
  const t = getThreadCostTokens(threadDbId);
  return computeRunCost(t.prompt_tokens, t.completion_tokens);
}

export function computeActivityCost(actId) {
  const t = getActivityCostTokens(actId);
  return computeRunCost(t.prompt_tokens, t.completion_tokens);
}

export function enrichMessagesWithCost(messages) {
  return messages.map(m => {
    if (m.role === 'assistant' && m.cost_prompt != null) {
      const cost = computeRunCost(m.cost_prompt, m.cost_completion);
      return { ...m, runCost: cost };
    }
    return m;
  });
}

export function recordUsage(threadDbId, activityId, model, usage, msgId) {
  if (!usage || !threadDbId) return null;
  try {
    const mapped = {
      prompt_tokens:     usage.input_tokens,
      completion_tokens: usage.output_tokens,
      total_tokens:      usage.total_tokens,
    };
    saveTokenUsage(threadDbId, activityId, model, mapped, msgId);
    console.log(`[Token] ${model} – input=${usage.input_tokens} output=${usage.output_tokens}`);
    return {
      runCost:      computeRunCost(mapped.prompt_tokens, mapped.completion_tokens),
      threadCost:   computeThreadCost(threadDbId),
      activityCost: computeActivityCost(activityId),
    };
  } catch (e) {
    console.error('[TokenLog] Fehler:', e.message);
    return null;
  }
}

// Beim Modulimport sofort laden und periodisch aktualisieren
fetchPricing();
setInterval(fetchPricing, 24 * 60 * 60 * 1000);
fetchEurRate();
setInterval(fetchEurRate, 60 * 60 * 1000);
