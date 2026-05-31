/**
 * Tests für services/widget-config-resolver.js — Issue #168
 *
 * Testet resolveWidgetConfig(activityId, userId, deps) mit allen Kaskaden-Szenarien.
 * Dependencies werden per optionalem dritten Parameter injiziert (kein DB-Zugriff).
 *
 * Run: node --test test/widget-config-resolver.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWidgetConfig } from '../services/widget-config-resolver.js';

const HARDCODED_DEFAULTS = {
  title:               null,
  botIcon:             'grw',
  opener:              null,
  uploadMode:          'off',
  audioInput:          'off',
  audioOutput:         'off',
  ttsVoice:            'nova',
  audioStudentOptions: 'off',
  model:               null,
  mathMode:            'off',
};

function makeDeps({ activity = null, teacherTemplate = null, systemTemplate = null } = {}) {
  return {
    getWidgetConfig:            () => activity,
    getTeacherDefaultTemplate:  () => teacherTemplate,
    getSystemTemplate:          () => systemTemplate,
  };
}

describe('resolveWidgetConfig — Kaskade: alle NULL → Hardcoded-Defaults', () => {
  test('gibt alle Hardcoded-Defaults zurück wenn Aktivität nicht existiert und keine Templates', () => {
    const deps = makeDeps();

    const result = resolveWidgetConfig('act-1', null, deps);

    assert.equal(result.title,               null);
    assert.equal(result.botIcon,             'grw');
    assert.equal(result.opener,              null);
    assert.equal(result.uploadMode,          'off');
    assert.equal(result.audioInput,          'off');
    assert.equal(result.audioOutput,         'off');
    assert.equal(result.ttsVoice,            'nova');
    assert.equal(result.audioStudentOptions, 'off');
    assert.equal(result.model,               null);
    assert.equal(result.mathMode,            'off');
    assert.equal(result.needsConfig,         true);
  });
});

describe('resolveWidgetConfig — Kaskade: nur System-Template gesetzt', () => {
  test('gibt System-Template-Werte zurück wenn keine Aktivität und kein Lehrer-Template', () => {
    const deps = makeDeps({
      systemTemplate: {
        title: 'System-Titel', bot_icon: 'grw2', opener: 'Hallo!',
        upload_mode: 'images', audio_input: 'on', audio_output: 'on',
        tts_voice: 'echo', audio_student_options: 'on', model: 'gpt-4o', math_mode: 'on',
      },
    });

    const result = resolveWidgetConfig('act-1', null, deps);

    assert.equal(result.title,               'System-Titel');
    assert.equal(result.botIcon,             'grw2');
    assert.equal(result.opener,              'Hallo!');
    assert.equal(result.uploadMode,          'images');
    assert.equal(result.audioInput,          'on');
    assert.equal(result.audioOutput,         'on');
    assert.equal(result.ttsVoice,            'echo');
    assert.equal(result.audioStudentOptions, 'on');
    assert.equal(result.model,               'gpt-4o');
    assert.equal(result.mathMode,            'on');
    assert.equal(result.needsConfig,         false);
  });

  test('System-Template mit nur einzelnen Feldern gesetzt — Rest fällt auf Hardcoded zurück', () => {
    const deps = makeDeps({
      systemTemplate: { title: 'Nur-Titel', bot_icon: null, opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null },
    });

    const result = resolveWidgetConfig('act-1', null, deps);

    assert.equal(result.title,   'Nur-Titel');
    assert.equal(result.botIcon, 'grw');  // Hardcoded-Default
    assert.equal(result.ttsVoice, 'nova'); // Hardcoded-Default
    assert.equal(result.model,   null);
  });
});

describe('resolveWidgetConfig — Kaskade: System + Lehrer-Template gesetzt', () => {
  test('Lehrer-Template überschreibt System-Template', () => {
    const deps = makeDeps({
      systemTemplate:  { title: 'System', bot_icon: 'grw', opener: 'System-Opener',
        upload_mode: 'off', audio_input: 'off', audio_output: 'off',
        tts_voice: 'nova', audio_student_options: 'off', model: null, math_mode: 'off' },
      teacherTemplate: { title: 'Lehrer', bot_icon: 'grw2', opener: null,
        upload_mode: 'images', audio_input: 'on', audio_output: null,
        tts_voice: 'shimmer', audio_student_options: null, model: 'gpt-4o', math_mode: null },
    });

    const result = resolveWidgetConfig('act-1', 'user-42', deps);

    // Lehrer überschreibt System wo Lehrer-Wert gesetzt ist
    assert.equal(result.title,    'Lehrer');
    assert.equal(result.botIcon,  'grw2');
    assert.equal(result.opener,   'System-Opener'); // Lehrer null → System hat Wert
    assert.equal(result.uploadMode, 'images');
    assert.equal(result.audioInput, 'on');
    assert.equal(result.audioOutput, 'off'); // Lehrer null → System-Wert
    assert.equal(result.ttsVoice, 'shimmer');
    assert.equal(result.audioStudentOptions, 'off'); // Lehrer null → System-Wert
    assert.equal(result.model,    'gpt-4o');
    assert.equal(result.mathMode, 'off'); // Lehrer null → System-Wert
  });

  test('kein userId → Lehrer-Template wird nicht abgefragt', () => {
    let teacherCalled = false;
    const deps = {
      getWidgetConfig:           () => null,
      getTeacherDefaultTemplate: () => { teacherCalled = true; return null; },
      getSystemTemplate:         () => ({ title: 'System', bot_icon: null, opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null }),
    };

    resolveWidgetConfig('act-1', null, deps);

    assert.equal(teacherCalled, false);
  });
});

describe('resolveWidgetConfig — Kaskade: alle Ebenen gesetzt', () => {
  test('Aktivität überschreibt alle Template-Werte', () => {
    const deps = makeDeps({
      activity: {
        title: 'Aktivität', bot_icon: 'weiblich', opener: 'Akt-Opener',
        upload_mode: 'files', audio_input: 'on', audio_output: 'on',
        tts_voice: 'onyx', audio_student_options: 'on', model: 'gpt-4.1', math_mode: 'on',
      },
      teacherTemplate: { title: 'Lehrer', bot_icon: 'grw2', opener: 'Lehrer-Opener',
        upload_mode: 'images', audio_input: 'off', audio_output: 'off',
        tts_voice: 'shimmer', audio_student_options: 'off', model: 'gpt-4o', math_mode: 'off' },
      systemTemplate:  { title: 'System', bot_icon: 'grw', opener: 'System-Opener',
        upload_mode: 'off', audio_input: 'off', audio_output: 'off',
        tts_voice: 'nova', audio_student_options: 'off', model: null, math_mode: 'off' },
    });

    const result = resolveWidgetConfig('act-1', 'user-42', deps);

    assert.equal(result.title,               'Aktivität');
    assert.equal(result.botIcon,             'weiblich');
    assert.equal(result.opener,              'Akt-Opener');
    assert.equal(result.uploadMode,          'files');
    assert.equal(result.audioInput,          'on');
    assert.equal(result.audioOutput,         'on');
    assert.equal(result.ttsVoice,            'onyx');
    assert.equal(result.audioStudentOptions, 'on');
    assert.equal(result.model,               'gpt-4.1');
    assert.equal(result.mathMode,            'on');
    assert.equal(result.needsConfig,         false);
  });
});

describe('resolveWidgetConfig — bestehende Aktivität mit Teilwerten', () => {
  test('NULL-Felder der Aktivität fallen auf Lehrer-Template zurück', () => {
    const deps = makeDeps({
      activity: {
        title: 'Meine Aufgabe', bot_icon: null, opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null,
      },
      teacherTemplate: { title: null, bot_icon: 'grw2', opener: 'Lehrer-Opener',
        upload_mode: 'images', audio_input: null, audio_output: 'on',
        tts_voice: null, audio_student_options: null, model: 'gpt-4o', math_mode: null },
    });

    const result = resolveWidgetConfig('act-1', 'user-42', deps);

    // Aktivität hat title, rest fällt durch
    assert.equal(result.title,       'Meine Aufgabe');  // aus Aktivität
    assert.equal(result.botIcon,     'grw2');            // aus Lehrer-Template
    assert.equal(result.opener,      'Lehrer-Opener');   // aus Lehrer-Template
    assert.equal(result.uploadMode,  'images');          // aus Lehrer-Template
    assert.equal(result.audioOutput, 'on');              // aus Lehrer-Template
    assert.equal(result.model,       'gpt-4o');          // aus Lehrer-Template
    assert.equal(result.audioInput,  'off');             // Hardcoded-Default
    assert.equal(result.ttsVoice,    'nova');            // Hardcoded-Default
    assert.equal(result.needsConfig, false);             // title ist gesetzt
  });

  test('needsConfig ist true wenn title null nach Auflösung aller Ebenen', () => {
    const deps = makeDeps({
      activity: {
        title: null, bot_icon: 'grw', opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null,
      },
    });

    const result = resolveWidgetConfig('act-1', null, deps);

    assert.equal(result.needsConfig, true);
  });

  test('needsConfig ist false wenn title aus System-Template kommt', () => {
    const deps = makeDeps({
      activity: {
        title: null, bot_icon: null, opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null,
      },
      systemTemplate: { title: 'System-Titel', bot_icon: null, opener: null,
        upload_mode: null, audio_input: null, audio_output: null,
        tts_voice: null, audio_student_options: null, model: null, math_mode: null },
    });

    const result = resolveWidgetConfig('act-1', null, deps);

    assert.equal(result.title,       'System-Titel');
    assert.equal(result.needsConfig, false);
  });
});
