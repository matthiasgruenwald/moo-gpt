/**
 * Tests für Teacher-Attribution — Issue #63
 *
 * Testet setTeacherIfUnset aus stores/activity.js.
 * Nutzt In-Memory-SQLite via DB_PATH=:memory: + initDb().
 *
 * Run: DB_PATH=:memory: node --test test/teacher-attribution.test.js
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db.js';
import { setTeacherIfUnset } from '../stores/activity.js';

before(() => {
  initDb();
});

function clearActivities() {
  getDb().exec('DELETE FROM activities');
}

describe('setTeacherIfUnset', () => {
  beforeEach(() => clearActivities());

  test('setzt teacher_id und teacher_name beim ersten Aufruf', () => {
    getDb().prepare(
      'INSERT INTO activities (activity_id, activity_name) VALUES (?, ?)'
    ).run('act-1', 'Mathe Kl.9');

    setTeacherIfUnset('act-1', 'user-42', 'Frau Müller');

    const row = getDb().prepare(
      'SELECT teacher_id, teacher_name FROM activities WHERE activity_id = ?'
    ).get('act-1');

    assert.equal(row.teacher_id,   'user-42');
    assert.equal(row.teacher_name, 'Frau Müller');
  });

  test('überschreibt teacher_id beim zweiten Aufruf nicht', () => {
    getDb().prepare(
      'INSERT INTO activities (activity_id, activity_name) VALUES (?, ?)'
    ).run('act-1', 'Mathe Kl.9');

    setTeacherIfUnset('act-1', 'user-42', 'Frau Müller');
    setTeacherIfUnset('act-1', 'user-99', 'Herr Schmidt');

    const row = getDb().prepare(
      'SELECT teacher_id, teacher_name FROM activities WHERE activity_id = ?'
    ).get('act-1');

    assert.equal(row.teacher_id,   'user-42',      'teacher_id darf nicht überschrieben werden');
    assert.equal(row.teacher_name, 'Frau Müller',  'teacher_name darf nicht überschrieben werden');
  });

  test('tut nichts und wirft nicht wenn activityId fehlt', () => {
    assert.doesNotThrow(() => setTeacherIfUnset(null, 'user-42', 'Frau Müller'));
    assert.doesNotThrow(() => setTeacherIfUnset(undefined, 'user-42', 'Frau Müller'));
    const count = getDb().prepare('SELECT COUNT(*) as n FROM activities').get().n;
    assert.equal(count, 0);
  });

  test('tut nichts wenn teacherId fehlt', () => {
    getDb().prepare(
      'INSERT INTO activities (activity_id, activity_name) VALUES (?, ?)'
    ).run('act-1', 'Mathe Kl.9');

    assert.doesNotThrow(() => setTeacherIfUnset('act-1', null, null));

    const row = getDb().prepare(
      'SELECT teacher_id FROM activities WHERE activity_id = ?'
    ).get('act-1');
    assert.equal(row.teacher_id, null, 'teacher_id muss NULL bleiben');
  });
});
