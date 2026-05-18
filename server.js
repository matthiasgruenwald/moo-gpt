const VERSION = "3.0.0";

import express from "express";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import { addAdmin } from './stores/admin.js';
import { getActivity } from './stores/activity.js';
import {
  initDb,
  getActiveSystemPrompt, saveSystemPrompt,
  getStudents,
  getMessages,
  getMessagesAll,
  getActiveErfahrungsprompt,
  getTeacherPreference,
  saveMessage,
} from './db.js';
import { ChatSession } from "./chat-session.js";
import { buildInstructions } from "./prompt-builder.js";
import { getCachedConfig, updateCachedConfig } from './config-cache.js';
import { oai, aiClient } from './ai-instance.js';
import { MODEL_NAME, AVAILABLE_MODELS } from './env-config.js';
import {
  isOriginAllowed,
  generateDashboardToken,
  validateDashboardToken,
} from './auth-middleware.js';
import { recordUsage, enrichMessagesWithCost, computeThreadCost, computeActivityCost } from './token-log.js';
import { ClientRegistry } from './client-registry.js';
import { createActivityRouter } from './routes/activity.js';
import dashboardRouter, { enrichStudentsWithCost } from './routes/dashboard.js';
import { createAdminRouter } from './routes/admin.js';
import teacherRouter from './routes/teacher.js';
import erfahrungspromptRouter from './routes/erfahrungsprompt.js';
import personasRouter from './routes/personas.js';
import criteriaRouter from './routes/criteria.js';
import simulationRouter from './routes/simulation.js';

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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Issue #13: System-Prompt aus Env (Fallback, wenn DB noch leer)
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';

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

const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks });
const adminRouter    = createAdminRouter({ dashboardRegistry });
app.use('/api', activityRouter);
app.use('/api', adminRouter);
app.use('/api', teacherRouter);
app.use('/api', erfahrungspromptRouter);
app.use('/api', personasRouter);
app.use('/api', criteriaRouter);
app.use('/api', simulationRouter);
app.use('/api', dashboardRouter);

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
