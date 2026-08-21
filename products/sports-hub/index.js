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
const { createImportStore } = require("./services/import-store");
const { createAnalysisStore } = require("./services/analysis-store");
const { createImportService } = require("./services/import-service");
const { createAnalysisService } = require("./services/analysis-service");
const { IMPORT_SCHEMA_VERSION } = require("./domain/import-schema");
const footballSample = require("./fixtures/football-team.json");
const basketballSample = require("./fixtures/basketball-team.json");
const soccerSample = require("./fixtures/soccer-team.json");

function createSportsHubRouter({
  teamStore = createTeamStore(),
  entitlementService = createEntitlementService(),
  importStore = createImportStore(),
  analysisStore = createAnalysisStore(),
  now = () => new Date()
} = {}) {
  const router = express.Router();
  const importService = createImportService({ teamStore, importStore, now });
  const analysisService = createAnalysisService({ analysisStore, entitlementService, now });

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
        "LOCAL_TEAM_PERSISTENCE",
        "CSV_JSON_IMPORT",
        "ANALYSIS_PROVENANCE"
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
    if (sport === "SOCCER") return response.json(soccerSample);
    return response.status(404).json({ error: "Sample sport not found." });
  });

  router.get("/import/templates/:format", (request, response) => {
    const format = String(request.params.format).toLowerCase();
    if (format === "json") {
      const template = require("./fixtures/import-basketball.json");
      response.setHeader("content-disposition", 'attachment; filename="sports-hub-import.json"');
      return response.type("application/json").send(`${JSON.stringify(template, null, 2)}\n`);
    }
    if (format === "csv") {
      const template = require("fs").readFileSync(require("path").join(__dirname, "fixtures", "import-football.csv"), "utf8");
      response.setHeader("content-disposition", 'attachment; filename="sports-hub-import.csv"');
      return response.type("text/csv").send(template);
    }
    return response.status(404).json({ error: "Template format not found." });
  });

  router.post("/imports/preview", (request, response) => {
    try { response.json({ preview: importService.preview(request.body) }); }
    catch (error) { response.status(400).json({ error: error.message }); }
  });

  router.post("/imports/confirm", async (request, response) => {
    try { response.status(201).json({ import: await importService.confirm(request.body) }); }
    catch (error) { response.status(/already exists/.test(error.message) ? 409 : 400).json({ error: error.message }); }
  });

  router.get("/imports", async (request, response) => {
    try { const imports = await importStore.list(); response.json({ count: imports.length, imports: imports.map(({ snapshot, ...metadata }) => metadata) }); }
    catch (error) { response.status(500).json({ error: error.message }); }
  });

  router.get("/imports/:importId", async (request, response) => {
    try { const record = await importStore.get(request.params.importId); if (!record) return response.status(404).json({ error: "Import not found." }); response.json({ import: record }); }
    catch (error) { response.status(500).json({ error: error.message }); }
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
      response.json(await analysisService.analyze({ team, availablePlayers: request.body?.availablePlayers ?? [] }));
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.post("/teams/:teamId/reanalyze", async (request, response) => {
    try {
      const record = await importStore.get(request.body?.importId);
      if (!record || record.teamId !== request.params.teamId) return response.status(404).json({ error: "Import snapshot not found for this team." });
      response.json(await analysisService.analyze({ team: record.snapshot.team, availablePlayers: record.snapshot.availablePlayers, importRecord: record }));
    } catch (error) { response.status(400).json({ error: error.message }); }
  });

  return router;
}

module.exports = {
  createSportsHubRouter
};
