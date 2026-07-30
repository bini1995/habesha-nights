const express = require("express");
const { broadcast } = require("../services/websocket");

const router = express.Router();

router.post("/event", (req, res) => {
  const event = {
    type: "TEST_EVENT",
    title: "Test Event",
    message: "WebSocket is working!",
    timestamp: new Date().toISOString()
  };

  broadcast("event", event);

  res.json({
    success: true
  });
});

module.exports = router;
