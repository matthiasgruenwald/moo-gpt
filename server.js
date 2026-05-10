const VERSION = "3.0.0";

import express from "express";
import OpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import { initDb, saveThread, saveMessage, findThread, touchThread, getMessages, getMessagesAll, getStudents, updateThreadName, upsertActivity, getActivity, setActivityConfig, saveTokenUsage, getThreadCostTokens, getActivityCostTokens, isAdmin, addAdmin, removeAdmin, getAdmins, getActiveSystemPrompt, saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry, getActiveErfahrungsprompt, saveErfahrungsprompt, getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry, getTeacherPreference, setTeacherPreference, getTeacherTemplates, getTeacherDefaultTemplate, createTeacherTemplate, updateTeacherTemplate, deleteTeacherTemplate, setTeacherTemplateDefault, getSystemTemplate, setSystemTemplate, saveFeedback, getFeedbackByActivity, getErkenntnisse, saveErkenntnisse, getGlobalPersonas, getTeacherPersonas, getAllPersonasForUser, createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped, getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion, getStudentMessages } from "./db.js";
import crypto from "crypto";

// Verhindert Prozess-Crash bei unhandled Promise rejections (z.B. saveMessage in async WS-Handler)
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Promise Rejection – Prozess läuft weiter:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG_DIR = "./config";
const CERT_FILE = `${CONFIG_DIR}/server.cert`;
const KEY_FILE = `${CONFIG_DIR}/server.key`;
let server;

if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
  const privateKey = fs.readFileSync(KEY_FILE, "utf8");
  const certificate = fs.readFileSync(CERT_FILE, "utf8");
  const credentials = { key: privateKey, cert: certificate };
  server = https.createServer(credentials, app);
  expressWs(app, server); // Setup express-ws with the HTTPS server
  console.log("Starting HTTPS/WSS server");
} else {
  server = http.createServer(app);
  expressWs(app, server); // Setup express-ws with the HTTP server
  console.log("Starting HTTP/WS server");
}

/**
 * Middle ware to limit the number of requests from a single IP address
 */
const requests = {};

// Prune stale IP entries daily to prevent unbounded growth
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const ip of Object.keys(requests)) {
    if (requests[ip].date !== today) delete requests[ip];
  }
}, 24 * 60 * 60 * 1000);

function limitRequests(ws, req, message, next) {
  const ip = req.socket.remoteAddress;
  console.log("Client IP:", ip);

  // Sicherstellen, dass das `requests` Objekt die IP enthält
  if (!requests[ip]) {
    requests[ip] = { count: 0, date: "" };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Überprüfen, ob das Datum aktualisiert werden muss
  if (requests[ip].date !== today) {
    requests[ip].count = 0;
    requests[ip].date = today;
  }

  // Erhöhe den Anfragenzähler
  requests[ip].count++;

  console.log("requests", JSON.stringify(requests[ip]));
  console.log("MAX_REQUESTS", process.env.MAX_REQUESTS);
  // Prüfen, ob ein Limit definiert ist und ob es überschritten wurde
  if (process.env.MAX_REQUESTS != undefined) {
    if (requests[ip].count > process.env.MAX_REQUESTS) {
      const chatMsg = {
        end: true,
        messages: "Error: Too many requests from this IP",
      };
      ws.send(JSON.stringify(chatMsg));
      ws.close(1008, "Rate limit exceeded"); // Code 1008: Policy Violation
      return;
    }
  }

  next();
}

function checkOrigin(ws, req, next) {
  const origin = req.headers.origin;
  console.log("origin", origin);
  if (process.env.ALLOWED_ORIGIN != undefined) {
    console.log("ALLOWED_ORIGIN", process.env.ALLOWED_ORIGIN);
    // Komma-getrennte Liste von erlaubten Origins unterstützen
    const allowedOrigins = process.env.ALLOWED_ORIGIN.split(",").map(o => o.trim());
    const allowed = allowedOrigins.some(o => origin && origin.startsWith(o));
    if (!allowed) {
      const chatMsg = {
        end: true,
        messages: "Error: Origin not allowed",
      };
      ws.send(JSON.stringify(chatMsg));
      console.log("Origin not allowed:", origin);
      ws.close(1008, "Origin not allowed");
      return;
    }
  }
  next();
}

// Issue #5: Teacher-Dashboard -----------------------------------------------

/** Prüft ALLOWED_ORIGIN für REST-Endpoints (analog zu checkOrigin für WS). */
function isOriginAllowed(req) {
  if (!process.env.ALLOWED_ORIGIN) return true;
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim());
  return allowedOrigins.some(o => origin.startsWith(o));
}

/** Map activityId → Set<ws>  für Live-Updates im Lehrer-Dashboard. */
const dashboardClients = new Map();

/** P3: activityId → { timerHandle? } für Plenum-Sperre. */
const activityLocks = new Map();

/** P3: activityId → Set<ws> für Chat-Clients (Schüler). */
const activityChatClients = new Map();

/** P3: Sendet ein Ereignis an alle Schüler-Chat-Clients einer Aktivität. */
function notifyChatClients(activityId, payload) {
  const clients = activityChatClients.get(String(activityId));
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

/**
 * Dashboard-Token-Verwaltung (Issue #5: Zugriffsschutz).
 * Token wird beim Lehrer-Login per WS erzeugt und 8 h gecacht.
 * Ohne gültigen Token → WS-Verbindung wird abgelehnt.
 */
const dashboardTokens = new Map(); // token → { activityId, userId, userName, expires }

function generateDashboardToken(activityId, userId, userName = null) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 8 * 60 * 60 * 1000; // 8 Stunden
  dashboardTokens.set(token, { activityId: String(activityId), userId, userName, expires });
  return token;
}

function validateDashboardToken(token, activityId) {
  const entry = dashboardTokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expires) { dashboardTokens.delete(token); return false; }
  return entry.activityId === String(activityId);
}

// Abgelaufene Tokens stündlich aufräumen
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of dashboardTokens) {
    if (now > v.expires) dashboardTokens.delete(t);
  }
}, 60 * 60 * 1000);

/** Sendet ein Ereignis an alle verbundenen Lehrer-Dashboards einer Aktivität. */
function notifyDashboard(activityId, payload) {
  const clients = dashboardClients.get(String(activityId));
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

/** Sendet ein Ereignis an ALLE verbundenen Dashboards (z.B. bei Config-Änderung). */
function notifyAllDashboards(payload) {
  const msg = JSON.stringify(payload);
  for (const clients of dashboardClients.values()) {
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }
}

function getTokenData(token) {
  if (!token) return null;
  const entry = dashboardTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expires) { dashboardTokens.delete(token); return null; }
  return entry;
}

function getUserIdFromToken(token)   { return getTokenData(token)?.userId  ?? null; }
function getUserNameFromToken(token) { return getTokenData(token)?.userName ?? null; }

/** Gibt das effektive Modell zurück: persönliche Präferenz > globaler DB-Wert. */
function getEffectiveModel(isTeacher, userId) {
  if (isTeacher && userId) {
    const pref = getTeacherPreference(userId);
    if (pref?.preferred_model && AVAILABLE_MODELS.includes(pref.preferred_model)) {
      return pref.preferred_model;
    }
  }
  return cachedConfig.model || MODEL_NAME;
}

