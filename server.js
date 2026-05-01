const VERSION = "2.0.0";

import axios from "axios";
import cheerio from "cheerio";
import express from "express";
import OpenAI from "openai";
import AsyncOpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import EventEmitter from "events";
import http from "http";
import https from "https";
import cors from "cors";
import { encode } from "querystring";
import moment from "moment";
import { log } from "console";
import puppeteer from "puppeteer";
import { initDb, saveThread, saveMessage, findThread, touchThread, getMessages, getStudents, updateThreadName, upsertActivity, getActivityName } from "./db.js";
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

if (process.env.APIKEY === undefined) {
  console.error("API key is not set");
  process.exit(1);
}
if (process.env.AID === undefined) {
  console.error("Assistenten AID key is not set");
  process.exit(1);
}

const oai = new AsyncOpenAI({
  apiKey: process.env.APIKEY,
});
var assistant = await oai.beta.assistants.retrieve(process.env.AID);

// SQLite-DB initialisieren
initDb();

async function fetchPage(url) {
  console.log("fetchPage:", url);
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function extractText(html) {
  const $ = cheerio.load(html);
  // Entferne alle Skripte und Stile im .page-content Container
  $(".page-content script, .page-content style").remove();
  // Extrahiere den reinen Text aus dem .page-content Container
  return $(".page-content").text();
}

function extractLinks(html) {
  console.log("extractLinks");
  const $ = cheerio.load(html);
  const links = [];
  $(".page-content a").each((index, element) => {
    const href = $(element).attr("href");
    if (href) {
      links.push(href);
    }
  });
  return links;
}

async function fetchAndExtract(query) {
  console.log("fetchAndExtract:", query);

  var result = "";
  const browser = await puppeteer.launch({
    //executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    dumpio: true,
  });
  console.log('1');
  var page;
  try {
    page = await browser.newPage();
    console.log("2");
  } catch (error) {
    console.error("Error creating a new page:", error);
  }
  
  const searchQuery = query + " site:mmbbs.de";
  
  console.log('3');
  await page.goto("https://duckduckgo.com/");
  await page.type('input[name="q"]', searchQuery);
  await page.keyboard.press("Enter");

  console.log('los geht es');
  var results = [];
  try {
    // Warten, bis die Ergebnisse geladen sind. Hier verwenden wir den `.result__body` Selektor.
    console.log("Page loaded");

    await page.waitForSelector(".react-results--main", { timeout: 60000 });

    results = await page.evaluate(() => {
      let links = [];
      let items = document.querySelectorAll("a[data-testid='result-title-a']");
      for (let i = 0; i < 3; i++) {
        const url = items[i].href;
        if (!url.endsWith(".pdf")) {
          // Ausschluss von Links, die auf .pdf enden
          links.push(url);
        }
      }
      return links;
    });
    console.log(results);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }

  console.log("Anzahl links:", results.length);
  var max = results.length;
  if (max > 2) max = 2;
  for (var i = 0; i < max; i++) {
    console.log('Get Link Nr. ' + i + ': ' + results[i]);
    
    const absoluteLink = new URL(results[i], results[i]).href;
    console.log("Get Link Nr. " + i + ": Destination " + absoluteLink);
    const linkHtml = await fetchPage(absoluteLink);
    if (linkHtml) {
      const linkText = extractText(linkHtml);
      //console.log('linkText:', linkText);
      result += linkText;
      //result.push({ url: absoluteLink, text: linkText });
    }
    
  }

  return result;
}

/**
 * OpenAI function that query a webpage
 * 
 * {
  "name": "query_homepage",
  "description": "query the homepage to get actual informations",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The query for the homepage"
      }
    },
    "required": [
      "the query result"
    ]
  }
}
 * 
 */

async function query_homepage(toolId, query) {
  
  console.log("------- CALLING AN EXTERNAL API ----------");
  console.log("query", JSON.stringify(query));
  var encoded = encodeURIComponent(query);
  const url = "https://duckduckgo.com/" + query;
  const result = await fetchAndExtract(query); // Awaiting the result
  console.log("\r\n\r\n-------------->" + result + "<---------------");
  return {
    tool_call_id: toolId,
    output: result,
  };
}

class EventHandler extends EventEmitter {
  constructor(client, ws, citations, resContent) {
    super();
    this.client = client;
    this.ws = ws;
    this.citations = citations;
    this.resContent = resContent;
    this.pendingFunctions = false;

    console.log("EventHandler constructor called");
  }

  async onEvent(event) {
    try {
      var chatMsg = {
        end: false,
        messages: "",
      };

      console.log("**" + event.event + "**");
      if (event.event === "thread.run.requires_action") {
        //console.log(event);
        this.pendingFunctions = true;
        const r = await this.handleRequiresAction(
          event.data,
          event.data.thread_id
        );
        //console.log("\r\nRun completed" + JSON.stringify(r, null, 2));
        if (r != undefined) {
          this.resContent = r[0].content[0].text.value;
          this.resContent = this.resContent.replace("\r\n\r\n", "\r\n");
          console.log("Antwort: " + this.resContent);
          chatMsg.messages = this.resContent;
          chatMsg.end = true;
          this.pendingFunctions = false;
          this.ws.send(JSON.stringify(chatMsg));
        }
      } else if (event.event === "thread.message.completed") {
        var citation = "<br><br><b>Quelle(n):</b>&nbsp;";
        var num = 1;
        this.citations.forEach(async (file_id) => {
          const citedFile = await oai.files.retrieve(file_id);
          console.log("** Cited File **", JSON.stringify(citedFile));
          if (
            fs.existsSync(
              process.cwd() + "/public/storage/" + citedFile.filename
            )
          ) {
            citation +=
              '[<a class="reference" href=\'storage/' +
              citedFile.filename +
              "' target='_blank'>" +
              num +
              "</a>]";
          } else {
            citation += "[" + num + "]:" + citedFile.filename;
          }
          num++;
          this.resContent = this.resContent.replace("\r\n\r\n", "\r\n");
          chatMsg.messages = this.resContent + citation;
          this.ws.send(JSON.stringify(chatMsg));
        });
      } else if (event === "thread.run.textDelta") {
        console.log("text Delta event");
      }
    } catch (error) {
      console.error("Error handling event:", error);
    }
  }

  async handleRequiresAction(run, threadId) {
    //console.log("Run object:", JSON.stringify(run));
    //console.log("Required action:", JSON.stringify(run.required_action));
    try {
      //console.log("handleRequiresAction called:", JSON.stringify(run));
      if (!run.required_action || !run.required_action.submit_tool_outputs) {
        throw new Error("submit_tool_outputs not found in required_action");
      }

      const toolCalls =
        run.required_action.submit_tool_outputs.tool_calls || [];
      const toolOutputs = await Promise.all(
        toolCalls.map(async (toolCall) => {
          console.log("toolCall:", JSON.stringify(toolCall));
          if (toolCall.function.name === "query_homepage") {
            const args = JSON.parse(toolCall.function.arguments);
            const keyword = args.query;
            var results = await query_homepage(toolCall.id, keyword);
            //console.log('results:', JSON.stringify(results));
            return {
              tool_call_id: toolCall.id,
              output: results.output,
            };
          }
        })
      );

      console.log("toolOutputs:", JSON.stringify(toolOutputs));
      if (toolOutputs.length > 0) {
        const result = await oai.beta.threads.runs.submitToolOutputsAndPoll(
          threadId,
          run.id,
          { tool_outputs: toolOutputs }
        );
        console.log("Tool outputs submitted successfully.");
        return this.handleRunStatus(result, threadId);
      } else {
        console.log("No tool outputs to submit.");
      }
    } catch (error) {
      console.error("Error processing required action:", error);
    }
  }

  async handleRunStatus(run, threadId) {
    console.log("handleRunStatus called:");

    // Check if the run is completed
    if (run.status === "completed") {
      let messages = await oai.beta.threads.messages.list(threadId);
      //console.log("messages:", JSON.stringify(messages));
      return messages.data;
    } else if (run.status === "requires_action") {
      return await this.handleRequiresAction(run, threadId);
    } else {
      console.error("Run did not complete:", run);
    }
  }

  async submitToolOutputs(toolOutputs, runId, threadId) {
    try {
      console.log("submitToolOutputs called");
      const stream = oai.beta.threads.runs.submitToolOutputsStream(
        threadId,
        runId,
        { tool_outputs: toolOutputs }
      );
      for await (const event of stream) {
        this.emit("event", event);
      }
    } catch (error) {
      console.error("Error submitting tool outputs:", error);
    }
  }
}

// ── Issue #5: Teacher-Dashboard REST-Endpoints ──────────────────────────────

/** GET /api/dashboard/students?activityId=…&token=… */
app.get('/api/dashboard/students', (req, res) => {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { activityId, token } = req.query;
  if (!activityId || !token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Forbidden' });
  try {
    const students     = getStudents(activityId);
    const activityName = getActivityName(activityId);
    res.json({ students, activityName });
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
    const messages = getMessages(threadDbId);
    res.json({ student, messages });
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

  // Initialliste + Aufgabentitel senden
  try {
    const students     = getStudents(activityId);
    const activityName = getActivityName(activityId);
    ws.send(JSON.stringify({ type: 'students', data: students, activityName }));
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
        const messages = getMessages(threadDbId);
        ws.send(JSON.stringify({ type: 'messages', threadDbId, student, data: messages }));
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
    settings = {
      hints: "",
      task: "",
    };
    var thread = undefined;
    var settings = undefined;
    var run = undefined;
    var threadDbId = undefined;  // Issue #3: im äußeren Scope, damit chatmsg-Handler darauf zugreifen kann

    var eventHandler = undefined;

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
        var citations = [];
        var resContent = "";
        var chatMsg = {
          end: false,
          messages: "",
        };
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
                  // Client-Erkennung (editmode-Formular) ist primär; TEACHER_USER_IDS als optionaler Override
                  ws.isTeacher = settings.isTeacher === true || isTeacherByEnv;
                  console.log(`[Auth] isTeacher=${ws.isTeacher} (client=${settings.isTeacher}, env=${isTeacherByEnv})`);
                }

                // Issue #5: Aufgabentitel in DB speichern (kommt vom Lehrer oder Schüler)
                if (settings.activityId && settings.activityName) {
                  upsertActivity(settings.activityId, settings.activityName);
                }

                // Issue #5: Dashboard-Token für Lehrer erzeugen und zurückschicken
                if (ws.isTeacher && settings.activityId) {
                  const token = generateDashboardToken(settings.activityId, settings.userId);
                  ws.send(JSON.stringify({ type: 'dashboardToken', token, activityId: settings.activityId }));
                  console.log(`[Dashboard] Token für Lehrer ${settings.userId} / Aufgabe ${settings.activityId} erzeugt`);
                }

                // Issue #3: Bestehenden Thread suchen oder neuen anlegen
                let existingThreadRow = null;
                if (settings.userId && settings.activityId) {
                  existingThreadRow = findThread({ moodle_user_id: settings.userId, activity_id: settings.activityId });
                }
                if (existingThreadRow) {
                  try {
                    thread = await oai.beta.threads.retrieve(existingThreadRow.openai_thread_id);
                    threadDbId = existingThreadRow.id;
                    touchThread(threadDbId);
                    // Issue #5: Namen nachfüllen, falls er beim ersten Anlegen fehlte
                    if (!existingThreadRow.moodle_user_name && settings.userName) {
                      updateThreadName(threadDbId, settings.userName);
                      console.log(`[DB] Namen nachgefüllt: ${settings.userName} (db_id=${threadDbId})`);
                    }
                    console.log(`[DB] Bestehenden Thread wiederverwendet: ${thread.id} (db_id=${threadDbId})`);
                  } catch (e) {
                    console.warn(`[DB] Thread nicht mehr bei OpenAI (${existingThreadRow.openai_thread_id}), lege neuen an: ${e.message}`);
                    existingThreadRow = null;
                  }
                }
                if (!existingThreadRow) {
                  thread = await oai.beta.threads.create();
                  console.log("thread created: " + thread.id);
                  threadDbId = saveThread({
                    moodle_user_id:   settings.userId   || null,
                    moodle_user_name: settings.userName || null,
                    activity_id:      settings.activityId || null,
                    openai_thread_id: thread.id,
                  });
                  console.log(`[DB] Neuer Thread gespeichert, db_id=${threadDbId}`);
                }

                // Bilder aus der Aufgabenstellung als Thread-Message hinzufügen (nur bei neuem Thread)
                if (!existingThreadRow && settings.images && settings.images.length > 0) {
                  console.log(`Füge ${settings.images.length} Bild(er) zum Thread hinzu`);
                  const imageItems = [];
                  for (const img of settings.images) {
                    try {
                      const imgClean = img && typeof img === 'string' ? img.trim() : img;
                      let imageBuffer, mimeType;

                      if (imgClean && imgClean.startsWith('data:')) {
                        // Base64 data-URL → Buffer extrahieren
                        const mimeMatch = imgClean.match(/^data:([^;]+);base64,/);
                        mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                        const b64 = imgClean.replace(/^data:[^;]+;base64,/, '');
                        imageBuffer = Buffer.from(b64, 'base64');
                        console.log(`Base64-Bild empfangen (${mimeType}, ${imageBuffer.length} bytes)`);
                      } else {
                        // Normale URL - fetchen
                        const parsed = new URL(imgClean);
                        if (!['http:', 'https:'].includes(parsed.protocol)) {
                          console.log(`Bild übersprungen (ungültiges Protokoll): ${imgClean}`);
                          continue;
                        }
                        const res = await fetch(imgClean);
                        if (!res.ok) {
                          console.log(`Bild übersprungen (HTTP ${res.status}): ${imgClean}`);
                          continue;
                        }
                        mimeType = res.headers.get('content-type') || 'image/jpeg';
                        imageBuffer = Buffer.from(await res.arrayBuffer());
                        console.log(`URL-Bild geladen: ${imgClean} (${mimeType}, ${imageBuffer.length} bytes)`);
                      }

                      // Bild bei OpenAI hochladen (Assistants API unterstützt keine base64 data-URLs)
                      const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
                      const uploadedFile = await oai.files.create({
                        file: new File([imageBuffer], `image.${ext}`, { type: mimeType }),
                        purpose: 'vision',
                      });
                      imageItems.push({
                        type: "image_file",
                        image_file: { file_id: uploadedFile.id },
                      });
                      console.log(`Bild hochgeladen: file_id=${uploadedFile.id}`);
                    } catch (e) {
                      console.log(`Bild übersprungen (Fehler): ${e.message}`);
                    }
                  }
                  if (imageItems.length > 0) {
                    const imageContent = [
                      { type: "text", text: "Aufgabenstellung (enthält Bilder):" },
                      ...imageItems,
                    ];
                    await oai.beta.threads.messages.create(thread.id, {
                      role: "user",
                      content: imageContent,
                    });
                    console.log(`${imageItems.length} Bild(er) zum Thread hinzugefügt`);
                  } else {
                    console.log("Keine gültigen Bilder gefunden, übersprungen");
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

                eventHandler = new EventHandler(oai, ws, citations, resContent);
                eventHandler.on(
                  "event",
                  eventHandler.onEvent.bind(eventHandler)
                );
                break;
              case "chatmsg":
                // Thread noch nicht bereit (race condition)
                if (!thread) {
                  chatMsg.end = true;
                  chatMsg.messages = "⏳ Verbindung wird aufgebaut, bitte nochmal senden...";
                  ws.send(JSON.stringify(chatMsg));
                  return;
                }
                // Handle user typing notification
                if (msgObj.data.message === "about") {
                  var resContent =
                    "**Version " +
                    VERSION +
                    "**\r\n\r\n 2024 by Dr. Jörg Tuttas.";
                  chatMsg.messages = resContent;
                  chatMsg.end = true;
                  ws.send(JSON.stringify(chatMsg));
                  return;
                } else {
                  // Usernachricht in DB spiegeln (Issue #2)
                  if (threadDbId) {
                    saveMessage({ thread_db_id: threadDbId, role: 'user', content: msgObj.data.message });
                    // Issue #5: Lehrer-Dashboard live benachrichtigen
                    if (settings.activityId) {
                      notifyDashboard(settings.activityId, {
                        type:        'newMessage',
                        threadDbId,
                        userId:      settings.userId   || null,
                        userName:    settings.userName || null,
                        role:        'user',
                        content:     msgObj.data.message,
                        createdAt:   new Date().toISOString(),
                      });
                    }
                  }
                  handleMsg(
                    ws,
                    thread,
                    msgObj.data.message,
                    settings,
                    eventHandler,
                    run,
                    threadDbId
                  );
                }
                break;
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

async function handleMsg(ws, thread, userMessage, settings, eventHandler, run, threadDbId = null) {
  console.log("handleMsg called " + thread.id);

  var citationindex = 1;
  eventHandler.resContent = "";
  eventHandler.citations = [];

  console.log("Message received:", userMessage);

  const msg = oai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: userMessage,
  });

  var chatMsg = {
    end: false,
    messages: userMessage,
  };

  moment.locale("de");

  const now = moment();
  const dayName = now.format("dddd");
  const date = now.format("DD.MM.YYYY");
  const time = now.format("HH:mm");

  console.log(`Heute ist ${dayName}, der ${date} um ${time}`);
  //console.log("task=" + settings.task);

  if (run!=undefined) {
    console.log("run is defined");
    run.cancel();

  }

  const runs = await oai.beta.threads.runs.list(
    thread.id,
  );

  console.log("RUNS:"+JSON.stringify(runs));


  try {
    run = oai.beta.threads.runs
      .stream(
        thread.id,
        {
          assistant_id: process.env.AID,
          instructions:
            assistant.instructions +
            `.Heute ist ${dayName}, der ${date} um ${time}.` +
            settings.hints +
            settings.task,
        },
        eventHandler
      )
      .on("event", (event) => {
        eventHandler.emit("event", event);
      })
      .on("textDelta", async (textDelta, snapshot) => {
        if (textDelta.hasOwnProperty("annotations")) {
          for (let annotation of textDelta.annotations) {
            const { file_citation } = annotation;
            if (file_citation) {
              console.log("File Citation", file_citation.file_id);
              eventHandler.citations.push(file_citation.file_id);
            }
            textDelta.value = " [" + citationindex + "] ";
            citationindex++;
          }
          eventHandler.resContent += textDelta.value;
        } else {
          eventHandler.resContent += textDelta.value;
        }
        eventHandler.resContent = eventHandler.resContent.replace(
          "\r\n\r\n",
          "\r\n"
        );
        chatMsg.messages = eventHandler.resContent;
        ws.send(JSON.stringify(chatMsg));
      })
      .on("end", async () => {
        console.log("End event called: pendingFuntions=" + eventHandler.pendingFunctions);
        eventHandler.resContent = eventHandler.resContent.replace(
          "sandbox:/mnt/data/",
          "storage/"
        );
        eventHandler.resContent = eventHandler.resContent.replace(
          "\r\n\r\n",
          "\r\n"
        );

        if (!eventHandler.pendingFunctions) {
          console.log("Antwort: " + eventHandler.resContent);
          // Assistenten-Antwort in DB spiegeln (Issue #2)
          if (threadDbId) {
            saveMessage({ thread_db_id: threadDbId, role: 'assistant', content: eventHandler.resContent });
            // Issue #5: Lehrer-Dashboard live benachrichtigen
            if (settings.activityId) {
              notifyDashboard(settings.activityId, {
                type:      'newMessage',
                threadDbId,
                userId:    settings.userId   || null,
                userName:  settings.userName || null,
                role:      'assistant',
                content:   eventHandler.resContent,
                createdAt: new Date().toISOString(),
              });
            }
          }
          chatMsg.end = true;
          chatMsg.messages = eventHandler.resContent;
          ws.send(JSON.stringify(chatMsg));
        }
      })
      .on("error", (error) => {
        console.error("Error:", error);
      });
  } catch (error) {
    chatMsg.end = true;
    chatMsg.messages = "Error: " + error.message;
    ws.send(JSON.stringify(chatMsg));
    console.log("Error: ", error);
  }
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} Version: ${VERSION}`);
});
