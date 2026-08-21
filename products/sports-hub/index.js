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

const { analyzeTeam, recommendImprovements, TEAM_SCORE_VERSION } = require("./domain/team-analysis");
const { createTeamStore } = require("./services/team-store");
const { createEntitlementService } = require("./services/entitlements");
const footballSample = require("./fixtures/football-team.json");
const basketballSample = require("./fixtures/basketball-team.json");

function createSportsHubRouter({
  teamStore = createTeamStore(),
  entitlementService = createEntitlementService()
} = {}) {
  const router = express.Router();

  router.get("/", (request, response) => {
    response.json({
      product: "AI Sports & Fantasy Hub",
      status: "foundation",
      sports: SPORTS,
      scoringVersion: SCORING_VERSION,
      teamScoreVersion: TEAM_SCORE_VERSION,
      capabilities: [
        "DETERMINISTIC_SCORING",
        "MINI_LEAGUE_VALIDATION",
        "TEAM_ANALYZER",
        "LOCAL_TEAM_PERSISTENCE"
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

  router.get("/samples/:sport", (request, response) => {
    const sport = String(request.params.sport).toUpperCase();
    if (sport === "FOOTBALL") return response.json(footballSample);
    if (sport === "BASKETBALL") return response.json(basketballSample);
    return response.status(404).json({ error: "Sample sport not found." });
  });

  router.get("/teams", async (request, response) => {
    try {
      const teams = await teamStore.list();
      response.json({ count: teams.length, teams });
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  router.post("/teams", async (request, response) => {
    try {
      const team = await teamStore.save(request.body);
      response.status(201).json({ team });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.get("/teams/:teamId", async (request, response) => {
    try {
      const team = await teamStore.get(request.params.teamId);
      if (!team) return response.status(404).json({ error: "Team not found." });
      response.json({ team });
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  router.post("/teams/:teamId/analyze", async (request, response) => {
    try {
      const team = await teamStore.get(request.params.teamId);
      if (!team) return response.status(404).json({ error: "Team not found." });
      const analysis = analyzeTeam(team);
      const allRecommendations = recommendImprovements(team, request.body?.availablePlayers ?? []);
      const entitlement = await entitlementService.getEntitlement(team.profileId);
      const recommendations = entitlementService.applyRecommendationEntitlement(allRecommendations, entitlement);
      response.json({ analysis, entitlement: recommendations.tier, recommendations: recommendations.recommendations, lockedRecommendationCount: recommendations.lockedRecommendationCount });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createSportsHubRouter
};
