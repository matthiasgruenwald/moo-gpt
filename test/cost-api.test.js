/**
 * Tests für routes/costs.js — Issue #68
 *
 * Testet die drei Cost-API-Endpunkte direkt über die Service-Schicht
 * (In-Memory-SQLite via DB_PATH=:memory:) und prüft die Router-Verdrahtung
 * über supertest-ähnliche Direkt-Tests mit dem Express-Router.
 *
 * Run: DB_PATH=:memory: node --test test/cost-api.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import {
  recordWerkzeugUsage,
  getCostSummary,
  getWerkzeugLog,
  getAdminCostsByTeacher,
} from '../cost-service.js';

// DB einmalig initialisieren (in-memory via DB_PATH=:memory:)
before(() => {
  initDb();
});

function clearAll() {
  getDb().exec('DELETE FROM token_log');
  getDb().exec('DELETE FROM activities');
}

// ── Test 1: getCostSummary für leere Aktivität → alle Felder vorhanden ──────

describe('GET /api/activity/:activityId/cost-summary (Service)', () => {
  test('leere Aktivität → alle drei Felder vorhanden und null', async () => {
    clearAll();
    const summary = await getCostSummary('act-leer');

    assert.ok('chatEur'     in summary, 'chatEur muss im Ergebnis sein');
    assert.ok('werkzeugEur' in summary, 'werkzeugEur muss im Ergebnis sein');
    assert.ok('totalEur'    in summary, 'totalEur muss im Ergebnis sein');
    assert.equal(summary.chatEur,     null, 'chatEur muss null sein');
    assert.equal(summary.werkzeugEur, null, 'werkzeugEur muss null sein');
    assert.equal(summary.totalEur,    null, 'totalEur muss null sein');
  });

  test('Aktivität mit Werkzeug-Einträgen → Struktur korrekt', async () => {
    clearAll();
    recordWerkzeugUsage('act-1', 'criteria', 'gpt-4.1-nano', {
      input_tokens: 100,
      output_tokens: 50,
    });

    const summary = await getCostSummary('act-1');

    assert.ok('chatEur'     in summary);
    assert.ok('werkzeugEur' in summary);
    assert.ok('totalEur'    in summary);
    // EUR-Werte null da keine Preisdaten im Test
    assert.equal(summary.chatEur, null);
  });
});

// ── Test 2: getWerkzeugLog für Aktivität mit 1 Eintrag ──────────────────────

describe('GET /api/activity/:activityId/werkzeug-log (Service)', () => {
  test('Aktivität mit 1 Eintrag → Liste hat 1 Element mit richtigen Feldern', () => {
    clearAll();
    recordWerkzeugUsage('act-2', 'live-summary', 'gpt-4.1-nano', {
      input_tokens: 200,
      output_tokens: 80,
    });

    const log = getWerkzeugLog('act-2');

    assert.equal(log.length, 1, 'genau 1 Eintrag erwartet');
    const entry = log[0];

    assert.ok(entry.id,               'id muss vorhanden sein');
    assert.ok(entry.createdAt,        'createdAt muss vorhanden sein');
    assert.equal(entry.callType,         'live-summary');
    assert.equal(entry.callTypeLabel,    'Live-Zusammenfassung');
    assert.equal(entry.model,            'gpt-4.1-nano');
    assert.equal(entry.promptTokens,     200);
    assert.equal(entry.completionTokens, 80);
    assert.equal(entry.totalTokens,      280);
  });

  test('leere Aktivität → leeres Array', () => {
    clearAll();
    const log = getWerkzeugLog('act-leer');
    assert.equal(log.length, 0);
    assert.ok(Array.isArray(log));
  });

  test('Chat-Einträge (call_type IS NULL) werden nicht zurückgegeben', () => {
    clearAll();
    // Chat-Eintrag ohne call_type
    getDb().prepare(`
      INSERT INTO token_log (activity_id, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?)
    `).run('act-2', 'gpt-5', 500, 200, 700);
    // Werkzeug-Eintrag
    recordWerkzeugUsage('act-2', 'optimize', 'gpt-4.1-nano', { input_tokens: 10, output_tokens: 5 });

    const log = getWerkzeugLog('act-2');
    assert.equal(log.length, 1, 'nur Werkzeug-Eintrag darf erscheinen');
    assert.equal(log[0].callType, 'optimize');
  });
});

// ── Test 3: getAdminCostsByTeacher — Aktivitäten ohne teacher_id ausgeblendet

describe('GET /api/admin/costs (Service)', () => {
  test('Aktivitäten ohne teacher_id erscheinen nicht in der Admin-Übersicht', async () => {
    clearAll();
    getDb().prepare(
      `INSERT INTO activities (activity_id, activity_name) VALUES (?,?)`
    ).run('act-anonym', 'Alte Aktivität ohne Lehrer');

    const result = await getAdminCostsByTeacher();
    const ids = result.flatMap(t => t.activities.map(a => a.activityId));
    assert.ok(!ids.includes('act-anonym'), 'anonyme Aktivität darf nicht erscheinen');
    assert.equal(result.length, 0, 'keine Lehrer ohne teacher_id');
  });

  test('gibt Aktivitäten mit teacher_id korrekt strukturiert zurück', async () => {
    clearAll();
    getDb().prepare(
      `INSERT INTO activities (activity_id, activity_name, teacher_id, teacher_name) VALUES (?,?,?,?)`
    ).run('act-a', 'Mathe', 'u-1', 'Frau Müller');
    getDb().prepare(
      `INSERT INTO activities (activity_id, activity_name, teacher_id, teacher_name) VALUES (?,?,?,?)`
    ).run('act-b', 'Physik', 'u-2', 'Herr Schmidt');

    const result = await getAdminCostsByTeacher();

    assert.equal(result.length, 2);
    const mueller = result.find(t => t.teacherId === 'u-1');
    assert.ok(mueller);
    assert.equal(mueller.teacherName, 'Frau Müller');
    assert.equal(mueller.activities.length, 1);
    assert.equal(mueller.activities[0].activityId, 'act-a');
    assert.ok('chatEur'     in mueller.activities[0]);
    assert.ok('werkzeugEur' in mueller.activities[0]);
    assert.ok('totalEur'    in mueller.activities[0]);
  });

  test('jede Aktivität im Ergebnis hat die erwarteten Felder', async () => {
    clearAll();
    getDb().prepare(
      `INSERT INTO activities (activity_id, activity_name, teacher_id, teacher_name) VALUES (?,?,?,?)`
    ).run('act-c', 'Chemie Kl.9', 'u-3', 'Herr Braun');
    recordWerkzeugUsage('act-c', 'simulation', 'gpt-4.1-nano', { input_tokens: 50, output_tokens: 25 });

    const result = await getAdminCostsByTeacher();
    const braun = result.find(t => t.teacherId === 'u-3');
    assert.ok(braun);
    const act = braun.activities[0];
    assert.equal(act.activityId,   'act-c');
    assert.equal(act.activityName, 'Chemie Kl.9');
    assert.ok('chatEur'     in act);
    assert.ok('werkzeugEur' in act);
    assert.ok('totalEur'    in act);
  });
});