/** Baut die vollständigen instructions für einen Chat-Request. */
function buildInstructions(settings, activityId) {
  const now = new Date();
  const dayName = now.toLocaleDateString('de-DE', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  let instructions = cachedConfig.content
    + `\nHeute ist ${dayName}, der ${dateStr} um ${timeStr}.\n`
    + (settings.hints || '')
    + (settings.task  || '');
  const erf = getActiveErfahrungsprompt(activityId);
  if (erf?.content) instructions += `\n\n${erf.content}`;
  return instructions;
}

// ---------------------------------------------------------------------------

function checkFormat(ws, msgObj, next) {
  const sendErr = (msg) => { ws.send(JSON.stringify({ end: true, messages: msg })); console.log(msg); };
  if (!msgObj.hasOwnProperty("type"))       return sendErr("Error: Missing or wrong Parameter 'type' in JSON message");
  if (typeof msgObj.type !== "string")       return sendErr("Error: Parameter 'type' is not a string in JSON message");
  if (!msgObj.hasOwnProperty("data"))       return sendErr("Error: Missing or wrong Parameter 'data' in JSON message");
  if (typeof msgObj.data !== "object")      return sendErr("Error: Parameter 'data' is not a object in JSON message");
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

if (!process.env.APIKEY) {
  console.error("APIKEY ist nicht gesetzt");
  process.exit(1);
}
if (!process.env.MODEL_NAME) {
  console.error("MODEL_NAME ist nicht gesetzt (z.B. gpt-5)");
  process.exit(1);
}

const oai = new OpenAI({ apiKey: process.env.APIKEY });

// Issue #13: Modell + System-Prompt aus Env (Fallback, wenn DB noch leer)
const MODEL_NAME    = process.env.MODEL_NAME;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';

// Issue #17: Verfügbare Modelle und aktive Konfiguration (DB überschreibt Env)
const AVAILABLE_MODELS = process.env.AVAILABLE_MODELS
  ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
  : [MODEL_NAME];

// Issue #25: Günstige Modelle für Hilfsgenerierungen (Kriterien, Personas, Äußerungen, Evaluierung)
const GEN_MODEL  = process.env.GEN_MODEL || 'gpt-4.1-nano';
const GEN_MODELS = [...new Set(['gpt-4.1-nano', 'gpt-4.1', ...AVAILABLE_MODELS])];

let cachedConfig = { content: SYSTEM_PROMPT, model: MODEL_NAME }; // wird nach initDb() überschrieben

// Issue #11: LiteLLM-Preise laden und 24 h cachen
let PRICING = null;
let pricingFetchedAt = 0;

async function fetchPricing() {
  const now = Date.now();
  if (PRICING && (now - pricingFetchedAt) < 24 * 60 * 60 * 1000) return PRICING;
  try {
    const res  = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    const data = await res.json();
    // LiteLLM-Keys: z.B. "gpt-5" oder "openai/gpt-5"
    const entry = data[MODEL_NAME] || data[`openai/${MODEL_NAME}`] || null;
    PRICING = entry ? {
      input_cost_per_token:  entry.input_cost_per_token  || 0,
      output_cost_per_token: entry.output_cost_per_token || 0,
    } : null;
    pricingFetchedAt = now;
    console.log(`[Pricing] Preise geladen für ${MODEL_NAME}:`, PRICING);
  } catch (e) {
    console.warn('[Pricing] Fehler beim Laden der Preise:', e.message);
  }
  return PRICING;
}

// Beim Serverstart sofort laden
fetchPricing();

// Issue #12: USD→EUR Wechselkurs (ECB via frankfurter.app), 1h Cache
let EUR_RATE = null;
let eurRateFetchedAt = 0;

async function fetchEurRate() {
  const now = Date.now();
  if (EUR_RATE && (now - eurRateFetchedAt) < 60 * 60 * 1000) return EUR_RATE;
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    const data = await res.json();
    EUR_RATE = data.rates?.EUR ?? null;
    eurRateFetchedAt = now;
    console.log(`[Pricing] EUR/USD: ${EUR_RATE}`);
  } catch (e) {
    console.warn('[Pricing] EUR-Rate Fehler:', e.message);
  }
  return EUR_RATE;
}

fetchEurRate();
setInterval(fetchEurRate, 60 * 60 * 1000);

/**
 * Berechnet die Kosten eines Runs in EUR.
 * Rückgabe: { inputEur, outputEur, totalEur } oder null wenn kein Pricing vorhanden.
 */
function computeRunCost(promptTokens, completionTokens) {
  if (!PRICING || !EUR_RATE) return null;
  const inputUsd  = (promptTokens     || 0) * PRICING.input_cost_per_token;
  const outputUsd = (completionTokens || 0) * PRICING.output_cost_per_token;
  return {
    inputEur:  inputUsd  * EUR_RATE,
    outputEur: outputUsd * EUR_RATE,
    totalEur:  (inputUsd + outputUsd) * EUR_RATE,
  };
}

/** Gesamtkosten eines Threads aus token_log. */
function computeThreadCost(threadDbId) {
  const t = getThreadCostTokens(threadDbId);
  return computeRunCost(t.prompt_tokens, t.completion_tokens);
}

/** Gesamtkosten einer Aktivität aus token_log. */
function computeActivityCost(actId) {
  const t = getActivityCostTokens(actId);
  return computeRunCost(t.prompt_tokens, t.completion_tokens);
}

/**
 * Reichert eine Nachrichten-Liste mit Kosten-Feldern an (Issue #12).
 * Assistenten-Nachrichten mit cost_prompt erhalten ein runCost-Objekt.
 */
function enrichMessagesWithCost(messages) {
  return messages.map(m => {
    if (m.role === 'assistant' && m.cost_prompt != null) {
      const cost = computeRunCost(m.cost_prompt, m.cost_completion);
      return { ...m, runCost: cost };
    }
    return m;
  });
}

/**
 * Reichert eine Schülerliste mit Kosten-Feldern an (Issue #12).
 */
function enrichStudentsWithCost(students) {
  return students.map(s => ({
    ...s,
    threadCost: computeRunCost(s.cost_prompt || 0, s.cost_completion || 0),
  }));
}

// SQLite-DB initialisieren
initDb();

// Issue #17: Admins aus ADMIN_USER_IDS-Env seeden (idempotent via INSERT OR IGNORE)
{
  const adminIds = process.env.ADMIN_USER_IDS
    ? process.env.ADMIN_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  for (const uid of adminIds) addAdmin(uid, 'env');
  if (adminIds.length > 0) console.log(`[Admin] ${adminIds.length} Admin(s) aus ADMIN_USER_IDS eingetragen`);
}

// Issue #17/#18: Systemprompt + Modell aus DB laden; bei Erststart aus Env migrieren
{
  const dbPrompt = getActiveSystemPrompt();
  if (dbPrompt) {
    cachedConfig = { content: dbPrompt.content, model: dbPrompt.model || MODEL_NAME };
    console.log(`[Config] Systemprompt aus DB (v${dbPrompt.version}), Modell: ${cachedConfig.model}`);
  } else {
    saveSystemPrompt(SYSTEM_PROMPT || '', MODEL_NAME, 'env-migration');
    cachedConfig = { content: SYSTEM_PROMPT || '', model: MODEL_NAME };
    console.log(`[Config] Systemprompt aus ENV in DB migriert, Modell: ${MODEL_NAME}`);
  }
}


const VALID_UPLOAD_MODES = ['off', 'images', 'files'];
const VALID_BOT_ICONS    = ['grw', 'grw2', 'weiblich'];

function validateTemplateFields(uploadMode, botIcon) {
  if (uploadMode !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode)) return 'Ungültiger uploadMode';
  if (botIcon !== undefined && botIcon !== '' && !VALID_BOT_ICONS.includes(botIcon)) return 'Ungültiges botIcon';
  return null;
}

