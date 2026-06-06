/**
 * Unit-Tests für den objektförmigen validateWidgetConfig-Contract — Issue #198 (VS2, ADR 0008)
 *
 * Verifiziert:
 * - REASONING_MODEL_PREFIXES ist exportiert
 * - isReasoningModel nutzt REASONING_MODEL_PREFIXES
 * - validateWidgetConfig(cfg, { availableModels, allowedBotIcons }) prüft alle Felder
 * - sanitizeWidgetConfig gibt ein normalisiertes Konfig-Objekt zurück
 *
 * Run: node --test test/validate-widget-config-contract.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REASONING_MODEL_PREFIXES,
  isReasoningModel,
  validateWidgetConfig,
  sanitizeWidgetConfig,
  VALID_TTS_VOICES,
  VALID_AUDIO_OUTPUTS,
  VALID_AUDIO_STUDENT_OPTIONS,
  VALID_UPLOAD_MODES,
} from '../validators.js';

// ── REASONING_MODEL_PREFIXES ───────────────────────────────────────────────────

describe('REASONING_MODEL_PREFIXES', () => {
  test('ist ein Array', () => {
    assert.ok(Array.isArray(REASONING_MODEL_PREFIXES));
  });

  test('enthält o1, o3, o4-, gpt-5', () => {
    assert.ok(REASONING_MODEL_PREFIXES.some(p => p === 'o1' || 'o1-'.startsWith(p)));
    assert.ok(REASONING_MODEL_PREFIXES.some(p => 'o3-preview'.startsWith(p)));
    assert.ok(REASONING_MODEL_PREFIXES.some(p => 'o4-mini'.startsWith(p)));
    assert.ok(REASONING_MODEL_PREFIXES.some(p => 'gpt-5'.startsWith(p)));
  });

  test('Muster stimmt mit VS3-Frontend-Regex überein (o1|o3|o4-|gpt-5)', () => {
    // Diese Modelle müssen als Reasoning erkannt werden
    const reasoningModels = ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini'];
    for (const m of reasoningModels) {
      assert.ok(isReasoningModel(m), `${m} sollte als Reasoning erkannt werden`);
    }
    // Diese nicht
    const nonReasoning = ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo', ''];
    for (const m of nonReasoning) {
      assert.ok(!isReasoningModel(m), `${m} sollte NICHT als Reasoning erkannt werden`);
    }
  });
});

// ── isReasoningModel ──────────────────────────────────────────────────────────

describe('isReasoningModel', () => {
  test('o1 → true', () => assert.ok(isReasoningModel('o1')));
  test('o1-mini → true', () => assert.ok(isReasoningModel('o1-mini')));
  test('o3 → true', () => assert.ok(isReasoningModel('o3')));
  test('o4-mini → true', () => assert.ok(isReasoningModel('o4-mini')));
  test('gpt-5 → true', () => assert.ok(isReasoningModel('gpt-5')));
  test('gpt-5-mini → true', () => assert.ok(isReasoningModel('gpt-5-mini')));
  test('gpt-4o → false', () => assert.ok(!isReasoningModel('gpt-4o')));
  test('gpt-4.1 → false', () => assert.ok(!isReasoningModel('gpt-4.1')));
  test('leerer String → false', () => assert.ok(!isReasoningModel('')));
  test('undefined → false', () => assert.ok(!isReasoningModel(undefined)));
  test('null → false', () => assert.ok(!isReasoningModel(null)));
});

// ── validateWidgetConfig (objektförmiger Contract) ────────────────────────────

describe('validateWidgetConfig — objektförmiger Contract', () => {
  const MODELS = ['gpt-4.1', 'gpt-4.1-mini'];
  const ICONS = ['grw', 'grw2'];

  const opts = { availableModels: MODELS, allowedBotIcons: ICONS };

  test('leeres cfg-Objekt → null (kein Fehler)', () => {
    assert.strictEqual(validateWidgetConfig({}, opts), null);
  });

  test('alles undefined → null (kein Fehler)', () => {
    assert.strictEqual(
      validateWidgetConfig({ uploadMode: undefined, botIcon: undefined }, opts),
      null
    );
  });

  // uploadMode
  test('ungültiger uploadMode → Fehlerstring', () => {
    const err = validateWidgetConfig({ uploadMode: 'invalid' }, opts);
    assert.ok(typeof err === 'string' && err.length > 0);
  });

  test('gültiger uploadMode → null', () => {
    for (const v of VALID_UPLOAD_MODES) {
      assert.strictEqual(validateWidgetConfig({ uploadMode: v }, opts), null, `uploadMode=${v}`);
    }
  });

  // botIcon
  test('ungültiges botIcon → Fehlerstring', () => {
    const err = validateWidgetConfig({ botIcon: 'unbekannt' }, opts);
    assert.ok(typeof err === 'string' && err.length > 0);
  });

  test('gültiges botIcon → null', () => {
    assert.strictEqual(validateWidgetConfig({ botIcon: 'grw' }, opts), null);
  });

  test('botIcon leer → null', () => {
    assert.strictEqual(validateWidgetConfig({ botIcon: '' }, opts), null);
  });

  // audioOutput
  test('ungültiger audioOutput → Fehlerstring', () => {
    const err = validateWidgetConfig({ audioOutput: 'bad' }, opts);
    assert.ok(typeof err === 'string', 'audioOutput=bad muss Fehler erzeugen');
  });

  test('gültiger audioOutput → null', () => {
    for (const v of VALID_AUDIO_OUTPUTS) {
      assert.strictEqual(validateWidgetConfig({ audioOutput: v }, opts), null, `audioOutput=${v}`);
    }
  });

  // ttsVoice
  test('ungültige ttsVoice → Fehlerstring', () => {
    const err = validateWidgetConfig({ ttsVoice: 'robot-voice' }, opts);
    assert.ok(typeof err === 'string', 'ttsVoice=robot-voice muss Fehler erzeugen');
  });

  test('gültige ttsVoice → null', () => {
    for (const v of VALID_TTS_VOICES) {
      assert.strictEqual(validateWidgetConfig({ ttsVoice: v }, opts), null, `ttsVoice=${v}`);
    }
  });

  // audioStudentOptions
  test('ungültige audioStudentOptions → Fehlerstring', () => {
    const err = validateWidgetConfig({ audioStudentOptions: 'maybe' }, opts);
    assert.ok(typeof err === 'string', 'audioStudentOptions=maybe muss Fehler erzeugen');
  });

  test('gültige audioStudentOptions → null', () => {
    for (const v of VALID_AUDIO_STUDENT_OPTIONS) {
      assert.strictEqual(validateWidgetConfig({ audioStudentOptions: v }, opts), null);
    }
  });

  // model (via availableModels)
  test('ungültiges model → Fehlerstring', () => {
    const err = validateWidgetConfig({ model: 'unbekannt-modell' }, opts);
    assert.ok(typeof err === 'string', 'model=unbekannt muss Fehler erzeugen');
  });

  test('gültiges model → null', () => {
    assert.strictEqual(validateWidgetConfig({ model: 'gpt-4.1' }, opts), null);
  });

  test('model leer/null → null (kein explizites Modell)', () => {
    assert.strictEqual(validateWidgetConfig({ model: '' }, opts), null);
    assert.strictEqual(validateWidgetConfig({ model: null }, opts), null);
  });

  // Alle Felder gleichzeitig, alle ungültig → erste Fehlermeldung
  test('mehrere ungültige Felder → gibt String zurück (erstes Fehler)', () => {
    const err = validateWidgetConfig(
      { uploadMode: 'evil', ttsVoice: 'robot', audioOutput: 'bad' },
      opts
    );
    assert.ok(typeof err === 'string');
  });

  // Alle Felder gültig — Roundtrip
  test('vollständig gültige Konfig → null', () => {
    const cfg = {
      uploadMode: 'off',
      botIcon: 'grw',
      audioInput: 'on',
      audioOutput: 'on',
      ttsVoice: 'nova',
      audioStudentOptions: 'off',
      mathMode: 'off',
      model: 'gpt-4.1',
    };
    assert.strictEqual(validateWidgetConfig(cfg, opts), null);
  });
});

// ── sanitizeWidgetConfig ──────────────────────────────────────────────────────

describe('sanitizeWidgetConfig', () => {
  const MODELS = ['gpt-4.1', 'gpt-4.1-mini'];
  const opts = { availableModels: MODELS };

  test('model null → null', () => {
    const out = sanitizeWidgetConfig({ model: null }, opts);
    assert.strictEqual(out.model, null);
  });

  test('model leer → null', () => {
    const out = sanitizeWidgetConfig({ model: '' }, opts);
    assert.strictEqual(out.model, null);
  });

  test('gültiges model bleibt erhalten', () => {
    const out = sanitizeWidgetConfig({ model: 'gpt-4.1' }, opts);
    assert.strictEqual(out.model, 'gpt-4.1');
  });

  test('ungültiges model → null (silent strip nach validateWidgetConfig-Check)', () => {
    const out = sanitizeWidgetConfig({ model: 'unbekannt' }, opts);
    assert.strictEqual(out.model, null);
  });

  test('chatTemperature "0.5" → 0.5 (Number)', () => {
    const out = sanitizeWidgetConfig({ chatTemperature: '0.5' }, opts);
    assert.strictEqual(out.chatTemperature, 0.5);
  });

  test('chatTemperature leer → null', () => {
    const out = sanitizeWidgetConfig({ chatTemperature: '' }, opts);
    assert.strictEqual(out.chatTemperature, null);
  });

  test('chatTemperature null → null', () => {
    const out = sanitizeWidgetConfig({ chatTemperature: null }, opts);
    assert.strictEqual(out.chatTemperature, null);
  });

  test('assistModel null → null', () => {
    const out = sanitizeWidgetConfig({ assistModel: null }, opts);
    assert.strictEqual(out.assistModel, null);
  });

  test('assistModel leer → null', () => {
    const out = sanitizeWidgetConfig({ assistModel: '' }, opts);
    assert.strictEqual(out.assistModel, null);
  });

  test('gültiges assistModel bleibt erhalten', () => {
    const out = sanitizeWidgetConfig({ assistModel: 'gpt-4.1-mini' }, opts);
    assert.strictEqual(out.assistModel, 'gpt-4.1-mini');
  });

  test('assistTemperature "0.3" → 0.3', () => {
    const out = sanitizeWidgetConfig({ assistTemperature: '0.3' }, opts);
    assert.strictEqual(out.assistTemperature, 0.3);
  });

  test('assistTemperature leer → null', () => {
    const out = sanitizeWidgetConfig({ assistTemperature: '' }, opts);
    assert.strictEqual(out.assistTemperature, null);
  });

  test('gibt unveränderliche Felder durch (opener, title usw.)', () => {
    const out = sanitizeWidgetConfig({ opener: 'Hallo', title: 'Test', mathMode: 'on' }, opts);
    assert.strictEqual(out.opener, 'Hallo');
    assert.strictEqual(out.title, 'Test');
    assert.strictEqual(out.mathMode, 'on');
  });

  test('Roundtrip: vollständige Konfig bleibt konsistent', () => {
    const cfg = {
      opener: 'Hi', title: 'T', botIcon: 'grw', uploadMode: 'off',
      hintsTemplate: 'hint', audioInput: 'on', audioOutput: 'on',
      ttsVoice: 'nova', audioStudentOptions: 'off', mathMode: 'off',
      model: 'gpt-4.1', chatTemperature: 0.7, assistModel: 'gpt-4.1-mini',
      assistTemperature: 0.3,
    };
    const out = sanitizeWidgetConfig(cfg, opts);
    assert.strictEqual(out.model, 'gpt-4.1');
    assert.strictEqual(out.chatTemperature, 0.7);
    assert.strictEqual(out.assistModel, 'gpt-4.1-mini');
    assert.strictEqual(out.assistTemperature, 0.3);
  });
});
