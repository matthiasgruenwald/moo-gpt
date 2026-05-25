/**
 * Tests für model-resolver.js — Issue #74
 *
 * Testet getEffectiveModel(isTeacher, userId) mit allen Präzedenz-Stufen.
 * Dependencies werden per optionalem dritten Parameter injiziert (kein DB-Zugriff).
 *
 * Run: node --test test/model-resolver.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveModel } from '../model-resolver.js';

const AVAILABLE_MODELS = ['gpt-5', 'gpt-4.1', 'gpt-4.1-mini'];
const MODEL_NAME = 'gpt-5';

function makeDeps({ preference = null, cachedModel = 'gpt-4.1' } = {}) {
  return {
    getTeacherPreference: () => preference,
    getCachedConfig: () => ({ model: cachedModel }),
    AVAILABLE_MODELS,
    MODEL_NAME,
  };
}

describe('getEffectiveModel', () => {
  test('Lehrer mit gültiger Präferenz → gibt Präferenz-Modell zurück', () => {
    const deps = makeDeps({ preference: { preferred_model: 'gpt-4.1-mini' } });

    const result = getEffectiveModel(true, 'user-42', deps);

    assert.equal(result, 'gpt-4.1-mini');
  });

  test('Lehrer mit Präferenz außerhalb AVAILABLE_MODELS → Fallback auf getCachedConfig().model', () => {
    const deps = makeDeps({ preference: { preferred_model: 'gpt-unknown-model' } });

    const result = getEffectiveModel(true, 'user-42', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('Lehrer ohne Präferenz (null) → getCachedConfig().model', () => {
    const deps = makeDeps({ preference: null });

    const result = getEffectiveModel(true, 'user-42', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('getCachedConfig().model leer → MODEL_NAME aus env-config.js', () => {
    const deps = makeDeps({ preference: null, cachedModel: '' });

    const result = getEffectiveModel(true, 'user-42', deps);

    assert.equal(result, MODEL_NAME);
  });

  test('isTeacher = false → getCachedConfig().model (kein Präferenz-Lookup)', () => {
    const deps = makeDeps({ preference: { preferred_model: 'gpt-4.1-mini' } });

    const result = getEffectiveModel(false, 'user-42', deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('isTeacher = true aber userId null → getCachedConfig().model', () => {
    const deps = makeDeps({ preference: { preferred_model: 'gpt-4.1-mini' } });

    const result = getEffectiveModel(true, null, deps);

    assert.equal(result, 'gpt-4.1');
  });

  test('getCachedConfig().model null → MODEL_NAME aus env-config.js', () => {
    const deps = makeDeps({ preference: null, cachedModel: null });

    const result = getEffectiveModel(false, 'user-42', deps);

    assert.equal(result, MODEL_NAME);
  });
});
