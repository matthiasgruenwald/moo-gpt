const DATE_OPTIONS = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

function formatDate(date) {
  const dayName = date.toLocaleDateString('de-DE', DATE_OPTIONS);
  const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('de-DE', TIME_OPTIONS);
  return `\nHeute ist ${dayName}, der ${dateStr} um ${timeStr}.\n`;
}

export function buildInstructions({ systemContent, erfahrungContent, hints, task, date }) {
  let out = systemContent ?? '';
  if (date)             out += formatDate(date);
  if (hints)            out += hints;
  if (task)             out += task;
  if (erfahrungContent) out += `\n\n${erfahrungContent}`;
  return out;
}
