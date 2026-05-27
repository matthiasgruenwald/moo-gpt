/**
 * Tests für stores/widget-config.js
 *
 * Deckt setWidgetConfig / getWidgetConfig ab:
 * - Roundtrip, Partial-Update, Defaults, unbekannte Felder
 *
 * Run: DB_PATH=:memory: node --test test/widget-config-store.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { initDb } = await import('../db.js');
const { upsertActivity } = await import('../stores/activity.js');
const { setWidgetConfig, getWidgetConfig } = await import('../stores/widget-config.js');

before(() => {
  initDb();
});

describe('setWidgetConfig / getWidgetConfig — Roundtrip', () => {
  test('Test A — Roundtrip: geschriebene Werte werden korrekt zurückgelesen', () => {
    // Aktivität muss existieren (upsertActivity legt sie an)
    upsertActivity('wc-1', 'TestAktivität');
    setWidgetConfig('wc-1', {
      opener: 'Hallo!',
      uploadMode: 'on',
      title: 'Mein Bot',
      botIcon: 'grw',
      audioInput: 'on',
      audioOutput: 'on',
      ttsVoice: 'echo',
      audioStudentOptions: 'on',
      model: 'gpt-4o',
    });
    const cfg = getWidgetConfig('wc-1');
    assert.equal(cfg.opener,               'Hallo!');
    assert.equal(cfg.upload_mode,          'on');
    assert.equal(cfg.title,                'Mein Bot');
    assert.equal(cfg.bot_icon,             'grw');
    assert.equal(cfg.audio_input,          'on');
    assert.equal(cfg.audio_output,         'on');
    assert.equal(cfg.tts_voice,            'echo');
    assert.equal(cfg.audio_student_options,'on');
    assert.equal(cfg.model,                'gpt-4o');
  });
});

describe('setWidgetConfig — Partial-Update', () => {
  test('Test B — nur audioOutput ändern, andere Felder bleiben unverändert', () => {
    upsertActivity('wc-2', 'PartialTest');
    setWidgetConfig('wc-2', {
      audioInput: 'on',
      audioOutput: 'off',
      ttsVoice: 'shimmer',
    });
    // Nur audioOutput aktualisieren
    setWidgetConfig('wc-2', { audioOutput: 'on' });
    const cfg = getWidgetConfig('wc-2');
    assert.equal(cfg.audio_output, 'on',      'audioOutput wurde aktualisiert');
    assert.equal(cfg.audio_input,  'on',      'audioInput bleibt unverändert');
    assert.equal(cfg.tts_voice,    'shimmer', 'ttsVoice bleibt unverändert');
  });
});

describe('setWidgetConfig — Defaults', () => {
  test('Test C — botIcon default grw, audioOutput default off, ttsVoice default nova, audioStudentOptions default off', () => {
    upsertActivity('wc-3', 'DefaultTest');
    setWidgetConfig('wc-3', {}); // kein Feld gesetzt
    const cfg = getWidgetConfig('wc-3');
    assert.equal(cfg.bot_icon,              'grw',  'botIcon default grw');
    assert.equal(cfg.audio_output,          'off',  'audioOutput default off');
    assert.equal(cfg.tts_voice,             'nova', 'ttsVoice default nova');
    assert.equal(cfg.audio_student_options, 'off',  'audioStudentOptions default off');
  });
});

describe('setWidgetConfig — unbekannte Felder', () => {
  test('Test D — unbekannte Felder im config-Objekt verursachen keinen SQL-Fehler', () => {
    upsertActivity('wc-4', 'UnknownFieldTest');
    assert.doesNotThrow(() => {
      setWidgetConfig('wc-4', {
        audioInput: 'on',
        unknownField: 'irgendwas',
        anotherUnknown: 42,
      });
    });
    const cfg = getWidgetConfig('wc-4');
    assert.equal(cfg.audio_input, 'on');
  });
});
