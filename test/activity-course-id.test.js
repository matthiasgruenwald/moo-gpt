/**
 * Tests für stores/activity.js — course_id (Issue #203)
 *
 * Prüft, dass upsertActivity() course_id additiv speichert (Monitoring/Logs-
 * Gruppierung, ADR 0010) und getActivity() es zurückliefert. course_id darf
 * bestehende Werte nicht überschreiben, wenn beim Re-Handshake keiner
 * übergeben wird (COALESCE-Pattern wie bei opener/title/bot_icon).
 *
 * Verwendet In-Memory-SQLite via DB_PATH=:memory:
 * Run: node --test test/activity-course-id.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { initDb } = await import('../db.js');
const { upsertActivity, getActivity } = await import('../stores/activity.js');

before(() => {
  initDb();
});

describe('upsertActivity / getActivity — course_id (Issue #203)', () => {
  test('speichert course_id beim Insert und liest es zurück', () => {
    upsertActivity('act-c1', 'Kurs-Test', null, null, null, null, '1667');
    const act = getActivity('act-c1');
    assert.equal(act.course_id, '1667');
  });

  test('course_id bleibt NULL wenn nicht übergeben', () => {
    upsertActivity('act-c2', 'Ohne Kurs');
    const act = getActivity('act-c2');
    assert.equal(act.course_id, null);
  });

  test('Re-Handshake ohne course_id überschreibt bestehenden Wert nicht', () => {
    upsertActivity('act-c3', 'Kurs-Update', null, null, null, null, '1667');
    upsertActivity('act-c3', 'Kurs-Update', null, null, null, null);
    const act = getActivity('act-c3');
    assert.equal(act.course_id, '1667', 'course_id darf durch fehlenden Wert nicht überschrieben werden');
  });

  test('Re-Handshake mit neuem course_id überschreibt alten Wert', () => {
    upsertActivity('act-c4', 'Kurs-Wechsel', null, null, null, null, '1667');
    upsertActivity('act-c4', 'Kurs-Wechsel', null, null, null, null, '2000');
    const act = getActivity('act-c4');
    assert.equal(act.course_id, '2000');
  });
});
