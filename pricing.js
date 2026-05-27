/**
 * pricing.js — Preisdaten-Modul (Issue #124)
 *
 * Kapselt alle Preis-Concerns: LiteLLM-Fetch, EUR-Kurs, Token-/Audio-/TTS-Kosten.
 *
 * Öffentliches Interface:
 *   computeTokenCost(promptTokens, completionTokens, model) → Promise<{inputEur, outputEur, totalEur}|null>
 *   computeAudioCost(audioSeconds)    → Promise<number|null>
 *   computeTtsCost(ttsCharacters)     → Promise<number|null>
 *
 * Sync-Zugriff für token-log.js#computeRunCost (gecachte Werte):
 *   getCachedEurRate()           → number|null
 *   getCachedPricing(model)      → object|null
 *
 * Test-Helfer (nicht für Produktion):
 *   _setEurRateForTest(rate)
 *   _setPricingCacheForTest(model, data)
 */

// ── Interner Zustand ──────────────────────────────────────────────────────────

let litellmData = null;
let litellmFetchedAt = 0;

const PRICING_CACHE = new Map();

let EUR_RATE = null;
let eurRateFetchedAt = 0;

// ── Interne Fetcher ───────────────────────────────────────────────────────────

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

async function refreshPricing() {
  litellmData = null;
  PRICING_CACHE.clear();
  await fetchLitellmData();
}

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

// Beim Modulimport sofort laden und periodisch aktualisieren.
// .unref() verhindert, dass die Intervals den Prozess (z.B. Tests) am Leben halten.
fetchLitellmData();
setInterval(refreshPricing, 24 * 60 * 60 * 1000).unref();
fetchEurRate();
setInterval(fetchEurRate, 60 * 60 * 1000).unref();

// ── Konstanten ────────────────────────────────────────────────────────────────

// Issue #90: Audio-Fallback-Preis (0,0001 $/s) wenn LiteLLM nicht erreichbar
const AUDIO_FALLBACK_COST_PER_SECOND = 0.0001;

// Issue #96: TTS-Preis – tts-1-hd kostet $30 / 1M Zeichen
const TTS_COST_PER_CHAR_USD = 30 / 1_000_000;

// ── Öffentliches Interface ────────────────────────────────────────────────────

/**
 * Berechnet Token-Kosten für einen KI-Aufruf in EUR.
 * Gibt null zurück wenn Preisdaten oder EUR-Rate fehlen.
 *
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @param {string} model
 * @returns {Promise<{inputEur: number, outputEur: number, totalEur: number}|null>}
 */
export async function computeTokenCost(promptTokens, completionTokens, model) {
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

/**
 * Berechnet die Kosten einer TTS-Synthese in EUR.
 * Gibt null zurück wenn kein EUR-Kurs verfügbar.
 *
 * @param {number} ttsCharacters - Anzahl der synthetisierten Zeichen
 * @returns {Promise<number|null>} - EUR-Betrag oder null
 */
export async function computeTtsCost(ttsCharacters) {
  if (ttsCharacters == null || ttsCharacters <= 0) return null;
  if (!EUR_RATE) return null;
  return ttsCharacters * TTS_COST_PER_CHAR_USD * EUR_RATE;
}

// ── Sync-Zugriff für token-log.js#computeRunCost ─────────────────────────────

/**
 * Gibt den aktuell gecachten EUR-Kurs zurück (sync).
 * Für computeRunCost in token-log.js.
 *
 * @returns {number|null}
 */
export function getCachedEurRate() {
  return EUR_RATE;
}

/**
 * Gibt gecachte Preisdaten für ein Modell zurück (sync).
 * Für computeRunCost in token-log.js.
 *
 * @param {string} model
 * @returns {{ input_cost_per_token, output_cost_per_token }|null}
 */
export function getCachedPricing(model) {
  return model ? (PRICING_CACHE.get(model) ?? null) : null;
}

// ── Test-Helfer ───────────────────────────────────────────────────────────────

/**
 * Setzt EUR_RATE direkt (nur für Tests).
 * @param {number|null} rate
 */
export function _setEurRateForTest(rate) {
  EUR_RATE = rate;
}

/**
 * Fügt einen Eintrag in PRICING_CACHE ein (nur für Tests).
 * @param {string} model
 * @param {{ input_cost_per_token, output_cost_per_token, input_cost_per_second? }|null} data
 */
export function _setPricingCacheForTest(model, data) {
  PRICING_CACHE.set(model, data);
}
