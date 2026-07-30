const express = require("express");

const {
  getState
} = require("../services/state");

const router = express.Router();

router.get("/", (request, response) => {
  response.json(getState());
});

module.exports = router;
