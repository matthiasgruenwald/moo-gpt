import { Router } from 'express';
import { requireTeacherAuth, isOriginAllowed } from '../auth-middleware.js';
import {
  getStudentMemory,
  getAllMemory,
  upsertStudentMemory,
  deleteStudentMemory,
} from '../stores/student-memory.js';

const router = Router();

/**
 * GET /api/student-memory
 *
 * Schüler-Auth (query: userId): gibt eigene globale Memory zurück.
 * Dashboard-Auth (query: token): gibt alle globalen Memory-Einträge zurück.
 */
router.get('/student-memory', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { token, userId } = req.query;

  // Dashboard-Auth → alle Einträge
  if (token) {
    requireTeacherAuth(req, res, () => {
      res.json({ memory: getAllMemory() });
    });
    return;
  }

  // Schüler-Auth → eigener Eintrag
  if (!userId) return res.status(400).json({ error: 'userId oder token erforderlich' });
  const entry = getStudentMemory(userId);
  res.json({ memory: entry });
});

/**
 * POST /api/student-memory
 * Body (Schüler): { userId, preferenceText, preferred_voice?, tts_autoplay? }
 * Body (Dashboard): { studentId, preferenceText, preferred_voice?, tts_autoplay? }
 * Query: token (optional, Dashboard-Auth)
 */
router.post('/student-memory', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { token } = req.query;

  if (token) {
    // Dashboard-Auth: kann beliebigen Schüler setzen
    requireTeacherAuth(req, res, () => {
      const { studentId, preferenceText, preferred_voice, tts_autoplay } = req.body;
      if (!studentId || preferenceText === undefined) {
        return res.status(400).json({ error: 'studentId und preferenceText erforderlich' });
      }
      upsertStudentMemory(studentId, preferenceText, { preferred_voice, tts_autoplay });
      res.json({ ok: true });
    });
    return;
  }

  // Schüler-Auth: eigener Eintrag
  const { userId, preferenceText, preferred_voice, tts_autoplay } = req.body;
  if (!userId || preferenceText === undefined) {
    return res.status(400).json({ error: 'userId und preferenceText erforderlich' });
  }
  upsertStudentMemory(userId, preferenceText, { preferred_voice, tts_autoplay });
  res.json({ ok: true });
});

/**
 * DELETE /api/student-memory
 * Query (Schüler): userId
 * Query (Dashboard): token + studentId
 */
router.delete('/student-memory', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { token, userId, studentId } = req.query;

  if (token) {
    requireTeacherAuth(req, res, () => {
      if (!studentId) return res.status(400).json({ error: 'studentId erforderlich' });
      deleteStudentMemory(studentId);
      res.json({ ok: true });
    });
    return;
  }

  if (!userId) return res.status(400).json({ error: 'userId erforderlich' });
  deleteStudentMemory(userId);
  res.json({ ok: true });
});

export default router;
