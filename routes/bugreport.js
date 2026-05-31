/**
 * routes/bugreport.js — Fehler-Meldung als GitHub-Issue (#160)
 *
 * POST /api/bug-report
 *
 * Nimmt eine Fehlerbeschreibung entgegen, ruft die KI auf, und gibt
 * aufbereiteten Issue-Text + verfügbare Materialien zurück.
 * Der eigentliche GitHub-Issue wird clientseitig via URL geöffnet.
 */

import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getActivity } from '../stores/activity.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getStudents } from '../stores/dashboard.js';
import { getMessages } from '../stores/chat.js';
import { getCachedConfig } from '../stores/prompt.js';
import { recordWerkzeugUsage } from '../cost-service.js';

// Maximale Anzahl Chat-Nachrichten pro Thread die beigefügt werden
const MAX_CHAT_MESSAGES = 20;

// Maximale Anzahl Threads die für Chat-Auszüge berücksichtigt werden
const MAX_THREADS = 3;

// ── Pseudonymisierung ─────────────────────────────────────────────────────────

/**
 * Ersetzt moodle_user_id durch neutrale Labels (Schüler A, B, C …).
 * @param {Array<{ threadId: number, moodle_user_id: string, messages: Array }>} threads
 * @returns {{ pseudoThreads: Array, idMap: Map<string, string> }}
 */
function pseudonymizeThreads(threads) {
  const idMap = new Map();
  const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let labelIdx = 0;

  function getLabel(userId) {
    if (!idMap.has(userId)) {
      const label = labelIdx < LABELS.length
        ? `Schüler ${LABELS[labelIdx]}`
        : `Schüler ${labelIdx + 1}`;
      idMap.set(userId, label);
      labelIdx++;
    }
    return idMap.get(userId);
  }

  const pseudoThreads = threads.map(t => ({
    ...t,
    displayName: getLabel(t.moodle_user_id),
  }));

  return { pseudoThreads, idMap };
}

/**
 * Formatiert Chat-Nachrichten als lesbaren Text (ohne Schüler-IDs).
 */
function formatChatLog(pseudoThreads) {
  const parts = [];
  for (const t of pseudoThreads) {
    parts.push(`--- ${t.displayName} ---`);
    for (const m of t.messages) {
      const role = m.role === 'user' ? t.displayName : 'Bot';
      const text = (m.content || '').slice(0, 500);
      parts.push(`${role}: ${text}`);
    }
  }
  return parts.join('\n');
}

// ── KI-System-Prompt ──────────────────────────────────────────────────────────

const BUG_REPORT_SYSTEM = `Du bist ein Assistent, der Fehlermeldungen für ein Schulprojekt (moo-gpt, ein Moodle-KI-Chatbot) aufbereitet.

Deine Aufgabe: Erstelle aus der Beschreibung einer Lehrkraft einen strukturierten GitHub-Issue.

Regeln:
- Titel: kurz (max. 80 Zeichen), auf Deutsch, beginnt mit "bug: " oder "feat: "
- Body: Markdown-Format mit Abschnitten: ## Beschreibung, ## Schritte zum Reproduzieren (wenn erkennbar), ## Erwartetes Verhalten, ## Tatsächliches Verhalten, ## Kontext
- Füge im Body einen Hinweis ein: "Gemeldet von: Lehrkraft (pseudonymisiert)"
- Sei präzise und sachlich
- Schlage 2-4 relevante Materialien vor: welche wären für dieses Problem hilfreich? Wähle aus: prompt (Aufgabenprompt), config (Aktivitätskonfiguration), chatLog (Chat-Auszüge)

Antworte ausschließlich als JSON: { "title": "...", "body": "...", "suggestedMaterials": ["prompt", "config", "chatLog"] }
suggestedMaterials ist ein Array mit 0-3 Einträgen aus ["prompt", "config", "chatLog"].`;

// ── Route-Handler ─────────────────────────────────────────────────────────────

export function createBugReportRouter({ aiClient }) {
  const router = Router();

  router.post('/bug-report', requireDashboardAuth, async (req, res) => {
    const { activityId } = req;
    const { description } = req.body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Fehlerbeschreibung fehlt' });
    }

    // ── Materialien laden ─────────────────────────────────────────────────────

    const activity = getActivity(activityId);
    const erfahrungsprompt = getActiveErfahrungsprompt(activityId);

    // Aufgabenprompt (Erfahrungsprompt + hints)
    const promptText = erfahrungsprompt?.content
      ? erfahrungsprompt.content
      : (activity?.hints || null);

    // Aktivitätskonfiguration (ohne sensible Daten)
    const configData = activity ? {
      botTitle:   activity.title      || null,
      botIcon:    activity.bot_icon   || null,
      model:      activity.model      || null,
      uploadMode: activity.upload_mode || null,
      audioInput: activity.audio_input || null,
      audioOutput: activity.audio_output || null,
    } : null;
    const configText = configData
      ? JSON.stringify(configData, null, 2)
      : null;

    // Chat-Auszüge laden (letzte MAX_THREADS aktive Threads)
    let chatLogText = null;
    try {
      const students = getStudents(activityId);
      const activeThreads = students.slice(0, MAX_THREADS);
      if (activeThreads.length > 0) {
        const threads = activeThreads.map(s => ({
          threadId: s.thread_db_id,
          moodle_user_id: s.moodle_user_id || String(s.thread_db_id),
          messages: getMessages(s.thread_db_id).slice(-MAX_CHAT_MESSAGES),
        }));
        const { pseudoThreads } = pseudonymizeThreads(threads);
        chatLogText = formatChatLog(pseudoThreads);
      }
    } catch (e) {
      console.warn('[BugReport] Chat-Log laden fehlgeschlagen:', e.message);
    }

    // ── KI-Aufruf ─────────────────────────────────────────────────────────────

    const config = getCachedConfig();
    const model = config.model || 'gpt-4.1-nano';

    const userMessage = `Fehlerbeschreibung der Lehrkraft:\n${description.trim()}`;

    let issueTitle = '';
    let issueBody = '';
    let suggestedMaterials = [];

    try {
      const { text: result, usage } = await aiClient.jsonCall(
        BUG_REPORT_SYSTEM,
        userMessage,
        model,
        { timeout: 45_000 }
      );

      recordWerkzeugUsage(activityId, 'bug-report', model, usage);
      console.log(`[BugReport] Issue generiert für ${activityId}`);

      issueTitle = (result?.title || '').trim();
      issueBody  = (result?.body  || '').trim();
      suggestedMaterials = Array.isArray(result?.suggestedMaterials)
        ? result.suggestedMaterials.filter(m => ['prompt', 'config', 'chatLog'].includes(m))
        : [];
    } catch (err) {
      console.error('[BugReport] KI-Fehler:', err.message);
      return res.status(502).json({ error: 'KI-Aufruf fehlgeschlagen' });
    }

    // ── Antwort ───────────────────────────────────────────────────────────────

    res.json({
      title:              issueTitle,
      body:               issueBody,
      suggestedMaterials,
      materials: {
        prompt:  promptText  || null,
        config:  configText  || null,
        chatLog: chatLogText || null,
      },
    });
  });

  return router;
}
