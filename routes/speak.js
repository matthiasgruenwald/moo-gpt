/**
 * routes/speak.js — Issue #102
 *
 * POST /api/speak — Text → GPT-mini-Preprocessing → tts-1-hd → Audio-Blob.
 *
 * Auth:    Origin-Check (analog zu /api/transcribe)
 * Input:   JSON { text, speed?, voice?, activityId?, threadId?, userId? }
 * Output:  audio/mpeg Binary
 * Fehler:  HTTP 400 bei Validierungsfehlern, HTTP 500 bei TTS-Fehler (kein Stack-Trace)
 *          Preprocessing-Fehler: graceful degradation (weiter mit unbereinigtem Text)
 */

import { Router } from 'express';
import { Readable } from 'node:stream';
import { isOriginAllowed } from '../auth-middleware.js';
import { saveTtsPrepUsage, saveTtsUsage } from '../stores/token.js';

const PREPROCESS_INSTRUCTIONS =
  'Bereinige den folgenden Text für deutsche Sprachausgabe.\n' +
  'REGELN:\n' +
  '- Entferne Markdown-Formatierung (**, *, __, #, `, etc.)\n' +
  '- Übersetze LaTeX-Ausdrücke in gesprochenes Deutsch\n' +
  '- Schreibe arabische Ziffern als deutsche Zahlwörter (12 → zwölf, 4 → vier)\n' +
  'WICHTIG: Antworte AUSSCHLIESSLICH mit dem bereinigten Text. Kein Kommentar, keine Ergänzung, kein Satz dazu.';

/**
 * Prüft ob der Text Markdown-Syntax oder LaTeX enthält und Preprocessing benötigt.
 * Reine Fließtexte (z. B. "Pong 4") werden direkt an TTS übergeben.
 */
function needsPreprocessing(text) {
  // Markdown, LaTeX oder Ziffern (damit Zahlen auf Deutsch gesprochen werden)
  return /[#*_`~]|\$\$?|\\\(|\\\[|={2,}|-{3,}|!\[|\d/.test(text);
}

const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;

/**
 * Erstellt den Speak-Router.
 *
 * @param {{ oai: OpenAI, fetchFn?: typeof fetch }} deps — OpenAI-Client + optionaler fetch-Override (für Tests)
 */
export function createSpeakRouter({ oai, fetchFn = globalThis.fetch }) {
  const router = Router();

  router.post('/speak', async (req, res) => {
    // Auth: Origin-Check
    if (!isOriginAllowed(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Input-Validierung
    const rawText = req.body?.text;
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      return res.status(400).json({ error: 'text muss ein nicht-leerer String sein' });
    }

    const speed = req.body?.speed != null ? Number(req.body.speed) : DEFAULT_SPEED;
    if (isNaN(speed) || speed < 0.5 || speed > 1.5) {
      return res.status(400).json({ error: 'speed muss zwischen 0.5 und 1.5 liegen' });
    }

    const voice      = typeof req.body?.voice === 'string' ? req.body.voice : DEFAULT_VOICE;
    const threadId   = typeof req.body?.threadId   === 'string' ? req.body.threadId.slice(0, 64)   : null;
    const activityId = typeof req.body?.activityId === 'string' ? req.body.activityId.slice(0, 64) : null;

    console.log(`[Speak] Request: voice=${voice}, speed=${speed}, textLen=${rawText.length}, activityId=${activityId}`);

    // GPT-mini-Preprocessing: nur wenn Markdown oder LaTeX erkannt
    let cleanedText = rawText;
    if (!needsPreprocessing(rawText)) {
      console.log('[Speak] Kein Markdown/LaTeX — Preprocessing übersprungen');
    } else try {
      console.log('[Speak] GPT-mini-Preprocessing startet…');
      const prepResponse = await oai.responses.create({
        model:        'gpt-4o-mini',
        instructions: PREPROCESS_INSTRUCTIONS,
        input:        [{ role: 'user', content: rawText }],
        stream:       false,
      });
      const prepText = prepResponse.output_text?.trim();
      if (prepText) cleanedText = prepText;

      const usage = prepResponse.usage;
      saveTtsPrepUsage(
        threadId,
        activityId,
        usage?.prompt_tokens     ?? null,
        usage?.completion_tokens ?? null,
      );
    } catch (prepErr) {
      // Graceful degradation: Preprocessing fehlgeschlagen → unbereinigten Text verwenden
      console.error('[Speak] GPT-mini-Preprocessing fehlgeschlagen:', prepErr.message);
    }

    console.log(`[Speak] Preprocessing abgeschlossen, starte TTS (${cleanedText.length} Zeichen)…`);

    // TTS-Synthese — direktes fetch() statt SDK (SDK 6.x BinaryResponse hängt in Express)
    try {
      const ttsRes = await fetchFn('https://api.openai.com/v1/audio/speech', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.APIKEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ model: 'tts-1-hd', voice, input: cleanedText, speed }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        console.error(`[Speak] TTS-API Fehler ${ttsRes.status}:`, errText.slice(0, 200));
        return res.status(500).json({ error: 'TTS-Synthese fehlgeschlagen' });
      }

      saveTtsUsage(threadId, activityId, cleanedText.length);
      console.log(`[Speak] TTS OK, streame Audio (${cleanedText.length} Zeichen)…`);

      res.set('Content-Type', 'audio/mpeg');
      Readable.fromWeb(ttsRes.body).pipe(res);
    } catch (ttsErr) {
      console.error('[Speak] TTS-Fehler:', ttsErr.message);
      return res.status(500).json({ error: 'TTS-Synthese fehlgeschlagen' });
    }
  });

  return router;
}
