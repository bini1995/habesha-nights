const express = require("express");

const {
  loadEvents
} = require("../services/event-store");

const router = express.Router();

router.get("/", async (request, response) => {
  try {
    const events = await loadEvents();

    response.json({
      events
    });
  } catch (error) {
    response.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
