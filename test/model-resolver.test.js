/**
 * Tests für model-resolver.js — aktualisiert für Issue #107 (ADR 0004)
 *
 * Testet getEffectiveModel(activityId, deps) mit allen Präzedenz-Stufen.
 * Dependencies werden per optionalem zweiten Parameter injiziert (kein DB-Zugriff).
 *
 * Run: node --test test/model-resolver.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveModel } from '../model-resolver.js';

const AVAILABLE_MODELS = ['gpt-5', 'gpt-4.1', 'gpt-4.1-mini'];
const MODEL_NAME = 'gpt-5';

function makeDeps({ activityModel = null, cachedModel = 'gpt-4.1' } = {}) {
  return {
    getActivity:     () => activityModel ? { model: activityModel } : { model: null },
    getCachedConfig: () => ({ model: cachedModel }),
    AVAILABLE_MODELS,
    MODEL_NAME,
  };
}

describe('getEffectiveModel', () => {
  test('Aktivität mit gültigem Modell → gibt Aktivitäts-Modell zurück', () => {
    const deps = makeDeps({ activityModel: 'gpt-4.1-mini' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1-mini');
  });

  test('Aktivitätsmodell nicht in AVAILABLE_MODELS → Fallback auf getCachedConfig().model', () => {
    const deps = makeDeps({ activityModel: 'gpt-unknown-model' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Kein Aktivitätsmodell (null) → getCachedConfig().model', () => {
    const deps = makeDeps({ activityModel: null });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('getCachedConfig().model leer → MODEL_NAME aus Env', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: '' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('activityId null → überspringt Aktivitäts-Lookup, gibt getCachedConfig().model zurück', () => {
    const deps = makeDeps({ activityModel: 'gpt-4.1-mini' });

    const result = getEffectiveModel(null, deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('activityId null und cachedModel leer → MODEL_NAME aus Env', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: '' });

    const result = getEffectiveModel(null, deps);

    assert.equal(result, MODEL_NAME);
  });

  test('getCachedConfig().model null → MODEL_NAME aus Env', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: null });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });
});
