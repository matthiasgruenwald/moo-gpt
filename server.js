import express from "express";
import OpenAI from "openai";
import bodyParser from "body-parser";
import config from "./config.json" assert { type: "json" };
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const oai = new OpenAI({
  apiKey: config.apikey,
});

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;
  console.log("userMessage", userMessage);
  console.log('Assistent ID', config.assistentid);

  const assistant = await oai.beta.assistants.retrieve(config.assistentid);
  const thread = await oai.beta.threads.create();
  const message = await oai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: userMessage,
  });
  const run = oai.beta.threads.runs
    .stream(thread.id, {
      assistant_id: config.assistentid,
    })
    .on("textCreated", (text) => process.stdout.write("\nassistant > "))
    .on("textDelta", (textDelta, snapshot) =>
      process.stdout.write(textDelta.value)
    )
    .on("toolCallCreated", (toolCall) =>
      process.stdout.write(`\nassistant > ${toolCall.type}\n\n`)
    )
    .on("toolCallDelta", (toolCallDelta, snapshot) => {
      if (toolCallDelta.type === "code_interpreter") {
        if (toolCallDelta.code_interpreter.input) {
          process.stdout.write(toolCallDelta.code_interpreter.input);
        }
        if (toolCallDelta.code_interpreter.outputs) {
          process.stdout.write("\noutput >\n");
          toolCallDelta.code_interpreter.outputs.forEach((output) => {
            if (output.type === "logs") {
              process.stdout.write(`\n${output.logs}\n`);
            }
          });
        }
      }
    });

    res.json({ message: "I am GPT-4" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
