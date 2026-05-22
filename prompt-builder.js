const DATE_OPTIONS = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

function formatDate(date) {
  const dayName = date.toLocaleDateString('de-DE', DATE_OPTIONS);
  const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('de-DE', TIME_OPTIONS);
  return `\nHeute ist ${dayName}, der ${dateStr} um ${timeStr}.\n`;
}

/**
 * Baut den vollständigen System-Prompt zusammen.
 *
 * @param {object} opts
 * @param {string}  [opts.systemContent]   - Globaler System-Prompt
 * @param {string}  [opts.erfahrungContent] - Erfahrungs-/Aufgabenprompt
 * @param {string}  [opts.hints]           - Hinweise aus Snippet
 * @param {string}  [opts.task]            - Aufgabenstellung aus Moodle-DOM
 * @param {Date}    [opts.date]            - Aktuelles Datum (für Zeitstempel)
 * @param {string}  [opts.studentMemory]   - Schüler-Präferenz aus student_memory
 */
export function buildInstructions({ systemContent, erfahrungContent, hints, task, date, studentMemory }) {
  let out = systemContent ?? '';
  if (studentMemory)    out = `[Schüler-Präferenz: ${studentMemory}]\n\n` + out;
  if (date)             out += formatDate(date);
  if (hints)            out += hints;
  if (task)             out += task;
  if (erfahrungContent) out += `\n\n${erfahrungContent}`;
  return out;
}
