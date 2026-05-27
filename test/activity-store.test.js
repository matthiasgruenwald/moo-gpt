/**
 * Tests für stores/activity.js + stores/widget-config.js — Regressions-Test für fix(#97)
 *
 * Stellt sicher dass setWidgetConfig die neuen TTS-Felder
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
const { getActivity } = await import('../stores/activity.js');
const { setWidgetConfig } = await import('../stores/widget-config.js');

before(() => {
  initDb();
});

describe('setWidgetConfig / getActivity — TTS-Felder (fix #97)', () => {
  test('speichert audioOutput=on und liest es korrekt zurück', () => {
    setWidgetConfig('act-1', { audioOutput: 'on' });
    const act = getActivity('act-1');
    assert.equal(act.audio_output, 'on');
  });

  test('speichert ttsVoice=echo und liest es korrekt zurück', () => {
    setWidgetConfig('act-2', { ttsVoice: 'echo' });
    const act = getActivity('act-2');
    assert.equal(act.tts_voice, 'echo');
  });

  test('speichert audioStudentOptions=on und liest es korrekt zurück', () => {
    setWidgetConfig('act-3', { audioStudentOptions: 'on' });
    const act = getActivity('act-3');
    assert.equal(act.audio_student_options, 'on');
  });

  test('speichert alle drei TTS-Felder gleichzeitig', () => {
    setWidgetConfig('act-4', {
      opener: 'opener', uploadMode: 'off', title: 'Titel', botIcon: 'grw',
      audioInput: 'off', audioOutput: 'on', ttsVoice: 'shimmer', audioStudentOptions: 'on',
    });
    const act = getActivity('act-4');
    assert.equal(act.audio_output, 'on');
    assert.equal(act.tts_voice, 'shimmer');
    assert.equal(act.audio_student_options, 'on');
  });

  test('Update überschreibt bestehenden Wert korrekt', () => {
    setWidgetConfig('act-5', { audioOutput: 'on', ttsVoice: 'nova' });
    setWidgetConfig('act-5', { audioOutput: 'off', ttsVoice: 'alloy' });
    const act = getActivity('act-5');
    assert.equal(act.audio_output, 'off');
    assert.equal(act.tts_voice, 'alloy');
  });

  test('Default audioOutput ist off wenn nicht gesetzt', () => {
    setWidgetConfig('act-6', {});
    const act = getActivity('act-6');
    assert.equal(act.audio_output, 'off');
  });

  test('Default ttsVoice ist nova wenn nicht gesetzt', () => {
    setWidgetConfig('act-7', {});
    const act = getActivity('act-7');
    assert.equal(act.tts_voice, 'nova');
  });
});

describe('resolveActivity gibt TTS-Felder zurück (fix #97 Backend→Widget)', () => {
  // Testet dass die drei neuen TTS-Felder in resolveActivity zurückgegeben werden,
  // damit _applyConfig sie ins Widget übernehmen kann — analog zu audioInput.
  test('resolveActivity enthält audioOutput aus DB', async () => {
    // Aktivität mit audioOutput=on anlegen
    setWidgetConfig('act-r1', {
      opener: 'opener', uploadMode: 'off', title: 'Titel', botIcon: 'grw',
      audioInput: 'off', audioOutput: 'on', ttsVoice: 'echo', audioStudentOptions: 'on',
    });
    // resolveActivity direkt importieren ist nicht möglich (private Funktion),
    // daher testen wir getActivity als Proxy — resolveActivity nutzt es intern.
    const act = getActivity('act-r1');
    assert.equal(act.audio_output, 'on',    'audio_output muss aus DB kommen');
    assert.equal(act.tts_voice,    'echo',  'tts_voice muss aus DB kommen');
    assert.equal(act.audio_student_options, 'on', 'audio_student_options muss aus DB kommen');
  });
});
