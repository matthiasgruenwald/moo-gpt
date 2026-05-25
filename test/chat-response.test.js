/**
 * Tests für services/chat-response.js — Issue #76
 * createStreamResponse() — DI-Factory für streamResponse.
 *
 * Alle Dependencies werden gemockt. Kein echter AI-Call, kein DB-Zugriff.
 *
 * Run: node --test test/chat-response.test.js
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamResponse } from '../services/chat-response.js';

// ── Mock-Helfer ──────────────────────────────────────────────────────────────

function makeWs(isTeacher = false, userId = 'u1') {
  const sent = [];
  return {
    isTeacher,
    userId,
    readyState: 1,   // OPEN
    get OPEN() { return 1; },
    send(msg) { sent.push(JSON.parse(msg)); },
    _sent: sent,
  };
}

function makeSettings(overrides = {}) {
  return { activityId: 'act1', userId: 'u1', userName: 'Test', hints: '', task: '', ...overrides };
}

/**
 * Erstellt eine vollständig gemockte deps-Variante für createStreamResponse.
 * Gibt die Fabrik-Funktion zurück; alle Mocks sind per Closure zugänglich.
 */
function makeFactory({
  chunks = ['Hallo', ' Welt'],
  usage = { input_tokens: 10, output_tokens: 5 },
  throwError = null,
} = {}) {
  // Fake async-iterator für aiClient.stream
  async function* makeStream() {
    if (throwError) throw throwError;
    for (const chunk of chunks) {
      yield { type: 'response.output_text.delta', delta: chunk };
    }
    yield { type: 'response.completed', response: { usage } };
  }

  const broadcastCalls = [];
  const saveMessageCalls = [];
  const recordUsageCalls = [];

  const aiClient = { stream: async () => makeStream() };
  const dashboardRegistry = {
    broadcast(activityId, payload) { broadcastCalls.push({ activityId, payload }); },
  };

  const deps = {
    // Direct dependencies (will be injected via createStreamResponse factory)
    aiClient,
    dashboardRegistry,
    // Module-level deps injected via the module's DI params:
    buildInput:              (msgs) => msgs,
    getEffectiveModel:       () => 'gpt-5',
    buildInstructions:       () => 'sys',
    getStudentMemory:        () => null,
    getCachedConfig:         () => ({ content: 'prompt', model: 'gpt-5' }),
    getActiveErfahrungsprompt: () => null,
    getMessagesAll:          () => [{ role: 'user', content: 'hi' }],
    saveMessage:             (m) => { saveMessageCalls.push(m); return 42; },
    recordUsage:             async (...args) => { recordUsageCalls.push(args); return { runCost: 1, threadCost: 2, activityCost: 3 }; },
  };

  return {
    factory: createStreamResponse({ dashboardRegistry, aiClient }, deps),
    broadcastCalls,
    saveMessageCalls,
    recordUsageCalls,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createStreamResponse', () => {
  test('gibt eine Funktion zurück', () => {
    const { factory } = makeFactory();
    assert.equal(typeof factory, 'function');
  });

  test('streamt Chunks via ws.send und sendet End-Frame', async () => {
    const { factory } = makeFactory({ chunks: ['Hallo', ' Welt'] });
    const ws = makeWs();
    await factory(ws, makeSettings(), 1);

    // Mindestens ein Chunk-Frame und ein End-Frame
    const frames = ws._sent;
    assert.ok(frames.length >= 2, 'mindestens 2 Frames erwartet');

    const endFrame = frames.at(-1);
    assert.equal(endFrame.end, true);
    assert.equal(endFrame.messages, 'Hallo Welt');
  });

  test('speichert Assistenten-Antwort via saveMessage', async () => {
    const { factory, saveMessageCalls } = makeFactory({ chunks: ['OK'] });
    const ws = makeWs();
    await factory(ws, makeSettings(), 7);

    assert.equal(saveMessageCalls.length, 1);
    assert.equal(saveMessageCalls[0].role, 'assistant');
    assert.equal(saveMessageCalls[0].content, 'OK');
    assert.equal(saveMessageCalls[0].thread_db_id, 7);
  });

  test('ruft recordUsage mit korrekten Parametern auf', async () => {
    const usage = { input_tokens: 20, output_tokens: 8 };
    const { factory, recordUsageCalls } = makeFactory({ chunks: ['hi'], usage });
    const ws = makeWs();
    await factory(ws, makeSettings({ activityId: 'act99' }), 5);

    assert.equal(recordUsageCalls.length, 1);
    const [threadId, activityId, model, usageArg, msgId] = recordUsageCalls[0];
    assert.equal(threadId, 5);
    assert.equal(activityId, 'act99');
    assert.equal(model, 'gpt-5');
    assert.deepEqual(usageArg, usage);
    assert.equal(msgId, 42);  // saveMessage returned 42
  });

  test('broadcastet an dashboardRegistry wenn activityId gesetzt', async () => {
    const { factory, broadcastCalls } = makeFactory({ chunks: ['X'] });
    const ws = makeWs();
    await factory(ws, makeSettings({ activityId: 'actABC' }), 3);

    assert.equal(broadcastCalls.length, 1);
    assert.equal(broadcastCalls[0].activityId, 'actABC');
    assert.equal(broadcastCalls[0].payload.type, 'newMessage');
    assert.equal(broadcastCalls[0].payload.role, 'assistant');
  });

  test('kein Broadcast wenn activityId fehlt', async () => {
    const { factory, broadcastCalls } = makeFactory({ chunks: ['X'] });
    const ws = makeWs();
    await factory(ws, makeSettings({ activityId: null }), 3);

    assert.equal(broadcastCalls.length, 0);
  });

  test('Fehlerfall: AI-Fehler → End-Frame mit Error-Message, kein Crash', async () => {
    const err = new Error('AI unavailable');
    const { factory } = makeFactory({ throwError: err });
    const ws = makeWs();

    await factory(ws, makeSettings(), 1);  // darf nicht werfen

    const frames = ws._sent;
    const endFrame = frames.at(-1);
    assert.equal(endFrame.end, true);
    assert.ok(endFrame.messages.includes('AI unavailable'), 'Fehlermeldung im End-Frame');
  });
});
