const express = require("express");

const {
  getSupportedProviders
} = require("../watchers");

const router = express.Router();

router.get("/", (request, response) => {
  response.json({
    providers: getSupportedProviders()
  });
});

module.exports = router;
