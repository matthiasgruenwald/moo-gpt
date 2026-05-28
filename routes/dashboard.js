import { Router } from 'express';
import { requireDashboardAuth, getUserNameFromToken } from '../auth-middleware.js';
import { getActivity, setTeacherIfUnset } from '../stores/activity.js';
import { getMessages } from '../stores/chat.js';
import { getStudents, enrichStudentsWithCost } from '../stores/dashboard.js';
import { enrichMessagesWithCost } from '../token-log.js';
import { recordWerkzeugUsage, computeThreadCost, sumCostRows } from '../cost-service.js';
import { aiClient } from '../ai-instance.js';
import { GEN_MODEL } from '../env-config.js';
import { getDb } from '../db.js';
import { generateLiveSummary } from '../services/live-summary.js';

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

    // Schüler mit/ohne echte Nachrichten aufteilen (für Response-Felder)
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

    const { summary, usage } = await generateLiveSummary({
      activityId,
      aiClient,
      model: GEN_MODEL,
      db: getDb(),
    });

    // ADR 0005: recordWerkzeugUsage verbleibt in der Route
    recordWerkzeugUsage(activityId, 'live-summary', GEN_MODEL, usage);

    const runCost = await sumCostRows([{
      prompt_tokens:     usage.input_tokens,
      completion_tokens: usage.output_tokens,
      model:             GEN_MODEL,
    }]);

    res.json({
      summary,
      timestamp: new Date().toISOString(),
      studentsMissing,
      studentsPresent,
      cost: {
        promptTokens:     usage.input_tokens,
        completionTokens: usage.output_tokens,
        costEur:          runCost?.totalEur ?? null,
      },
    });
  } catch (e) {
    console.error('[Dashboard] overview-summary error:', e);
    res.status(500).json({ error: 'Zusammenfassung konnte nicht erstellt werden.' });
  }
});

export default router;
