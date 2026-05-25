/**
 * Tests für app-init.js — Issue #79
 * initApp() — DB-Init + Admin-Seed + Config-Load.
 *
 * Alle DB/Env-Dependencies werden per DI injiziert.
 * Kein echter DB-Zugriff, keine env-config.js-Abhängigkeit.
 *
 * Run: node --test test/app-init.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initApp } from '../app-init.js';

function makeDeps({
  dbPrompt = null,
  savedSystemPrompt = null,
  ADMIN_USER_IDS = '',
  SYSTEM_PROMPT = '',
  MODEL_NAME = 'gpt-test',
} = {}) {
  const calls = {
    initDb: 0,
    addAdmin: [],
    saveSystemPrompt: [],
    updateCachedConfig: [],
  };

  return {
    calls,
    deps: {
      initDb: ()                   => { calls.initDb++; },
      addAdmin: (uid, src)         => { calls.addAdmin.push({ uid, src }); },
      getActiveSystemPrompt: ()    => dbPrompt,
      saveSystemPrompt: (...args)  => { calls.saveSystemPrompt.push(args); return savedSystemPrompt; },
      updateCachedConfig: (...args) => { calls.updateCachedConfig.push(args); },
      getCachedConfig: ()          => ({ model: MODEL_NAME }),
      MODEL_NAME,
      SYSTEM_PROMPT,
      ADMIN_USER_IDS,
    },
  };
}

describe('initApp', () => {
  test('ruft initDb() auf', () => {
    const { calls, deps } = makeDeps();
    initApp(deps);
    assert.equal(calls.initDb, 1, 'initDb soll genau einmal aufgerufen werden');
  });

  test('Erststart: kein DB-Prompt → ENV migrieren (saveSystemPrompt + updateCachedConfig)', () => {
    const { calls, deps } = makeDeps({
      dbPrompt: null,
      SYSTEM_PROMPT: 'Hallo Welt',
      MODEL_NAME: 'gpt-5',
    });
    initApp(deps);

    assert.equal(calls.saveSystemPrompt.length, 1, 'saveSystemPrompt soll einmal aufgerufen werden');
    assert.equal(calls.saveSystemPrompt[0][0], 'Hallo Welt', 'System-Prompt soll aus ENV kommen');
    assert.equal(calls.saveSystemPrompt[0][1], 'gpt-5', 'MODEL_NAME soll aus deps kommen');
    assert.equal(calls.updateCachedConfig.length, 1, 'updateCachedConfig soll einmal aufgerufen werden');
  });

  test('Wiederkehr-Start: DB-Prompt vorhanden → updateCachedConfig, kein saveSystemPrompt', () => {
    const { calls, deps } = makeDeps({
      dbPrompt: { content: 'DB-Prompt', model: 'gpt-4', version: 3 },
    });
    initApp(deps);

    assert.equal(calls.saveSystemPrompt.length, 0, 'saveSystemPrompt soll NICHT aufgerufen werden');
    assert.equal(calls.updateCachedConfig.length, 1, 'updateCachedConfig soll einmal aufgerufen werden');
    assert.equal(calls.updateCachedConfig[0][0], 'DB-Prompt');
    assert.equal(calls.updateCachedConfig[0][1], 'gpt-4');
  });

  test('Admin-Seed: eine Admin-ID → addAdmin einmal aufgerufen', () => {
    const { calls, deps } = makeDeps({ ADMIN_USER_IDS: 'user42' });
    initApp(deps);
    assert.equal(calls.addAdmin.length, 1);
    assert.equal(calls.addAdmin[0].uid, 'user42');
    assert.equal(calls.addAdmin[0].src, 'env');
  });

  test('Admin-Seed idempotent: mehrere IDs → addAdmin für jede ID', () => {
    const { calls, deps } = makeDeps({ ADMIN_USER_IDS: 'user1,user2,user3' });
    initApp(deps);
    assert.equal(calls.addAdmin.length, 3);
    assert.deepEqual(calls.addAdmin.map(c => c.uid), ['user1', 'user2', 'user3']);
  });

  test('leere ADMIN_USER_IDS → kein addAdmin-Aufruf', () => {
    const { calls, deps } = makeDeps({ ADMIN_USER_IDS: '' });
    initApp(deps);
    assert.equal(calls.addAdmin.length, 0);
  });

  test('DB-Prompt ohne model → MODEL_NAME als Fallback für updateCachedConfig', () => {
    const { calls, deps } = makeDeps({
      dbPrompt: { content: 'X', model: null, version: 1 },
      MODEL_NAME: 'gpt-fallback',
    });
    initApp(deps);
    assert.equal(calls.updateCachedConfig[0][1], 'gpt-fallback');
  });
});
