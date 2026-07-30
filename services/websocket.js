const WebSocket = require("ws");

let wss = null;

function initialize(server) {
  wss = new WebSocket.Server({
    server
  });

  wss.on("connection", () => {
    console.log("WebSocket client connected.");
  });
}

function broadcast(type, payload) {
  if (!wss) {
    return;
  }

  const message = JSON.stringify({
    type,
    payload
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

module.exports = {
  initialize,
  broadcast
};
