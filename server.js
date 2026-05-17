const VERSION = "3.0.0";

import express from "express";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import { initDb, saveThread, saveMessage, findThread, touchThread, getMessages, getMessagesAll, getStudents, updateThreadName, upsertActivity, getActivity, setActivityConfig, isAdmin, addAdmin, removeAdmin, getAdmins, getActiveSystemPrompt, saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry, getActiveErfahrungsprompt, saveErfahrungsprompt, getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry, getTeacherPreference, setTeacherPreference, getTeacherTemplates, getTeacherDefaultTemplate, createTeacherTemplate, updateTeacherTemplate, deleteTeacherTemplate, setTeacherTemplateDefault, getSystemTemplate, setSystemTemplate, saveFeedback, getFeedbackByActivity, saveErkenntnisse, getGlobalPersonas, getTeacherPersonas, getAllPersonasForUser, createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped, getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion, getStudentMessages } from "./db.js";
import { execFileSync, execFile } from 'child_process';
import { ChatSession } from "./chat-session.js";
import { buildInstructions } from "./prompt-builder.js";
import { getCachedConfig, updateCachedConfig } from './config-cache.js';
import { oai, aiClient } from './ai-instance.js';
import { MODEL_NAME, AVAILABLE_MODELS, GEN_MODEL, GEN_MODELS } from './env-config.js';
import {
  isOriginAllowed,
  generateDashboardToken,
  validateDashboardToken,
  getUserNameFromToken,
  requireTeacherAuth,
  requireDashboardAuth,
  requireAdminAuth,
} from './auth-middleware.js';
import { recordUsage, enrichMessagesWithCost, computeThreadCost, computeActivityCost, computeRunCost } from './token-log.js';
import { runSimulation } from './simulation.js';
import { suggestCriteriaList, augmentCriteria } from './criteria.js';
import { generateOptimizeProposal } from './optimize.js';
import { ClientRegistry } from './client-registry.js';
import { validateTemplateFields } from './routes/validators.js';

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

const dashboardRegistry = new ClientRegistry();
const chatRegistry      = new ClientRegistry();

/** P3: activityId → { timerHandle? } für Plenum-Sperre. */
const activityLocks = new Map();

/** Gibt das effektive Modell zurück: persönliche Präferenz > globaler DB-Wert. */
function getEffectiveModel(isTeacher, userId) {
  if (isTeacher && userId) {
    const pref = getTeacherPreference(userId);
    if (pref?.preferred_model && AVAILABLE_MODELS.includes(pref.preferred_model)) {
      return pref.preferred_model;
    }
  }
  return getCachedConfig().model || MODEL_NAME;
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

// Issue #13: System-Prompt aus Env (Fallback, wenn DB noch leer)
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';

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
    updateCachedConfig(dbPrompt.content, dbPrompt.model || MODEL_NAME);
    console.log(`[Config] Systemprompt aus DB (v${dbPrompt.version}), Modell: ${getCachedConfig().model}`);
  } else {
    saveSystemPrompt(SYSTEM_PROMPT || '', MODEL_NAME, 'env-migration');
    updateCachedConfig(SYSTEM_PROMPT || '', MODEL_NAME);
    console.log(`[Config] Systemprompt aus ENV in DB migriert, Modell: ${MODEL_NAME}`);
  }
}


// ── P5: Aktivitäts-Konfig-Endpoints ─────────────────────────────────────────

