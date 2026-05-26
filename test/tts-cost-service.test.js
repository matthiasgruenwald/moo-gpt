/**
 * Tests für Issue #103: Dashboard TTS-Kosten (tts-prep + tts)
 *
 * Testet die Erweiterung von getCostSummary um ttsEur + ttsChars.
 * Prüft auch Regression: Chat- und Werkzeug-Kosten bleiben korrekt.
 *
 * Run: DB_PATH=:memory: node --test test/tts-cost-service.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { getCostSummary, recordWerkzeugUsage } from '../cost-service.js';
import { saveTtsPrepUsage, saveTtsUsage } from '../stores/token.js';

before(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
});

function clearLogs() {
  getDb().exec('DELETE FROM token_log');
  getDb().exec('DELETE FROM activities');
}

// ── Tests: SQL-Aggregation tts_characters ────────────────────────────────────

describe('SQL-Aggregation: tts_characters pro Aktivität', () => {
  test('summiert mehrere tts-Einträge einer Aktivität korrekt', () => {
    clearLogs();
    saveTtsUsage(1, 'act-tts', 10000);
    saveTtsUsage(2, 'act-tts', 12500);

    const row = getDb().prepare(`
      SELECT COALESCE(SUM(tts_characters), 0) AS total_chars
      FROM token_log
      WHERE activity_id = ? AND call_type = 'tts'
    `).get('act-tts');
    assert.equal(row.total_chars, 22500, 'Summe muss 22500 sein');
  });

  test('tts-Einträge anderer Aktivitäten werden nicht mitgezählt', () => {
    clearLogs();
    saveTtsUsage(1, 'act-X', 5000);
    saveTtsUsage(2, 'act-Y', 8000);

    const row = getDb().prepare(`
      SELECT COALESCE(SUM(tts_characters), 0) AS total_chars
      FROM token_log
      WHERE activity_id = ? AND call_type = 'tts'
    `).get('act-X');
    assert.equal(row.total_chars, 5000, 'Nur act-X darf summiert werden');
  });

  test('liefert 0 wenn keine tts-Einträge', () => {
    clearLogs();
    const row = getDb().prepare(`
      SELECT COALESCE(SUM(tts_characters), 0) AS total_chars
      FROM token_log
      WHERE activity_id = ? AND call_type = 'tts'
    `).get('act-leer');
    assert.equal(row.total_chars, 0, 'Muss 0 sein wenn keine Einträge');
  });
});

// ── Tests: getCostSummary Felder ──────────────────────────────────────────────

describe('getCostSummary — TTS-Felder', () => {
  test('hat Felder ttsEur und ttsChars', async () => {
    clearLogs();
    const summary = await getCostSummary('act-leer');

    assert.ok('ttsEur'  in summary, 'ttsEur muss in getCostSummary sein');
    assert.ok('ttsChars' in summary, 'ttsChars muss in getCostSummary sein');
  });

  test('ttsChars ist 0 wenn keine TTS-Einträge', async () => {
    clearLogs();
    const summary = await getCostSummary('act-leer');
    assert.equal(summary.ttsChars, 0, 'ttsChars muss 0 sein');
  });

  test('ttsChars summiert tts-Einträge korrekt', async () => {
    clearLogs();
    saveTtsUsage(1, 'act-1', 10000);
    saveTtsUsage(2, 'act-1', 5000);

    const summary = await getCostSummary('act-1');
    assert.equal(summary.ttsChars, 15000, 'ttsChars muss 15000 sein');
  });

  test('ttsEur ist null wenn kein EUR-Kurs verfügbar (kein Netz in Tests)', async () => {
    clearLogs();
    saveTtsUsage(1, 'act-1', 22500);

    const summary = await getCostSummary('act-1');
    // Kein EUR-Kurs in Tests → null
    assert.equal(summary.ttsEur, null, 'ttsEur muss null sein (kein EUR-Kurs)');
  });
});

// ── Tests: Werkzeug-Rows schließen TTS aus ────────────────────────────────────

describe('getWerkzeugCostRows — TTS-Ausschluss', () => {
  test('tts-Einträge erscheinen NICHT in Werkzeug-Kosten', async () => {
    clearLogs();
    recordWerkzeugUsage('act-1', 'criteria', 'gpt-4.1-nano', { input_tokens: 10, output_tokens: 5 });
    saveTtsUsage(1, 'act-1', 3000);
    saveTtsPrepUsage(1, 'act-1', 100, 50);

    const werkzeugRows = getDb().prepare(`
      SELECT call_type FROM token_log
      WHERE activity_id = ?
        AND call_type IS NOT NULL
        AND call_type NOT IN ('transcription', 'tts', 'tts-prep')
    `).all('act-1');

    assert.ok(!werkzeugRows.some(r => r.call_type === 'tts'),
      'tts darf nicht in Werkzeug-Query erscheinen');
    assert.ok(!werkzeugRows.some(r => r.call_type === 'tts-prep'),
      'tts-prep darf nicht in Werkzeug-Query erscheinen');
    assert.ok(werkzeugRows.some(r => r.call_type === 'criteria'),
      'criteria muss weiterhin in Werkzeug-Query erscheinen');
  });
});

// ── Tests: Regression — bestehende Felder unberührt ──────────────────────────

describe('getCostSummary — Regression', () => {
  test('alle bestehenden Felder bleiben vorhanden', async () => {
    clearLogs();
    const summary = await getCostSummary('act-leer');

    assert.ok('chatEur'     in summary, 'chatEur muss vorhanden sein');
    assert.ok('werkzeugEur' in summary, 'werkzeugEur muss vorhanden sein');
    assert.ok('totalEur'    in summary, 'totalEur muss vorhanden sein');
    assert.ok('audioEur'    in summary, 'audioEur muss vorhanden sein');
    assert.ok('audioSeconds' in summary, 'audioSeconds muss vorhanden sein');
  });
});
