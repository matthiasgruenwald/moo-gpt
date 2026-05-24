import { Router } from 'express';
import { requireDashboardAuth, getUserNameFromToken } from '../auth-middleware.js';
import { getActivity, setTeacherIfUnset } from '../stores/activity.js';
import { getMessages } from '../stores/chat.js';
import { getStudents } from '../stores/dashboard.js';
import { enrichMessagesWithCost, computeThreadCost } from '../token-log.js';
import { aiClient } from '../ai-instance.js';
import { GEN_MODEL } from '../env-config.js';
import { recordWerkzeugUsage } from '../cost-service.js';

// Issue #41: Kosten pro Schüler aus per-Modell-Token-Daten berechnen
export async function enrichStudentsWithCost(students) {
  return Promise.all(students.map(async s => ({
    ...s,
    threadCost: await computeThreadCost(s.thread_db_id),
  })));
}

const router = Router();

router.get('/dashboard/students', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;

  // Issue #63: Lehrer beim ersten Dashboard-Aufruf als Eigentümer der Aktivität eintragen
  const teacherName = getUserNameFromToken(req.query.token);
  setTeacherIfUnset(activityId, req.userId, teacherName);

  try {
    const students = getStudents(activityId);
    const act      = getActivity(activityId);
    res.json({ students, activityName: act?.activity_name, opener: act?.opener });
  } catch (e) {
    console.error('[Dashboard] getStudents error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/dashboard/messages/:threadDbId', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  const threadDbId = parseInt(req.params.threadDbId);
  if (isNaN(threadDbId)) return res.status(400).json({ error: 'Invalid threadDbId' });
  try {
    const students = getStudents(activityId);
    const student  = students.find(s => s.thread_db_id === threadDbId);
    if (!student) return res.status(403).json({ error: 'Forbidden' });
    const [messages, threadCost] = await Promise.all([
      enrichMessagesWithCost(getMessages(threadDbId)),
      computeThreadCost(threadDbId),
    ]);
    res.json({ student, messages, threadCost });
  } catch (e) {
    console.error('[Dashboard] getMessages error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Issue #52: Live-Unterrichts-Überblick – KI-Zusammenfassung aller Chat-Verläufe
router.post('/activity/:activityId/overview-summary', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const students = getStudents(activityId);

    if (students.length === 0) {
      return res.json({
        summary: 'Noch keine Chat-Verläufe vorhanden.',
        timestamp: new Date().toISOString(),
        studentsMissing: [],
      });
    }

    // Schüler mit/ohne echte Nachrichten aufteilen
    const studentsWithChats = students.filter(s => s.message_count > 0);
    const studentsMissing   = students
      .filter(s => s.message_count === 0)
      .map(s => s.moodle_user_name || s.moodle_user_id || 'Unbekannt');
    const studentsPresent   = studentsWithChats
      .map(s => s.moodle_user_name || s.moodle_user_id || 'Unbekannt');

    if (studentsWithChats.length === 0) {
      return res.json({
        summary: 'Noch keine Chat-Nachrichten vorhanden.',
        timestamp: new Date().toISOString(),
        studentsMissing,
        studentsPresent: [],
      });
    }

    // Alle Nachrichten aller Schüler laden und zu einem Prompt zusammenbauen
    const chatBlocks = studentsWithChats.map(s => {
      const msgs = getMessages(s.thread_db_id);
      const name = s.moodle_user_name || s.moodle_user_id || 'Schüler';
      const lines = msgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `${m.role === 'user' ? name : 'KI'}: ${(m.content || '').slice(0, 800)}`)
        .join('\n');
      return `--- ${name} ---\n${lines}`;
    }).join('\n\n');

    const systemPrompt =
      'Du bist ein pädagogischer Assistent für Lehrkräfte. ' +
      'Fasse die Chatverläufe einer Klasse in maximal 4 Stichpunkten zusammen. ' +
      'Jeder Stichpunkt: eine Zeile, kein Fülltext. Format: "• ..." ' +
      'Fokus: Was beschäftigt die Schüler? Wo haken sie? Antworte auf Deutsch.';

    const userMessage =
      `Hier sind die Chatverläufe der Schulklasse (${studentsWithChats.length} Schüler):\n\n${chatBlocks}`;

    const { text: summary, usage } = await aiClient.textCall(systemPrompt, userMessage, GEN_MODEL, { timeout: 60_000 });

    recordWerkzeugUsage(activityId, 'live-summary', GEN_MODEL, usage);

    res.json({
      summary,
      timestamp: new Date().toISOString(),
      studentsMissing,
      studentsPresent,
      cost: {
        promptTokens:     usage.input_tokens,
        completionTokens: usage.output_tokens,
      },
    });
  } catch (e) {
    console.error('[Dashboard] overview-summary error:', e);
    res.status(500).json({ error: 'Zusammenfassung konnte nicht erstellt werden.' });
  }
});

export default router;
