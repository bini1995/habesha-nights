const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const football = require("../products/sports-hub/fixtures/football-team.json");
const basketball = require("../products/sports-hub/fixtures/basketball-team.json");

const {
  analyzeTeam
} = require("../products/sports-hub/domain/team-analysis");

const {
  TEAM_CHECK_IN_SCHEMA_VERSION,
  compareTeamCheckIns,
  createTeamCheckIn
} = require("../products/sports-hub/domain/team-check-in");

const {
  createAnalysisStore
} = require("../products/sports-hub/services/analysis-store");

const {
  createCheckInStore
} = require("../products/sports-hub/services/check-in-store");

const {
  createImportStore
} = require("../products/sports-hub/services/import-store");

const {
  createTeamStore
} = require("../products/sports-hub/services/team-store");

const {
  createSportsHubRouter
} = require("../products/sports-hub");

const NOW = "2026-08-24T18:00:00.000Z";

function analysisRecord(team, analysisId = "analysis-test") {
  return {
    analysisId,
    analyzedAt: NOW,
    inputChecksum: `checksum-${analysisId}`,
    inputSnapshot: { team },
    outputSnapshot: analyzeTeam(team),
    profileId: "default",
    schemaVersion: "sports-hub-analysis-snapshot/2.0",
    teamId: team.id
  };
}

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

