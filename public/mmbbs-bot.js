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
    css.href = this.settings.protocol + "://" + this.settings.host + ":" + this.settings.port + "/styles.css";
    css.rel = "stylesheet";
    head.appendChild(css);

    // Create chat icon
    const chatIcon = document.createElement("div");
    chatIcon.id = "chat-icon";
    chatIcon.className = "chat-icon";
    chatIcon.innerHTML =
      '<img src="' +
      this.settings.protocol +
      "://" +
      this.settings.host +
      ":" +
      this.settings.port +
      '/chat-icon.png" alt="Chat Icon">';
    chatIcon.onclick = this.toggleChat.bind(this);
    document.body.appendChild(chatIcon);

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.className = "chat-container";

    // Create chat header
    const chatHeader = document.createElement("div");
    chatHeader.className = "chat-header";
    chatHeader.innerHTML = `
            <div class="chat-header-icon-container">
                <img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/chat-icon.png" alt="Chat Icon" class="chat-header-icon">
            </div>
            <h1>MMBbS GPT</h1>
            <div class="header-icon" onclick="toggleChat()">
                <img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/close-icon.png" alt="Close Icon">
            </div>
        `;
    chatContainer.appendChild(chatHeader);

    // Create chat window
    const chatWindow = document.createElement("div");
    chatWindow.id = "chat-window";
    chatWindow.className = "chat-window";
    chatWindow.innerHTML = `
            <div class="message received">
                <p>Hallo, wie kann ich ihnen helfen?</p>
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

  setupWebSocket() {
    const host = this.settings.host || "localhost";
    const port =
      this.settings.port ||
      (window.location.protocol === "https:" ? "443" : "80");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${host}:${port}/api/chat`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection established");
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
        const messageText = messageObj.messages;

        if (this.msgCount == 0) {
          const loading = document.getElementById("loading");
          if (loading) {
            chatWindow.removeChild(loading);
          }

          const message = document.createElement("div");
          message.className = "message received";
          message.innerHTML = `${messageText}`;
          chatWindow.appendChild(message);
        } else {
          const lastReceivedMessage = chatWindow.querySelector(
            ".message.received:last-child"
          );
          lastReceivedMessage.innerHTML = `${messageText}`;
        }
        this.msgCount += 1;

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
      this.ws.send(JSON.stringify({ message: messageText }));

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
