const express = require("express");

const {
  getSupportedProviders
} = require("../services/providers");

const router = express.Router();

router.get("/", (request, response) => {
  response.json({
    providers: getSupportedProviders()
  });
});

module.exports = router;
