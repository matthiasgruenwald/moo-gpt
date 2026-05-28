/**
 * routes/prompt-assist.js — Prompt-Assistent-Endpunkte (#128-Architektur)
 *
 * Kapselt alle KI-gestützten Prompt-Werkzeuge für Lehrkräfte:
 *   POST /api/activity/:activityId/prompt-check   — Einmaliger Prompt-Verbesserungsvorschlag
 *   POST /api/activity/:activityId/suggest-prompt — Dialogbasierter Prompt-Assistent (grill-me-Muster)
 *
 * Auth:    requireDashboardAuth
 * Kein HTTP-Bezug außer Route-Handling; KI-Logik vollständig in Handler-Buildern.
 *
 * Exportiert zusätzlich buildPromptCheckHandler + buildSuggestPromptHandler
 * für direkte Tests ohne Express-Stack.
 */

import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getCachedConfig } from '../config-cache.js';
import { recordWerkzeugUsage, sumCostRows } from '../cost-service.js';
import { AVAILABLE_MODELS, MODEL_NAME } from '../env-config.js';

// ── System-Prompts ────────────────────────────────────────────────────────────

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

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

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

// ── Handler-Builder (exportiert für direkte Tests) ────────────────────────────

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
      const { text: result, usage } = await client.jsonCall(systemPrompt, userMessage, model, opts);
      recordWerkzeugUsage(req.activityId, 'prompt-assist', model, usage);
      res.json(result);
    } catch (err) {
      console.log(`[PromptCheck] Fehler: ${err.message}`);
      res.status(502).json({ error: 'KI-Aufruf fehlgeschlagen' });
    }
  };
}

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
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let parsed;
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = null; }
      }
      if (!parsed) parsed = { type: 'final', prompt: raw.trim() };
      const runCost = await sumCostRows([{
        prompt_tokens:     usage?.input_tokens  ?? 0,
        completion_tokens: usage?.output_tokens ?? 0,
        model:             MODEL_NAME,
      }]);
      const cost = {
        promptTokens:     usage?.input_tokens  ?? null,
        completionTokens: usage?.output_tokens ?? null,
        costEur:          runCost?.totalEur ?? null,
      };
      res.json({ ...parsed, cost });
    } catch (err) {
      console.log(`[SuggestPrompt] Fehler: ${err.message}`);
      res.status(502).json({ error: 'KI-Aufruf fehlgeschlagen' });
    }
  };
}

// ── Router-Factory ────────────────────────────────────────────────────────────

export function createPromptAssistRouter({ aiClient }) {
  const router = Router();

  router.post('/activity/:activityId/prompt-check',
    requireDashboardAuth,
    buildPromptCheckHandler({ aiClient }),
  );

  router.post('/activity/:activityId/suggest-prompt',
    requireDashboardAuth,
    buildSuggestPromptHandler({ aiClient }),
  );

  return router;
}
