import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity, setActivityConfig } from '../stores/activity.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getTeacherPreference, setTeacherSuggestPreference } from '../stores/teacher.js';
import { AVAILABLE_MODELS, GEN_MODEL, MODEL_NAME } from '../env-config.js';
import { validateWidgetConfig } from '../validators.js';
import { getCachedConfig } from '../config-cache.js';
import { recordWerkzeugUsage } from '../cost-service.js';

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
      const { text: result } = await client.jsonCall(systemPrompt, userMessage, model, opts);
      res.json(result);
    } catch (err) {
      console.log(`[PromptCheck] Fehler: ${err.message}`);
      res.status(502).json({ error: 'KI-Aufruf fehlgeschlagen' });
    }
  };
}

const SUGGEST_PROMPT_SYSTEM = `Du bist Experte für System-Prompts für KI-Lernassistenten im Schulunterricht (IGS, Sekundarstufe I/II).

Dein Ziel: Gemeinsam mit der Lehrkraft einen vollständigen, exzellenten Aufgabenprompt entwickeln.

Vorgehensweise:
1. Analysiere den vorhandenen Prompt und die Aufgabenstellung im ersten User-Message sorgfältig.
2. Prüfe welche der 5 Kernbereiche bereits klar abgedeckt sind: Fach/Thema/Jahrgang · Rolle des Bots · Lernziel · Antwortstil · Didaktik+Verbote
3. Frage gezielt nach allem was fehlt oder noch unklar ist — so viele Fragen wie nötig, so wenige wie möglich. Überspringe nur was wirklich klar und vollständig ist.
4. Pro Nachricht immer nur EINE Frage. Gib zu jeder Frage deine eigene Empfehlung als Ausgangspunkt mit — die Lehrkraft muss dann nur bestätigen oder korrigieren. Beispiel: "Welche Rolle soll der Bot haben? Mein Vorschlag: Lernbegleiter, der schrittweise führt und keine fertigen Lösungen liefert. Passt das?"
5. Erst wenn alle 5 Bereiche ausreichend geklärt sind: erstelle den finalen verbesserten Prompt. Kein vorzeitiger Abschluss.

Finaler Prompt MUSS diese Abschnitte enthalten: Rolle | Ziel | Antwortstil | Didaktisches Verhalten | Verbote | Beispiele (Schüler: … / Gut: … / Schlecht: …)

AUSGABE — ausschließlich ein JSON-Objekt, absolut kein Text davor oder danach:
Nächste Frage → {"type":"question","question":"<Fragetext mit Empfehlung>"}
Fertig → {"type":"final","prompt":"<vollständiger verbesserter Prompt>"}`;

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
      if (messages.length > 0) {
        history = messages;
      } else {
        // Fallback wenn Client keine History schickt
        const contextNote = currentPrompt?.trim()
          ? `Vorhandener Prompt der Lehrkraft:\n${currentPrompt.trim()}\n\n`
          : '';
        history = [{ role: 'user', content: `${contextNote}Bitte stell mir Frage 1 von 5.` }];
      }
    }

    try {
      const { text: raw, usage } = await client.textCall(systemPrompt, '', MODEL_NAME, {
        timeout: 120_000,
        input: history.map(m => ({ role: m.role, content: m.content })),
      });
      recordWerkzeugUsage(req.activityId, 'prompt-assist', MODEL_NAME, usage);
      // Robust JSON extraction: find first { ... } block
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let parsed;
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = null; }
      }
      if (!parsed) parsed = { type: 'final', prompt: raw.trim() };
      const cost = {
        promptTokens:     usage?.input_tokens  ?? null,
        completionTokens: usage?.output_tokens ?? null,
      };
      res.json({ ...parsed, cost });
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
