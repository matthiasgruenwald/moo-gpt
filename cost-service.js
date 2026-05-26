/**
 * cost-service.js — Werkzeug-Kosten-Service (#62)
 *
 * Kapselt alle Operationen für Werkzeug-Kosten.
 * Kein HTTP-Bezug (analog zu criteria.js, optimize.js).
 *
 * Abhängigkeiten: db.js (Singleton), token-log.js (sumCostRows)
 */

import { getDb } from './db.js';
import { sumCostRows, computeAudioCost, computeTtsCost } from './token-log.js';
import { getActivityAudioSeconds, getActivityTtsChars } from './stores/token.js';

// Deutsche Anzeige-Labels für call_type-Werte
const CALL_TYPE_LABELS = {
  'live-summary':  'Live-Zusammenfassung',
  'prompt-assist': 'Prompt-Assistent',
  'criteria':      'Kriterien',
  'optimize':      'Optimierung',
  'persona':       'Persona',
  'simulation':    'Simulation',
};

/**
 * Speichert einen Werkzeug-Aufruf in token_log.
 * Wird von Wave-2-Slices aufgerufen, nachdem textCall/jsonCall ausgeführt wurde.
 *
 * @param {string} activityId
 * @param {string} callType  Einer der CALL_TYPE_LABELS-Keys
 * @param {string} model
 * @param {{ input_tokens, output_tokens, total_tokens? }} usage  Objekt aus AIClient
 */
