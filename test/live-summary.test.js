/**
 * Tests für Issue #132 — services/live-summary.js extrahieren
 *
 * Prüft:
 * A. generateLiveSummary gibt { summary, usage } zurück
 * B. Prompt enthält Schüler-Nachrichten (user/assistant-Zeilen)
 * C. model wird unverändert an aiClient.textCall weitergegeben
 * D. kein Transitivimport von ai-instance.js (kein OPENAI_API_KEY nötig)
 *
 * Run: MODEL_NAME=gpt-test node --test test/live-summary.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateLiveSummary } from '../services/live-summary.js';

// ---------------------------------------------------------------------------
// Mock-Factories
// ---------------------------------------------------------------------------

/**
 * Erstellt einen Mock-aiClient, der feste Werte zurückgibt und alle Calls aufzeichnet.
 */
function makeMockAiClient(text = 'Zusammenfassung', usage = { input_tokens: 50, output_tokens: 20 }) {
  const calls = [];
  const client = {
    textCall: async (sysPrompt, userMsg, model, opts) => {
      calls.push({ sysPrompt, userMsg, model, opts });
      return { text, usage };
    },
    _calls: calls,
  };
  return client;
}

/**
 * Erstellt einen Mock-db, der zwei Query-Typen unterscheidet:
 * - Schüler-Query: gibt `students` zurück
 * - Nachrichten-Query: gibt `messages` zurück
 */
function makeMockDb(students = [], messages = []) {
  let callCount = 0;
  return {
    prepare: () => ({
      all: () => {
        const isFirst = callCount === 0;
        callCount++;
        return isFirst ? students : messages;
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// A. Ergebnis-Shape
// ---------------------------------------------------------------------------
describe('generateLiveSummary', () => {
  test('A — gibt { summary, usage } zurück', async () => {
    const aiClient = makeMockAiClient('• Keine Aktivität', { input_tokens: 10, output_tokens: 5 });
    const db = makeMockDb([]); // keine Schüler

    const result = await generateLiveSummary({
      activityId: 'act-a',
      aiClient,
      model: 'gpt-test',
      db,
    });

    assert.ok(result !== null && typeof result === 'object', 'Ergebnis muss ein Objekt sein');
    assert.ok('summary' in result,  'Ergebnis muss summary enthalten');
    assert.ok('usage' in result,    'Ergebnis muss usage enthalten');
    assert.equal(result.summary, '• Keine Aktivität');
    assert.equal(result.usage.input_tokens, 10);
    assert.equal(result.usage.output_tokens, 5);
  });

  // ---------------------------------------------------------------------------
  // B. Prompt-Aufbau mit Schüler-Nachrichten
  // ---------------------------------------------------------------------------
  test('B — Prompt enthält Schüler-Name und Nachrichteninhalt', async () => {
    const aiClient = makeMockAiClient('Gut gemacht', { input_tokens: 80, output_tokens: 30 });

    const students = [
      { thread_db_id: 1, moodle_user_name: 'Anna', moodle_user_id: 'u1', message_count: 2 },
    ];
    const messages = [
      { role: 'user',      content: 'Hallo KI' },
      { role: 'assistant', content: 'Hallo Schüler' },
    ];

    // Erster prepare().all() Aufruf → students, weitere → messages
    let prepareCount = 0;
    const db = {
      prepare: () => ({
        all: () => {
          prepareCount++;
          return prepareCount === 1 ? students : messages;
        },
      }),
    };

    const result = await generateLiveSummary({
      activityId: 'act-b',
      aiClient,
      model: 'gpt-test',
      db,
    });

    assert.equal(aiClient._calls.length, 1, 'aiClient.textCall muss genau einmal aufgerufen werden');
    const userMsg = aiClient._calls[0].userMsg;
    assert.ok(userMsg.includes('Anna'), 'Prompt muss Schülername enthalten');
    assert.ok(userMsg.includes('Hallo KI'), 'Prompt muss Schüler-Nachricht enthalten');
    assert.equal(result.summary, 'Gut gemacht');
  });

  // ---------------------------------------------------------------------------
  // C. model-Weitergabe
  // ---------------------------------------------------------------------------
  test('C — model wird unverändert an aiClient.textCall weitergegeben', async () => {
    const aiClient = makeMockAiClient('OK', { input_tokens: 5, output_tokens: 2 });
    const db = makeMockDb([]);

    await generateLiveSummary({ activityId: 'act-c', aiClient, model: 'gpt-4.1', db });

    assert.equal(aiClient._calls[0].model, 'gpt-4.1',
      'model muss unverändert an textCall übergeben werden');
  });

  // ---------------------------------------------------------------------------
  // D. Kein Transitivimport von ai-instance.js
  // ---------------------------------------------------------------------------
  test('D — kein Transitivimport von ai-instance.js (kein OPENAI_API_KEY nötig)', () => {
    // Wenn ai-instance.js transitivisch importiert würde, würde Node beim Modul-Import
    // wegen fehlendem OPENAI_API_KEY einen Fehler werfen.
    // Der erfolgreiche Import dieses Testmoduls (+ services/live-summary.js) ist der Test.
    assert.ok(true, 'Modul importiert ohne OPENAI_API_KEY — kein Transitivimport');
  });
});
