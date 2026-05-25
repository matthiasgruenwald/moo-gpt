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

// Erlaubte Audio-MIME-Types (Whitelist)
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'video/webm', // Chrome/Firefox senden gelegentlich video/webm für Audio-Recordings
]);

// Multer: In-Memory-Speicherung, MIME-Type-Check per fileFilter
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper-Limit
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unerlaubter Dateityp: ${file.mimetype}`));
    }
  },
});

// Einfacher IP-basierter Rate-Limiter für den Transcribe-Endpunkt (kostet Geld!)
const transcribeRequests = new Map(); // ip → { count, resetAt }
const TRANSCRIBE_LIMIT_PER_HOUR = 60; // max. 60 Transkriptionen/Stunde/IP

function transcribeRateLimit(req, res, next) {
  const ip  = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = transcribeRequests.get(ip);

  if (!entry || now > entry.resetAt) {
    transcribeRequests.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return next();
  }

  entry.count += 1;
  if (entry.count > TRANSCRIBE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
  }
  next();
}

// Stale Entries täglich bereinigen
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of transcribeRequests) {
    if (now > entry.resetAt) transcribeRequests.delete(ip);
  }
}, 60 * 60 * 1000);

/**
 * Erstellt den Transcribe-Router.
 *
 * @param {{ oai: OpenAI }} deps — OpenAI-Client (injizierbar für Tests)
 */
export function createTranscribeRouter({ oai }) {
  const router = Router();

  router.post('/transcribe', transcribeRateLimit, upload.single('audio'), async (req, res) => {
    // Auth: Origin-Check
    if (!isOriginAllowed(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Keine Audio-Datei empfangen' });
    }

    // threadId / activityId nur als Strings zulassen (Länge begrenzen)
    const threadId   = typeof req.body?.threadId   === 'string' ? req.body.threadId.slice(0, 64)   : null;
    const activityId = typeof req.body?.activityId === 'string' ? req.body.activityId.slice(0, 64) : null;

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
