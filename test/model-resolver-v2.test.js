/**
 * Tests für model-resolver.js — Issue #107 (ADR 0004)
 *
 * Testet getEffectiveModel(activityId, deps) mit der neuen 3-Stufen-Reihenfolge:
 * 1. activities.model
 * 2. prompts.model (globaler System-Prompt-Wert via getCachedConfig)
 * 3. MODEL_NAME aus Env
 *
 * Run: node --test test/model-resolver-v2.test.js
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

describe('getEffectiveModel (ADR 0004 — Modell pro Aktivität)', () => {
  test('Stufe 1: activities.model gesetzt → gibt Aktivitäts-Modell zurück', () => {
    const deps = makeDeps({ activityModel: 'gpt-4.1-mini' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1-mini');
  });

  test('Stufe 1: activities.model gesetzt, aber nicht in AVAILABLE_MODELS → fällt auf Stufe 2', () => {
    const deps = makeDeps({ activityModel: 'gpt-unknown', cachedModel: 'gpt-4.1' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Stufe 2: activities.model null → gibt getCachedConfig().model zurück', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: 'gpt-4.1' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Stufe 3: activities.model null und cachedModel leer → gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: '' });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('Stufe 3: activities.model null und cachedModel null → gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: null });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('activityId null → überspringt Stufe 1, fällt auf getCachedConfig().model', () => {
    const deps = makeDeps({ cachedModel: 'gpt-4.1' });

    const result = getEffectiveModel(null, deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('activityId undefined → überspringt Stufe 1, fällt auf getCachedConfig().model', () => {
    const deps = makeDeps({ cachedModel: 'gpt-4.1' });

    const result = getEffectiveModel(undefined, deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Stufe 1 und 2 leer → gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ activityModel: null, cachedModel: null });

    const result = getEffectiveModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });
});
