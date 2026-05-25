import { saveTokenUsage, getThreadCostByModel, getActivityCostByModel } from './stores/token.js';

// Issue #41: Per-Modell-Preis-Cache (statt globalem Singleton)
let litellmData = null;
let litellmFetchedAt = 0;

async function fetchLitellmData() {
  const now = Date.now();
  if (litellmData && (now - litellmFetchedAt) < 24 * 60 * 60 * 1000) return litellmData;
  try {
    const res  = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    litellmData = await res.json();
    litellmFetchedAt = now;
    console.log('[Pricing] LiteLLM-Preisdaten geladen');
  } catch (e) {
    console.warn('[Pricing] Fehler beim Laden der Preise:', e.message);
  }
  return litellmData;
}

const PRICING_CACHE = new Map();

async function fetchPricingForModel(model) {
  if (!model) return null;
  if (PRICING_CACHE.has(model)) return PRICING_CACHE.get(model);
  const data = await fetchLitellmData();
  if (!data) return null;
  const entry = data[model] || data[`openai/${model}`] || null;
  const pricing = entry ? {
    input_cost_per_token:   entry.input_cost_per_token   || 0,
    output_cost_per_token:  entry.output_cost_per_token  || 0,
    // Issue #90: Whisper — Kosten pro Sekunde (z.B. 0.0001 $/s für whisper-1)
    input_cost_per_second:  entry.input_cost_per_second  || null,
  } : null;
  PRICING_CACHE.set(model, pricing);
  console.log(`[Pricing] Preise für ${model}:`, pricing);
  return pricing;
}

// Hält den Cache nach 24h frisch (LiteLLM-Daten neu laden, PRICING_CACHE leeren)
async function refreshPricing() {
  litellmData = null;
  PRICING_CACHE.clear();
  await fetchLitellmData();
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

// Issue #90: Audio-Fallback-Preis (0,0001 $/s) wenn LiteLLM nicht erreichbar
const AUDIO_FALLBACK_COST_PER_SECOND = 0.0001;

/**
 * Berechnet die Kosten einer Whisper-Transkription in EUR.
 * Gibt null zurück wenn Preisdaten fehlen (kein LiteLLM-Eintrag und kein EUR-Kurs).
 * Fallback auf 0,0001 $/s wenn LiteLLM nicht erreichbar (aber EUR-Kurs vorhanden).
 *
 * @param {number} audioSeconds - Dauer der Transkription
 * @returns {Promise<number|null>} - EUR-Betrag oder null
 */
export async function computeAudioCost(audioSeconds) {
  if (audioSeconds == null || audioSeconds <= 0) return null;
  if (!EUR_RATE) return null;

  const pricing = await fetchPricingForModel('whisper-1');
  const costPerSecond = pricing?.input_cost_per_second ?? AUDIO_FALLBACK_COST_PER_SECOND;
  return audioSeconds * costPerSecond * EUR_RATE;
}

// Issue #41: Kostenberechnung für ein einzelnes Modell (async)
async function computeRunCostForModel(promptTokens, completionTokens, model) {
  if (!EUR_RATE) return null;
  const pricing = await fetchPricingForModel(model);
  if (!pricing) return null;
  const inputUsd  = (promptTokens     || 0) * pricing.input_cost_per_token;
  const outputUsd = (completionTokens || 0) * pricing.output_cost_per_token;
  return {
    inputEur:  inputUsd  * EUR_RATE,
    outputEur: outputUsd * EUR_RATE,
    totalEur:  (inputUsd + outputUsd) * EUR_RATE,
  };
}

/**
 * Summiert Kosten über alle Zeilen.
 * - Zeilen mit audio_seconds (IS NOT NULL) → computeAudioCost (Issue #90)
 * - Alle anderen Zeilen → computeRunCostForModel (Token-basiert)
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
      const c = await computeRunCostForModel(row.prompt_tokens, row.completion_tokens, row.model);
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

// Bleibt als sync-Wrapper für Abwärtskompatibilität (nutzt gecachte Preise)
export function computeRunCost(promptTokens, completionTokens, model) {
  if (!EUR_RATE) return null;
  const pricing = model ? PRICING_CACHE.get(model) : null;
  if (!pricing) return null;
  const inputUsd  = (promptTokens     || 0) * pricing.input_cost_per_token;
  const outputUsd = (completionTokens || 0) * pricing.output_cost_per_token;
  return {
    inputEur:  inputUsd  * EUR_RATE,
    outputEur: outputUsd * EUR_RATE,
    totalEur:  (inputUsd + outputUsd) * EUR_RATE,
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
      const cost = await computeRunCostForModel(m.cost_prompt, m.cost_completion, m.cost_model);
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
    // Preise für dieses Modell vorab laden (befüllt PRICING_CACHE)
    await fetchPricingForModel(model);
    const [runCost, threadCost, activityCost] = await Promise.all([
      computeRunCostForModel(mapped.prompt_tokens, mapped.completion_tokens, model),
      computeThreadCost(threadDbId),
      computeActivityCost(activityId),
    ]);
    return { runCost, threadCost, activityCost };
  } catch (e) {
    console.error('[TokenLog] Fehler:', e.message);
    return null;
  }
}

// Beim Modulimport sofort laden und periodisch aktualisieren
fetchLitellmData();
setInterval(refreshPricing, 24 * 60 * 60 * 1000);
fetchEurRate();
setInterval(fetchEurRate, 60 * 60 * 1000);
