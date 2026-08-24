const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const football = require("../products/sports-hub/fixtures/football-team.json");
const basketball = require("../products/sports-hub/fixtures/basketball-team.json");

const {
  PLAYER_DATA_SCHEMA_VERSION,
  createFreshness
} = require("../products/sports-hub/domain/player-data");

const {
  createPlayerDataProvider
} = require("../products/sports-hub/services/player-data-provider");

const {
  SportsDataIOFootballFixtureProvider
} = require("../products/sports-hub/services/sportsdataio-football-fixture-provider");

const {
  PlayerDataCapabilityError,
  createPlayerDataPreviewService
} = require("../products/sports-hub/services/player-data-preview-service");

const {
  createTeamStore
} = require("../products/sports-hub/services/team-store");

const {
  createSportsHubRouter
} = require("../products/sports-hub");

const NOW = "2026-08-24T12:00:00.000Z";
const now = () => new Date(NOW);

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/sports-hub", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/sports-hub`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("classifies provider records as fresh or stale deterministically", () => {
  const fresh = createFreshness(
    "2026-08-24T10:00:00.000Z",
    "PROJECTIONS",
    { now }
  );
  const stale = createFreshness(
    "2026-08-20T10:00:00.000Z",
    "PROJECTIONS",
    { now }
  );
  assert.equal(fresh.status, "FRESH");
  assert.equal(fresh.ageSeconds, 7200);
  assert.equal(stale.status, "STALE");
  assert.equal(Object.isFrozen(fresh), true);
});

test("maps the SportsDataIO-shaped fixture without making live claims", async () => {
  const provider = new SportsDataIOFootballFixtureProvider({ now });
  const status = provider.status();
  assert.equal(status.live, false);
  assert.equal(status.fixtureOnly, true);
  assert.equal(status.licenseStatus, "LIVE_USE_NOT_APPROVED");
  assert.deepEqual(status.sports, ["FOOTBALL"]);
  assert.deepEqual(status.capabilities, [
    "PLAYER_DIRECTORY",
    "PROJECTIONS",
    "INJURIES",
    "SCHEDULES"
  ]);

  const players = await provider.listPlayers({ sport: "FOOTBALL" });
  const projections = await provider.getProjections({ sport: "FOOTBALL" });
  const injuries = await provider.getInjuries({ sport: "FOOTBALL" });
  const schedule = await provider.getSchedule({ sport: "FOOTBALL" });

  assert.equal(players.length, 9);
  assert.equal(players[0].providerPlayerId, "1001");
  assert.equal(projections.schemaVersion, PLAYER_DATA_SCHEMA_VERSION);
  assert.equal(projections.records.length, 6);
  assert.equal(projections.rejectedCount, 3);
  assert.match(projections.rejectedRecords[0].reason, /Duplicate/);
  assert.equal(
    projections.records.find((record) => record.canonicalPlayerId === "f-rb-a")
      .freshness.status,
    "STALE"
  );
  assert.equal(injuries.records[1].rosterStatus, "ACTIVE");
  assert.equal(injuries.records[1].injuryStatus, "QUESTIONABLE");
  assert.equal(schedule.records[0].gameId, "demo-2026-1");
  await assert.rejects(
    provider.getProjections({ sport: "BASKETBALL" }),
    /supports FOOTBALL only/
  );
});

test("keeps the real provider name disabled until licensing is approved", () => {
  assert.throws(
    () => createPlayerDataProvider({ name: "sportsdataio-football" }),
    /Unsupported sports data provider/
  );
  const provider = createPlayerDataProvider({
    name: "sportsdataio-football-fixture"
  });
  assert.equal(provider.status().mode, "OFFLINE_FIXTURE");
});

test("builds a read-only football preview with provenance and warnings", async () => {
  const service = createPlayerDataPreviewService({
    now,
    provider: new SportsDataIOFootballFixtureProvider({ now })
  });
  const original = structuredClone(football);
  const preview = await service.previewTeam(football);

  assert.deepEqual(football, original);
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.persisted, false);
  assert.equal(preview.canApply, false);
  assert.equal(preview.summary.playerCount, 6);
  assert.equal(preview.summary.matchedCount, 6);
  assert.equal(preview.summary.projectionCount, 6);
  assert.equal(preview.summary.staleProjectionCount, 1);
  assert.equal(preview.summary.rejectedRecordCount, 3);
  assert.equal(preview.roster[0].match.method, "CANONICAL_ID");
  assert.equal(preview.roster[0].comparison.difference, 2.4);
  assert.equal(preview.roster[1].injury.rosterStatus, "ACTIVE");
  assert.equal(preview.roster[1].injury.injuryStatus, "QUESTIONABLE");
  assert.match(preview.warnings[0], /fictional offline fixture/);
  assert.equal(Object.isFrozen(preview.roster), true);

  const mismatchedIdentity = structuredClone(football);
  mismatchedIdentity.roster[0].player.identity = {
    canonicalPlayerId: "f-qb-a",
    matchMethod: "USER_CONFIRMED",
    matchedAt: NOW,
    providerId: "sportsdataio-football-fixture",
    providerPlayerId: "1002",
    sourceUpdatedAt: NOW
  };
  const safePreview = await service.previewTeam(mismatchedIdentity);
  assert.equal(safePreview.roster[0].match.providerPlayerId, "1001");
  assert.equal(safePreview.roster[0].match.method, "CANONICAL_ID");
  assert.match(safePreview.warnings.join(" "), /was ignored/);

  await assert.rejects(
    service.previewTeam(basketball),
    PlayerDataCapabilityError
  );
});

test("player-data API previews a saved team without changing persistence", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sports-player-data-test-")
  );
  const teamStore = createTeamStore({
    file: path.join(directory, "teams.json"),
    now
  });
  const previewService = createPlayerDataPreviewService({
    now,
    provider: new SportsDataIOFootballFixtureProvider({ now })
  });

  try {
    const saved = await teamStore.save(football);
    await withServer(createSportsHubRouter({
      now,
      playerDataPreviewService: previewService,
      teamStore
    }), async (base) => {
      const status = await fetch(`${base}/player-data/status`);
      const statusBody = await status.json();
      assert.equal(status.status, 200);
      assert.equal(statusBody.previewReady, true);
      assert.equal(statusBody.readOnly, true);

      const response = await fetch(
        `${base}/teams/${football.id}/player-data/preview`,
        { method: "POST" }
      );
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.teamId, football.id);
      assert.equal(body.provider.id, "sportsdataio-football-fixture");

      const after = await teamStore.get(football.id);
      assert.deepEqual(after, saved);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("default API reports unavailable preview rather than fabricating data", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sports-player-data-default-test-")
  );
  const teamStore = createTeamStore({
    file: path.join(directory, "teams.json"),
    now
  });
  try {
    await teamStore.save(football);
    await withServer(createSportsHubRouter({ teamStore }), async (base) => {
      const status = await fetch(`${base}/player-data/status`);
      const statusBody = await status.json();
      assert.equal(statusBody.previewReady, false);
      assert.deepEqual(statusBody.missingCapabilities, [
        "PROJECTIONS",
        "INJURIES",
        "SCHEDULES"
      ]);

      const response = await fetch(
        `${base}/teams/${football.id}/player-data/preview`,
        { method: "POST" }
      );
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /not configured/);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
