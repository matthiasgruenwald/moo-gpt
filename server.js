const VERSION = "3.0.0";

import express from "express";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import { addAdmin } from './stores/admin.js';
import { getActiveSystemPrompt, saveSystemPrompt } from './stores/prompt.js';
import { initDb } from './db.js';
import { ChatSession } from "./chat-session.js";
import { getCachedConfig, updateCachedConfig } from './config-cache.js';
import { oai, aiClient } from './ai-instance.js';
import { MODEL_NAME } from './env-config.js';
import { generateDashboardToken } from './auth-middleware.js';
import { ClientRegistry } from './client-registry.js';
import { createActivityRouter } from './routes/activity.js';
import dashboardRouter from './routes/dashboard.js';
import { createDashboardWsRouter } from './routes/dashboard-ws.js';
import { createAdminRouter } from './routes/admin.js';
import teacherRouter from './routes/teacher.js';
import erfahrungspromptRouter from './routes/erfahrungsprompt.js';
import personasRouter from './routes/personas.js';
import criteriaRouter from './routes/criteria.js';
import simulationRouter from './routes/simulation.js';
import messageEditsRouter from './routes/message-edits.js';
import studentMemoryRouter from './routes/student-memory.js';
import { LockManager } from './lock-manager.js';
import dashboardPagesRouter from './routes/dashboard-pages.js';
import { createCostsRouter } from './routes/costs.js';
import { createStreamResponse } from './services/chat-response.js';

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

const lockManager = new LockManager(chatRegistry, dashboardRegistry);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static("public"));
app.use('/graphify', express.static("graphify-out"));

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

const streamResponse     = createStreamResponse({ dashboardRegistry, aiClient });
const activityRouter     = createActivityRouter({ chatRegistry, dashboardRegistry, lockManager, aiClient });
const adminRouter        = createAdminRouter({ dashboardRegistry });
const costsRouter        = createCostsRouter();
const dashboardWsRouter  = createDashboardWsRouter({ dashboardRegistry, lockManager });
app.use('/api', activityRouter);
app.use('/api', adminRouter);
app.use('/api', costsRouter);
app.use('/api', teacherRouter);
app.use('/api', erfahrungspromptRouter);
app.use('/api', personasRouter);
app.use('/api', criteriaRouter);
app.use('/api', simulationRouter);
app.use('/api', messageEditsRouter);
app.use('/api', studentMemoryRouter);
app.use('/api', dashboardRouter);
app.use(dashboardWsRouter);
app.use(dashboardPagesRouter);

// ---------------------------------------------------------------------------

function checkFormat(ws, msgObj, next) {
  const sendErr = (msg) => { ws.send(JSON.stringify({ end: true, messages: msg })); console.log(msg); };
  if (!msgObj.hasOwnProperty("type"))       return sendErr("Error: Missing or wrong Parameter 'type' in JSON message");
  if (typeof msgObj.type !== "string")       return sendErr("Error: Parameter 'type' is not a string in JSON message");
  if (!msgObj.hasOwnProperty("data"))       return sendErr("Error: Missing or wrong Parameter 'data' in JSON message");
  if (typeof msgObj.data !== "object")      return sendErr("Error: Parameter 'data' is not a object in JSON message");
  next();
}

// ── Issue #5/#75: Dashboard-WS → routes/dashboard-ws.js ─────────────────────
// Registriert via dashboardWsRouter (createDashboardWsRouter) — siehe oben.

// ────────────────────────────────────────────────────────────────────────────

app.ws("/api/chat", (ws, req) => {
  checkOrigin(ws, req, () => {
    const session = new ChatSession(ws, {
      chatRegistry, lockManager, generateDashboardToken,
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

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} Version: ${VERSION}`);
});
