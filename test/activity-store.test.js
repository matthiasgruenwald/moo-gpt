/**
 * Tests für stores/activity.js — Regressions-Test für fix(#97)
 *
 * Stellt sicher dass setActivityConfig die neuen TTS-Felder
 * (audioOutput, ttsVoice, audioStudentOptions) korrekt speichert
 * und getActivity sie korrekt zurückliefert.
 *
 * Verwendet In-Memory-SQLite via DB_PATH=:memory:
 * Run: node --test test/activity-store.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { initDb } = await import('../db.js');
const { getActivity, setActivityConfig } = await import('../stores/activity.js');

before(() => {
  initDb();
});

describe('setActivityConfig / getActivity — TTS-Felder (fix #97)', () => {
  test('speichert audioOutput=on und liest es korrekt zurück', () => {
    setActivityConfig('act-1', null, null, null, null, null, 'on', null, null);
    const act = getActivity('act-1');
    assert.equal(act.audio_output, 'on');
  });

  test('speichert ttsVoice=echo und liest es korrekt zurück', () => {
    setActivityConfig('act-2', null, null, null, null, null, null, 'echo', null);
    const act = getActivity('act-2');
    assert.equal(act.tts_voice, 'echo');
  });

  test('speichert audioStudentOptions=on und liest es korrekt zurück', () => {
    setActivityConfig('act-3', null, null, null, null, null, null, null, 'on');
    const act = getActivity('act-3');
    assert.equal(act.audio_student_options, 'on');
  });

  test('speichert alle drei TTS-Felder gleichzeitig', () => {
    setActivityConfig('act-4', 'opener', 'off', 'Titel', 'grw', 'off', 'on', 'shimmer', 'on');
    const act = getActivity('act-4');
    assert.equal(act.audio_output, 'on');
    assert.equal(act.tts_voice, 'shimmer');
    assert.equal(act.audio_student_options, 'on');
  });

  test('Update überschreibt bestehenden Wert korrekt', () => {
    setActivityConfig('act-5', null, null, null, null, null, 'on', 'nova', null);
    setActivityConfig('act-5', null, null, null, null, null, 'off', 'alloy', null);
    const act = getActivity('act-5');
    assert.equal(act.audio_output, 'off');
    assert.equal(act.tts_voice, 'alloy');
  });

  test('Default audioOutput ist off wenn nicht gesetzt', () => {
    setActivityConfig('act-6', null, null, null, null, null, null, null, null);
    const act = getActivity('act-6');
    assert.equal(act.audio_output, 'off');
  });

  test('Default ttsVoice ist nova wenn nicht gesetzt', () => {
    setActivityConfig('act-7', null, null, null, null, null, null, null, null);
    const act = getActivity('act-7');
    assert.equal(act.tts_voice, 'nova');
  });
});