export function recordWerkzeugUsage(activityId, callType, model, usage) {
  if (!activityId || !callType || !usage) return;

  const promptTokens     = usage.input_tokens  ?? null;
  const completionTokens = usage.output_tokens ?? null;
  const totalTokens      = usage.total_tokens
    ?? (promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : null);

  getDb().prepare(`
    INSERT INTO token_log (activity_id, call_type, model, prompt_tokens, completion_tokens, total_tokens)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(activityId, callType, model, promptTokens, completionTokens, totalTokens);
}

// Interne Hilfsfunktionen für gefilterte Kosten-Rows
function getChatCostRows(activityId) {
  return getDb().prepare(`
    SELECT model,
           COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log
    WHERE activity_id = ? AND call_type IS NULL
    GROUP BY model
  `).all(activityId);
}

function getWerkzeugCostRows(activityId) {
  return getDb().prepare(`
    SELECT model,
           COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log
    WHERE activity_id = ? AND call_type IS NOT NULL
      AND call_type NOT IN ('transcription', 'tts', 'tts-prep')
    GROUP BY model
  `).all(activityId);
}

// Issue #103: TTS-Prep-Kosten (Token-basiert, wie Werkzeug aber als Chat-Kosten)
function getTtsPrepCostRows(activityId) {
  return getDb().prepare(`
    SELECT model,
           COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log
    WHERE activity_id = ? AND call_type = 'tts-prep'
    GROUP BY model
  `).all(activityId);
}

/**
 * Gibt Chat-, Werkzeug-, Audio- und TTS-Kosten für eine Aktivität in EUR zurück.
 * EUR-Werte sind null wenn Preisdaten noch nicht geladen sind.
 *
 * @param {string} activityId
 * @returns {Promise<{
 *   chatEur: number|null,
 *   werkzeugEur: number|null,
 *   totalEur: number|null,
 *   audioEur: number|null,
 *   audioSeconds: number,
 *   ttsEur: number|null,
 *   ttsChars: number
 * }>}
 */
export async function getCostSummary(activityId) {
  // Audio-Sekunden abrufen (synchron, kein Netz)
  const audioRow     = getActivityAudioSeconds(activityId);
  const audioSeconds = audioRow?.total_seconds ?? 0;

  // TTS-Zeichen abrufen (synchron, kein Netz)
  const ttsRow   = getActivityTtsChars(activityId);
  const ttsChars = ttsRow?.total_chars ?? 0;

  const [chatCost, werkzeugCost, audioEur, ttsSynthEur, ttsPrepCost] = await Promise.all([
    sumCostRows(getChatCostRows(activityId)),
    sumCostRows(getWerkzeugCostRows(activityId)),
    computeAudioCost(audioSeconds),
    computeTtsCost(ttsChars),
    sumCostRows(getTtsPrepCostRows(activityId)),
  ]);

  const chatEur     = chatCost?.totalEur     ?? null;
  const werkzeugEur = werkzeugCost?.totalEur ?? null;

  // ttsEur: Synthese (Zeichen-basiert) + Preprocessing (Token-basiert)
  const ttsPrepEur  = ttsPrepCost?.totalEur ?? null;
  const ttsParts    = [ttsSynthEur, ttsPrepEur].filter(v => v != null);
  const ttsEur      = ttsParts.length > 0 ? ttsParts.reduce((a, b) => a + b, 0) : null;

  // totalEur: Summe aller verfügbaren Kosten-Typen
  const parts = [chatEur, werkzeugEur, audioEur, ttsEur].filter(v => v != null);
  const totalEur = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;

  return { chatEur, werkzeugEur, totalEur, audioEur, audioSeconds, ttsEur, ttsChars };
}

/**
 * Gibt alle Werkzeug-Aufrufe einer Aktivität zurück.
 *
 * @param {string} activityId
 * @returns {Promise<Array<{ id, createdAt, callType, callTypeLabel, model, promptTokens, completionTokens, totalTokens, costEur }>>}
 */
export async function getWerkzeugLog(activityId) {
  const rows = getDb().prepare(`
    SELECT id, created_at, call_type, model, prompt_tokens, completion_tokens, total_tokens
    FROM token_log
    WHERE activity_id = ? AND call_type IS NOT NULL
    ORDER BY created_at DESC
  `).all(activityId);

  return Promise.all(rows.map(async row => {
    const cost = await sumCostRows([{
      model:             row.model,
      prompt_tokens:     row.prompt_tokens,
      completion_tokens: row.completion_tokens,
    }]);
    const costEur = cost?.totalEur ?? null;
    return {
      id:               row.id,
      createdAt:        row.created_at,
      callType:         row.call_type,
      callTypeLabel:    CALL_TYPE_LABELS[row.call_type] ?? row.call_type,
      model:            row.model,
      promptTokens:     row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens:      row.total_tokens,
      costEur,
    };
  }));
}

/**
 * Gibt Gesamtkosten aller Lehrer mit ihren Aktivitäten zurück (Admin-Ansicht).
 *
 * @returns {Promise<Array<{ teacherId, teacherName, activities: Array<{ activityId, activityName, chatEur, werkzeugEur, totalEur }> }>>}
 */
export async function getAdminCostsByTeacher() {
  const teachers = getDb().prepare(`
    SELECT DISTINCT teacher_id, teacher_name
    FROM activities
    WHERE teacher_id IS NOT NULL
    ORDER BY teacher_name
  `).all();

  const result = await Promise.all(teachers.map(async t => {
    const acts = getDb().prepare(`
      SELECT activity_id, activity_name
      FROM activities
      WHERE teacher_id = ?
      ORDER BY activity_name
    `).all(t.teacher_id);

    const activities = await Promise.all(acts.map(async a => {
      const costSummary = await getCostSummary(a.activity_id);
      return {
        activityId:   a.activity_id,
        activityName: a.activity_name,
        ...costSummary,
      };
    }));

    return {
      teacherId:   t.teacher_id,
      teacherName: t.teacher_name,
      activities,
    };
  }));

  // Aktivitäten ohne Lehrer-Zuordnung
  const unknownActs = getDb().prepare(`
    SELECT activity_id, activity_name
    FROM activities
    WHERE teacher_id IS NULL
    ORDER BY activity_name
  `).all();

  if (unknownActs.length > 0) {
    const activities = await Promise.all(unknownActs.map(async a => {
      const costSummary = await getCostSummary(a.activity_id);
      return { activityId: a.activity_id, activityName: a.activity_name, ...costSummary };
    }));
    result.push({ teacherId: null, teacherName: 'Unbekannt', activities });
  }

  return result;
}