/** GET /api/activity-config/:activityId?token= – Konfig für config.html lesen */
app.get('/api/activity-config/:activityId', requireDashboardAuth, (req, res) => {
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

/** PUT /api/activity-config/:activityId?token= – Opener + Upload-Modus speichern */
app.put('/api/activity-config/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { opener, uploadMode, title, botIcon } = req.body;
  const validErr = validateTemplateFields(uploadMode, botIcon);
  if (validErr) return res.status(400).json({ error: validErr });
  setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
  console.log(`[Config] Aktivität ${activityId} aktualisiert von ${userId}`);
  res.json({ ok: true });
});

// ── Issue #5: Teacher-Dashboard REST-Endpoints ──────────────────────────────

/** GET /api/dashboard/students?activityId=…&token=… */
app.get('/api/dashboard/students', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
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
app.get('/api/dashboard/messages/:threadDbId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
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
app.get('/api/admin/config', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const pref = getTeacherPreference(userId);
  res.json({
    systemPrompt:    getCachedConfig().content,
    model:           getCachedConfig().model,
    availableModels: AVAILABLE_MODELS,
    genModels:       GEN_MODELS,
    isAdmin:         isAdmin(userId),
    myModel:         pref?.preferred_model || null,
  });
});

/** PUT /api/admin/config?token=… – Systemprompt + Globalmodell speichern (nur Admin) */
app.put('/api/admin/config', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { systemPrompt, model } = req.body;
  if (typeof systemPrompt !== 'string') return res.status(400).json({ error: 'systemPrompt fehlt' });
  if (!model || !AVAILABLE_MODELS.includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });

  saveSystemPrompt(systemPrompt, model, userId);
  updateCachedConfig(systemPrompt, model);
  dashboardRegistry.broadcastAll({ type: 'configUpdated', model, updatedBy: userId });
  console.log(`[Admin] Systemprompt + Modell gespeichert von ${userId}, Modell: ${model}`);
  res.json({ ok: true });
});

/** GET /api/admin/prompt-history?token=… – Versionshistorie (Admin) */
app.get('/api/admin/prompt-history', requireAdminAuth, (req, res) => {
  res.json({ history: getPromptHistory() });
});

/** DELETE /api/admin/prompt-history/:id?token=… – Historyeintrag löschen (Admin) */
app.delete('/api/admin/prompt-history/:id', requireAdminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deletePromptHistoryEntry(id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getPromptHistory() });
});

/** GET /api/admin/admins?token=… – Admin-Liste (Admin) */
app.get('/api/admin/admins', requireAdminAuth, (req, res) => {
  res.json({ admins: getAdmins() });
});

/** POST /api/admin/admins?token=… – Admin hinzufügen (Admin) */
app.post('/api/admin/admins', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { newUserId } = req.body;
  if (!newUserId || typeof newUserId !== 'string') return res.status(400).json({ error: 'newUserId fehlt' });
  addAdmin(newUserId.trim(), userId);
  console.log(`[Admin] ${newUserId} als Admin eingetragen von ${userId}`);
  res.json({ ok: true, admins: getAdmins() });
});

/** DELETE /api/admin/admins/:targetId?token=… – Admin entfernen (Admin) */
app.delete('/api/admin/admins/:targetId', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const targetId = req.params.targetId;
  if (targetId === userId) return res.status(400).json({ error: 'Eigene Admin-Rechte nicht entziehbar' });
  removeAdmin(targetId);
  console.log(`[Admin] ${targetId} als Admin entfernt von ${userId}`);
  res.json({ ok: true, admins: getAdmins() });
});

/** GET /api/teacher/preferences?token=… – Persönliche Präferenzen lesen */
app.get('/api/teacher/preferences', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const pref = getTeacherPreference(userId);
  res.json({ myModel: pref?.preferred_model || null, availableModels: AVAILABLE_MODELS });
});

/** PUT /api/teacher/preferences?token=… – Persönliches Modell setzen */
app.put('/api/teacher/preferences', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { model } = req.body;
  const validModel = (!model || model === '') ? null : (AVAILABLE_MODELS.includes(model) ? model : null);
  if (model && model !== '' && !validModel) return res.status(400).json({ error: 'Ungültiges Modell' });
  setTeacherPreference(userId, validModel);
  console.log(`[Teacher] ${userId} setzt Modell-Präferenz: ${validModel || 'Standard'}`);
  res.json({ ok: true, myModel: validModel });
});

// ── P5b: Lehrer-Vorlagen-Bibliothek ──────────────────────────────────────────

/** GET /api/teacher/templates?token= – alle Vorlagen der Lehrkraft */
app.get('/api/teacher/templates', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  res.json({ templates: getTeacherTemplates(userId) });
});

/** POST /api/teacher/templates?token= – neue Vorlage anlegen */
app.post('/api/teacher/templates', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { name, title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const validErr1 = validateTemplateFields(uploadMode, botIcon);
  if (validErr1) return res.status(400).json({ error: validErr1 });
  const id = createTeacherTemplate(userId, { name: name.trim(), title, botIcon, opener, uploadMode, hintsTemplate });
  res.json({ ok: true, id });
});

