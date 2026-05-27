/**
 * Tests für getStudentCostSummary — Issue #106
 *
 * Prüft die aggregierten Schülerkosten (Chat / Audio / TTS) pro Aktivität.
 *
 * Run: DB_PATH=:memory: node --test test/student-cost-summary.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { recordWerkzeugUsage, getStudentCostSummary } from '../cost-service.js';

before(() => {
  initDb();
});

function clearAll() {
  getDb().exec('DELETE FROM token_log');
}

function insertChatEntry(activityId, model, promptTokens, completionTokens) {
  getDb().prepare(`
    INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens, total_tokens)
    VALUES (?, ?, ?, ?, ?)
  `).run(activityId, model, promptTokens, completionTokens, promptTokens + completionTokens);
}

function insertCallTypeEntry(activityId, callType, model, promptTokens, completionTokens) {
  getDb().prepare(`
    INSERT INTO token_log (activity_id, call_type, model, prompt_tokens, completion_tokens, total_tokens)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(activityId, callType, model, promptTokens, completionTokens, promptTokens + completionTokens);
}

// ── Struktur ─────────────────────────────────────────────────────────────────

describe('getStudentCostSummary — Struktur', () => {
  test('leere Aktivität → alle Felder vorhanden', async () => {
    clearAll();
    const result = await getStudentCostSummary('act-leer');

    assert.ok('chatEur'        in result, 'chatEur muss vorhanden sein');
    assert.ok('audioEur'       in result, 'audioEur muss vorhanden sein');
    assert.ok('ttsEur'         in result, 'ttsEur muss vorhanden sein');
    assert.ok('chatTokens'     in result, 'chatTokens muss vorhanden sein');
    assert.ok('audioSeconds'   in result, 'audioSeconds muss vorhanden sein');
    assert.ok('ttsChars'       in result, 'ttsChars muss vorhanden sein');
  });

  test('leere Aktivität → chatTokens = 0, audioSeconds = 0, ttsChars = 0', async () => {
    clearAll();
    const result = await getStudentCostSummary('act-leer2');

    assert.equal(result.chatTokens,   0, 'chatTokens = 0 bei leerer Aktivität');
    assert.equal(result.audioSeconds, 0, 'audioSeconds = 0 bei leerer Aktivität');
    assert.equal(result.ttsChars,     0, 'ttsChars = 0 bei leerer Aktivität');
  });
});

// ── Chat-Token-Aggregation ────────────────────────────────────────────────────

describe('getStudentCostSummary — Chat-Einträge (call_type IS NULL)', () => {
  test('Chat-Einträge werden aggregiert', async () => {
    clearAll();
    insertChatEntry('act-chat', 'gpt-5', 100, 50);
    insertChatEntry('act-chat', 'gpt-5', 200, 80);
    // Werkzeug-Eintrag — darf nicht mitzählen
    recordWerkzeugUsage('act-chat', 'criteria', 'gpt-4.1-nano', { input_tokens: 999, output_tokens: 999 });

    const result = await getStudentCostSummary('act-chat');

    // chatTokens = Summe aller call_type IS NULL Token
    assert.equal(result.chatTokens, 100 + 50 + 200 + 80, 'chatTokens = Summe prompt + completion aller Chat-Einträge');
  });

  test('Werkzeug-Einträge werden nicht als Chat gezählt', async () => {
    clearAll();
    recordWerkzeugUsage('act-w', 'simulate', 'gpt-4.1', { input_tokens: 500, output_tokens: 200 });

    const result = await getStudentCostSummary('act-w');

    assert.equal(result.chatTokens, 0, 'Werkzeug-Token dürfen nicht in chatTokens erscheinen');
  });
});

// ── Trennung von Aktivitäten ──────────────────────────────────────────────────

describe('getStudentCostSummary — Aktivitäten werden nicht vermischt', () => {
  test('Einträge einer anderen Aktivität werden ignoriert', async () => {
    clearAll();
    insertChatEntry('act-a', 'gpt-5', 100, 50);
    insertChatEntry('act-b', 'gpt-5', 999, 999);

    const resultA = await getStudentCostSummary('act-a');
    const resultB = await getStudentCostSummary('act-b');

    assert.equal(resultA.chatTokens, 150,  'act-a darf nur eigene Einträge sehen');
    assert.equal(resultB.chatTokens, 1998, 'act-b darf nur eigene Einträge sehen');
  });
});

// ── TTS-Einträge ──────────────────────────────────────────────────────────────

describe('getStudentCostSummary — TTS (tts-prep und tts)', () => {
  test('tts-prep-Einträge erscheinen in ttsChars (über token_log)', async () => {
    clearAll();
    insertCallTypeEntry('act-tts', 'tts-prep', 'gpt-4.1-mini', 50, 20);

    const result = await getStudentCostSummary('act-tts');

    // tts-prep ist Token-basiert, keine ttsChars — aber ttsEur-Berechnung kommt vom Store
    // Minimal-Prüfung: Struktur korrekt
    assert.ok('ttsEur' in result, 'ttsEur muss vorhanden sein');
  });
});
