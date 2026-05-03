const VERSION = "3.0.0";

import express from "express";
import OpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import moment from "moment";
import { initDb, saveThread, saveMessage, findThread, touchThread, getMessages, getMessagesAll, getStudents, updateThreadName, upsertActivity, getActivity, getActivityName, saveTokenUsage, getThreadCostTokens, getActivityCostTokens } from "./db.js";
import crypto from "crypto";

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

/**
 * Dashboard-Token-Verwaltung (Issue #5: Zugriffsschutz).
 * Token wird beim Lehrer-Login per WS erzeugt und 8 h gecacht.
 * Ohne gültigen Token → WS-Verbindung wird abgelehnt.
 */
const dashboardTokens = new Map(); // token → { activityId, userId, expires }

function generateDashboardToken(activityId, userId) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 8 * 60 * 60 * 1000; // 8 Stunden
  dashboardTokens.set(token, { activityId: String(activityId), userId, expires });
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

// ---------------------------------------------------------------------------

function checkFormat(ws, msgObj, next) {
  if (!msgObj.hasOwnProperty("type")) {
    chatMsg.end = true;
    chatMsg.messages =
      "Error: Missing or wrong Parameter 'type' in JSON message";
    ws.send(JSON.stringify(chatMsg));
    console.log("Error: Missing or wrong Parameter 'type' in JSON message");
    return;
  } else if (typeof msgObj.type !== "string") {
    chatMsg.end = true;
    chatMsg.messages =
      "Error: Parameter 'type' is not a string in JSON message";
    ws.send(JSON.stringify(chatMsg));
    console.log("Error: Parameter 'type' is not a string in JSON message");
    return;
  }
  if (!msgObj.hasOwnProperty("data")) {
    chatMsg.end = true;
    chatMsg.messages =
      "Error: Missing or wrong Parameter 'data' in JSON message";
    ws.send(JSON.stringify(chatMsg));
    console.log("Error: Missing or wrong Parameter 'data' in JSON message");
    return;
  } else if (typeof msgObj.data !== "object") {
    chatMsg.end = true;
    chatMsg.messages =
      "Error: Parameter 'data' is not a object in JSON message";
    ws.send(JSON.stringify(chatMsg));
    console.log("Error: Parameter 'data' is not a object in JSON message");
    return;
  }

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
  console.error("MODEL_NAME ist nicht gesetzt (z.B. gpt-4o)");
  process.exit(1);
}

const oai = new OpenAI({ apiKey: process.env.APIKEY });

// Issue #13: Modell + System-Prompt aus Env (nicht mehr aus OpenAI-Dashboard)
const MODEL_NAME    = process.env.MODEL_NAME;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';
console.log(`[Config] Modell: ${MODEL_NAME}`);
if (!SYSTEM_PROMPT) console.warn('[Config] SYSTEM_PROMPT nicht gesetzt – leerer System-Prompt');

// Issue #11: LiteLLM-Preise laden und 24 h cachen
let PRICING = null;
let pricingFetchedAt = 0;

async function fetchPricing() {
  const now = Date.now();
  if (PRICING && (now - pricingFetchedAt) < 24 * 60 * 60 * 1000) return PRICING;
  try {
    const res  = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
    const data = await res.json();
    // LiteLLM-Keys: z.B. "gpt-4o" oder "openai/gpt-4o"
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

// ── Issue #5: Teacher-Dashboard WebSocket (Live-Updates) ────────────────────

app.ws('/api/dashboard-ws', (ws, req) => {
  // Origin-Check
  const origin = req.headers.origin || '';
  if (process.env.ALLOWED_ORIGIN) {
    const allowed = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()).some(o => origin.startsWith(o));
    if (!allowed) {
      ws.close(1008, 'Origin not allowed');
      return;
    }
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
    ws.on("close", () => clearInterval(keepalive));

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
                  console.log(`[Auth] isTeacher=${ws.isTeacher} (client=${settings.isTeacher}, env=${isTeacherByEnv})`);
                }

                // Issue #5/#10: Aufgabentitel + upload_mode in DB speichern
                if (settings.activityId && settings.activityName) {
                  upsertActivity(settings.activityId, settings.activityName, settings.opener || null, settings.uploadMode || null);
                }

                // Issue #5: Dashboard-Token für Lehrer erzeugen und zurückschicken
                if (ws.isTeacher && settings.activityId) {
                  const token = generateDashboardToken(settings.activityId, settings.userId);
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
                // Issue #10: Dateiupload (Bilder & PDF)
                const uploadMode = settings?.uploadMode || 'off';
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

  moment.locale('de');
  const now     = moment();
  const dayName = now.format('dddd');
  const date    = now.format('DD.MM.YYYY');
  const time    = now.format('HH:mm');

  const instructions = SYSTEM_PROMPT +
    `\nHeute ist ${dayName}, der ${date} um ${time}.\n` +
    (settings.hints || '') +
    (settings.task  || '');

  const input = buildInput(getMessagesAll(threadDbId));

  let resContent = '';

  try {
    const stream = await oai.responses.create({
      model:        MODEL_NAME,
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
        saveTokenUsage(threadDbId, settings?.activityId || null, MODEL_NAME, mapped, msgId);
        console.log(`[Token] ${MODEL_NAME} – input=${usage.input_tokens} output=${usage.output_tokens}`);
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
