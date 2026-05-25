/**
 * routes/transcribe.js — Issue #91
 *
 * POST /api/transcribe — Multipart-Upload → OpenAI Whisper → Text + Dauer zurück.
 *
 * Auth:     Origin-Check (wie andere Chat-Endpunkte)
 * Input:    FormData { audio: File, threadId?: string, activityId?: string }
 * Output:   { text: string, duration_seconds: number }
 * Fehler:   HTTP 500, { error: 'Transkription fehlgeschlagen' } — kein Stack-Trace
 *
 * Safari/iOS: audio/mp4 → Dateiname mit .mp4-Endung (Whisper erkennt Format aus Endung)
 */

import { Router } from 'express';
import multer from 'multer';
import { toFile } from 'openai';
import { isOriginAllowed } from '../auth-middleware.js';
import { saveAudioUsage } from '../stores/token.js';

// Multer: In-Memory-Speicherung (kein Temp-File auf Disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper-Limit
});

/**
 * Erstellt den Transcribe-Router.
 *
 * @param {{ oai: OpenAI }} deps — OpenAI-Client (injizierbar für Tests)
 */
export function createTranscribeRouter({ oai }) {
  const router = Router();

  router.post('/transcribe', upload.single('audio'), async (req, res) => {
    // Auth: Origin-Check
    if (!isOriginAllowed(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Keine Audio-Datei empfangen' });
    }

    const threadId   = req.body?.threadId   || null;
    const activityId = req.body?.activityId || null;

    try {
      // Safari/iOS: audio/mp4 → .mp4-Endung; Standard: .webm
      const mimeType = req.file.mimetype || 'audio/webm';
      const ext      = mimeType.includes('mp4') ? '.mp4' : '.webm';
      const filename = `audio${ext}`;

      const audioFile = await toFile(req.file.buffer, filename, { type: mimeType });

      const response = await oai.audio.transcriptions.create({
        file:            audioFile,
        model:           'whisper-1',
        response_format: 'verbose_json',
        // language nicht gesetzt → auto-detection
      });

      const text             = response.text ?? '';
      const duration_seconds = response.duration ?? 0;

      // Kosten loggen (Issue #87)
      if (duration_seconds > 0) {
        saveAudioUsage(threadId, activityId, duration_seconds);
      }

      return res.json({ text, duration_seconds });
    } catch (err) {
      console.error('[Transcribe] Whisper-Fehler:', err.message);
      return res.status(500).json({ error: 'Transkription fehlgeschlagen' });
    }
  });

  return router;
}
