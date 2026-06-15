/**
 * Tests für Quiz-Seiten-Fallbacks: activityId & isTeacher (ADR 0010, Issue #202)
 *
 * Framework: Node.js 22 node:test
 *
 * Die Erkennungslogik wird aus der kanonischen Quelle (public/quiz-detect.js)
 * importiert (auch von public/moo-bot.js verwendet) und mit Fixtures für die
 * vier Seitenvarianten aus der DOM-Analyse getestet:
 *  - Normale Aktivitätsseite (Regression, unverändertes Verhalten)
 *  - Quiz-Attempt: Schüler-Testmaske
 *  - Quiz-Attempt: Lehrer-Gesamtvorschau
 *  - Quiz-Attempt: Lehrer-Rollenwechsel-zu-Teilnehmer-Vorschau
 *  - Fragenbank-Vorschau (Infotext-Frage, Konfigurations-Einstieg)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extractActivityId, detectIsTeacher, extractCourseId } from '../public/quiz-detect.js';

describe('extractActivityId', () => {
  test('normale Aktivitätsseite: ?id= liefert activityId (Regression)', () => {
    const result = extractActivityId({
      search: '?id=555',
      bodyClassName: 'path-mod-page context-123',
      bodyId: 'page-mod-page-view',
    });
    assert.equal(result, '555');
  });

  test('Quiz-Attempt: activityId aus ?cmid= (kein ?id=)', () => {
    const result = extractActivityId({
      search: '?attempt=987&cmid=37313',
      bodyClassName: 'path-mod-quiz cmid-37313 course-1667',
      bodyId: 'page-mod-quiz-attempt',
    });
    assert.equal(result, '37313');
  });

  test('Quiz-Attempt: activityId aus cmid-NNN in body.className (kein ?cmid= in URL)', () => {
    const result = extractActivityId({
      search: '?attempt=987',
      bodyClassName: 'path-mod-quiz cmid-37313 course-1667 editing',
      bodyId: 'page-mod-quiz-attempt',
    });
    assert.equal(result, '37313');
  });

  test('Fragenbank-Vorschau: ?id= ist questionid, NICHT activityId — cmid aus className gewinnt', () => {
    const result = extractActivityId({
      search: '?id=98765',
      bodyClassName: 'path-question-bank cmid-37313 course-1667 editing',
      bodyId: 'page-question-bank-previewquestion-preview',
    });
    assert.equal(result, '37313');
    assert.notEqual(result, '98765');
  });

  test('keine ID ermittelbar: gibt null zurück', () => {
    const result = extractActivityId({
      search: '',
      bodyClassName: 'path-mod-page',
      bodyId: 'page-mod-page-view',
    });
    assert.equal(result, null);
  });
});

describe('detectIsTeacher', () => {
  test('normale Aktivitätsseite: Lehrer mit Edit-Mode (Regression)', () => {
    const result = detectIsTeacher({
      hasEditMode: true,
      isSwitchedRole: false,
      bodyClassName: 'path-mod-page',
      bodyId: 'page-mod-page-view',
    });
    assert.equal(result, true);
  });

  test('normale Aktivitätsseite: Schüler ohne Edit-Mode (Regression)', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: false,
      bodyClassName: 'path-mod-page',
      bodyId: 'page-mod-page-view',
    });
    assert.equal(result, false);
  });

  test('Quiz-Attempt: Schüler-Testmaske → false', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: false,
      bodyClassName: 'path-mod-quiz cmid-37313 course-1667',
      bodyId: 'page-mod-quiz-attempt',
    });
    assert.equal(result, false);
  });

  test('Quiz-Attempt: Lehrer-Gesamtvorschau (body.editing) → true', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: false,
      bodyClassName: 'path-mod-quiz editing cmid-37313 course-1667',
      bodyId: 'page-mod-quiz-attempt',
    });
    assert.equal(result, true);
  });

  test('Quiz-Attempt: Lehrer-Rollenwechsel-zu-Teilnehmer-Vorschau → false', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: true,
      bodyClassName: 'path-mod-quiz userswitchedrole cmid-37313 course-1667',
      bodyId: 'page-mod-quiz-attempt',
    });
    assert.equal(result, false);
  });

  test('Fragenbank-Vorschau (Infotext): immer true, auch ohne editing-Klasse', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: false,
      bodyClassName: 'path-question-bank cmid-37313 course-1667',
      bodyId: 'page-question-bank-previewquestion-preview',
    });
    assert.equal(result, true);
  });

  test('Fragenbank-Vorschau (Infotext): true, auch wenn isSwitchedRole gesetzt wäre', () => {
    const result = detectIsTeacher({
      hasEditMode: false,
      isSwitchedRole: true,
      bodyClassName: 'path-question-bank cmid-37313 course-1667',
      bodyId: 'page-question-bank-previewquestion-preview',
    });
    assert.equal(result, true);
  });
});

describe('extractCourseId (Issue #203)', () => {
  test('extrahiert course-NNN aus body.className', () => {
    const result = extractCourseId('path-mod-quiz cmid-37313 course-1667 editing');
    assert.equal(result, '1667');
  });

  test('Quiz-Attempt: course-NNN unabhängig von Seitenvariante extrahierbar', () => {
    const result = extractCourseId('path-mod-quiz userswitchedrole cmid-37313 course-1667');
    assert.equal(result, '1667');
  });

  test('keine course-Klasse vorhanden: gibt null zurück', () => {
    const result = extractCourseId('path-mod-page context-123');
    assert.equal(result, null);
  });

  test('leerer className: gibt null zurück', () => {
    const result = extractCourseId('');
    assert.equal(result, null);
  });
});