// ── P5: Aktivitäts-Konfig-Endpoints ─────────────────────────────────────────

/** GET /api/activity-config/:activityId?token= – Konfig für config.html lesen */
app.get('/api/activity-config/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
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

/** PUT /api/activity-config/:activityId?token= – Opener + Upload-Modus speichern */
app.put('/api/activity-config/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const { opener, uploadMode, title, botIcon } = req.body;
  const validErr = validateTemplateFields(uploadMode, botIcon);
  if (validErr) return res.status(400).json({ error: validErr });
  setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
  console.log(`[Config] Aktivität ${activityId} aktualisiert von ${userId}`);
  res.json({ ok: true });
});

// ── Issue #5: Teacher-Dashboard REST-Endpoints ──────────────────────────────

/** GET /api/dashboard/students?activityId=…&token=… */
app.get('/api/dashboard/students', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Forbidden' });
  try {
    const students = getStudents(activityId);
    const act      = getActivity(activityId);
    res.json({ students, activityName: act?.activity_name, opener: act?.opener });
  } catch (e) {
    console.error('[Dashboard] getStudents error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** GET /api/dashboard/messages/:threadDbId?activityId=…&token=… */
app.get('/api/dashboard/messages/:threadDbId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Forbidden' });
  const threadDbId = parseInt(req.params.threadDbId);
  if (isNaN(threadDbId)) return res.status(400).json({ error: 'Invalid threadDbId' });
  try {
    const students = getStudents(activityId);
    const student  = students.find(s => s.thread_db_id === threadDbId);
    if (!student) return res.status(403).json({ error: 'Forbidden' });
    const messages   = enrichMessagesWithCost(getMessages(threadDbId));
    const threadCost = computeThreadCost(threadDbId);
    res.json({ student, messages, threadCost });
  } catch (e) {
    console.error('[Dashboard] getMessages error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ── Issue #17: Admin/Teacher-Config-Endpunkte ────────────────────────────────

/** GET /api/admin/config?token=… – Prompt + Modell lesen (alle Lehrer) */
app.get('/api/admin/config', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const pref = getTeacherPreference(userId);
  res.json({
    systemPrompt:    cachedConfig.content,
    model:           cachedConfig.model,
    availableModels: AVAILABLE_MODELS,
    genModels:       GEN_MODELS,
    isAdmin:         isAdmin(userId),
    myModel:         pref?.preferred_model || null,
  });
});

/** PUT /api/admin/config?token=… – Systemprompt + Globalmodell speichern (nur Admin) */
app.put('/api/admin/config', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  if (!isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });

  const { systemPrompt, model } = req.body;
  if (typeof systemPrompt !== 'string') return res.status(400).json({ error: 'systemPrompt fehlt' });
  if (!model || !AVAILABLE_MODELS.includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });

  saveSystemPrompt(systemPrompt, model, userId);
  cachedConfig = { content: systemPrompt, model };
  notifyAllDashboards({ type: 'configUpdated', model, updatedBy: userId });
  console.log(`[Admin] Systemprompt + Modell gespeichert von ${userId}, Modell: ${model}`);
  res.json({ ok: true });
});

/** GET /api/admin/prompt-history?token=… – Versionshistorie (Admin) */
app.get('/api/admin/prompt-history', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ history: getPromptHistory() });
});

/** DELETE /api/admin/prompt-history/:id?token=… – Historyeintrag löschen (Admin) */
app.delete('/api/admin/prompt-history/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deletePromptHistoryEntry(id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getPromptHistory() });
});

/** GET /api/admin/admins?token=… – Admin-Liste (Admin) */
app.get('/api/admin/admins', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ admins: getAdmins() });
});

/** POST /api/admin/admins?token=… – Admin hinzufügen (Admin) */
app.post('/api/admin/admins', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  const { newUserId } = req.body;
  if (!newUserId || typeof newUserId !== 'string') return res.status(400).json({ error: 'newUserId fehlt' });
  addAdmin(newUserId.trim(), userId);
  console.log(`[Admin] ${newUserId} als Admin eingetragen von ${userId}`);
  res.json({ ok: true, admins: getAdmins() });
});

/** DELETE /api/admin/admins/:targetId?token=… – Admin entfernen (Admin) */
app.delete('/api/admin/admins/:targetId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  const targetId = req.params.targetId;
  if (targetId === userId) return res.status(400).json({ error: 'Eigene Admin-Rechte nicht entziehbar' });
  removeAdmin(targetId);
  console.log(`[Admin] ${targetId} als Admin entfernt von ${userId}`);
  res.json({ ok: true, admins: getAdmins() });
});

/** GET /api/teacher/preferences?token=… – Persönliche Präferenzen lesen */
app.get('/api/teacher/preferences', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const pref = getTeacherPreference(userId);
  res.json({ myModel: pref?.preferred_model || null, availableModels: AVAILABLE_MODELS });
});

/** PUT /api/teacher/preferences?token=… – Persönliches Modell setzen */
app.put('/api/teacher/preferences', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const { model } = req.body;
  const validModel = (!model || model === '') ? null : (AVAILABLE_MODELS.includes(model) ? model : null);
  if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
  setTeacherPreference(userId, validModel);
  console.log(`[Teacher] ${userId} setzt Modell-Präferenz: ${validModel || 'Standard'}`);
  res.json({ ok: true, myModel: validModel });
});

// ── P5b: Lehrer-Vorlagen-Bibliothek ──────────────────────────────────────────

/** GET /api/teacher/templates?token= – alle Vorlagen der Lehrkraft */
app.get('/api/teacher/templates', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ templates: getTeacherTemplates(userId) });
});

/** POST /api/teacher/templates?token= – neue Vorlage anlegen */
app.post('/api/teacher/templates', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const { name, title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const validErr1 = validateTemplateFields(uploadMode, botIcon);
  if (validErr1) return res.status(400).json({ error: validErr1 });
  const id = createTeacherTemplate(userId, { name: name.trim(), title, botIcon, opener, uploadMode, hintsTemplate });
  res.json({ ok: true, id });
});

/** PUT /api/teacher/templates/:id?token= – Vorlage aktualisieren */
app.put('/api/teacher/templates/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const { name, title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const validErr2 = validateTemplateFields(uploadMode, botIcon);
  if (validErr2) return res.status(400).json({ error: validErr2 });
  updateTeacherTemplate(id, userId, { name: name.trim(), title, botIcon, opener, uploadMode, hintsTemplate });
  res.json({ ok: true });
});

/** DELETE /api/teacher/templates/:id?token= – Vorlage löschen */
app.delete('/api/teacher/templates/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  deleteTeacherTemplate(id, userId);
  res.json({ ok: true });
});

/** PUT /api/teacher/templates/:id/set-default?token= – als Standard markieren */
app.put('/api/teacher/templates/:id/set-default', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  setTeacherTemplateDefault(id, userId);
  res.json({ ok: true });
});

// ── P5b: Systemvorlage (Admin) ────────────────────────────────────────────────

/** GET /api/admin/system-template?token= – Systemvorlage lesen */
app.get('/api/admin/system-template', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const tpl = getSystemTemplate();
  res.json({
    title:         tpl?.title         ?? '',
    botIcon:       tpl?.bot_icon      ?? 'grw',
    opener:        tpl?.opener        ?? '',
    uploadMode:    tpl?.upload_mode   ?? 'off',
    hintsTemplate: tpl?.hints_template ?? '',
  });
});

