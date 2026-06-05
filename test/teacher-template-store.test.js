/**
 * Tests für stores/teacher.js — Template-Funktionen mit Audio-Feldern + Modell (Issue #111)
 *
 * Stellt sicher dass createTeacherTemplate, updateTeacherTemplate, getTeacherTemplates,
 * setSystemTemplate und getSystemTemplate die neuen Felder korrekt lesen/schreiben.
 *
 * Verwendet In-Memory-SQLite via DB_PATH=:memory:
 * Run: node --test test/teacher-template-store.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { initDb } = await import('../db.js');
const {
  createTeacherTemplate,
  updateTeacherTemplate,
  getTeacherTemplates,
  setSystemTemplate,
  getSystemTemplate,
} = await import('../stores/teacher.js');

before(() => {
  initDb();
});

describe('createTeacherTemplate — Audio-Felder + Modell (Issue #111)', () => {
  test('speichert audioInput=on korrekt', () => {
    createTeacherTemplate('user-1', { name: 'T1', audioInput: 'on' });
    const templates = getTeacherTemplates('user-1');
    const t = templates.find(t => t.name === 'T1');
    assert.equal(t.audio_input, 'on');
  });

  test('speichert audioOutput=on und ttsVoice=echo korrekt', () => {
    createTeacherTemplate('user-1', { name: 'T2', audioOutput: 'on', ttsVoice: 'echo' });
    const templates = getTeacherTemplates('user-1');
    const t = templates.find(t => t.name === 'T2');
    assert.equal(t.audio_output, 'on');
    assert.equal(t.tts_voice, 'echo');
  });

  test('speichert audioStudentOptions=on korrekt', () => {
    createTeacherTemplate('user-1', { name: 'T3', audioStudentOptions: 'on' });
    const templates = getTeacherTemplates('user-1');
    const t = templates.find(t => t.name === 'T3');
    assert.equal(t.audio_student_options, 'on');
  });

  test('speichert model korrekt', () => {
    createTeacherTemplate('user-1', { name: 'T4', model: 'gpt-4o' });
    const templates = getTeacherTemplates('user-1');
    const t = templates.find(t => t.name === 'T4');
    assert.equal(t.model, 'gpt-4o');
  });

  test('model ist null wenn nicht gesetzt', () => {
    createTeacherTemplate('user-1', { name: 'T5' });
    const templates = getTeacherTemplates('user-1');
    const t = templates.find(t => t.name === 'T5');
    assert.equal(t.model, null);
  });

  test('Default-Werte: audioInput=off, audioOutput=off, ttsVoice=nova, audioStudentOptions=off', () => {
    createTeacherTemplate('user-2', { name: 'Defaults' });
    const templates = getTeacherTemplates('user-2');
    const t = templates[0];
    assert.equal(t.audio_input, 'off');
    assert.equal(t.audio_output, 'off');
    assert.equal(t.tts_voice, 'nova');
    assert.equal(t.audio_student_options, 'off');
  });

  test('speichert alle Audio-Felder + Modell gleichzeitig', () => {
    createTeacherTemplate('user-3', {
      name: 'Vollständig',
      audioInput: 'on', audioOutput: 'on', ttsVoice: 'shimmer',
      audioStudentOptions: 'on', model: 'gpt-4o-mini',
    });
    const templates = getTeacherTemplates('user-3');
    const t = templates[0];
    assert.equal(t.audio_input, 'on');
    assert.equal(t.audio_output, 'on');
    assert.equal(t.tts_voice, 'shimmer');
    assert.equal(t.audio_student_options, 'on');
    assert.equal(t.model, 'gpt-4o-mini');
  });
});

describe('updateTeacherTemplate — Audio-Felder + Modell (Issue #111)', () => {
  test('überschreibt Audio-Felder + Modell korrekt', () => {
    const id = createTeacherTemplate('user-4', {
      name: 'Update-Test',
      audioInput: 'off', audioOutput: 'off', ttsVoice: 'nova',
      audioStudentOptions: 'off', model: null,
    });
    updateTeacherTemplate(id, 'user-4', {
      name: 'Update-Test',
      audioInput: 'on', audioOutput: 'on', ttsVoice: 'alloy',
      audioStudentOptions: 'on', model: 'gpt-4o',
    });
    const templates = getTeacherTemplates('user-4');
    const t = templates[0];
    assert.equal(t.audio_input, 'on');
    assert.equal(t.audio_output, 'on');
    assert.equal(t.tts_voice, 'alloy');
    assert.equal(t.audio_student_options, 'on');
    assert.equal(t.model, 'gpt-4o');
  });

  test('setzt model auf null zurück wenn nicht übergeben', () => {
    const id = createTeacherTemplate('user-5', { name: 'NullModel', model: 'gpt-4o' });
    updateTeacherTemplate(id, 'user-5', { name: 'NullModel' });
    const templates = getTeacherTemplates('user-5');
    const t = templates[0];
    assert.equal(t.model, null);
  });
});

describe('setSystemTemplate / getSystemTemplate — Audio-Felder + Modell (Issue #111)', () => {
  test('speichert und liest audioInput korrekt', () => {
    setSystemTemplate({ audioInput: 'on' });
    const tpl = getSystemTemplate();
    assert.equal(tpl.audio_input, 'on');
  });

  test('speichert und liest audioOutput + ttsVoice korrekt', () => {
    setSystemTemplate({ audioOutput: 'on', ttsVoice: 'onyx' });
    const tpl = getSystemTemplate();
    assert.equal(tpl.audio_output, 'on');
    assert.equal(tpl.tts_voice, 'onyx');
  });

  test('speichert und liest audioStudentOptions korrekt', () => {
    setSystemTemplate({ audioStudentOptions: 'on' });
    const tpl = getSystemTemplate();
    assert.equal(tpl.audio_student_options, 'on');
  });

  test('speichert und liest model korrekt', () => {
    setSystemTemplate({ model: 'gpt-4o' });
    const tpl = getSystemTemplate();
    assert.equal(tpl.model, 'gpt-4o');
  });

  test('speichert alle neuen Felder gleichzeitig', () => {
    setSystemTemplate({
      title: 'System', botIcon: 'grw', opener: 'Hallo', uploadMode: 'off',
      hintsTemplate: 'Prompt', audioInput: 'on', audioOutput: 'on',
      ttsVoice: 'shimmer', audioStudentOptions: 'on', model: 'gpt-4o-mini',
    });
    const tpl = getSystemTemplate();
    assert.equal(tpl.audio_input, 'on');
    assert.equal(tpl.audio_output, 'on');
    assert.equal(tpl.tts_voice, 'shimmer');
    assert.equal(tpl.audio_student_options, 'on');
    assert.equal(tpl.model, 'gpt-4o-mini');
  });

  test('Überschreiben aktualisiert alle Felder', () => {
    setSystemTemplate({ audioInput: 'on', model: 'gpt-4o' });
    setSystemTemplate({ audioInput: 'off', model: null });
    const tpl = getSystemTemplate();
    assert.equal(tpl.audio_input, 'off');
    assert.equal(tpl.model, null);
  });
});

describe('createTeacherTemplate — assist_model, chat_temperature, assist_temperature (Issue #183)', () => {
  test('speichert assistModel korrekt', () => {
    createTeacherTemplate('user-10', { name: 'N1', assistModel: 'gpt-4o-mini' });
    const templates = getTeacherTemplates('user-10');
    assert.equal(templates[0].assist_model, 'gpt-4o-mini');
  });

  test('speichert chatTemperature und assistTemperature korrekt', () => {
    createTeacherTemplate('user-10', { name: 'N2', chatTemperature: 0.6, assistTemperature: 0.2 });
    const templates = getTeacherTemplates('user-10');
    const t = templates.find(t => t.name === 'N2');
    assert.equal(t.chat_temperature,   0.6);
    assert.equal(t.assist_temperature, 0.2);
  });

  test('neue Felder sind null wenn nicht gesetzt', () => {
    createTeacherTemplate('user-10', { name: 'N3' });
    const templates = getTeacherTemplates('user-10');
    const t = templates.find(t => t.name === 'N3');
    assert.equal(t.assist_model,       null);
    assert.equal(t.chat_temperature,   null);
    assert.equal(t.assist_temperature, null);
  });
});

describe('updateTeacherTemplate — assist_model, chat_temperature, assist_temperature (Issue #183)', () => {
  test('überschreibt neue Felder korrekt', () => {
    const id = createTeacherTemplate('user-11', {
      name: 'UpN',
      assistModel: 'gpt-4o', chatTemperature: 0.5, assistTemperature: 0.5,
    });
    updateTeacherTemplate(id, 'user-11', {
      name: 'UpN',
      assistModel: 'gpt-4.1-nano', chatTemperature: 0.1, assistTemperature: 0.9,
    });
    const templates = getTeacherTemplates('user-11');
    const t = templates[0];
    assert.equal(t.assist_model,       'gpt-4.1-nano');
    assert.equal(t.chat_temperature,   0.1);
    assert.equal(t.assist_temperature, 0.9);
  });

  test('setzt neue Felder auf null zurück wenn nicht übergeben', () => {
    const id = createTeacherTemplate('user-12', {
      name: 'NullBack',
      assistModel: 'gpt-4o', chatTemperature: 0.7, assistTemperature: 0.3,
    });
    updateTeacherTemplate(id, 'user-12', { name: 'NullBack' });
    const templates = getTeacherTemplates('user-12');
    const t = templates[0];
    assert.equal(t.assist_model,       null);
    assert.equal(t.chat_temperature,   null);
    assert.equal(t.assist_temperature, null);
  });
});

describe('setSystemTemplate / getSystemTemplate — assist_model, chat_temperature, assist_temperature (Issue #183)', () => {
  test('speichert und liest assistModel korrekt', () => {
    setSystemTemplate({ assistModel: 'gpt-4o-mini' });
    const tpl = getSystemTemplate();
    assert.equal(tpl.assist_model, 'gpt-4o-mini');
  });

  test('speichert und liest chatTemperature und assistTemperature korrekt', () => {
    setSystemTemplate({ chatTemperature: 0.4, assistTemperature: 0.8 });
    const tpl = getSystemTemplate();
    assert.equal(tpl.chat_temperature,   0.4);
    assert.equal(tpl.assist_temperature, 0.8);
  });

  test('neue Felder sind null wenn nicht gesetzt', () => {
    setSystemTemplate({ title: 'NullTest', assistModel: null, chatTemperature: null, assistTemperature: null });
    const tpl = getSystemTemplate();
    assert.equal(tpl.assist_model,       null);
    assert.equal(tpl.chat_temperature,   null);
    assert.equal(tpl.assist_temperature, null);
  });
});