async function post(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

test("creates an immutable versioned team check-in without recommendations", () => {
  const record = analysisRecord(football);
  const checkIn = createTeamCheckIn({
    analysisRecord: record,
    checkInId: "check-in-test",
    now: () => new Date(NOW)
  });

  assert.equal(checkIn.schemaVersion, TEAM_CHECK_IN_SCHEMA_VERSION);
  assert.equal(checkIn.analysisId, record.analysisId);
  assert.equal(checkIn.overallScore, record.outputSnapshot.overallScore);
  assert.equal(checkIn.roster.length, football.roster.length);
  assert.equal(checkIn.roster[1].status, "QUESTIONABLE");
  assert.equal(Object.isFrozen(checkIn.roster), true);
  assert.equal("recommendations" in checkIn, false);
});

test("compares score, projections, lineup, roster, and status changes", () => {
  const previous = createTeamCheckIn({
    analysisRecord: analysisRecord(football, "analysis-before"),
    checkInId: "check-in-before",
    now: () => new Date("2026-08-17T18:00:00.000Z")
  });
  const improvedTeam = structuredClone(football);
  improvedTeam.roster = improvedTeam.roster
    .filter((slot) => slot.player.id !== "f-wr-b")
    .map((slot) => ({
      ...slot,
      role: slot.player.id === "f-rb-b" ? "STARTER" : slot.role,
      player: {
        ...slot.player,
        status: slot.player.id === "f-rb-a" ? "ACTIVE" : slot.player.status
      },
      projection: slot.projection
        ? {
          ...slot.projection,
          projectedFantasyPoints:
            slot.projection.projectedFantasyPoints + 2
        }
        : null
    }));
  improvedTeam.roster.push({
    id: "new-bench",
    role: "BENCH",
    player: {
      id: "f-new-player",
      name: "Taylor North",
      position: "WR",
      status: "ACTIVE"
    },
    projection: {
      playerId: "f-new-player",
      projectedFantasyPoints: 14
    }
  });
  const current = createTeamCheckIn({
    analysisRecord: analysisRecord(improvedTeam, "analysis-after"),
    checkInId: "check-in-after",
    now: () => new Date(NOW)
  });
  const comparison = compareTeamCheckIns(current, previous);

  assert.equal(comparison.hasPrevious, true);
  assert.equal(comparison.direction, "IMPROVED");
  assert.ok(comparison.scoreDelta > 0);
  assert.equal(comparison.statusChanges[0].from, "QUESTIONABLE");
  assert.equal(comparison.statusChanges[0].to, "ACTIVE");
  assert.equal(comparison.lineupChanges[0].name, "Darius Stone");
  assert.equal(comparison.playerChanges.added[0].name, "Taylor North");
  assert.equal(comparison.playerChanges.removed[0].name, "Eli Brooks");
  assert.ok(comparison.projectionChanges.length > 0);

  const baseline = compareTeamCheckIns(previous);
  assert.equal(baseline.direction, "BASELINE");
  assert.equal(baseline.scoreDelta, null);

  const nextVersion = structuredClone(current);
  nextVersion.analysisVersion = "2.0.0";
  const versionComparison = compareTeamCheckIns(nextVersion, previous);
  assert.equal(versionComparison.direction, "VERSION_CHANGED");
  assert.equal(versionComparison.scoreDelta, null);
  assert.equal(versionComparison.analysisVersionChanged, true);
  assert.match(versionComparison.summary[0], /scores are not compared/);
});

test("check-in store isolates profiles and returns newest team records first", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sports-check-in-store-")
  );
  const store = createCheckInStore({
    file: path.join(directory, "check-ins.json")
  });
  try {
    const first = createTeamCheckIn({
      analysisRecord: analysisRecord(football, "analysis-first"),
      checkInId: "check-in-first",
      now: () => new Date("2026-08-17T18:00:00.000Z")
    });
    const latest = createTeamCheckIn({
      analysisRecord: analysisRecord(football, "analysis-latest"),
      checkInId: "check-in-latest",
      now: () => new Date(NOW)
    });
    await store.save(first);
    await store.save(latest);
    await store.save({ ...latest, profileId: "other" }, "other");

    assert.deepEqual(
      (await store.list(football.id)).map((record) => record.checkInId),
      ["check-in-latest", "check-in-first"]
    );
    assert.equal((await store.list(football.id, "other")).length, 1);
    assert.equal(
      (await store.findByAnalysisId("analysis-latest")).checkInId,
      "check-in-latest"
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("check-in APIs save idempotently and compare two team analyses", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sports-check-in-api-")
  );
  const teamStore = createTeamStore({
    file: path.join(directory, "teams.json"),
    now: () => new Date(NOW)
  });
  const analysisStore = createAnalysisStore({
    file: path.join(directory, "analyses.json")
  });
  const checkInStore = createCheckInStore({
    file: path.join(directory, "check-ins.json")
  });
  const router = createSportsHubRouter({
    analysisStore,
    checkInStore,
    importStore: createImportStore({
      file: path.join(directory, "imports.json")
    }),
    now: () => new Date(NOW),
    teamStore
  });

  try {
    await withServer(router, async (base) => {
      const createdTeam = await post(`${base}/teams`, football);
      assert.equal(createdTeam.response.status, 201);

      const firstAnalysis = await post(
        `${base}/teams/${football.id}/analyze`,
        { availablePlayers: football.availablePlayers }
      );
      assert.equal(firstAnalysis.response.status, 200);
      const firstCheckIn = await post(
        `${base}/teams/${football.id}/check-ins`,
        { analysisId: firstAnalysis.body.analysisId }
      );
      assert.equal(firstCheckIn.response.status, 201);
      assert.equal(firstCheckIn.body.comparison.direction, "BASELINE");

      const repeated = await post(
        `${base}/teams/${football.id}/check-ins`,
        { analysisId: firstAnalysis.body.analysisId }
      );
      assert.equal(repeated.response.status, 200);
      assert.equal(repeated.body.created, false);

      const improved = structuredClone(football);
      improved.roster = improved.roster.map((slot) => ({
        ...slot,
        player: {
          ...slot.player,
          status: slot.player.id === "f-rb-a" ? "ACTIVE" : slot.player.status
        },
        projection: {
          ...slot.projection,
          projectedFantasyPoints:
            slot.projection.projectedFantasyPoints + 2
        }
      }));
      await post(`${base}/teams`, improved);
      const secondAnalysis = await post(
        `${base}/teams/${football.id}/analyze`,
        { availablePlayers: football.availablePlayers }
      );
      const secondCheckIn = await post(
        `${base}/teams/${football.id}/check-ins`,
        { analysisId: secondAnalysis.body.analysisId }
      );
      assert.equal(secondCheckIn.response.status, 201);
      assert.equal(secondCheckIn.body.comparison.direction, "IMPROVED");
      assert.equal(secondCheckIn.body.comparison.projectionTotalDelta, 12);
      assert.equal(secondCheckIn.body.comparison.statusChanges.length, 1);

      const history = await fetch(`${base}/teams/${football.id}/check-ins`);
      const historyBody = await history.json();
      assert.equal(history.status, 200);
      assert.equal(historyBody.count, 2);
      assert.equal(historyBody.timeline[0].comparison.direction, "IMPROVED");
      assert.equal(historyBody.timeline[1].comparison.direction, "BASELINE");
      assert.equal(JSON.stringify(historyBody).includes("recommendations"), false);

      const basketballTeam = await post(`${base}/teams`, basketball);
      assert.equal(basketballTeam.response.status, 201);
      const wrongTeam = await post(
        `${base}/teams/${basketball.id}/check-ins`,
        { analysisId: secondAnalysis.body.analysisId }
      );
      assert.equal(wrongTeam.response.status, 404);

      const missingId = await post(`${base}/teams/${football.id}/check-ins`);
      assert.equal(missingId.response.status, 400);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
