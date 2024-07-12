
const VERSION="1.0.2"

import express from "express";
import OpenAI from "openai";
import fs from "fs";
import expressWs from "express-ws";
import EventEmitter from "events";
import Showdown from "showdown";
import { log } from "console";

const app = express();
const PORT = process.env.PORT || 3000;
expressWs(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
const converter = new Showdown.Converter();

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
      //console.log(event.event);
      // Retrieve events that are denoted with 'requires_action'
      // since these will have our tool_calls
      if (event.event === "thread.run.requires_action") {
        console.log(event);
        await this.handleRequiresAction(
          event.data,
          event.data.id,
          event.data.thread_id
        );
      } else if (event.event === "thread.message.completed") {
        //console.log("Thread Message completed!! Add citization to the message");

        var citation = "<br><br><b>Quelle(n):</b>&nbsp;";
        var num = 1;
        this.citations.forEach(async (file_id) => {
          const citedFile = await oai.files.retrieve(file_id);
          console.log("** Cited File **", JSON.stringify(citedFile));
          //console.log(process.cwd());
          if (fs.existsSync(process.cwd()+ "/public/storage/" + citedFile.filename)) {
            //console.log("Die Datei existiert.");
            citation +=
              "[<a href='storage/" +
              citedFile.filename +
              "' target='_blank'>" +
              num +
              "</a>]";
          } else {
            //console.log("Die Datei existiert nicht.");
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
      // Submit all the tool outputs at the same time
      await this.submitToolOutputs(toolOutputs, runId, threadId);
    } catch (error) {
      console.error("Error processing required action:", error);
    }
  }

  async submitToolOutputs(toolOutputs, runId, threadId) {
    try {
      console.log("submitToolOutputs called");
      // Use the submitToolOutputsStream helper
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
  // Extract IP address and get current time
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

      const msgObj = JSON.parse(message);
      if (!msgObj.hasOwnProperty("end")) {
        ws.send("Error: Missing or wrong Parameter 'end' in JSON message");
        console.log("Error: Missing or wrong Parameter 'end' in JSON message");
        return;
      } else if (typeof msgObj.end !== "boolean") {
        ws.send("Error: Parameter 'end' is not a boolean in JSON message");
        console.log("Error: Parameter 'end' is not a boolean in JSON message");
        return;
      }
      if (!msgObj.hasOwnProperty("messages")) {
        ws.send("Error: Missing or wrong Parameter 'messages' in JSON message");
        console.log(
          "Error: Missing or wrong Parameter 'messages' in JSON message"
        );
        return;
      } else if (typeof msgObj.messages !== "string") {
        ws.send("Error: Parameter 'messages' is not a string in JSON message");
        console.log(
          "Error: Parameter 'messages' is not a string in JSON message"
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

      //console.log("chatMsg", JSON.stringify(chatMsg));

      const run = oai.beta.threads.runs
        .stream(
          thread.id,
          {
            assistant_id: process.env.AID,
          },
          eventHandler
        )
        .on("event", (event) => {
          // console.log("event", event.event);
          eventHandler.emit("event", event);
        })
        .on("textDelta", async (textDelta, snapshot) => {
          if (textDelta.hasOwnProperty("annotations")) {
            //console.log("textDelta", JSON.stringify(textDelta));
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
          //console.log("textDelta =>", textDelta.value);
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

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
