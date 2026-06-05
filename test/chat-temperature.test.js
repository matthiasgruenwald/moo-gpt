/**
 * Tests für chat_temperature — Issue #186
 *
 * 1. chat-response: temperature-Übergabe an aiClient.stream()
 * 2. validators: chat_temperature-Validierung
 *
 * Run: node --test test/chat-temperature.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamResponse } from '../services/chat-response.js';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function makeWs() {
  const sent = [];
  return {
    isTeacher: false,
    userId: 'u1',
    readyState: 1,
    get OPEN() { return 1; },
    send(msg) { sent.push(JSON.parse(msg)); },
    _sent: sent,
  };
}

function makeSettings(overrides = {}) {
  return { activityId: 'act1', userId: 'u1', userName: 'Test', hints: '', task: '', ...overrides };
}

/**
 * Erstellt eine Fabrik mit steuerbarem aiClient.
 * capturedStreamArgs enthält die Argumente des letzten stream()-Aufrufs.
 */
function makeFactory({ widgetCfg = { math_mode: 'off', chat_temperature: null } } = {}) {
  const capturedStreamArgs = [];

  async function* makeStream() {
    yield { type: 'response.output_text.delta', delta: 'OK' };
    yield { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } };
  }

  const aiClient = {
    stream(...args) {
      capturedStreamArgs.push(args);
      return Promise.resolve(makeStream());
    },
  };

  const dashboardRegistry = { broadcast() {} };

  const deps = {
    buildInput:              (msgs) => msgs,
    getEffectiveModel:       () => 'gpt-4.1',
    buildInstructions:       () => 'sys',
    getStudentMemory:        () => null,
    getCachedConfig:         () => ({ content: 'prompt', model: 'gpt-4.1' }),
    getActiveErfahrungsprompt: () => null,
    getMessagesAll:          () => [],
    saveMessage:             () => 1,
    recordUsage:             async () => null,
    getWidgetConfig:         () => widgetCfg,
  };

  return {
    factory: createStreamResponse({ dashboardRegistry, aiClient }, deps),
    capturedStreamArgs,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chat_temperature → chat-response', () => {
  test('übergibt temperature an aiClient.stream() wenn chat_temperature gesetzt', async () => {
    const { factory, capturedStreamArgs } = makeFactory({
      widgetCfg: { math_mode: 'off', chat_temperature: 0.3 },
    });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    assert.equal(capturedStreamArgs.length, 1);
    const [_instructions, _input, _model, opts] = capturedStreamArgs[0];
    assert.ok(opts != null, 'opts sollte nicht null sein');
    assert.equal(opts.temperature, 0.3, 'temperature muss 0.3 sein');
  });

  test('übergibt kein temperature wenn chat_temperature null', async () => {
    const { factory, capturedStreamArgs } = makeFactory({
      widgetCfg: { math_mode: 'off', chat_temperature: null },
    });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    assert.equal(capturedStreamArgs.length, 1);
    const [_instructions, _input, _model, opts] = capturedStreamArgs[0];
    // opts sollte undefined oder ohne temperature-Key sein
    assert.ok(opts == null || !('temperature' in opts), 'temperature darf nicht gesetzt sein wenn null');
  });

  test('übergibt kein temperature wenn chat_temperature undefined', async () => {
    const { factory, capturedStreamArgs } = makeFactory({
      widgetCfg: { math_mode: 'off' },  // kein chat_temperature-Key
    });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    assert.equal(capturedStreamArgs.length, 1);
    const [_instructions, _input, _model, opts] = capturedStreamArgs[0];
    assert.ok(opts == null || !('temperature' in opts), 'temperature darf nicht gesetzt sein wenn undefined');
  });

  test('übergibt temperature 0 korrekt (Grenzwert)', async () => {
    const { factory, capturedStreamArgs } = makeFactory({
      widgetCfg: { math_mode: 'off', chat_temperature: 0 },
    });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    const [_instructions, _input, _model, opts] = capturedStreamArgs[0];
    // 0 ist ein gültiger Wert — muss explizit übergeben werden
    assert.ok(opts != null && 'temperature' in opts, 'temperature muss gesetzt sein wenn 0');
    assert.equal(opts.temperature, 0);
  });

  test('übergibt temperature 1 korrekt (Grenzwert)', async () => {
    const { factory, capturedStreamArgs } = makeFactory({
      widgetCfg: { math_mode: 'off', chat_temperature: 1 },
    });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    const [_instructions, _input, _model, opts] = capturedStreamArgs[0];
    assert.ok(opts != null && 'temperature' in opts, 'temperature muss gesetzt sein wenn 1');
    assert.equal(opts.temperature, 1);
  });
});