/** PUT /api/teacher/templates/:id?token= – Vorlage aktualisieren */
app.put('/api/teacher/templates/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
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
app.delete('/api/teacher/templates/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  deleteTeacherTemplate(id, userId);
  res.json({ ok: true });
});

/** PUT /api/teacher/templates/:id/set-default?token= – als Standard markieren */
app.put('/api/teacher/templates/:id/set-default', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  setTeacherTemplateDefault(id, userId);
  res.json({ ok: true });
});

// ── P5b: Systemvorlage (Admin) ────────────────────────────────────────────────

/** GET /api/admin/system-template?token= – Systemvorlage lesen */
app.get('/api/admin/system-template', requireTeacherAuth, (req, res) => {
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
app.put('/api/admin/system-template', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
  const validErr3 = validateTemplateFields(uploadMode, botIcon);
  if (validErr3) return res.status(400).json({ error: validErr3 });
  setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate });
  console.log(`[P5b] Systemvorlage gespeichert von ${userId}`);
  res.json({ ok: true });
});

// ── Issue #20: Erfahrungsprompt-Verwaltung + Prompt-Optimierung ──────────────

/** GET /api/erfahrungsprompt/:activityId?token= */
app.get('/api/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const erf = getActiveErfahrungsprompt(activityId);
  res.json({ content: erf?.content || '', version: erf?.version || 0 });
});

/** POST /api/erfahrungsprompt/:activityId?token= – manuell speichern */
app.post('/api/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content fehlt' });
  saveErfahrungsprompt(activityId, content, userId);
  console.log(`[Erfahrungsprompt] Gespeichert für ${activityId} von ${userId}`);
  res.json({ ok: true });
});

/** GET /api/erfahrungsprompt-history/:activityId?token= */
app.get('/api/erfahrungsprompt-history/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ history: getErfahrungspromptHistory(activityId) });
});

/** DELETE /api/erfahrungsprompt-history/:id?activityId=&token= */
app.delete('/api/erfahrungsprompt-history/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deleteErfahrungspromptHistoryEntry(activityId, id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getErfahrungspromptHistory(activityId) });
});


/** POST /api/optimize-prompt?activityId=X&token= – KI-Vorschlag generieren */
app.post('/api/optimize-prompt', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const result = await generateOptimizeProposal(activityId, '', getCachedConfig(), aiClient);
    console.log(`[Optimize] Vorschlag für ${activityId} generiert (${result.kausalkette.length} Kausalketten-Einträge)`);
    res.json(result);
  } catch (e) {
    console.error('[Optimize] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/erkenntnisse?activityId=X&token= – Erkenntnisse aus Kausalkette speichern */
app.post('/api/erkenntnisse', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const { items } = req.body; // [{ problem, ursache, aenderung }]
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items-Array fehlt' });
  for (const item of items) {
    const text = [item.problem, item.ursache, item.aenderung].filter(Boolean).join(' → ');
    if (text) saveErkenntnisse(activityId, text, 'ai');
  }
  res.json({ ok: true, saved: items.length });
});


// ── P6: Personas ─────────────────────────────────────────────────────────────

/** GET /api/personas?token= – globale + lehrer-eigene Personas */
app.get('/api/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  res.json({ global: getGlobalPersonas(), own: getTeacherPersonas(userId) });
});

