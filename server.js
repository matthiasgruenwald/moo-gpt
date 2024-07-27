const VERSION = "1.4.0";

import axios from "axios";
import cheerio from "cheerio";
import express from "express";
import OpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import EventEmitter from "events";
import Showdown from "showdown";
import http from "http";
import https from "https";
import cors from "cors";
import { encode } from "querystring";
import moment from "moment";

const app = express();
const PORT = process.env.PORT || 3000;
const converter = new Showdown.Converter();

const CONFIG_DIR = "./config";
const CERT_FILE = `${CONFIG_DIR}/server.cert`;
const KEY_FILE = `${CONFIG_DIR}/server.key`;
let server;
var pendingFunctions = false;

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

function limitRequests(ws, req,message, next) {
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
    if (!origin.startsWith(process.env.ALLOWED_ORIGIN)) {
      const chatMsg = {
        end: true,
        messages: "Error: Origin not allowed",
      };
      ws.send(JSON.stringify(chatMsg));
      console.log("Origin not allowed");
      ws.close(1008, "Origin not allowed");
      return;
    }
  }
  next();
}

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

const oai = new OpenAI({
  apiKey: process.env.APIKEY,
});
var assistant = await oai.beta.assistants.retrieve(process.env.AID);

var resContent = "";

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

async function fetchAndExtract(url) {
  console.log("fetchAndExtract:", url);
  let result = "";

  const html = await fetchPage(url);
  //console.log('--html-->'+html+"<---");
  if (!html) return result;

  const links = extractLinks(html);
  console.log("Anzahl links:", links.length);
  var max = links.length;
  if (max > 2) max = 2;
  for (var i = 0; i < max; i++) {
    const absoluteLink = new URL(links[i], url).href;
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
  pendingFunctions = true;
  console.log("------- CALLING AN EXTERNAL API ----------");
  console.log("query", JSON.stringify(query));
  var encoded = encodeURIComponent(query);
  const url = "https://www.mmbbs.de/?s=" + encoded;
  const result = await fetchAndExtract(url); // Awaiting the result
  //console.log("\r\n\r\n-------------->" + result + "<---------------");
  return {
    tool_call_id: toolId,
    output: result,
  };
}

class EventHandler extends EventEmitter {
  constructor(client, ws, citations) {
    super();
    this.client = client;
    this.ws = ws;
    this.citations = citations;
    console.log("EventHandler constructor called");
  }

  async onEvent(event) {
    try {
      console.log("**" + event.event + "**");
      if (event.event === "thread.run.requires_action") {
        //console.log(event);
        const r = await this.handleRequiresAction(
          event.data,
          event.data.thread_id
        );
        //console.log("\r\nRun completed" + JSON.stringify(r, null, 2));
        if (r != undefined) {
          resContent = r[0].content[0].text.value;
          resContent = resContent.replace("\r\n\r\n", "\r\n");
          console.log("Antwort: " + resContent);
          chatMsg.messages = converter.makeHtml(resContent);
          chatMsg.end = true;
          pendingFunctions = false;
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
          resContent = resContent.replace("\r\n\r\n", "\r\n");
          chatMsg.messages = converter.makeHtml(resContent + citation);
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

      //console.log("toolOutputs:", JSON.stringify(toolOutputs));
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

var chatMsg = {
  end: false,
  messages: "",
};

var thread = undefined;
var settings = undefined;
app.ws("/api/chat", async (ws, req) => {
  checkOrigin(ws, req, () => {
    ws.on("message", (message) => {
      limitRequests(ws, req, message, () => {
        console.log("Message received:", message);
        try {
          var msgObj = JSON.parse(message);
          console.log("msgObj:", JSON.stringify(msgObj, null, 2));
          checkFormat(ws, msgObj, async () => {
            switch (msgObj.type) {
              case "settings":
                settings = msgObj.data;
                console.log("Settings received: " + JSON.stringify(settings));
                console.log("ws connection opened");
                thread = await oai.beta.threads.create();
                console.log("thread created" + thread.id);

                break;
              case "chatmsg":
                // Handle user typing notification
                if (msgObj.data.message === "about") {
                  resContent =
                    "**Version " +
                    VERSION +
                    "**\r\n\r\n 2024 by Dr. Jörg Tuttas.";
                  chatMsg.messages = converter.makeHtml(resContent);
                  chatMsg.end = true;
                  ws.send(JSON.stringify(chatMsg));
                  return;
                } else {
                  handleMsg(ws, thread, msgObj.data.message);
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

function handleMsg(ws, thread, userMessage) {
  console.log("handleMsg called " + thread.id);
  var citations = [];
  const eventHandler = new EventHandler(oai, ws, citations);
  eventHandler.on("event", eventHandler.onEvent.bind(eventHandler));

  var citationindex = 1;
  resContent = "";

  console.log("Message received:", userMessage);

  const msg = oai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: userMessage,
  });

  chatMsg = {
    end: false,
    messages: userMessage,
  };

  moment.locale("de");

  const now = moment();
  const dayName = now.format("dddd");
  const date = now.format("DD.MM.YYYY");
  const time = now.format("HH:mm");

  console.log(`Heute ist ${dayName}, der ${date} um ${time}`);

  const run = oai.beta.threads.runs
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
            citations.push(file_citation.file_id);
          }
          textDelta.value = " [" + citationindex + "] ";
          citationindex++;
        }
        resContent += textDelta.value;
      } else {
        resContent += textDelta.value;
      }
      resContent = resContent.replace("\r\n\r\n", "\r\n");
      chatMsg.messages = converter.makeHtml(resContent);
      ws.send(JSON.stringify(chatMsg));
    })
    .on("end", async () => {
      console.log("End event called: pendingFuntions=" + pendingFunctions);
      resContent = resContent.replace("sandbox:/mnt/data/", "storage/");
      resContent = resContent.replace("\r\n\r\n", "\r\n");
      if (!pendingFunctions) {
        console.log("Antwort: " + resContent);
        chatMsg.end = true;
        chatMsg.messages = converter.makeHtml(resContent);
        ws.send(JSON.stringify(chatMsg));
      }
    });
}

/*
  ws.on("connection", (ws,req) => {
    console.log("WS connection opened");
    const thread = oai.beta.threads.create();
    console.log("thread created");
  });
  ws.on("message", (message) => {
    console.log("Message received:", message);
    var citations = [];
    const eventHandler = new EventHandler(oai, ws, citations);
    eventHandler.on("event", eventHandler.onEvent.bind(eventHandler));

    var citationindex = 1;
    resContent = "";
    try {
      console.log("Message received:", message);
      const msgObj = JSON.parse(message);
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      var currentTime = new Date().toLocaleString();
      const userMessage = JSON.parse(message).message;
      console.log(`\r\nuserMessage ${ip} at ${currentTime}:`, userMessage);

      if (userMessage === "about") {
        resContent =
          "**Version " + VERSION + "**\r\n\r\n 2024 by Dr. Jörg Tuttas.";
        chatMsg.messages = converter.makeHtml(resContent);
        chatMsg.end = true;
        ws.send(JSON.stringify(chatMsg));
        return;
      }

      const msg = oai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userMessage,
      });

      chatMsg = {
        end: false,
        messages: userMessage,
      };

      moment.locale("de");

      const now = moment();
      const dayName = now.format("dddd");
      const date = now.format("DD.MM.YYYY");
      const time = now.format("HH:mm");

      console.log(`Heute ist ${dayName}, der ${date} um ${time}`);

      const run = oai.beta.threads.runs
        .stream(
          thread.id,
          {
            assistant_id: process.env.AID,
            instructions:
              assistant.instructions +
              `.Heute ist ${dayName}, der ${date} um ${time}`,
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
                citations.push(file_citation.file_id);
              }
              textDelta.value = " [" + citationindex + "] ";
              citationindex++;
            }
            resContent += textDelta.value;
          } else {
            resContent += textDelta.value;
          }
          chatMsg.messages = converter.makeHtml(resContent);
          ws.send(JSON.stringify(chatMsg));
        })
        .on("end", async () => {
          console.log("End event called: pendingFuntions=" + pendingFunctions);
          resContent = resContent.replace("sandbox:/mnt/data/", "storage/");
          resContent = resContent.replace("\r\n\r\n", "\r\n");
          if (!pendingFunctions) {
            console.log("Antwort: " + resContent);
            chatMsg.end = true;
            chatMsg.messages = converter.makeHtml(resContent);
            ws.send(JSON.stringify(chatMsg));
          }
        });
    } catch (error) {
      chatMsg.end = true;
      chatMsg.messages = "Error: " + error.message;

      ws.send(JSON.stringify(chatMsg));
      console.log("Error: ", error);
    }
  });
});
*/

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
