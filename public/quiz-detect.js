/**
 * public/quiz-detect.js — activityId- und Lehrer-Erkennung für Quiz-Seiten (Issue #202)
 *
 * Kanonische Quelle für die Fallback-Erkennung auf Quiz-Seiten (Attempt,
 * Lehrer-Vorschau-Varianten, Fragenbank-Vorschau für Infotext-Fragen).
 * Hintergrund/Domänenentscheidung: ADR 0010 + CONTEXT.md, Abschnitt "Aktivität".
 *
 * Exportiert als ES-Modul — in moo-bot.js per import eingebunden;
 * in Tests direkt importierbar (keine DOM-Abhängigkeit).
 */

// Fragenbank-Vorschau (Infotext-Frage): ?id= ist hier die Moodle-questionid,
// NICHT die activityId (Namenskollision mit normalen Aktivitätsseiten).
// Capability-gated — Studierende können diese Seite nie laden.
const QUESTION_BANK_PREVIEW_BODY_ID = 'page-question-bank-previewquestion-preview';

/**
 * Ermittelt die activityId (Moodle-cmid) aus URL und body-Attributen.
 * Fallback-Kette: ?id= → ?cmid= → cmid-NNN aus body.className.
 * Auf der Fragenbank-Vorschau greift ausschließlich der cmid-Fallback,
 * da ?id= dort die questionid ist.
 * @param {{ search: string, bodyClassName: string, bodyId: string }} ctx
 * @returns {string|null}
 */
export function extractActivityId({ search, bodyClassName, bodyId }) {
  const params = new URLSearchParams(search);
  const cmidMatch = (bodyClassName || '').match(/\bcmid-(\d+)\b/);
  const cmidFromClass = cmidMatch ? cmidMatch[1] : null;

  if (bodyId === QUESTION_BANK_PREVIEW_BODY_ID) {
    return cmidFromClass || null;
  }
  return params.get('id') || params.get('cmid') || cmidFromClass || null;
}

/**
 * Ermittelt den Lehrer-Status inkl. Quiz-Seiten-Fallback.
 * - Fragenbank-Vorschau: immer Teacher (capability-gated Konfigurations-Einstieg).
 * - Sonst: editmode.php-Formular ODER body.editing-Klasse, außer bei Rollenwechsel.
 *
 * Bekannte akzeptierte Restlücke (ADR 0010, siehe Issue #204): Lehrkraft mit
 * Edit-Mode AUS auf normaler Quiz-Attempt-Seite (Gesamtvorschau/Rollenwechsel)
 * wird als Schüler erkannt.
 * @param {{ hasEditMode: boolean, isSwitchedRole: boolean, bodyClassName: string, bodyId: string }} ctx
 * @returns {boolean}
 */
export function detectIsTeacher({ hasEditMode, isSwitchedRole, bodyClassName, bodyId }) {
  if (bodyId === QUESTION_BANK_PREVIEW_BODY_ID) return true;
  const isEditing = (bodyClassName || '').split(/\s+/).includes('editing');
  return (hasEditMode || isEditing) && !isSwitchedRole;
}
