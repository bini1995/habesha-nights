const express = require("express");

const {
  SPORTS
} = require("./domain/sports");

const {
  DEFAULT_RULES,
  SCORING_VERSION,
  scoreStatLine
} = require("./domain/scoring");

const {
  createLeague
} = require("./domain/league");

function createSportsHubRouter() {
  const router = express.Router();

  router.get("/", (request, response) => {
    response.json({
      product: "AI Sports & Fantasy Hub",
      status: "foundation",
      sports: SPORTS,
      scoringVersion: SCORING_VERSION,
      capabilities: [
        "DETERMINISTIC_SCORING",
        "MINI_LEAGUE_VALIDATION"
      ]
    });
  });

  router.get("/scoring-rules", (request, response) => {
    response.json({
      version: SCORING_VERSION,
      rules: DEFAULT_RULES
    });
  });

  router.post("/score", (request, response) => {
    try {
      response.json({
        score: scoreStatLine(request.body)
      });
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  router.post("/leagues/validate", (request, response) => {
    try {
      response.json({
        league: createLeague(request.body)
      });
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createSportsHubRouter
};
