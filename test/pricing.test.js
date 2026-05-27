/**
 * Tests für pricing.js — Issue #124
 *
 * Testet das neue Preisdaten-Modul direkt (ohne Umweg über token-log.js).
 * Nutzt interne Testhelfer _setEurRateForTest / _setPricingCacheForTest
 * um Netzwerkzugriffe zu vermeiden.
 *
 * Run: node --test test/pricing.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTokenCost,
  computeAudioCost,
  computeTtsCost,
  _setEurRateForTest,
  _setPricingCacheForTest,
} from '../pricing.js';

// ── Hilfsfunktion: Zustand zurücksetzen ───────────────────────────────────────

function resetState() {
  // EUR-Rate auf null (kein Kurs geladen)
  _setEurRateForTest(null);
}

// ── Test A: computeTokenCost liefert korrekten EUR-Wert ───────────────────────

describe('computeTokenCost', () => {
  beforeEach(resetState);

  test('A: gibt korrekten EUR-Wert zurück wenn Preisdaten und EUR-Rate vorhanden', async () => {
    _setEurRateForTest(0.93);
    _setPricingCacheForTest('gpt-4.1-nano', {
      input_cost_per_token:  0.000001,  // 1 $/1M tokens
      output_cost_per_token: 0.000002,  // 2 $/1M tokens
    });

    const result = await computeTokenCost(1000, 500, 'gpt-4.1-nano');

    assert.ok(result !== null, 'Ergebnis darf nicht null sein');
    assert.ok('inputEur'  in result, 'inputEur muss vorhanden sein');
    assert.ok('outputEur' in result, 'outputEur muss vorhanden sein');
    assert.ok('totalEur'  in result, 'totalEur muss vorhanden sein');

    // 1000 * 0.000001 * 0.93 = 0.00093
    assert.ok(Math.abs(result.inputEur - 0.00093) < 1e-9, `inputEur falsch: ${result.inputEur}`);
    // 500 * 0.000002 * 0.93 = 0.00093
    assert.ok(Math.abs(result.outputEur - 0.00093) < 1e-9, `outputEur falsch: ${result.outputEur}`);
    // total = 0.00186
    assert.ok(Math.abs(result.totalEur - 0.00186) < 1e-9, `totalEur falsch: ${result.totalEur}`);
  });

  test('B: gibt null zurück wenn EUR-Rate nicht geladen', async () => {
    _setEurRateForTest(null);
    _setPricingCacheForTest('gpt-5', {
      input_cost_per_token:  0.000015,
      output_cost_per_token: 0.000060,
    });

    const result = await computeTokenCost(100, 50, 'gpt-5');
    assert.equal(result, null, 'Ohne EUR-Rate muss null zurückkommen');
  });

  test('gibt null zurück wenn Pricing für Modell nicht im Cache', async () => {
    _setEurRateForTest(0.93);
    // Kein Cache-Eintrag für 'unbekanntes-modell'

    const result = await computeTokenCost(100, 50, 'unbekanntes-modell');
    // Kein Netz in Tests → fetchPricingForModel liefert null → computeTokenCost null
    assert.equal(result, null, 'Ohne Pricing-Daten muss null zurückkommen');
  });
});

// ── Test C: computeAudioCost ──────────────────────────────────────────────────

describe('computeAudioCost', () => {
  beforeEach(resetState);

  test('C: nutzt Fallback-Preis wenn LiteLLM-Fetch fehlschlägt, aber EUR-Rate vorhanden', async () => {
    _setEurRateForTest(0.93);
    // Kein Pricing-Cache-Eintrag für whisper-1 → Fallback 0.0001 $/s

    const result = await computeAudioCost(10);

    assert.ok(result !== null, 'Ergebnis darf nicht null sein');
    // 10s * 0.0001 $/s * 0.93 = 0.00093
    assert.ok(Math.abs(result - 0.00093) < 1e-9, `computeAudioCost falsch: ${result}`);
  });

  test('gibt null zurück wenn audioSeconds null', async () => {
    _setEurRateForTest(0.93);
    assert.equal(await computeAudioCost(null), null);
  });

  test('gibt null zurück wenn audioSeconds <= 0', async () => {
    _setEurRateForTest(0.93);
    assert.equal(await computeAudioCost(0),  null);
    assert.equal(await computeAudioCost(-1), null);
  });

  test('gibt null zurück wenn EUR-Rate fehlt', async () => {
    _setEurRateForTest(null);
    assert.equal(await computeAudioCost(10), null);
  });

  test('nutzt bekannten Preis aus Cache wenn verfügbar', async () => {
    _setEurRateForTest(0.93);
    _setPricingCacheForTest('whisper-1', {
      input_cost_per_token:  0,
      output_cost_per_token: 0,
      input_cost_per_second: 0.0002,  // doppelter Preis
    });

    const result = await computeAudioCost(10);
    // 10s * 0.0002 $/s * 0.93 = 0.00186
    assert.ok(Math.abs(result - 0.00186) < 1e-9, `computeAudioCost mit Cache falsch: ${result}`);
  });
});

// ── Test D: computeTtsCost ────────────────────────────────────────────────────

describe('computeTtsCost', () => {
  beforeEach(resetState);

  test('D: berechnet korrekt (30 $/1M Zeichen × EUR-Rate)', async () => {
    _setEurRateForTest(0.93);

    const result = await computeTtsCost(1_000_000);
    // 1M Zeichen × (30/1M) $/Zeichen × 0.93 = 27.9
    assert.ok(Math.abs(result - 27.9) < 1e-9, `computeTtsCost falsch: ${result}`);
  });

  test('skaliert linear mit Zeichenanzahl', async () => {
    _setEurRateForTest(0.93);

    const result = await computeTtsCost(22_500);
    // 22500 × (30/1M) × 0.93 = 0.627750
    const expected = 22_500 * (30 / 1_000_000) * 0.93;
    assert.ok(Math.abs(result - expected) < 1e-9, `computeTtsCost Skalierung falsch: ${result}`);
  });

  test('gibt null zurück wenn ttsCharacters null', async () => {
    _setEurRateForTest(0.93);
    assert.equal(await computeTtsCost(null), null);
  });

  test('gibt null zurück wenn ttsCharacters <= 0', async () => {
    _setEurRateForTest(0.93);
    assert.equal(await computeTtsCost(0),  null);
    assert.equal(await computeTtsCost(-1), null);
  });

  test('gibt null zurück wenn EUR-Rate fehlt', async () => {
    _setEurRateForTest(null);
    assert.equal(await computeTtsCost(10_000), null);
  });
});
