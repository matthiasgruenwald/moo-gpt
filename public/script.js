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

const ws = new WebSocket("ws:3000/api/chat");
var msgCount = 0;

ws.onmessage = function (event) {
  //document.getElementById("chat-log").value += event.data;
  const chatWindow = document.getElementById("chat-window");
  const chatInput = document.getElementById("chat-input");
  console.log('onmessage function called'+event.data);
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
    chatInput.disabled = true;
    document.getElementById("send-button").disabled = true;
  }
}

function handleKeyDown(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}
