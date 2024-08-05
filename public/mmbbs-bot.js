export class MMBBSBOT {
  constructor(settings) {
    this.settings = settings;
    this.msgCount = 0;
    this.ws = null;
    this.init();
  }

  init() {
    this.createChatInterface();
    this.setupWebSocket();
  }

  createChatInterface() {
    // load css
    const head = document.querySelector("head");
    const css = document.createElement("link");
    css.href =
      this.settings.protocol +
      "://" +
      this.settings.host +
      ":" +
      this.settings.port +
      "/styles.css";
    css.rel = "stylesheet";
    head.appendChild(css);

    // Load external libraries
    this.loadExternalLibraries();

    // Create chat icon
    const chatIcon = document.createElement("div");
    const icon = this.settings.chat_icon
      ? this.settings.chat_icon
      : `${this.settings.protocol}://${this.settings.host}:${this.settings.port}/chat-icon.png`;
    //console.log("icon: ", icon);
    chatIcon.id = "chat-icon";
    chatIcon.className = "chat-icon";
    chatIcon.innerHTML = '<img src="' + icon + '" alt="Chat Icon">';
    chatIcon.onclick = this.toggleChat.bind(this);
    document.body.appendChild(chatIcon);

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.className = "chat-container";

    // Create chat header
    const chatHeader = document.createElement("div");
    const title = this.settings.title ? this.settings.title : "MMBbS GPT";

    chatHeader.className = "chat-header";
    chatHeader.innerHTML = `
            <div class="chat-header-icon-container">
                <img src="${icon}" alt="Chat Icon" class="chat-header-icon">
            </div>
            <h1>${title}</h1>
            <div class="header-icon" onclick="toggleChat()">
                <img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/close-icon.png" alt="Close Icon">
            </div>
        `;
    chatContainer.appendChild(chatHeader);

    // Create chat window
    const opener = this.settings.opener
      ? this.settings.opener
      : "Hallo, wie kann ich ihnen helfen?";
    const chatWindow = document.createElement("div");
    chatWindow.id = "chat-window";
    chatWindow.className = "chat-window";
    chatWindow.innerHTML = `
            <div class="message received">
                <p>${opener}</p>
            </div>
        `;
    chatContainer.appendChild(chatWindow);

    // Create input container
    const inputContainer = document.createElement("div");
    inputContainer.className = "input-container";
    inputContainer.innerHTML = `
            <input type="text" id="chat-input" placeholder="Geben Sie eine Nachricht ein..." onkeydown="handleKeyDown(event)">
            <button id="send-button" onclick="sendMessage()">Senden</button>
        `;
    chatContainer.appendChild(inputContainer);

    document.body.appendChild(chatContainer);

    // Make toggleChat, sendMessage, and handleKeyDown available globally
    window.toggleChat = this.toggleChat.bind(this);
    window.sendMessage = this.sendMessage.bind(this);
    window.handleKeyDown = this.handleKeyDown.bind(this);
  }

  loadExternalLibraries() {
    // Load KaTeX CSS
    const katexCss = document.createElement("link");
    katexCss.href =
      "https://cdn.jsdelivr.net/npm/katex@0.13.18/dist/katex.min.css";
    katexCss.rel = "stylesheet";
    document.head.appendChild(katexCss);

    // Load katex.js
    const katexScript = document.createElement("script");
    katexScript.src = "https://cdn.jsdelivr.net/npm/katex@0.13.18/dist/katex.min.js";
    document.head.appendChild(katexScript);

    const katexScript2 = document.createElement("script");
    katexScript2.src =
      "https://cdn.jsdelivr.net/npm/katex@0.13.18/dist/contrib/auto-render.min.js";
    document.head.appendChild(katexScript2);



    // Load Marked.js
    const markedScript = document.createElement("script");
    markedScript.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
    document.head.appendChild(markedScript);

    // Load Prism.js CSS
    const prismCss = document.createElement("link");
    prismCss.href =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/themes/prism.min.css";
    prismCss.rel = "stylesheet";
    document.head.appendChild(prismCss);

    // Load Prism.js Scripts
    const prismScript = document.createElement("script");
    prismScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/prism.min.js";
    document.head.appendChild(prismScript);

    const prismPythonScript = document.createElement("script");
    prismPythonScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/components/prism-python.min.js";
    document.head.appendChild(prismPythonScript);
    const prismJavaScript = document.createElement("script");
    prismJavaScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/components/prism-java.min.js";
    document.head.appendChild(prismJavaScript);
    const prismJsonScript = document.createElement("script");
    prismJsonScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/components/prism-json.min.js";
    document.head.appendChild(prismJsonScript);

    // Add more languages if needed
    // const prismAnotherLangScript = document.createElement("script");
    // prismAnotherLangScript.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/components/prism-<language>.min.js";
    // document.head.appendChild(prismAnotherLangScript);
  }

  setupWebSocket() {
    const host = this.settings.host || "localhost";
    const port =
      this.settings.port ||
      (window.location.protocol === "https:" ? "443" : "80");
    const protocol = this.settings.protocol === "https" ? "wss" : "ws";
    const wsUrl = `${protocol}://${host}:${port}/api/chat`;
    console.log("wsUrl: ", wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection established");

      var obj = { type: "settings", data: this.settings };

      // Das "setting"-Objekt als JSON-String senden
      try {
        this.ws.send(JSON.stringify(obj));
        console.log("Settings sent successfully!" + JSON.stringify(obj));
      } catch (error) {
        console.error("Send error:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.showConnectionLostMessage();
    };

    this.ws.onclose = () => {
      console.warn("WebSocket connection closed");
      this.showConnectionLostMessage();
    };

    this.ws.onmessage = (event) => {
      if (event.end == true) {
        console.log("onmessage function called" + JSON.stringify(event.data));
      }

      const chatWindow = document.getElementById("chat-window");
      const chatInput = document.getElementById("chat-input");

      try {
        const messageObj = JSON.parse(event.data);
        var messageText = messageObj.messages;

        // Ersetzen von \[ durch $$
        messageText = messageText.replace(/\\\[/g, "$$$");
        // Ersetzen von \] durch $$
        messageText = messageText.replace(/\\\]/g, "$$$");
        // Ersetzen von \( durch $
        messageText = messageText.replace(/\\\(/g, "$");
        // Ersetzen von \) durch $#
        messageText = messageText.replace(/\\\)/g, "$#");
        // Markdown in HTML umwandeln
        //const htmlContent = marked.parse(messageText);
        if (this.msgCount == 0) {
          const loading = document.getElementById("loading");
          if (loading) {
            chatWindow.removeChild(loading);
          }

          const message = document.createElement("div");
          message.className = "message received";
          message.innerHTML = `${htmlContent}`;
          chatWindow.appendChild(message);
          var mathDiv = message;
          renderMathInElement(mathDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        } else {
          const lastReceivedMessage = chatWindow.querySelector(
            ".message.received:last-child"
          );
          lastReceivedMessage.innerHTML = `${htmlContent}`;
          var mathDiv = lastReceivedMessage;
          renderMathInElement(mathDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        }
        this.msgCount += 1;

        // Syntax-Highlighting anwenden
        Prism.highlightAll();

        if (messageObj.end == true) {
          chatInput.disabled = false;
          chatInput.focus();
          document.getElementById("send-button").disabled = false;
        }
        chatWindow.scrollTop = chatWindow.scrollHeight;
      } catch (error) {
        console.log("Error parsing JSON message:", error);
      }
    };
  }

  sendMessage() {
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const messageText = chatInput.value;
    const sendButton = document.getElementById("send-button");

    if (messageText.trim() !== "") {
      const message = document.createElement("div");
      message.className = "message sent";
      message.innerHTML = `<p>${messageText}</p>`;
      chatWindow.appendChild(message);
      chatInput.value = "";
      this.ws.send(
        JSON.stringify({ type: "chatmsg", data: { message: messageText } })
      );

      const loading = document.createElement("div");
      loading.className = "message_loading";
      loading.id = "loading";
      loading.innerHTML = `<img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/loading.gif" alt="Loading...">`;
      chatWindow.appendChild(loading);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      this.msgCount = 0;

      chatInput.disabled = true;
      sendButton.disabled = true;
    }
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      this.sendMessage();
    }
  }

  toggleChat() {
    const chatContainer = document.getElementById("chat-container");
    const chatIcon = document.getElementById("chat-icon");

    if (
      chatContainer.style.display === "none" ||
      chatContainer.style.display === ""
    ) {
      chatContainer.style.display = "flex";
      chatIcon.style.display = "none";
    } else {
      chatContainer.style.display = "none";
      chatIcon.style.display = "block";
    }
  }

  showConnectionLostMessage() {
    const inputContainer = document.querySelector(".input-container");
    inputContainer.innerHTML =
      '<div class="connection-lost">Connection lost</div>';
  }
}
