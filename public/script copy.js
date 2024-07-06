const ws = new WebSocket("ws://localhost:3000/api/chat");

ws.onmessage = function (event) {
  document.getElementById("chat-log").value += event.data;
};

function sendMessage() {
  const message = document.getElementById("message").value;
  ws.send(JSON.stringify({ message: message }));
  document.getElementById("message").value = "";
}