/** PUT /api/admin/system-template?token= – Systemvorlage speichern (nur Admin) */
app.put('/api/admin/system-template', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  const { title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
  const validErr3 = validateTemplateFields(uploadMode, botIcon);
  if (validErr3) return res.status(400).json({ error: validErr3 });
  setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate });
  console.log(`[P5b] Systemvorlage gespeichert von ${userId}`);
  res.json({ ok: true });
});

// ── Issue #20: Erfahrungsprompt-Verwaltung + Prompt-Optimierung ──────────────

/** GET /api/erfahrungsprompt/:activityId?token= */
app.get('/api/erfahrungsprompt/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  if (!validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const erf = getActiveErfahrungsprompt(activityId);
  res.json({ content: erf?.content || '', version: erf?.version || 0 });
});

/** POST /api/erfahrungsprompt/:activityId?token= – manuell speichern */
app.post('/api/erfahrungsprompt/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content fehlt' });
  saveErfahrungsprompt(activityId, content, userId);
  console.log(`[Erfahrungsprompt] Gespeichert für ${activityId} von ${userId}`);
  res.json({ ok: true });
});

/** GET /api/erfahrungsprompt-history/:activityId?token= */
app.get('/api/erfahrungsprompt-history/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  if (!validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  res.json({ history: getErfahrungspromptHistory(activityId) });
});

/** DELETE /api/erfahrungsprompt-history/:id?activityId=&token= */
app.delete('/api/erfahrungsprompt-history/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.query;
  if (!validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deleteErfahrungspromptHistoryEntry(activityId, id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getErfahrungspromptHistory(activityId) });
});

// Issue #26: Optimize-Logik als Hilfsfunktion (wird von /api/optimize-prompt und /api/simulate genutzt)
async function generateOptimizeProposal(activityId, simResultsText = '') {
  const feedbacks    = getFeedbackByActivity(activityId);
  const erkenntnisse = getErkenntnisse(activityId);
  const erf          = getActiveErfahrungsprompt(activityId);

  const feedbackText = feedbacks.length === 0
    ? 'Noch keine Bewertungen vorhanden.'
    : feedbacks.map(f => {
        const lines = [`[${f.rating.toUpperCase()}] ${(f.message_content || '').slice(0, 300)}`];
        if (f.comment) lines.push(`Kommentar: ${f.comment}`);
        if (f.improved_text) lines.push(`Verbesserter Vorschlag: ${f.improved_text.slice(0, 300)}`);
        return lines.join('\n');
      }).join('\n---\n');

  const erkenntnisText = erkenntnisse.length === 0
    ? 'Keine Erkenntnisse vorhanden.'
    : erkenntnisse.map(e => `- ${e.content}`).join('\n');

  const instructions = `Du bist Experte für pädagogisches Prompt-Engineering an einer IGS (Klasse 9).
Deine Aufgabe: Erstelle einen verbesserten Erfahrungsprompt basierend auf Feedback-Daten.

Der Erfahrungsprompt ist ein kurzer Zusatz zum globalen Systemprompt – aktivitätsspezifisch, max. 200 Wörter.
Er wiederholt den Systemprompt NICHT, sondern ergänzt ihn mit konkreten Hinweisen für diese Aufgabe.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Blöcke:
{
  "erfahrungsprompt_neu": "...",
  "kausalkette": [
    { "problem": "...", "ursache": "...", "aenderung": "..." }
  ]
}`;

  const userMessage = `Globaler Systemprompt:\n${cachedConfig.content}\n\n` +
    `Aktueller Erfahrungsprompt:\n${erf?.content || '(noch keiner)'}\n\n` +
    `Feedback zu KI-Antworten dieser Aufgabe:\n${feedbackText}\n\n` +
    (simResultsText ? `Simulations-Ergebnisse (frisch):\n${simResultsText}\n\n` : '') +
    `Bisherige Erkenntnisse:\n${erkenntnisText}\n\n` +
    `Erstelle einen verbesserten Erfahrungsprompt für diese Aufgabe.`;

  const response = await oai.responses.create({
    model:        cachedConfig.model || MODEL_NAME,
    instructions,
    input:        [{ role: 'user', content: userMessage }],
    stream:       false,
  });

  const parsed = stripAndParseJson(response.output_text);
  if (!parsed.erfahrungsprompt_neu || !Array.isArray(parsed.kausalkette))
    throw new Error('Unvollständige KI-Antwort');

  return {
    erfahrungsprompt_alt: erf?.content || '',
    erfahrungsprompt_neu: parsed.erfahrungsprompt_neu,
    kausalkette:          parsed.kausalkette,
  };
}

