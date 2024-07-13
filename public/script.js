function toggleChat() {
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

const host = window.location.hostname;
const port = window.location.port
  ? window.location.port
  : window.location.protocol === "https:"
  ? "443"
  : "80";
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${host}:${port}/api/chat`;
console.log(wsUrl);



const ws = new WebSocket(wsUrl);
//const ws = new WebSocket("ws://localhost:3000/api/chat");
var msgCount = 0;

function showConnectionLostMessage() {
  const inputContainer = document.querySelector(".input-container");
  inputContainer.innerHTML =
    '<div class="connection-lost">Connection lost</div>';
}

 ws.onopen = function () {
   console.log("WebSocket connection established");
 };

 ws.onerror = function (error) {
   console.error("WebSocket error:", error);
   showConnectionLostMessage();
 };

 ws.onclose = function () {
   console.warn("WebSocket connection closed");
   showConnectionLostMessage();
 };

ws.onmessage = function (event) {
  //console.log('onmessage function called' + JSON.stringify(event));
  //document.getElementById("chat-log").value += event.data;
  const chatWindow = document.getElementById("chat-window");
  const chatInput = document.getElementById("chat-input");
  const messageObj = JSON.parse(event.data);
  const messageText = messageObj.messages;

  if (msgCount == 0) {
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
  msgCount += 1;

  if (messageObj.end==true) {
    chatInput.disabled = false;
    chatInput.focus();
    document.getElementById("send-button").disabled = false;
  
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;

};


function sendMessage() {
  //console.log('sendMessage function called');
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
    ws.send(JSON.stringify({ message: messageText }));
    // Füge ein loading.gif hinzu
    const loading = document.createElement("div");
    loading.className = "message_loading";
    loading.id = "loading";
    loading.innerHTML = `<img src="loading.gif" alt="Loading...">`;
    chatWindow.appendChild(loading);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    msgCount = 0;

    // Deaktivieren Sie das Eingabefeld und den Sende-Button
    chatInput.disabled = true;
    sendButton.disabled = true;
  }
}

function handleKeyDown(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}

// Globale Funktionen verfügbar machen
  window.toggleChat = toggleChat;
  window.sendMessage = sendMessage;
  window.handleKeyDown = handleKeyDown;