import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity, setActivityConfig } from '../stores/activity.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference } from '../stores/teacher.js';
import { AVAILABLE_MODELS, MODEL_NAME } from '../env-config.js';
import { validateWidgetConfig } from '../validators.js';
import { getCachedConfig } from '../config-cache.js';

function buildPromptCheckSystem(hasImages) {
  const sections = 'Rolle | Ziel | Antwortstil | Didaktisches Verhalten | Verbote | Beispiele (Schüler: … / Gut: … / Schlecht: …)';
  const imageSection = hasImages
    ? '\n- Umgang mit dem Arbeitsblatt/Bild: Bot soll auf sichtbare Inhalte verweisen und wörtlich zitieren, keine Vermutungen'
    : '';
  return `Du bist Experte für System-Prompts für KI-Lernassistenten im Schulkontext (IGS, Sek. I/II).

Du erhältst eine Aufgabenstellung und einen bestehenden Aufgabenprompt einer Lehrkraft.
Erstelle einen vollständigen, expliziten, strukturierten verbesserten Aufgabenprompt.

Wichtige Prinzipien:
- Übernimm alle konkreten Anforderungen der Lehrkraft möglichst wörtlich
- Der Prompt darf lang und explizit sein — kurze Prompts führen zu schlechten Bot-Antworten
- Genau eine Rückfrage oder ein Hinweis pro Bot-Turn${imageSection}

Der Prompt MUSS diese Abschnitte enthalten: ${sections}

Antworte ausschließlich als JSON: { "suggestion": "<verbesserter Prompt>" }`;
}

function stripHtml(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildPromptCheckHandler({ aiClient: client }) {
  return async function promptCheckHandler(req, res) {
    const { task, currentHints, taskImages } = req.body;
    const taskText = stripHtml(task);
    const userMessage = `Aufgabenstellung:\n${taskText || '(keine)'}\n\nAktueller Prompt:\n${currentHints || '(leer)'}`;

    const validImages = (taskImages || []).filter(img => img !== null && typeof img === 'string');
    const model = getCachedConfig().model || MODEL_NAME;
    const systemPrompt = buildPromptCheckSystem(validImages.length > 0);

    const opts = {
      timeout: 90_000,
      ...(validImages.length ? {
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: userMessage },
            ...validImages.map(img => ({ type: 'input_image', image_url: img })),
          ],
        }],
      } : {}),
    };

    try {
      const result = await client.jsonCall(systemPrompt, userMessage, model, opts);
      res.json(result);
    } catch (err) {
      console.log(`[PromptCheck] Fehler: ${err.message}`);
      res.status(502).json({ error: 'KI-Aufruf fehlgeschlagen' });
    }
  };
}

export function createActivityRouter({ chatRegistry, dashboardRegistry, lockManager, aiClient }) {
  const router = Router();

  router.get('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const act  = getActivity(activityId);
    const erf  = getActiveErfahrungsprompt(activityId);
    const pref = getTeacherPreference(userId);
    res.json({
      activityId,
      activityName:     act?.activity_name   || '',
      title:            act?.title           ?? '',
      botIcon:          act?.bot_icon        ?? 'grw',
      opener:           act?.opener          || '',
      uploadMode:       act?.upload_mode     || 'off',
      erfahrungsprompt: erf?.content         || '',
      myModel:          pref?.preferred_model || null,
      availableModels:  AVAILABLE_MODELS,
    });
  });

  router.put('/activity-config/:activityId', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const { opener, uploadMode, title, botIcon } = req.body;
    const validErr = validateWidgetConfig(uploadMode, botIcon);
    if (validErr) return res.status(400).json({ error: validErr });
    setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
    console.log(`[Config] Aktivität ${activityId} aktualisiert von ${userId}`);
    res.json({ ok: true });
  });

  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    const durationMinutes = Number(req.body.durationMinutes) || 0;
    lockManager.lock(activityId, durationMinutes);
    console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
    res.json({ ok: true, locked: true });
  });

  router.delete('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
    const { activityId, userId } = req;
    lockManager.unlock(activityId);
    console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
    res.json({ ok: true, locked: false });
  });

  router.post('/activity/:activityId/prompt-check', requireDashboardAuth, buildPromptCheckHandler({ aiClient }));

  return router;
}
