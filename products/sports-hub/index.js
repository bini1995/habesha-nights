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
const { createCheckInStore } = require("./services/check-in-store");
const { createMiniLeagueStore } = require("./services/mini-league-store");
const { createImportService } = require("./services/import-service");
const { createAnalysisService } = require("./services/analysis-service");
const {
  CheckInNotFoundError,
  createCheckInService
} = require("./services/check-in-service");
const {
  MiniLeagueConflictError,
  MiniLeagueNotFoundError,
  MiniLeagueValidationError,
  createMiniLeagueService
} = require("./services/mini-league-service");
const {
  createPlayerIdentityService
} = require("./services/player-identity-service");
const {
  PlayerDataCapabilityError,
  createPlayerDataPreviewService
} = require("./services/player-data-preview-service");
const {
  RosterImageConfigurationError,
  RosterImageUpstreamError,
  RosterImageValidationError,
  createRosterImageParser
} = require("./services/roster-image-parser");
const { IMPORT_SCHEMA_VERSION } = require("./domain/import-schema");
const footballSample = require("./fixtures/football-team.json");
const basketballSample = require("./fixtures/basketball-team.json");
const soccerSample = require("./fixtures/soccer-team.json");

function createSportsHubRouter({
  teamStore = createTeamStore(),
  entitlementService = createEntitlementService(),
  importStore = createImportStore(),
  analysisStore = createAnalysisStore(),
  checkInStore = createCheckInStore(),
  miniLeagueStore = createMiniLeagueStore(),
  rosterImageParser = createRosterImageParser(),
  playerIdentityService = createPlayerIdentityService(),
  playerDataPreviewService = createPlayerDataPreviewService(),
  now = () => new Date()
} = {}) {
  const router = express.Router();
  const importService = createImportService({ teamStore, importStore, now });
  const analysisService = createAnalysisService({ analysisStore, entitlementService, now });
  const checkInService = createCheckInService({
    analysisStore,
    checkInStore,
    now
  });
  const miniLeagueService = createMiniLeagueService({
    miniLeagueStore,
    teamStore,
    now
  });
  const rosterImageRequests = new Map();

  function allowRosterImageRequest(request) {
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    const currentTime = now().getTime();
    const recent = (rosterImageRequests.get(key) ?? [])
      .filter((timestamp) => currentTime - timestamp < 60_000);

    if (recent.length >= 5) return false;

    recent.push(currentTime);
    rosterImageRequests.set(key, recent);
    return true;
  }

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
        "ANALYSIS_PROVENANCE",
        "SAVED_TEAM_CHECK_INS",
        "TEAM_PROGRESS_HISTORY",
        "LOCAL_MINI_LEAGUES",
        "DETERMINISTIC_MATCHUPS",
        "OFFICIAL_POINT_STANDINGS",
        "ROSTER_IMAGE_EXTRACTION",
        "PLAYER_IDENTITY_RESOLUTION",
        "READ_ONLY_PLAYER_DATA_PREVIEW",
        "LIVE_PLAYER_DATA_PROVIDER_BOUNDARY"
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

  function sendMiniLeagueError(response, error) {
    if (error instanceof MiniLeagueValidationError) {
      return response.status(400).json({ error: error.message });
    }
    if (error instanceof MiniLeagueNotFoundError) {
      return response.status(404).json({ error: error.message });
    }
    if (error instanceof MiniLeagueConflictError) {
      return response.status(409).json({ error: error.message });
    }
    return response.status(500).json({ error: "Mini-league request failed." });
  }

  router.get("/mini-leagues", async (request, response) => {
    try {
      const leagues = await miniLeagueService.list();
      response.json({ count: leagues.length, leagues });
    } catch (error) {
      sendMiniLeagueError(response, error);
    }
  });

  router.post("/mini-leagues", async (request, response) => {
    try {
      response.status(201).json(await miniLeagueService.create(request.body));
    } catch (error) {
      sendMiniLeagueError(response, error);
    }
  });

  router.post("/mini-leagues/join", async (request, response) => {
    try {
      response.status(201).json({
        league: await miniLeagueService.join(request.body)
      });
    } catch (error) {
      sendMiniLeagueError(response, error);
    }
  });

  router.get("/mini-leagues/:leagueId", async (request, response) => {
    try {
      response.json({
        league: await miniLeagueService.get(request.params.leagueId)
      });
    } catch (error) {
      sendMiniLeagueError(response, error);
    }
  });

  router.put("/mini-leagues/:leagueId/matchups/:matchupId/score", async (request, response) => {
    try {
      response.json({
        league: await miniLeagueService.recordScore({
          leagueId: request.params.leagueId,
          matchupId: request.params.matchupId,
          homePoints: request.body?.homePoints,
          awayPoints: request.body?.awayPoints
        })
      });
    } catch (error) {
      sendMiniLeagueError(response, error);
    }
  });

  router.get("/samples/:sport", (request, response) => {
    const sport = String(request.params.sport).toUpperCase();
    if (sport === "FOOTBALL") return response.json(footballSample);
    if (sport === "BASKETBALL") return response.json(basketballSample);
    if (sport === "SOCCER") return response.json(soccerSample);
    return response.status(404).json({ error: "Sample sport not found." });
  });

  router.get("/roster-images/status", (request, response) => {
    response.json(rosterImageParser.status());
  });

  router.get("/player-identities/status", (request, response) => {
    response.json(playerIdentityService.status());
  });

  router.post("/player-identities/resolve", async (request, response) => {
    try {
      response.json(await playerIdentityService.resolveRoster(request.body));
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  router.get("/player-data/status", (request, response) => {
    response.json(playerDataPreviewService.status());
  });

  router.post("/roster-images/parse", async (request, response) => {
    if (!allowRosterImageRequest(request)) {
      return response.status(429).json({
        error: "Too many roster scans. Wait a minute and try again."
      });
    }

    try {
      const result = await rosterImageParser.parse(request.body);
      response.json(result);
    } catch (error) {
      if (error instanceof RosterImageValidationError) {
        return response.status(400).json({ error: error.message });
      }

      if (error instanceof RosterImageConfigurationError) {
        return response.status(503).json({ error: error.message });
      }

      if (error instanceof RosterImageUpstreamError) {
        return response.status(502).json({ error: error.message });
      }

      response.status(500).json({
        error: "Roster screenshot scanning failed."
      });
    }
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

  router.post("/teams/:teamId/player-data/preview", async (request, response) => {
    try {
      const team = await teamStore.get(request.params.teamId);
      if (!team) return response.status(404).json({ error: "Team not found." });
      response.json(await playerDataPreviewService.previewTeam(team));
    } catch (error) {
      if (error instanceof PlayerDataCapabilityError) {
        return response.status(409).json({ error: error.message });
      }
      response.status(400).json({ error: error.message });
    }
  });

  router.get("/teams/:teamId/check-ins", async (request, response) => {
    try {
      const team = await teamStore.get(request.params.teamId);
      if (!team) return response.status(404).json({ error: "Team not found." });
      const timeline = await checkInService.timeline(team.id, team.profileId);
      response.json({
        count: timeline.length,
        team,
        timeline
      });
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  router.post("/teams/:teamId/check-ins", async (request, response) => {
    try {
      const team = await teamStore.get(request.params.teamId);
      if (!team) return response.status(404).json({ error: "Team not found." });
      const result = await checkInService.create({
        analysisId: request.body?.analysisId,
        profileId: team.profileId,
        teamId: team.id
      });
      response.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof CheckInNotFoundError) {
        return response.status(404).json({ error: error.message });
      }
      response.status(400).json({ error: error.message });
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
