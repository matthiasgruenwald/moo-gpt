/**
 * Tests für stores/student-memory.js — Issue #95
 * Global student_memory ohne activityId, mit preferred_voice + tts_autoplay.
 *
 * Verwendet In-Memory-SQLite via DB_PATH=:memory:
 * Run: node --test test/student-memory-store.test.js
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-Memory-DB für Tests (muss vor Imports gesetzt sein)
process.env.DB_PATH = ':memory:';

const { initDb, getDb } = await import('../db.js');
const {
  getStudentMemory,
  getAllMemory,
  upsertStudentMemory,
  deleteStudentMemory,
} = await import('../stores/student-memory.js');

before(() => {
  initDb();
});

beforeEach(() => {
  getDb().prepare('DELETE FROM student_memory').run();
});

describe('student-memory store (global)', () => {
  test('getStudentMemory gibt null zurück wenn kein Eintrag', () => {
    const result = getStudentMemory('student-1');
    assert.equal(result, null);
  });

  test('upsertStudentMemory legt neuen Eintrag an', () => {
    upsertStudentMemory('student-1', 'Ich mag kurze Antworten');
    const entry = getStudentMemory('student-1');
    assert.ok(entry !== null);
    assert.equal(entry.preference_text, 'Ich mag kurze Antworten');
  });

  test('upsertStudentMemory überschreibt bestehenden Eintrag ohne Duplikat', () => {
    upsertStudentMemory('student-1', 'Erst-Text');
    upsertStudentMemory('student-1', 'Neuer Text');
    const entry = getStudentMemory('student-1');
    assert.equal(entry.preference_text, 'Neuer Text');

    const count = getDb().prepare('SELECT count(*) as n FROM student_memory WHERE student_id = ?').get('student-1');
    assert.equal(count.n, 1, 'Kein Duplikat beim Upsert');
  });

  test('getStudentMemory gibt preferred_voice und tts_autoplay zurück', () => {
    upsertStudentMemory('student-2', 'Text', { preferred_voice: 'alloy', tts_autoplay: 1 });
    const entry = getStudentMemory('student-2');
    assert.equal(entry.preferred_voice, 'alloy');
    assert.equal(entry.tts_autoplay, 1);
  });

  test('preferred_voice Default ist nova, tts_autoplay Default ist 0', () => {
    upsertStudentMemory('student-3', 'Text');
    const entry = getStudentMemory('student-3');
    assert.equal(entry.preferred_voice, 'nova');
    assert.equal(entry.tts_autoplay, 0);
  });

  test('deleteStudentMemory entfernt den Eintrag', () => {
    upsertStudentMemory('student-4', 'Text');
    deleteStudentMemory('student-4');
    assert.equal(getStudentMemory('student-4'), null);
  });

  test('deleteStudentMemory ist idempotent (kein Fehler wenn nicht vorhanden)', () => {
    assert.doesNotThrow(() => deleteStudentMemory('nicht-vorhanden'));
  });

  test('getAllMemory gibt alle Einträge zurück', () => {
    upsertStudentMemory('student-a', 'Text A');
    upsertStudentMemory('student-b', 'Text B');
    const all = getAllMemory();
    assert.equal(all.length, 2);
    const ids = all.map(e => e.student_id).sort();
    assert.deepEqual(ids, ['student-a', 'student-b']);
  });

  test('getAllMemory gibt preferred_voice und tts_autoplay mit zurück', () => {
    upsertStudentMemory('student-x', 'X', { preferred_voice: 'shimmer', tts_autoplay: 1 });
    const all = getAllMemory();
    const entry = all.find(e => e.student_id === 'student-x');
    assert.ok(entry, 'Eintrag gefunden');
    assert.equal(entry.preferred_voice, 'shimmer');
    assert.equal(entry.tts_autoplay, 1);
  });

  test('upsertStudentMemory aktualisiert preferred_voice ohne preference_text zu löschen', () => {
    upsertStudentMemory('student-5', 'Mein Text');
    upsertStudentMemory('student-5', 'Mein Text', { preferred_voice: 'echo' });
    const entry = getStudentMemory('student-5');
    assert.equal(entry.preference_text, 'Mein Text');
    assert.equal(entry.preferred_voice, 'echo');
  });
});
