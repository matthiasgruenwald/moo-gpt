import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { getMessages } from '../stores/chat.js';
import { getStudents } from '../stores/dashboard.js';
import { enrichMessagesWithCost, computeThreadCost, computeRunCost } from '../token-log.js';

export function enrichStudentsWithCost(students) {
  return students.map(s => ({
    ...s,
    threadCost: computeRunCost(s.cost_prompt || 0, s.cost_completion || 0),
  }));
}

const router = Router();

router.get('/dashboard/students', requireDashboardAuth, (req, res) => {
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

router.get('/dashboard/messages/:threadDbId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const threadDbId = parseInt(req.params.threadDbId);
  if (isNaN(threadDbId)) return res.status(400).json({ error: 'Invalid threadDbId' });
  try {
    const students = getStudents(activityId);
    const student  = students.find(s => s.thread_db_id === threadDbId);
    if (!student) return res.status(403).json({ error: 'Forbidden' });
    const messages   = enrichMessagesWithCost(getMessages(threadDbId));
    const threadCost = computeThreadCost(threadDbId);
    res.json({ student, messages, threadCost });
  } catch (e) {
    console.error('[Dashboard] getMessages error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
