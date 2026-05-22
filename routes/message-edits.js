import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  saveMessageEdit,
  getMessageEdits,
  setActiveEdit,
  deleteMessageEdit,
} from '../stores/message-edits.js';

const router = Router();

/**
 * PUT /api/messages/:messageId/content
 * Speichert einen neuen Edit für eine Nachricht (neue Version).
 * Body: { content: string }
 */
router.put('/messages/:messageId/content', requireDashboardAuth, (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  if (!messageId) return res.status(400).json({ error: 'Ungültige messageId' });

  const { content } = req.body;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content fehlt oder leer' });
  }

  const edit = saveMessageEdit(messageId, content);
  console.log(`[MessageEdits] Neue Version ${edit.version} für message_id=${messageId}`);
  res.json({ ok: true, edit });
});

/**
 * GET /api/messages/:messageId/versions
 * Listet alle Versionen einer Nachricht auf, neueste zuerst.
 */
router.get('/messages/:messageId/versions', requireDashboardAuth, (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  if (!messageId) return res.status(400).json({ error: 'Ungültige messageId' });

  const versions = getMessageEdits(messageId);
  res.json({ versions });
});

/**
 * PUT /api/messages/edits/:editId/activate
 * Setzt einen bestimmten Edit als aktive Version.
 */
router.put('/messages/edits/:editId/activate', requireDashboardAuth, (req, res) => {
  const editId = parseInt(req.params.editId, 10);
  if (!editId) return res.status(400).json({ error: 'Ungültige editId' });

  const result = setActiveEdit(editId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

/**
 * DELETE /api/messages/edits/:editId
 * Löscht eine bestimmte Edit-Version.
 */
router.delete('/messages/edits/:editId', requireDashboardAuth, (req, res) => {
  const editId = parseInt(req.params.editId, 10);
  if (!editId) return res.status(400).json({ error: 'Ungültige editId' });

  const result = deleteMessageEdit(editId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