/** POST /api/personas?token= – lehrer-eigene Persona speichern */
app.post('/api/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  const teacherName = getUserNameFromToken(req.query.token);
  createPersona({ teacherId: userId, teacherName, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

/** DELETE /api/personas/:id?token= – eigene Persona löschen */
app.delete('/api/personas/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  deletePersona(parseInt(req.params.id), userId, false);
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

/** POST /api/personas-suggest?activityId=X&token= – KI schlägt Personas vor */
app.post('/api/personas-suggest', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const { genModel } = req.body;
    const msgs   = getStudentMessages(activityId);
    const sample = msgs.slice(0, 60).map(m => m.content).join('\n---\n');
    const result = await aiClient.jsonCall(
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
app.get('/api/admin/personas', requireAdminAuth, (req, res) => {
  res.json({ personas: getAllTeacherPersonasGrouped() });
});

/** POST /api/admin/personas?token= – globale Persona erstellen */
app.post('/api/admin/personas', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  createPersona({ teacherId: null, teacherName: null, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, global: getGlobalPersonas() });
});

/** DELETE /api/admin/personas/:id?token= – beliebige Persona löschen */
app.delete('/api/admin/personas/:id', requireAdminAuth, (req, res) => {
  deletePersona(parseInt(req.params.id), null, true);
  res.json({ ok: true });
});

/** PUT /api/admin/personas/:id/promote?token= – Lehrer-Persona zu global machen */
app.put('/api/admin/personas/:id/promote', requireAdminAuth, (req, res) => {
  const { userId } = req;
  promotePersonaToGlobal(parseInt(req.params.id), userId);
  res.json({ ok: true, global: getGlobalPersonas() });
});

// ── P8: Admin-Debug-Endpunkte ────────────────────────────────────────────────

/** GET /api/admin/logs?token=&n=100 – letzte N Zeilen journalctl (Admin) */
app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  const n = Math.min(Math.max(parseInt(req.query.n) || 100, 1), 2000);
  try {
    const out = execFileSync('journalctl', ['-u', 'moo-gpt', '-n', String(n), '--no-pager', '--output=short-iso'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    res.json({ lines: out.split('\n').filter(l => l.length > 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/admin/restart?token= – Dienst neu starten (Admin) */
app.post('/api/admin/restart', requireAdminAuth, (req, res) => {
  res.json({ ok: true });
  setTimeout(() => execFile('systemctl', ['restart', 'moo-gpt'], () => {}), 500);
});

// ── Issue #21: Kriterien-Endpunkte ───────────────────────────────────────────

/** GET /api/criteria/:activityId?token= */
app.get('/api/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** POST /api/criteria-suggest/:activityId?token= – KI schlägt Kriterien vor */
app.post('/api/criteria-suggest/:activityId', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const suggestions = await suggestCriteriaList(activityId, getCachedConfig(), req.body.genModel, aiClient);
    res.json({ suggestions });
  } catch (e) {
    console.error('[Criteria-Suggest] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/criteria/:activityId?token= – Kriterium hinzufügen */
app.post('/api/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content fehlt' });
  saveErkenntnisse(activityId, content, 'criteria');
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** DELETE /api/criteria/:id?activityId=X&token= – Soft-Delete */
app.delete('/api/criteria/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  softDeleteCriterion(parseInt(req.params.id));
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

/** PATCH /api/criteria/:id/restore?activityId=X&token= */
app.patch('/api/criteria/:id/restore', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  restoreCriterion(parseInt(req.params.id));
  res.json({ ok: true, criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

// ── P3: Plenum-Sperre ────────────────────────────────────────────────────────

/** POST /api/activity/:activityId/lock?token= – Aktivität sperren */
app.post('/api/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const existing = activityLocks.get(String(activityId));
  if (existing?.timerHandle) clearTimeout(existing.timerHandle);

  const entry = {};
  const durationMinutes = Math.min(120, Math.max(0, Number(req.body.durationMinutes) || 0));
  if (durationMinutes > 0) {
    entry.timerHandle = setTimeout(() => {
      activityLocks.delete(String(activityId));
      chatRegistry.broadcast(activityId, { type: 'unlocked' });
      dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
      console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${durationMinutes} min`);
    }, durationMinutes * 60 * 1000);
  }

  activityLocks.set(String(activityId), entry);
  chatRegistry.broadcast(activityId, { type: 'locked' });
  dashboardRegistry.broadcast(activityId, { type: 'locked' });
  console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
  res.json({ ok: true, locked: true });
});

/** DELETE /api/activity/:activityId/lock?token= – Aktivität entsperren */
app.delete('/api/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const existing = activityLocks.get(String(activityId));
  if (existing?.timerHandle) clearTimeout(existing.timerHandle);
  activityLocks.delete(String(activityId));
  chatRegistry.broadcast(activityId, { type: 'unlocked' });
  dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
  console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
  res.json({ ok: true, locked: false });
});

// ── Issues #21 + #26: Simulation (SSE-Streaming) ─────────────────────────────

/** POST /api/simulate?activityId=X&token= – SSE-Stream */
app.post('/api/simulate', requireDashboardAuth, async (req, res) => {
  const { activityId, userId } = req;
  const { personaId, utteranceModel, evalModel } = req.body;
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
    sendEvent('progress', { label: 'Simulation läuft, dauert typischerweise 30–60 Sekunden…' });

    const { pairs, simResultsText } = await runSimulation({
      persona,
      config:            getCachedConfig(),
      erfahrungsprompt:  erfahrungsprompt?.content || '',
      criteria,
      models:            { utteranceModel: uModel, evalModel: eModel },
      aiClient,
    });

    console.log(`[Simulate] ${pairs.length} Paare abgeschlossen, generiere Erfahrungsprompt-Vorschlag`);
    for (let i = 0; i < pairs.length; i++) {
      sendEvent('pair', { index: i, pair: pairs[i], personaName: persona.name });
    }

    sendEvent('progress', { label: 'Generiere Erfahrungsprompt-Vorschlag…' });

    try {
      const suggestion = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
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

// ── P7: One-Click Optimierung ─────────────────────────────────────────────────

const ONE_CLICK_FALLBACK_NAMES = ['Der Musterschüler', 'Der Stille', 'Die Pragmatikerin', 'Der Zweifler'];

function selectPersonasForOneClick(userId, count = 4) {
  const own    = getTeacherPersonas(userId);
  const global = getGlobalPersonas();

  function selectDiverse(pool, n) {
    if (pool.length <= n) return [...pool];
    const words   = p => new Set((p.description || p.name).toLowerCase().split(/\W+/).filter(Boolean));
    const overlap = (a, b) => {
      const wa = words(a), wb = words(b);
      let common = 0;
      wa.forEach(w => { if (wb.has(w)) common++; });
      return common / Math.max(wa.size, wb.size, 1);
    };
    const selected = [pool[0]];
    while (selected.length < n) {
      let best = null, bestScore = Infinity;
      for (const p of pool) {
        if (selected.includes(p)) continue;
        const score = Math.max(...selected.map(s => overlap(p, s)));
        if (score < bestScore) { bestScore = score; best = p; }
      }
      if (!best) break;
      selected.push(best);
    }
    return selected;
  }

  const chosen = selectDiverse(own, count);

  if (chosen.length < count) {
    const fallbacks = ONE_CLICK_FALLBACK_NAMES
      .map(name => global.find(p => p.name === name))
      .filter(Boolean)
      .filter(p => !chosen.find(c => c.id === p.id));
    for (const p of fallbacks) {
      if (chosen.length >= count) break;
      chosen.push(p);
    }
    for (const p of global) {
      if (chosen.length >= count) break;
      if (!chosen.find(c => c.id === p.id)) chosen.push(p);
    }
  }

  return chosen.slice(0, count);
}


/** POST /api/one-click-optimize?activityId=X&token= – SSE-Stream */
app.post('/api/one-click-optimize', requireDashboardAuth, async (req, res) => {
  const { activityId, userId } = req;
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    // Phase 1: Kriterien ergänzen
    const existing    = getCriteria(activityId);
    const newCriteria = await augmentCriteria(activityId, existing, getCachedConfig(), aiClient);
    for (const c of newCriteria) saveErkenntnisse(activityId, c, 'criteria');
    sendEvent('criteria', { added: newCriteria.length, total: existing.length + newCriteria.length });
    console.log(`[OneClick] Kriterien: ${existing.length} vorhanden, ${newCriteria.length} ergänzt`);

    // Phase 2: Personas auswählen
    const personas = selectPersonasForOneClick(userId);
    if (!personas.length) throw new Error('Keine Personas verfügbar');
    sendEvent('personas', { selected: personas.map(p => p.name) });
    console.log(`[OneClick] Personas: ${personas.map(p => p.name).join(', ')}`);

    // Phase 3: Parallele Simulationen
    const currentCriteria  = getCriteria(activityId);
    const erfahrungsprompt = getActiveErfahrungsprompt(activityId);
    const allPairs         = [];
    const total            = personas.length * 4;
    let   pairsEmitted     = 0;

    sendEvent('sim_start', { total });

    await Promise.allSettled(personas.map(async (persona) => {
      let result;
      try {
        result = await runSimulation({
          persona,
          config:           getCachedConfig(),
          erfahrungsprompt: erfahrungsprompt?.content || '',
          criteria:         currentCriteria,
          models:           { utteranceModel: GEN_MODEL, evalModel: GEN_MODEL },
          aiClient,
        });
      } catch (e) {
        console.warn(`[OneClick] Simulation fehlgeschlagen für ${persona.name}:`, e.message);
        return;
      }
      for (let i = 0; i < result.pairs.length; i++) {
        const pair = result.pairs[i];
        allPairs.push({ personaName: persona.name, pair });
        pairsEmitted++;
        sendEvent('sim_pair', { personaName: persona.name, index: i, pair, emitted: pairsEmitted, total });
      }
    }));

    if (allPairs.length === 0) throw new Error('Alle Simulationen fehlgeschlagen – bitte erneut versuchen.');
    console.log(`[OneClick] ${allPairs.length} Paare simuliert, generiere Vorschlag`);

    // Phase 4: Optimierungsvorschlag
    const simResultsText = allPairs.map(r =>
      `[${r.personaName}] ${r.pair.utterance}\n` +
      `KI-Antwort: ${r.pair.aiResponse.slice(0, 400)}\n` +
      `Bewertung: ${r.pair.evaluation.overall} (Score ${r.pair.evaluation.score}/5) – ${r.pair.evaluation.summary || ''}`
    ).join('\n---\n');

    const proposal = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
    sendEvent('optimize_done', proposal);
    console.log(`[OneClick] Fertig für ${activityId}`);

  } catch (e) {
    console.error('[OneClick] Fehler:', e);
    sendEvent('error', { message: e.message });
  }

  res.end();
});

// ── Issue #19: Feedback-Bewertung ────────────────────────────────────────────

/** POST /api/feedback?activityId=…&token=… */
app.post('/api/feedback', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { messageId, threadId, rating, comment, improvedText } = req.body;
  if (!messageId || !['gut', 'schlecht'].includes(rating))
    return res.status(400).json({ error: 'messageId und rating (gut|schlecht) erforderlich' });
  try {
    saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy: userId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Feedback] Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

/** GET /api/feedback/:activityId?token=… */
app.get('/api/feedback/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
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
  dashboardRegistry.register(activityId, ws);
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
    dashboardRegistry.unregister(activityId, ws);
    console.log(`[Dashboard] Lehrer getrennt, activityId=${activityId}`);
  });
});

// ────────────────────────────────────────────────────────────────────────────

app.ws("/api/chat", (ws, req) => {
  checkOrigin(ws, req, () => {
    const session = new ChatSession(ws, {
      chatRegistry, activityLocks, generateDashboardToken,
      dashboardRegistry, streamResponse, oai, VERSION,
    });

    ws.on("message", (message) => {
      limitRequests(ws, req, message, () => {
        console.log("Message received:", message);
        try {
          var msgObj = JSON.parse(message);
          console.log("msgObj:", JSON.stringify(msgObj, null, 2));
          checkFormat(ws, msgObj, async () => {
            switch (msgObj.type) {
              case "settings": await session.init(msgObj.data); break;
              case "chatmsg":  await session.handleChat(msgObj); break;
              case "filemsg":  await session.handleFile(msgObj); break;
              default: break;
            }
          });
        } catch (error) {
          ws.send(JSON.stringify({ end: true, messages: "Error: " + error.message }));
          console.log("Error: ", error);
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
  const instructions   = buildInstructions({
    systemContent:    getCachedConfig().content,
    erfahrungContent: getActiveErfahrungsprompt(settings.activityId)?.content ?? '',
    hints:            settings.hints,
    task:             settings.task,
    date:             new Date(),
  });
  const input          = buildInput(getMessagesAll(threadDbId));

  let resContent = '';

  try {
    const stream = await aiClient.stream(instructions, input, effectiveModel);

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
    const costs = recordUsage(threadDbId, settings?.activityId || null, effectiveModel, usage, msgId);

    // Dashboard benachrichtigen
    if (settings.activityId) {
      dashboardRegistry.broadcast(settings.activityId, {
        type:         'newMessage',
        threadDbId,
        userId:       settings.userId   || null,
        userName:     settings.userName || null,
        role:         'assistant',
        content:      resContent,
        createdAt:    new Date().toISOString(),
        messageId:    msgId,
        runCost:      costs?.runCost      ?? null,
        threadCost:   costs?.threadCost   ?? null,
        activityCost: costs?.activityCost ?? null,
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
