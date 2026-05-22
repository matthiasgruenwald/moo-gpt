import { Router } from 'express';
import { requireDashboardAuth, isOriginAllowed } from '../auth-middleware.js';
import {
  getStudentMemory,
  getAllMemoryForActivity,
  upsertStudentMemory,
  deleteStudentMemory,
} from '../stores/student-memory.js';

const router = Router();

/**
 * GET /api/student-memory/:activityId
 *
 * Schüler-Auth (query: userId): gibt eigene Memory zurück.
 * Dashboard-Auth (query: token): gibt alle Memory-Einträge der Aktivität zurück.
 */
router.get('/student-memory/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { activityId } = req.params;
  const { token, userId } = req.query;

  // Dashboard-Auth → alle Einträge
  if (token) {
    requireDashboardAuth(req, res, () => {
      res.json({ memory: getAllMemoryForActivity(activityId) });
    });
    return;
  }

  // Schüler-Auth → eigener Eintrag
  if (!userId) return res.status(400).json({ error: 'userId oder token erforderlich' });
  const entry = getStudentMemory(userId, activityId);
  res.json({ memory: entry });
});

/**
 * POST /api/student-memory/:activityId
 * Body (Schüler): { userId, preferenceText }
 * Body (Dashboard): { studentId, preferenceText }
 * Query: token (optional, Dashboard-Auth)
 */
router.post('/student-memory/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { activityId } = req.params;
  const { token } = req.query;

  if (token) {
    // Dashboard-Auth: kann beliebigen Schüler setzen
    requireDashboardAuth(req, res, () => {
      const { studentId, preferenceText } = req.body;
      if (!studentId || !preferenceText) {
        return res.status(400).json({ error: 'studentId und preferenceText erforderlich' });
      }
      upsertStudentMemory(studentId, activityId, preferenceText);
      res.json({ ok: true });
    });
    return;
  }

  // Schüler-Auth: eigener Eintrag
  const { userId, preferenceText } = req.body;
  if (!userId || !preferenceText) {
    return res.status(400).json({ error: 'userId und preferenceText erforderlich' });
  }
  upsertStudentMemory(userId, activityId, preferenceText);
  res.json({ ok: true });
});

/**
 * DELETE /api/student-memory/:activityId
 * Query (Schüler): userId
 * Query (Dashboard): token + studentId
 */
router.delete('/student-memory/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { activityId } = req.params;
  const { token, userId, studentId } = req.query;

  if (token) {
    requireDashboardAuth(req, res, () => {
      if (!studentId) return res.status(400).json({ error: 'studentId erforderlich' });
      deleteStudentMemory(studentId, activityId);
      res.json({ ok: true });
    });
    return;
  }

  if (!userId) return res.status(400).json({ error: 'userId erforderlich' });
  deleteStudentMemory(userId, activityId);
  res.json({ ok: true });
});

export default router;
