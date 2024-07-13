const VERSION = "1.1.0";

import express from "express";
import OpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import EventEmitter from "events";
import Showdown from "showdown";
import http from "http";
import https from "https";

const app = express();
const PORT = process.env.PORT || 3000;
const converter = new Showdown.Converter();

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

var resContent = "";

async function getSearchResult(query) {
  console.log("------- CALLING AN EXTERNAL API ----------");
  console.log("query", JSON.stringify(query));
  return JSON.stringify({
    data: "Mein Leiblingslehrer",
  });
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
      if (event.event === "thread.run.requires_action") {
        console.log(event);
        await this.handleRequiresAction(
          event.data,
          event.data.id,
          event.data.thread_id
        );
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
              "[<a href='storage/" +
              citedFile.filename +
              "' target='_blank'>" +
              num +
              "</a>]";
          } else {
            citation += "[" + num + "]:" + citedFile.filename;
          }
          num++;
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

  async handleRequiresAction(data, runId, threadId) {
    try {
      console.log("handleRequiresAction called");
      const toolOutputs =
        data.required_action.submit_tool_outputs.tool_calls.map((toolCall) => {
          if (toolCall.function.name === "getSearchResult") {
            return {
              tool_call_id: toolCall.id,
              output: "57",
            };
          }
        });
      await this.submitToolOutputs(toolOutputs, runId, threadId);
    } catch (error) {
      console.error("Error processing required action:", error);
    }
  }

  async submitToolOutputs(toolOutputs, runId, threadId) {
    try {
      console.log("submitToolOutputs called");
      const stream = this.client.beta.threads.runs.submitToolOutputsStream(
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

const assistant = await oai.beta.assistants.retrieve(process.env.AID);

var chatMsg = {
  end: false,
  messages: "",
};

app.ws("/api/chat", async (ws, req) => {
  const origin = req.headers.origin;
  console.log("origin", origin);
  if (process.env.ALLOWED_ORIGIN != undefined) {
    if (process.env.ALLOWED_ORIGIN && origin !== process.env.ALLOWED_ORIGIN) {
      console.log("Origin not allowed");
      ws.close();
      return;
    }
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  var currentTime = new Date().toLocaleString();
  console.log(`New WS connection from IP: ${ip} at ${currentTime}`);

  const thread = await oai.beta.threads.create();
  console.log("thread created");
  ws.on("message", async (message) => {
    var citations = [];
    const eventHandler = new EventHandler(oai, ws, citations);
    eventHandler.on("event", eventHandler.onEvent.bind(eventHandler));

    var citationindex = 1;
    resContent = "";
    try {
      console.log("Message received:", message);
      const msgObj = JSON.parse(message);

      if (!msgObj.hasOwnProperty("message")) {
        ws.send("Error: Missing or wrong Parameter 'messages' in JSON message");
        console.log(
          "Error: Missing or wrong Parameter 'message' in JSON message"
        );
        return;
      } else if (typeof msgObj.message !== "string") {
        ws.send("Error: Parameter 'messages' is not a string in JSON message");
        console.log(
          "Error: Parameter 'message' is not a string in JSON message"
        );
        return;
      }

      currentTime = new Date().toLocaleString();
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

      const msg = await oai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userMessage,
      });

      chatMsg = {
        end: false,
        messages: userMessage,
      };

      const run = oai.beta.threads.runs
        .stream(
          thread.id,
          {
            assistant_id: process.env.AID,
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
          resContent = resContent.replace("sandbox:/mnt/data/", "storage/");
          chatMsg.messages = converter.makeHtml(resContent);
          chatMsg.end = true;
          ws.send(JSON.stringify(chatMsg));
          console.log("End event called:" + resContent);
        });
    } catch (error) {
      ws.send("Error: " + error.message);
      console.log("Error: ", error);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