/** POST /api/optimize-prompt?activityId=X&token= – KI-Vorschlag generieren */
app.post('/api/optimize-prompt', async (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await generateOptimizeProposal(activityId);
    console.log(`[Optimize] Vorschlag für ${activityId} generiert (${result.kausalkette.length} Kausalketten-Einträge)`);
    res.json(result);
  } catch (e) {
    console.error('[Optimize] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/erkenntnisse?activityId=X&token= – Erkenntnisse aus Kausalkette speichern */
app.post('/api/erkenntnisse', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const { items } = req.body; // [{ problem, ursache, aenderung }]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items-Array fehlt' });
  for (const item of items) {
    const text = [item.problem, item.ursache, item.aenderung].filter(Boolean).join(' → ');
    if (text) saveErkenntnisse(activityId, text, 'ai');
  }
  res.json({ ok: true, saved: items.length });
});

// ── Issue #21: Personas & Simulation – AI-Hilfsfunktionen ────────────────────

function stripAndParseJson(text) {
  const raw = (text || '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  // Attempt 1: parse as-is
  try { return JSON.parse(raw); } catch (_) {}

  // Attempt 2: strip invalid escape sequences (e.g. \' or \,)
  try {
    return JSON.parse(raw.replace(/\\([^"\\\/bfnrtu])/g, (_, c) => c));
  } catch (_) {}

  // Attempt 3: LLMs sometimes embed literal control characters (newline, tab) inside
  // JSON string values. Escape them within string literals only.
  const fixedControls = raw.replace(/"(?:[^"\\]|\\.)*"/gs, match =>
    match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, ' ')
  );
  return JSON.parse(fixedControls.replace(/\\([^"\\\/bfnrtu])/g, (_, c) => c));
}

async function aiJsonCall(instructions, userMessage, model = GEN_MODEL) {
  const response = await oai.responses.create({
    model,
    instructions,
    input:   [{ role: 'user', content: userMessage }],
    stream:  false,
  });
  return stripAndParseJson(response.output_text);
}

async function generateSimulatedUtterances(persona, count = 4, model = GEN_MODEL) {
  return aiJsonCall(
    `Du simulierst Schüleräußerungen für Prompt-Engineering-Tests an einer IGS (Klasse 9).
Generiere exakt ${count} kurze Schüleräußerungen für den beschriebenen Schüler-Typ.
Antworte NUR mit einem JSON-Array von Strings: ["Äußerung 1", "Äußerung 2", ...]`,
    `Schüler-Typ: ${persona.name}\nBeschreibung: ${persona.description || '–'}\n` +
    (persona.example_msgs ? `Typische Formulierungen: ${persona.example_msgs}` : ''),
    model
  );
}

async function generateAIResponse(systemContent, erfahrungContent, utterance) {
  const instructions = systemContent + (erfahrungContent ? `\n\n${erfahrungContent}` : '');
  const r = await oai.responses.create({
    model:        cachedConfig.model || MODEL_NAME,
    instructions,
    input:        [{ role: 'user', content: utterance }],
    stream:       false,
  });
  return r.output_text || '';
}

async function evaluateResponse(utterance, aiResponse, criteria, model = GEN_MODEL) {
  const criteriaText = criteria.length
    ? criteria.map(c => `- ${c.content}`).join('\n')
    : '- Gibt keine fertigen Lösungen\n- Stellt Rückfragen\n- Fördert eigenständiges Denken';

  return aiJsonCall(
    `Du bewertest KI-Antworten nach pädagogischen Kriterien.
Antworte AUSSCHLIESSLICH mit validem JSON (keine Markdown-Blöcke):
{
  "overall": "gut|gemischt|problematisch",
  "score": 1-5,
  "highlights": [{ "quote": "exakter Wortlaut aus der KI-Antwort", "type": "gut|schlecht", "reason": "Begründung" }],
  "summary": "Kurzes Gesamturteil"
}
Wähle nur Highlights deren Wortlaut EXAKT so in der KI-Antwort steht.`,
    `Kriterien:\n${criteriaText}\n\nSchüler-Äußerung: ${utterance}\n\nKI-Antwort:\n${aiResponse}`,
    model
  );
}

// ── P6: Personas ─────────────────────────────────────────────────────────────

/** GET /api/personas?token= – globale + lehrer-eigene Personas */
app.get('/api/personas', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ global: getGlobalPersonas(), own: getTeacherPersonas(userId) });
});

/** POST /api/personas?token= – lehrer-eigene Persona speichern */
app.post('/api/personas', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  const teacherName = getUserNameFromToken(req.query.token);
  createPersona({ teacherId: userId, teacherName, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

/** DELETE /api/personas/:id?token= – eigene Persona löschen */
app.delete('/api/personas/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  deletePersona(parseInt(req.params.id), userId, false);
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

/** POST /api/personas-suggest?activityId=X&token= – KI schlägt Personas vor */
app.post('/api/personas-suggest', async (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !validateDashboardToken(token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const { genModel } = req.body;
    const msgs   = getStudentMessages(activityId);
    const sample = msgs.slice(0, 60).map(m => m.content).join('\n---\n');
    const result = await aiJsonCall(
      `Du analysierst Schüleräußerungen aus einer Lernaktivität und leitest typische Schüler-Personas ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "personas": [{ "name": "...", "description": "...", "example_msgs": "Beispiel 1|Beispiel 2|Beispiel 3" }] }
Leite 3–5 gut unterscheidbare Personas ab. Wenn keine Äußerungen vorliegen, erstelle generische Schüler-Typen für eine IGS Klasse 9.`,
      msgs.length ? `Schüler-Äußerungen:\n${sample}` : 'Noch keine Schüler-Äußerungen vorhanden. Erstelle typische Klasse-9-Personas.',
      genModel || GEN_MODEL
    );
    res.json({ suggestions: result.personas || [] });
  } catch (e) {
    console.error('[Personas-Suggest] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── P6: Admin Personas ────────────────────────────────────────────────────────

/** GET /api/admin/personas?token= – alle Lehrer-Personas sortiert nach Name */
app.get('/api/admin/personas', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ personas: getAllTeacherPersonasGrouped() });
});

/** POST /api/admin/personas?token= – globale Persona erstellen */
app.post('/api/admin/personas', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  createPersona({ teacherId: null, teacherName: null, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, global: getGlobalPersonas() });
});

/** DELETE /api/admin/personas/:id?token= – beliebige Persona löschen */
app.delete('/api/admin/personas/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  deletePersona(parseInt(req.params.id), null, true);
  res.json({ ok: true });
});

/** PUT /api/admin/personas/:id/promote?token= – Lehrer-Persona zu global machen */
app.put('/api/admin/personas/:id/promote', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  promotePersonaToGlobal(parseInt(req.params.id), userId);
  res.json({ ok: true, global: getGlobalPersonas() });
});

// ── Issue #21: Kriterien-Endpunkte ───────────────────────────────────────────

/** GET /api/criteria/:activityId?token= */
app.get('/api/criteria/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  if (!validateDashboardToken(req.query.token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** POST /api/criteria-suggest/:activityId?token= – KI schlägt Kriterien vor */
app.post('/api/criteria-suggest/:activityId', async (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  if (!validateDashboardToken(req.query.token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const { genModel } = req.body;
    const erf = getActiveErfahrungsprompt(activityId);
    const promptSource = erf
      ? `Aufgabenprompt:\n${erf.content}`
      : `Systemprompt:\n${cachedConfig.content}`;

    const result = await aiJsonCall(
      `Du leitest Bewertungskriterien für eine KI-Tutoring-Anwendung aus einem Prompt ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "criteria": ["Kriterium 1", "Kriterium 2", ...] }
Leite 5–8 präzise, prüfbare Kriterien ab. Formuliere sie als positive Aussagen (was die KI TUN soll).`,
      promptSource,
      genModel || GEN_MODEL
    );
    res.json({ suggestions: result.criteria || [] });
  } catch (e) {
    console.error('[Criteria-Suggest] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/criteria/:activityId?token= – Kriterium hinzufügen */
app.post('/api/criteria/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content fehlt' });
  saveErkenntnisse(activityId, content, 'criteria');
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** DELETE /api/criteria/:id?activityId=X&token= – Soft-Delete */
app.delete('/api/criteria/:id', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.query;
  if (!activityId || !validateDashboardToken(req.query.token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  softDeleteCriterion(parseInt(req.params.id));
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** PATCH /api/criteria/:id/restore?activityId=X&token= */
app.patch('/api/criteria/:id/restore', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.query;
  if (!activityId || !validateDashboardToken(req.query.token, activityId)) return res.status(403).json({ error: 'Unauthorized' });
  restoreCriterion(parseInt(req.params.id));
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

// ── P3: Plenum-Sperre ────────────────────────────────────────────────────────

/** POST /api/activity/:activityId/lock?token= – Aktivität sperren */
app.post('/api/activity/:activityId/lock', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });

  const existing = activityLocks.get(String(activityId));
  if (existing?.timerHandle) clearTimeout(existing.timerHandle);

  const entry = {};
  const durationMinutes = Math.min(120, Math.max(0, Number(req.body.durationMinutes) || 0));
  if (durationMinutes > 0) {
    entry.timerHandle = setTimeout(() => {
      activityLocks.delete(String(activityId));
      notifyChatClients(activityId, { type: 'unlocked' });
      notifyDashboard(activityId, { type: 'unlocked' });
      console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${durationMinutes} min`);
    }, durationMinutes * 60 * 1000);
  }

  activityLocks.set(String(activityId), entry);
  notifyChatClients(activityId, { type: 'locked' });
  notifyDashboard(activityId, { type: 'locked' });
  console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
  res.json({ ok: true, locked: true });
});

/** DELETE /api/activity/:activityId/lock?token= – Aktivität entsperren */
app.delete('/api/activity/:activityId/lock', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !validateDashboardToken(req.query.token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });

  const existing = activityLocks.get(String(activityId));
  if (existing?.timerHandle) clearTimeout(existing.timerHandle);
  activityLocks.delete(String(activityId));
  notifyChatClients(activityId, { type: 'unlocked' });
  notifyDashboard(activityId, { type: 'unlocked' });
  console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
  res.json({ ok: true, locked: false });
});

// ── Issues #21 + #26: Simulation (SSE-Streaming) ─────────────────────────────

/** POST /api/simulate?activityId=X&token= – SSE-Stream */
app.post('/api/simulate', async (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !validateDashboardToken(token, activityId)) return res.status(403).json({ error: 'Unauthorized' });

  const { personaId, utteranceModel, evalModel } = req.body;
  const userId   = getUserIdFromToken(token);
  const personas = userId ? getAllPersonasForUser(userId) : getGlobalPersonas();
  const persona  = personas.find(p => p.id === parseInt(personaId));
  if (!persona) return res.status(400).json({ error: 'Persona nicht gefunden' });

  const criteria         = getCriteria(activityId);
  const erfahrungsprompt = getActiveErfahrungsprompt(activityId);

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    const uModel = utteranceModel || GEN_MODEL;
    const eModel = evalModel      || GEN_MODEL;
    const total  = 4;
    console.log(`[Simulate] Start für ${activityId}, Persona: ${persona.name}, utteranceModel: ${uModel}, evalModel: ${eModel}`);

    sendEvent('start', { total, personaName: persona.name });
    sendEvent('progress', { label: 'Generiere Schüler-Äußerungen…' });

    const utterances = await generateSimulatedUtterances(persona, total, uModel);
    console.log(`[Simulate] ${utterances.length} Äußerungen generiert`);

    const results = [];
    for (let i = 0; i < utterances.length; i++) {
      sendEvent('progress', { label: `Simuliere Antwort ${i + 1} von ${utterances.length}…` });
      const utterance  = utterances[i];
      const aiResponse = await generateAIResponse(cachedConfig.content, erfahrungsprompt?.content || '', utterance);
      let evaluation   = null;
      try {
        evaluation = await evaluateResponse(utterance, aiResponse, criteria, eModel);
      } catch (evalErr) {
        console.warn('[Simulate] Evaluierung fehlgeschlagen:', evalErr.message);
        evaluation = { overall: 'gemischt', score: 3, highlights: [], summary: 'Evaluierung nicht möglich.' };
      }
      const pair = { utterance, aiResponse, evaluation };
      results.push(pair);
      sendEvent('pair', { index: i, pair, personaName: persona.name });
    }

    console.log(`[Simulate] ${results.length} Paare abgeschlossen, generiere Erfahrungsprompt-Vorschlag`);
    sendEvent('progress', { label: 'Generiere Erfahrungsprompt-Vorschlag…' });

    const simResultsText = results.map((r, i) =>
      `Äußerung ${i + 1}: ${r.utterance}\n` +
      `KI-Antwort: ${r.aiResponse.slice(0, 400)}\n` +
      `Bewertung: ${r.evaluation.overall} (Score ${r.evaluation.score}/5) – ${r.evaluation.summary || ''}`
    ).join('\n---\n');

    try {
      const suggestion = await generateOptimizeProposal(activityId, simResultsText);
      sendEvent('suggestion', suggestion);
      console.log(`[Simulate] Erfahrungsprompt-Vorschlag gesendet`);
    } catch (optErr) {
      console.warn('[Simulate] Optimize-Vorschlag fehlgeschlagen:', optErr.message);
    }

    sendEvent('done', { personaName: persona.name });
  } catch (e) {
    console.error('[Simulate] Fehler:', e);
    sendEvent('error', { message: e.message });
  }

  res.end();
});

// ── Issue #19: Feedback-Bewertung ────────────────────────────────────────────

/** POST /api/feedback?activityId=…&token=… */
app.post('/api/feedback', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  const { messageId, threadId, rating, comment, improvedText } = req.body;
  if (!messageId || !['gut', 'schlecht'].includes(rating))
    return res.status(400).json({ error: 'messageId und rating (gut|schlecht) erforderlich' });
  const userId = getUserIdFromToken(token);
  try {
    saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy: userId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Feedback] Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

/** GET /api/feedback/:activityId?token=… */
app.get('/api/feedback/:activityId', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId } = req.params;
  const { token } = req.query;
  if (!token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Unauthorized' });
  try {
    res.json({ feedback: getFeedbackByActivity(activityId) });
  } catch (e) {
    console.error('[Feedback] Ladefehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ── Issue #5: Teacher-Dashboard WebSocket (Live-Updates) ────────────────────

app.ws('/api/dashboard-ws', (ws, req) => {
  if (!isOriginAllowed(req)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  const params     = new URLSearchParams((req.url || '').split('?')[1] || '');
  const activityId = params.get('activityId');
  const token      = params.get('token');

  // Token-Validierung (Issue #5: Zugriffsschutz)
  if (!activityId || !token || !validateDashboardToken(token, activityId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    ws.close(1008, 'Unauthorized');
    console.log(`[Dashboard] Ungültiger Token für activityId=${activityId}`);
    return;
  }

  // Registrieren
  if (!dashboardClients.has(activityId)) dashboardClients.set(activityId, new Set());
  dashboardClients.get(activityId).add(ws);
  console.log(`[Dashboard] Lehrer verbunden, activityId=${activityId}`);

  // Initialliste + Aufgabentitel + Kosten senden (Issue #12)
  try {
    const students     = enrichStudentsWithCost(getStudents(activityId));
    const act          = getActivity(activityId);
    const activityCost = computeActivityCost(activityId);
    ws.send(JSON.stringify({
      type: 'students',
      data: students,
      activityName: act?.activity_name,
      opener:       act?.opener,
      activityCost,
      locked:       activityLocks.has(activityId),
    }));
  } catch (e) {
    console.error('[Dashboard] Initial-students error:', e);
  }

  // Nachrichten-Anfrage vom Dashboard-Client
  ws.on('message', (msg) => {
    try {
      const obj = JSON.parse(msg);
      if (obj.type === 'getMessages' && obj.threadDbId) {
        const threadDbId = parseInt(obj.threadDbId);
        const students = getStudents(activityId);
        const student = students.find(s => s.thread_db_id === threadDbId);
        if (!student) {
          ws.send(JSON.stringify({ type: 'error', message: 'Forbidden' }));
          return;
        }
        const messages = enrichMessagesWithCost(getMessages(threadDbId));
        const threadCost = computeThreadCost(threadDbId);
        ws.send(JSON.stringify({ type: 'messages', threadDbId, student, data: messages, threadCost }));
      }
    } catch (e) {
      console.error('[Dashboard] WS message error:', e);
    }
  });

  ws.on('close', () => {
    dashboardClients.get(activityId)?.delete(ws);
    console.log(`[Dashboard] Lehrer getrennt, activityId=${activityId}`);
  });
});

// ────────────────────────────────────────────────────────────────────────────

app.ws("/api/chat", (ws, req) => {
  checkOrigin(ws, req, () => {
    var settings  = undefined;
    var threadDbId = undefined;

    // Keepalive: alle 30 Sek. ping senden, damit Cloudflare die Verbindung nicht trennt
    const keepalive = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30000);
    ws.on("close", () => {
      clearInterval(keepalive);
      if (settings?.activityId) {
        activityChatClients.get(String(settings.activityId))?.delete(ws);
      }
    });

    ws.on("message", (message) => {
      limitRequests(ws, req, message, () => {
        console.log("Message received:", message);
        var chatMsg = { end: false, messages: "" };
        try {
          var msgObj = JSON.parse(message);
          console.log("msgObj:", JSON.stringify(msgObj, null, 2));
          checkFormat(ws, msgObj, async () => {
            switch (msgObj.type) {
              case "settings":
                settings = msgObj.data;
                console.log("Settings received: " + JSON.stringify({...settings, images: settings.images ? `[${settings.images.length} Bild(er)]` : 'keine'}));

                // Rollenerkennung (Issue #4)
                {
                  const teacherIds = process.env.TEACHER_USER_IDS
                    ? process.env.TEACHER_USER_IDS.split(',').map(s => s.trim())
                    : [];
                  const isTeacherByEnv = !!(settings.userId && teacherIds.includes(settings.userId));
                  ws.isTeacher = settings.isTeacher === true || isTeacherByEnv;
                  ws.userId    = settings.userId || null;
                  console.log(`[Auth] isTeacher=${ws.isTeacher} (client=${settings.isTeacher}, env=${isTeacherByEnv})`);
                }

                // P5b: Aktivitäts-Config aus DB laden; bei neuer Aktivität Vorlage anwenden
                if (settings.activityId) {
                  let act = getActivity(settings.activityId);
                  if (!act) {
                    const defaults = ws.isTeacher && ws.userId
                      ? (getTeacherDefaultTemplate(ws.userId) ?? getSystemTemplate())
                      : null;
                    upsertActivity(
                      settings.activityId,
                      settings.activityName || settings.activityId,
                      defaults?.opener      ?? null,
                      defaults?.upload_mode ?? 'off',
                      defaults?.title       ?? null,
                      defaults?.bot_icon    ?? 'grw',
                    );
                    act = getActivity(settings.activityId);
                  } else if (settings.activityName && settings.activityName !== act.activity_name) {
                    upsertActivity(settings.activityId, settings.activityName, null, null, null, null);
                  }

                  // Backward-Compat: hints aus altem Snippet importieren (nur wenn noch kein Erfahrungsprompt)
                  if (settings.hints && !getActiveErfahrungsprompt(settings.activityId)) {
                    saveErfahrungsprompt(settings.activityId, settings.hints, settings.userId || 'moodle-import');
                    console.log(`[Settings] Aufgabenprompt (hints) für ${settings.activityId} aus Snippet importiert`);
                  }

                  const actConfig = {
                    title:      act?.title       ?? null,
                    botIcon:    act?.bot_icon    ?? 'grw',
                    opener:     act?.opener      ?? null,
                    uploadMode: act?.upload_mode ?? 'off',
                    needsConfig: act?.title == null,
                  };
                  ws.activityConfig = actConfig;
                  ws.send(JSON.stringify({ type: 'config', activityId: settings.activityId, config: actConfig }));
                  console.log(`[P5a] Config für ${settings.activityId} gesendet, needsConfig=${actConfig.needsConfig}`);
                }

                // P3: Chat-Client registrieren (nur Schüler) + ggf. sofort sperren
                if (settings.activityId && !ws.isTeacher) {
                  const aid = String(settings.activityId);
                  if (!activityChatClients.has(aid)) activityChatClients.set(aid, new Set());
                  activityChatClients.get(aid).add(ws);
                  if (activityLocks.has(aid)) ws.send(JSON.stringify({ type: 'locked' }));
                }

                // Issue #5: Dashboard-Token für Lehrer erzeugen und zurückschicken
                if (ws.isTeacher && settings.activityId) {
                  const token = generateDashboardToken(settings.activityId, settings.userId, settings.userName || null);
                  ws.send(JSON.stringify({ type: 'dashboardToken', token, activityId: settings.activityId }));
                  console.log(`[Dashboard] Token für Lehrer ${settings.userId} / Aufgabe ${settings.activityId} erzeugt`);
                }

                // Issue #13: Thread nur noch in SQLite – kein OpenAI-Thread-Objekt mehr
                {
                  let existingThreadRow = null;
                  if (settings.userId && settings.activityId) {
                    existingThreadRow = findThread({ moodle_user_id: settings.userId, activity_id: settings.activityId });
                  }
                  if (existingThreadRow) {
                    threadDbId = existingThreadRow.id;
                    touchThread(threadDbId);
                    if (!existingThreadRow.moodle_user_name && settings.userName) {
                      updateThreadName(threadDbId, settings.userName);
                      console.log(`[DB] Namen nachgefüllt: ${settings.userName} (db_id=${threadDbId})`);
                    }
                    console.log(`[DB] Bestehenden Thread wiederverwendet (db_id=${threadDbId})`);
                  } else {
                    threadDbId = saveThread({
                      moodle_user_id:   settings.userId   || null,
                      moodle_user_name: settings.userName || null,
                      activity_id:      settings.activityId || null,
                    });
                    console.log(`[DB] Neuer Thread angelegt, db_id=${threadDbId}`);

                    // Aufgabenbilder als task_image in DB speichern (statt Files API + Thread-Message)
                    if (settings.images && settings.images.length > 0) {
                      let saved = 0;
                      for (const img of settings.images) {
                        try {
                          const imgClean = typeof img === 'string' ? img.trim() : img;
                          if (!imgClean) continue;
                          let dataUrl;
                          if (imgClean.startsWith('data:')) {
                            dataUrl = imgClean;
                          } else {
                            const parsed = new URL(imgClean);
                            if (!['http:', 'https:'].includes(parsed.protocol)) continue;
                            const res = await fetch(imgClean);
                            if (!res.ok) { console.log(`[Settings] Bild übersprungen (HTTP ${res.status})`); continue; }
                            const mimeType = res.headers.get('content-type') || 'image/jpeg';
                            const buf = Buffer.from(await res.arrayBuffer());
                            dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
                          }
                          saveMessage({ thread_db_id: threadDbId, role: 'user', content: dataUrl, content_type: 'task_image' });
                          saved++;
                        } catch (e) {
                          console.warn('[Settings] Aufgabenbild übersprungen:', e.message);
                        }
                      }
                      console.log(`[DB] ${saved} Aufgabenbild(er) als task_image gespeichert`);
                    }
                  }

                  // Chatverlauf an Client senden (nur bei bestehendem Thread)
                  if (existingThreadRow) {
                    const history = getMessages(threadDbId);
                    if (history.length > 0) {
                      ws.send(JSON.stringify({ type: "history", messages: history }));
                      console.log(`[DB] ${history.length} Nachrichten an Client gesendet`);
                    }
                  }
                }
                break;
              case "chatmsg":
                // Noch nicht bereit (race condition)
                if (!threadDbId) {
                  chatMsg.end = true;
                  chatMsg.messages = "⏳ Verbindung wird aufgebaut, bitte nochmal senden...";
                  ws.send(JSON.stringify(chatMsg));
                  return;
                }
                if (msgObj.data.message === "about") {
                  chatMsg.messages = `**Version ${VERSION}**\r\n\r\n© 2024 Dr. Jörg Tuttas · Erweitert 2026 von Matthias Grünwald`;
                  chatMsg.end = true;
                  ws.send(JSON.stringify(chatMsg));
                  return;
                }
                // Usernachricht in DB spiegeln + Dashboard benachrichtigen
                saveMessage({ thread_db_id: threadDbId, role: 'user', content: msgObj.data.message });
                if (settings.activityId) {
                  notifyDashboard(settings.activityId, {
                    type: 'newMessage', threadDbId,
                    userId:    settings.userId   || null,
                    userName:  settings.userName || null,
                    role:      'user',
                    content:   msgObj.data.message,
                    createdAt: new Date().toISOString(),
                  });
                }
                streamResponse(ws, settings, threadDbId);
                break;
              case "filemsg": {
                // Issue #10: Dateiupload (Bilder & PDF) — P5a: uploadMode aus DB-Config
                const uploadMode = ws.activityConfig?.uploadMode || settings?.uploadMode || 'off';
                if (uploadMode === 'off') {
                  ws.send(JSON.stringify({ end: true, messages: '⚠️ Upload ist für diese Aufgabe nicht aktiviert.' }));
                  return;
                }
                const { file, originalType } = msgObj.data;
                if (originalType === 'video') {
                  ws.send(JSON.stringify({ end: true, messages: '⚠️ Videos werden nicht unterstützt.' }));
                  return;
                }
                if (originalType === 'pdf' && uploadMode !== 'files') {
                  ws.send(JSON.stringify({ end: true, messages: '⚠️ PDF-Upload ist für diese Aufgabe nicht aktiviert (nur Bilder erlaubt).' }));
                  return;
                }
                if (!threadDbId) {
                  ws.send(JSON.stringify({ end: true, messages: '⏳ Verbindung wird aufgebaut, bitte nochmal senden...' }));
                  return;
                }
                try {
                  const mimeMatch = file.match(/^data:([^;]+);base64,/);
                  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                  const b64 = file.replace(/^data:[^;]+;base64,/, '');
                  const imageBuffer = Buffer.from(b64, 'base64');
                  console.log(`[Upload] originalType=${originalType}, mimeType=${mimeType}, size=${imageBuffer.length}`);

                  if (mimeType.startsWith('video/')) {
                    ws.send(JSON.stringify({ end: true, messages: '⚠️ Videos werden nicht unterstützt.' }));
                    return;
                  }

                  // Kleine Dateien direkt als base64 in DB; große über Files API (bleibt verfügbar)
                  const TWO_MB = 2 * 1024 * 1024;
                  let dbContent;
                  if (imageBuffer.length < TWO_MB) {
                    dbContent = file;
                  } else {
                    const ext = mimeType.split('/')[1]?.split('+')[0] || 'jpeg';
                    const uploadedFile = await oai.files.create({
                      file: new File([imageBuffer], `upload.${ext}`, { type: mimeType }),
                      purpose: 'vision',
                    });
                    dbContent = `[${originalType}:${uploadedFile.id}]`;
                    console.log(`[Upload] Große Datei → Files API, file_id=${uploadedFile.id}`);
                  }
                  const contentType = originalType === 'pdf' ? 'pdf' : 'image';

                  // In DB speichern + Dashboard benachrichtigen
                  saveMessage({ thread_db_id: threadDbId, role: 'user', content: dbContent, content_type: contentType });
                  if (settings.activityId) {
                    notifyDashboard(settings.activityId, {
                      type: 'newMessage', threadDbId,
                      userId: settings.userId || null, userName: settings.userName || null,
                      role: 'user', content: dbContent, contentType,
                      createdAt: new Date().toISOString(),
                    });
                  }

                  // History jetzt vollständig in DB – direkt streamen
                  streamResponse(ws, settings, threadDbId);
                } catch (err) {
                  console.error('[Upload] Fehler:', err);
                  ws.send(JSON.stringify({ end: true, messages: `⚠️ Upload fehlgeschlagen: ${err.message}` }));
                }
                break;
              }
              default:
                // Handle unknown message type
                break;
            }
          });
        } catch (error) {
          chatMsg.end = true;
          chatMsg.messages = "Error: " + error.message;
          ws.send(JSON.stringify(chatMsg));
          console.log("Error: ", error);
          return;
        }
      });
    });
  });
});

/**
 * Baut das input-Array für oai.responses.create() aus der SQLite-History.
 * Inkl. task_image-Einträge (Aufgabenbilder).
 */
function buildInput(messages) {
  return messages.map(m => {
    const ct = m.content_type || 'text';

    if (ct === 'image' || ct === 'task_image') {
      if (m.content.startsWith('data:')) {
        return { role: m.role, content: [{ type: 'input_image', image_url: m.content }] };
      }
      // Marker [image:file-xxx] oder [pdf:file-xxx]
      const match = m.content.match(/^\[(?:image|pdf):([^\]]+)\]$/);
      if (match) {
        return { role: m.role, content: [{ type: 'input_image', file_id: match[1] }] };
      }
    }

    if (ct === 'pdf') {
      const match = m.content.match(/^\[pdf:([^\]]+)\]$/);
      if (match) {
        return { role: m.role, content: [{ type: 'input_file', file_id: match[1] }] };
      }
    }

    // Default: Plaintext
    return { role: m.role, content: m.content };
  });
}

/**
 * Streamt eine Antwort via Responses API und spiegelt sie in SQLite.
 * History wird vollständig aus der DB aufgebaut (inkl. task_image).
 */
async function streamResponse(ws, settings, threadDbId) {
  const chatMsg = { end: false, messages: '' };

  const effectiveModel = getEffectiveModel(ws.isTeacher, ws.userId);
  const instructions   = buildInstructions(settings, settings.activityId);
  const input          = buildInput(getMessagesAll(threadDbId));

  let resContent = '';

  try {
    const stream = await oai.responses.create({
      model:        effectiveModel,
      instructions,
      input,
      stream:       true,
    });

    let usage = null;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        resContent += event.delta;
        chatMsg.messages = resContent;
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));
      } else if (event.type === 'response.completed') {
        usage = event.response?.usage ?? null;
      }
    }

    resContent = resContent.replace('sandbox:/mnt/data/', 'storage/');
    console.log(`[Chat] Antwort (${resContent.length} Zeichen)`);

    // Assistenten-Antwort in DB spiegeln
    const msgId = saveMessage({ thread_db_id: threadDbId, role: 'assistant', content: resContent });

    // Token-Verbrauch speichern (Responses API: input_tokens / output_tokens)
    let runCost      = null;
    let threadCost   = null;
    let activityCost = null;
    try {
      if (usage && threadDbId) {
        const mapped = {
          prompt_tokens:     usage.input_tokens,
          completion_tokens: usage.output_tokens,
          total_tokens:      usage.total_tokens,
        };
        saveTokenUsage(threadDbId, settings?.activityId || null, effectiveModel, mapped, msgId);
        console.log(`[Token] ${effectiveModel} – input=${usage.input_tokens} output=${usage.output_tokens}`);
        runCost      = computeRunCost(mapped.prompt_tokens, mapped.completion_tokens);
        threadCost   = computeThreadCost(threadDbId);
        activityCost = computeActivityCost(settings?.activityId || null);
      }
    } catch (e) {
      console.warn('[Token] Fehler beim Speichern:', e.message);
    }

    // Dashboard benachrichtigen
    if (settings.activityId) {
      notifyDashboard(settings.activityId, {
        type:         'newMessage',
        threadDbId,
        userId:       settings.userId   || null,
        userName:     settings.userName || null,
        role:         'assistant',
        content:      resContent,
        createdAt:    new Date().toISOString(),
        messageId:    msgId,
        runCost,
        threadCost,
        activityCost,
      });
    }

    chatMsg.end      = true;
    chatMsg.messages = resContent;
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));

  } catch (error) {
    console.error('[Chat] streamResponse Fehler:', error);
    chatMsg.end      = true;
    chatMsg.messages = 'Error: ' + error.message;
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));
  }
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} Version: ${VERSION}`);
});
