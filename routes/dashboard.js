import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { getMessages } from '../stores/chat.js';
import { getStudents } from '../stores/dashboard.js';
import { enrichMessagesWithCost, computeThreadCost } from '../token-log.js';
import { aiClient } from '../ai-instance.js';
import { GEN_MODEL } from '../env-config.js';

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

    // Schüler ohne Nachrichten ermitteln
    const studentsMissing = students
      .filter(s => s.message_count === 0)
      .map(s => s.moodle_user_name || s.moodle_user_id || 'Unbekannt');

    // Nur Schüler mit Nachrichten für die Zusammenfassung laden
    const studentsWithChats = students.filter(s => s.message_count > 0);

    if (studentsWithChats.length === 0) {
      return res.json({
        summary: 'Noch keine Chat-Nachrichten vorhanden.',
        timestamp: new Date().toISOString(),
        studentsMissing,
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
      'Analysiere die folgenden Chatverläufe einer Schulklasse und erstelle eine kompakte thematische Zusammenfassung. ' +
      'Gliederung: 1) Häufige Fragen der Schüler (thematisch, nicht wörtlich). ' +
      '2) Häufige Missverständnisse oder Schwierigkeiten. ' +
      'Antworte auf Deutsch. Bleibe sachlich und präzise.';

    const userMessage =
      `Hier sind die Chatverläufe der Schulklasse (${studentsWithChats.length} Schüler):\n\n${chatBlocks}`;

    const summary = await aiClient.textCall(systemPrompt, userMessage, GEN_MODEL, { timeout: 60_000 });

    res.json({
      summary,
      timestamp: new Date().toISOString(),
      studentsMissing,
    });
  } catch (e) {
    console.error('[Dashboard] overview-summary error:', e);
    res.status(500).json({ error: 'Zusammenfassung konnte nicht erstellt werden.' });
  }
});

export default router;
