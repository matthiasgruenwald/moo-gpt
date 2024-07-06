import express from "express";
import OpenAI from "openai";
import config from "./config.json" assert { type: "json" };
import expressWs from "express-ws";

const app = express();
const PORT = process.env.PORT || 3000;
expressWs(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const oai = new OpenAI({
  apiKey: config.apikey,
});

app.ws("/api/chat", async (ws, req) => {
  ws.on("message", async (message) => {
    try {
      const userMessage = JSON.parse(message).message;
      console.log("userMessage", userMessage);
      console.log("Assistant ID", config.assistentid);

      const assistant = await oai.beta.assistants.retrieve(config.assistentid);
      const thread = await oai.beta.threads.create();
      const msg = await oai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userMessage,
      });

      var chatMsg = {
        end: false,
        messages: userMessage
      }

      console.log('chatMsg', JSON.stringify(chatMsg));

      const run = oai.beta.threads.runs
        .stream(thread.id, {
          assistant_id: config.assistentid,
        })
        .on("textDelta", (textDelta, snapshot) => {
          console.log('textDelta', textDelta.value);
          chatMsg.messages=textDelta.value
          ws.send(JSON.stringify(chatMsg));
        })
        .on("end", async () => {
          chatMsg.end = true;
          ws.send(JSON.stringify(chatMsg));
        });
    } catch (error) {
      ws.send("Error: " + error.message);
    }
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
