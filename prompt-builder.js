const DATE_OPTIONS = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

function formatDate(date) {
  const dayName = date.toLocaleDateString('de-DE', DATE_OPTIONS);
  const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('de-DE', TIME_OPTIONS);
  return `\nHeute ist ${dayName}, der ${dateStr} um ${timeStr}.\n`;
}

/**
 * Alle Eingabe-Slots für den System-Prompt.
 *
 * @typedef {object} PromptStack
 * @property {string}      [system]         Systemweiter Prompt (Admin-Einstellung)
 * @property {string|null} [studentMemory]  Schüler-Präferenz aus student_memory (global)
 * @property {Date|null}   [dateTime]       Aktuelles Datum/Uhrzeit
 * @property {string|null} [aufgabe]        Aufgabenstellung (heute: Moodle-DOM; Plugin: Moodle-DB)
 * @property {string|null} [aufgabenprompt] Aufgabenprompt des Lehrers (Werkzeug-Workflow)
 * @property {'on'|'off'}  [mathMode]       Fachpräferenz: LaTeX-Formatierung (aus Widget-Config)
 */

/**
 * Baut den vollständigen System-Prompt zusammen.
 *
 * @param {object}      opts
 * @param {string}      [opts.systemContent]    Globaler System-Prompt
 * @param {string}      [opts.erfahrungContent] Erfahrungs-/Aufgabenprompt
 * @param {string|null} [opts.aufgabenprompt]   Aufgabenprompt des Lehrers (Werkzeug-Workflow)
 * @param {string|null} [opts.aufgabe]          Aufgabenstellung (Moodle-DOM)
 * @param {Date|null}   [opts.date]             Aktuelles Datum (für Zeitstempel)
 * @param {string|null} [opts.studentMemory]    Schüler-Präferenz aus student_memory
 * @param {'on'|'off'}  [opts.mathMode]         LaTeX-Formatierungsanweisung
 */
export function buildInstructions({ systemContent, erfahrungContent, aufgabenprompt, aufgabe, date, studentMemory, mathMode }) {
  let out = systemContent ?? '';
  if (studentMemory)    out = `[Schüler-Präferenz: ${studentMemory}]\n\n` + out;
  if (date)             out += formatDate(date);
  if (aufgabenprompt)   out += aufgabenprompt;
  if (aufgabe)          out += aufgabe;
  if (erfahrungContent) out += `\n\n${erfahrungContent}`;
  if (mathMode === 'on') out += '\n\nSchreibe mathematische Ausdrücke stets in LaTeX: inline mit $...$, abgesetzt mit $$...$$. Beispiel: $-0{,}0213x^2 + 192 = 0$.';
  return out;
}
