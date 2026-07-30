const express = require("express");
const healthRouter = require("../routes/health");

const router = express.Router();

router.get("/", (request, response) => {
  response.json({
    status: "ok",
    service: "nyc-opportunity-agent",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;