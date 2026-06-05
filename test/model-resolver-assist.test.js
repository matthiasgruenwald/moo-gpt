/**
 * Tests für getEffectiveAssistModel — Issue #185
 *
 * Fallback-Kette:
 * 1. activities.assist_model (wenn gesetzt und in AVAILABLE_MODELS)
 * 2. activities.model (wenn gesetzt und in AVAILABLE_MODELS)
 * 3. MODEL_NAME aus Env
 *
 * Run: node --test test/model-resolver-assist.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveAssistModel } from '../model-resolver.js';

const AVAILABLE_MODELS = ['gpt-5', 'gpt-4.1', 'gpt-4.1-mini'];
const MODEL_NAME = 'gpt-5';

function makeDeps({ assistModel = null, activityModel = null } = {}) {
  return {
    getActivity: () => ({ assist_model: assistModel, model: activityModel }),
    getCachedConfig: () => ({ model: 'gpt-4.1' }),
    AVAILABLE_MODELS,
    MODEL_NAME,
  };
}

describe('getEffectiveAssistModel (Issue #185)', () => {
  test('Stufe 1: assist_model gesetzt und in AVAILABLE_MODELS → gibt assist_model zurück', () => {
    const deps = makeDeps({ assistModel: 'gpt-4.1-mini', activityModel: 'gpt-4.1' });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, 'gpt-4.1-mini');
  });

  test('Stufe 1: assist_model ungültig (nicht in AVAILABLE_MODELS) → fällt auf Stufe 2', () => {
    const deps = makeDeps({ assistModel: 'gpt-unknown', activityModel: 'gpt-4.1' });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Stufe 2: assist_model null → fällt auf activities.model zurück', () => {
    const deps = makeDeps({ assistModel: null, activityModel: 'gpt-4.1' });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Stufe 2: activities.model ungültig → fällt auf Stufe 3', () => {
    const deps = makeDeps({ assistModel: null, activityModel: 'gpt-unknown' });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('Stufe 3: assist_model und activities.model beide null → gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ assistModel: null, activityModel: null });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('activityId null → überspringt Aktivitäts-Lookup, gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ assistModel: 'gpt-4.1-mini', activityModel: 'gpt-4.1' });

    const result = getEffectiveAssistModel(null, deps);

    assert.equal(result, MODEL_NAME);
  });

  test('activityId undefined → überspringt Aktivitäts-Lookup, gibt MODEL_NAME zurück', () => {
    const deps = makeDeps({ assistModel: 'gpt-4.1-mini', activityModel: 'gpt-4.1' });

    const result = getEffectiveAssistModel(undefined, deps);

    assert.equal(result, MODEL_NAME);
  });

  test('assist_model gesetzt, activityModel null → gibt assist_model zurück', () => {
    const deps = makeDeps({ assistModel: 'gpt-4.1', activityModel: null });

    const result = getEffectiveAssistModel('act-1', deps);

    assert.equal(result, 'gpt-4.1');
  });
});
