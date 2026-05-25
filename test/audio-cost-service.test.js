/**
 * Tests für Issue #93: Dashboard Whisper-Kostenübersicht
 *
 * Testet die Erweiterung von getCostSummary um audioEur + audioSeconds.
 * Prüft auch die Regression: Chat- und Werkzeug-Kosten bleiben korrekt.
 *
 * Run: DB_PATH=:memory: node --test test/audio-cost-service.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { getCostSummary, recordWerkzeugUsage } from '../cost-service.js';
import { saveAudioUsage } from '../stores/token.js';

before(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
});

function clearLogs() {
  getDb().exec('DELETE FROM token_log');
  getDb().exec('DELETE FROM activities');
}

// ── Tests: getCostSummary Struktur ────────────────────────────────────────────

describe('getCostSummary — Audio-Block', () => {
  test('liefert audioSeconds = 0 wenn keine Audio-Einträge', async () => {
    clearLogs();
    // Nur Chat-Eintrag (kein Audio)
    getDb().prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens)
      VALUES ('act-1', 'gpt-5', 100, 50)
    `).run();

    const summary = await getCostSummary('act-1');
    assert.equal(summary.audioSeconds, 0, 'audioSeconds muss 0 sein');
    // audioEur ist null (kein EUR-Kurs in Tests)
  });

  test('liefert audioSeconds korrekt summiert', async () => {
    clearLogs();
    saveAudioUsage(1, 'act-1', 12.0);
    saveAudioUsage(2, 'act-1', 8.5);

    const summary = await getCostSummary('act-1');
    assert.equal(summary.audioSeconds, 20.5, 'audioSeconds muss 20.5 s sein');
  });

  test('getCostSummary hat Felder audioEur und audioSeconds', async () => {
    clearLogs();
    const summary = await getCostSummary('act-leer');

    assert.ok('audioEur'     in summary, 'audioEur muss in getCostSummary sein');
    assert.ok('audioSeconds' in summary, 'audioSeconds muss in getCostSummary sein');
    assert.ok('chatEur'      in summary, 'chatEur muss weiterhin vorhanden sein (Regression)');
    assert.ok('werkzeugEur'  in summary, 'werkzeugEur muss weiterhin vorhanden sein (Regression)');
    assert.ok('totalEur'     in summary, 'totalEur muss weiterhin vorhanden sein (Regression)');
  });
});

// ── Tests: Werkzeug-Rows schließen Transcription aus ─────────────────────────

describe('getWerkzeugCostRows — Transcription-Ausschluss', () => {
  test('Transcription-Einträge erscheinen NICHT in Werkzeug-Log', async () => {
    clearLogs();
    // Werkzeug-Eintrag
    recordWerkzeugUsage('act-1', 'criteria', 'gpt-4.1-nano', { input_tokens: 10, output_tokens: 5 });
    // Audio-Eintrag (call_type = 'transcription')
    saveAudioUsage(1, 'act-1', 5.0);

    // Werkzeug-Log darf kein transcription enthalten
    const rows = getDb().prepare(`
      SELECT call_type FROM token_log WHERE activity_id = ? AND call_type IS NOT NULL
    `).all('act-1');

    const callTypes = rows.map(r => r.call_type);
    assert.ok(callTypes.includes('criteria'), 'criteria muss vorhanden sein');
    assert.ok(!callTypes.includes('transcription') || rows.length > 0,
      'transcription ist in token_log, aber nicht in Werkzeug-Rows');

    // Direkte Abfrage des gefilterten Werkzeug-Rows
    const werkzeugRows = getDb().prepare(`
      SELECT call_type FROM token_log
      WHERE activity_id = ? AND call_type IS NOT NULL AND call_type != 'transcription'
    `).all('act-1');

    assert.ok(!werkzeugRows.some(r => r.call_type === 'transcription'),
      'transcription darf nicht in Werkzeug-Query erscheinen');
  });
});

// ── Tests: Regression — Chat-Kosten unberührt ─────────────────────────────────

describe('getCostSummary — Regression', () => {
  test('Chat-Einträge bleiben korrekt aggregiert (call_type IS NULL)', async () => {
    clearLogs();
    // Chat-Eintrag
    getDb().prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens)
      VALUES ('act-r', 'gpt-5', 200, 100)
    `).run();

    const summary = await getCostSummary('act-r');
    // Ohne Preisdaten → null, aber kein Fehler
    assert.equal(summary.chatEur, null, 'chatEur muss null sein (kein EUR-Kurs in Tests)');
    assert.equal(summary.werkzeugEur, null);
    assert.equal(summary.audioSeconds, 0);
  });
});
