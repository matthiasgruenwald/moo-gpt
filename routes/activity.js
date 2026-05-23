import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity, setActivityConfig } from '../stores/activity.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
import { AVAILABLE_MODELS, GEN_MODEL, MODEL_NAME } from '../env-config.js';
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

const SUGGEST_PROMPT_SYSTEM = `Du bist Experte für System-Prompts für KI-Lernassistenten im Schulunterricht (IGS, Sekundarstufe I/II).

Deine Aufgabe: Hilf einer Lehrkraft, einen vollständigen Aufgabenprompt zu erstellen. Stelle genau 5 Fragen — eine nach der anderen. Erst nach der 5. Antwort erzeugst du den finalen Prompt.

Reihenfolge der Fragen (je nach bereits vorhandenem Prompt ggf. kürzer fassen oder überspringen):
1. Fach, Thema und Jahrgang (z. B. „Biologie, Ökosysteme, Klasse 9")
2. Rolle und Charakter des Bots (z. B. Tutor, Lernbegleiter, Prüfer, Gesprächspartner)
3. Was sollen die Schüler tun oder lernen? (Lernziel / Aufgabenstellung)
4. Antwortstil: Wie soll der Bot antworten? (Länge, Fachsprache vs. Schülersprache, Ton)
5. Didaktik + Verbote: Soll der Bot direkte Lösungen nennen oder schrittweise führen? Was darf er keinesfalls tun oder sagen?

Stelle immer nur EINE Frage auf einmal. Wenn der vorhandene Prompt bereits Antworten enthält, übernimm sie stillschweigend und überspringe die entsprechende Frage.

Der finale Prompt MUSS diese Abschnitte enthalten: Rolle | Ziel | Antwortstil | Didaktisches Verhalten | Verbote | Beispiele (Schüler: … / Gut: … / Schlecht: …)

Antworte IMMER im JSON-Format (keine anderen Zeichen davor/danach):
- Nächste Frage: {"type":"question","question":"Deine Frage"}
- Finaler Prompt: {"type":"final","prompt":"Vollständiger Prompt hier"}`;

const SUGGEST_DIRECT_SYSTEM = `Du bist Experte für System-Prompts für KI-Lernassistenten im Schulunterricht (IGS, Sekundarstufe I/II).

Erstelle sofort und ohne Rückfragen einen vollständigen, strukturierten Aufgabenprompt auf Basis des vorhandenen Prompts der Lehrkraft. Falls kein Prompt vorhanden ist, erstelle einen allgemeinen Lernassistenten-Prompt.

Der Prompt MUSS diese Abschnitte enthalten: Rolle | Ziel | Antwortstil | Didaktisches Verhalten | Verbote | Beispiele (Schüler: … / Gut: … / Schlecht: …)

Antworte ausschließlich als JSON (keine anderen Zeichen davor/danach): {"type":"final","prompt":"Vollständiger Prompt hier"}`;

export function buildSuggestPromptHandler({ aiClient: client }) {
  return async function suggestPromptHandler(req, res) {
    const { currentPrompt, messages = [], direct = false } = req.body;

    let systemPrompt;
    let history;

    if (direct) {
      systemPrompt = SUGGEST_DIRECT_SYSTEM;
      const contextNote = currentPrompt?.trim()
        ? `Vorhandener Prompt der Lehrkraft:\n${currentPrompt.trim()}\n\n`
        : '';
      history = [{ role: 'user', content: `${contextNote}Erstelle jetzt den vollständigen Aufgabenprompt.` }];
    } else {
      systemPrompt = SUGGEST_PROMPT_SYSTEM;
      const contextNote = currentPrompt?.trim()
        ? `Vorhandener Prompt der Lehrkraft:\n${currentPrompt.trim()}\n\n`
        : '';
      const firstUserMsg = `${contextNote}Bitte stell mir die erste Rückfrage, um einen guten Aufgabenprompt zu erstellen.`;
      history = messages.length > 0
        ? messages
        : [{ role: 'user', content: firstUserMsg }];
    }

    try {
      const raw = await client.textCall(systemPrompt, '', GEN_MODEL, {
        timeout: 60_000,
        input: history.map(m => ({ role: m.role, content: m.content })),
      });
      const text = raw.trim().replace(/^```jsons*/i, '').replace(/```s*$/, '');
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { parsed = { type: 'final', prompt: raw.trim() }; }
      res.json(parsed);
    } catch (err) {
      console.log(`[SuggestPrompt] Fehler: ${err.message}`);
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
      activityName:           act?.activity_name             || '',
      title:                  act?.title                     ?? '',
      botIcon:                act?.bot_icon                  ?? 'grw',
      opener:                 act?.opener                    || '',
      uploadMode:             act?.upload_mode               || 'off',
      erfahrungsprompt:       erf?.content                   || '',
      myModel:                pref?.preferred_model          || null,
      availableModels:        AVAILABLE_MODELS,
      preferSuggestQuestions: pref?.prefer_suggest_questions ?? 1,
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

  router.put('/activity-config/:activityId/suggest-preference', requireDashboardAuth, (req, res) => {
    const { userId } = req;
    const { preferSuggestQuestions } = req.body;
    setTeacherSuggestPreference(userId, preferSuggestQuestions);
    res.json({ ok: true });
  });

  router.post('/activity/:activityId/prompt-check', requireDashboardAuth, buildPromptCheckHandler({ aiClient }));

  router.post('/activity/:activityId/suggest-prompt', requireDashboardAuth, buildSuggestPromptHandler({ aiClient }));

  return router;
}
