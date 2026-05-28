/**
 * services/live-summary.js — Issue #132
 *
 * Extrahiert aus routes/dashboard.js: KI-Zusammenfassung aller Chat-Verläufe
 * einer Aktivität (POST /activity/:activityId/overview-summary).
 *
 * Abhängigkeiten werden als Parameter übergeben — ermöglicht Tests ohne echte
 * DB/AI-Verbindung.
 *
 * recordWerkzeugUsage verbleibt in der Route (ADR 0005).
 */

const SYSTEM_PROMPT =
  'Du bist ein pädagogischer Assistent für Lehrkräfte. ' +
  'Fasse die Chatverläufe einer Klasse in maximal 4 Stichpunkten zusammen. ' +
  'Jeder Stichpunkt: eine Zeile, kein Fülltext. Format: "• ..." ' +
  'Fokus: Was beschäftigt die Schüler? Wo haken sie? Antworte auf Deutsch.';

const STUDENTS_SQL = `
  SELECT t.id              AS thread_db_id,
         t.moodle_user_id,
         t.moodle_user_name,
         t.updated_at,
         COUNT(DISTINCT CASE WHEN m.role = 'user' AND m.content_type != 'task_image' THEN m.id END) AS message_count
  FROM threads t
  LEFT JOIN messages m ON m.thread_id = t.id
  WHERE t.activity_id = ?
  GROUP BY t.id
  ORDER BY t.updated_at DESC
`;

const MESSAGES_SQL = `
  SELECT m.id, m.role,
         COALESCE(me.content, m.content) AS content,
         m.content_type, m.created_at
  FROM messages m
  LEFT JOIN message_edits me ON me.message_id = m.id AND me.is_active = 1
  WHERE m.thread_id = ? AND COALESCE(m.content_type, 'text') != 'task_image'
  ORDER BY m.created_at ASC LIMIT 100
`;

/**
 * Lädt alle Chat-Verläufe einer Aktivität und erstellt eine KI-Zusammenfassung.
 *
 * @param {{ activityId: string, aiClient: object, model: string, db: object }} params
 * @returns {Promise<{ summary: string, usage: object }>}
 */
export async function generateLiveSummary({ activityId, aiClient, model, db }) {
  const students = db.prepare(STUDENTS_SQL).all(activityId);

  const studentsWithChats = students.filter(s => s.message_count > 0);

  const chatBlocks = studentsWithChats.map(s => {
    const msgs = db.prepare(MESSAGES_SQL).all(s.thread_db_id);
    const name = s.moodle_user_name || s.moodle_user_id || 'Schüler';
    const lines = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? name : 'KI'}: ${(m.content || '').slice(0, 800)}`)
      .join('\n');
    return `--- ${name} ---\n${lines}`;
  }).join('\n\n');

  const userMessage =
    `Hier sind die Chatverläufe der Schulklasse (${studentsWithChats.length} Schüler):\n\n${chatBlocks}`;

  const { text: summary, usage } = await aiClient.textCall(
    SYSTEM_PROMPT,
    userMessage,
    model,
    { timeout: 60_000 },
  );

  return { summary, usage };
}
