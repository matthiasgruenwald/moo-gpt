const VERSION = "3.0.0";

import express from "express";
import fs from "fs";
import expressWs from "express-ws";
import http from "http";
import https from "https";
import cors from "cors";
import { ChatSession } from "./chat-session.js";
import { oai, aiClient } from './ai-instance.js';
import { generateDashboardToken, checkOriginWs } from './auth-middleware.js';
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
import { createRateLimiter } from './rate-limiter.js';
import { initApp } from './app-init.js';

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

const limitRequests = createRateLimiter();

const dashboardRegistry = new ClientRegistry();
const chatRegistry      = new ClientRegistry();

const lockManager = new LockManager(chatRegistry, dashboardRegistry);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static("public"));
app.use('/graphify', express.static("graphify-out"));

// DB-Init + Admin-Seed + Config-Load (→ app-init.js)
initApp();

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

function checkFormat(ws, msgObj, next) {
  const sendErr = (msg) => { ws.send(JSON.stringify({ end: true, messages: msg })); console.log(msg); };
  if (!msgObj.hasOwnProperty("type"))       return sendErr("Error: Missing or wrong Parameter 'type' in JSON message");
  if (typeof msgObj.type !== "string")       return sendErr("Error: Parameter 'type' is not a string in JSON message");
  if (!msgObj.hasOwnProperty("data"))       return sendErr("Error: Missing or wrong Parameter 'data' in JSON message");
  if (typeof msgObj.data !== "object")      return sendErr("Error: Parameter 'data' is not a object in JSON message");
  next();
}

app.ws("/api/chat", (ws, req) => {
  checkOriginWs(ws, req, () => {
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
