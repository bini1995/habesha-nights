const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const football = require("../products/sports-hub/fixtures/football-team.json");
const basketball = require("../products/sports-hub/fixtures/basketball-team.json");
const {
  MINI_LEAGUE_SCHEMA_VERSION,
  buildRoundRobinSchedule,
  calculateStandings,
  createMiniLeague
} = require("../products/sports-hub/domain/league");
const { createSportsHubRouter } = require("../products/sports-hub");
const { createAnalysisStore } = require("../products/sports-hub/services/analysis-store");
const { createCheckInStore } = require("../products/sports-hub/services/check-in-store");
const { createImportStore } = require("../products/sports-hub/services/import-store");
const { createMiniLeagueStore } = require("../products/sports-hub/services/mini-league-store");
const {
  MiniLeagueConflictError,
  MiniLeagueValidationError,
  LeagueAuthorizationError,
  createMiniLeagueService
} = require("../products/sports-hub/services/mini-league-service");
const {
  createLocalLeagueAccessProvider
} = require("../products/sports-hub/services/league-access-provider");
const { createTeamStore } = require("../products/sports-hub/services/team-store");

const NOW = "2026-08-24T18:00:00.000Z";

function baseLeague(overrides = {}) {
  return {
    id: "league-test",
    profileId: "default",
    name: "Sunday Friends",
    sport: "FOOTBALL",
    ownerMemberId: "member-a",
    joinCodeHash: "a".repeat(64),
    scoringPeriodCount: 3,
    members: [{
      id: "member-a",
      displayName: "Avery",
      joinedAt: NOW,
      role: "OWNER"
    }, {
      id: "member-b",
      displayName: "Blake",
      joinedAt: NOW,
      role: "MEMBER"
    }],
    memberships: [{ memberId: "member-a", teamId: "team-a" }, {
      memberId: "member-b", teamId: "team-b"
    }],
    matchups: buildRoundRobinSchedule({
      leagueId: "league-test",
      memberIds: ["member-a", "member-b"],
      scoringPeriodCount: 3
    }),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
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

async function requestJson(url, method = "GET", body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined
      ? headers
      : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

test("mini-league model is versioned, immutable, and separates advisory scores", () => {
  const league = createMiniLeague(baseLeague());
  assert.equal(league.schemaVersion, MINI_LEAGUE_SCHEMA_VERSION);
  assert.equal(league.scoringSource, "MANUAL_OFFICIAL_FANTASY_POINTS");
  assert.equal(league.teamScoreAffectsStandings, false);
  assert.equal(league.managerScore, null);
  assert.equal(league.aiRanking, null);
  assert.equal(Object.isFrozen(league.members), true);
  assert.equal(Object.isFrozen(league.matchups[0]), true);
});

test("round-robin schedules are deterministic for even and odd member counts", () => {
  const fourMembers = ["d", "b", "a", "c"];
  const first = buildRoundRobinSchedule({
    leagueId: "league-even",
    memberIds: fourMembers,
    scoringPeriodCount: 3
  });
  const repeated = buildRoundRobinSchedule({
    leagueId: "league-even",
    memberIds: fourMembers,
    scoringPeriodCount: 3
  });
  assert.deepEqual(first, repeated);
  assert.equal(first.length, 6);
  assert.equal(new Set(first.map((matchup) =>
    [matchup.homeMemberId, matchup.awayMemberId].sort().join(":"))).size, 6);

  const odd = buildRoundRobinSchedule({
    leagueId: "league-odd",
    memberIds: ["c", "a", "b"],
    scoringPeriodCount: 3
  });
  assert.equal(odd.length, 3);
  assert.equal(odd.some((matchup) =>
    matchup.homeMemberId === matchup.awayMemberId), false);
});

test("standings use only entered official matchup points", () => {
  const matchups = structuredClone(baseLeague().matchups);
  Object.assign(matchups[0], {
    homePoints: 109.4,
    awayPoints: 101.2,
    scoredAt: NOW,
    teamScore: 99,
    managerScore: 100
  });
  const league = createMiniLeague(baseLeague({ matchups }));
  const standings = calculateStandings(league);
  assert.equal(standings[0].wins, 1);
  assert.equal(standings[0].pointsFor, 109.4);
  assert.equal(standings[1].losses, 1);
  assert.equal("teamScore" in standings[0], false);
  assert.equal("managerScore" in standings[0], false);
});

test("mini-league service hashes invite codes, validates teams, and locks membership after scoring", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-mini-league-"));
  const file = path.join(directory, "mini-leagues.json");
  const miniLeagueStore = createMiniLeagueStore({ file });
  const teamStore = createTeamStore({ file: path.join(directory, "teams.json") });
  let id = 0;
  const service = createMiniLeagueService({
    miniLeagueStore,
    teamStore,
    now: () => new Date(NOW),
    createId: (kind) => `${kind}-${++id}`,
    createJoinCode: () => "PLAY2Q26",
    leagueAccessProvider: createLocalLeagueAccessProvider({
      createKey: () => "commissioner_key_abcdefghijklmnopqrstuvwxyz"
    })
  });

  try {
    await teamStore.save(football);
    await teamStore.save({ ...football, id: "football-rivals", name: "Rivals" });
    await teamStore.save(basketball);
    const created = await service.create({
      name: "Sunday Friends",
      ownerName: "Avery",
      scoringPeriodCount: 4,
      sport: "football",
      teamId: football.id
    });
    assert.equal(created.joinCode, "PLAY2Q26");
    assert.equal(
      created.commissionerKey,
      "commissioner_key_abcdefghijklmnopqrstuvwxyz"
    );
    assert.equal("joinCodeHash" in created.league, false);
    const persisted = await fs.readFile(file, "utf8");
    assert.equal(persisted.includes("PLAY2Q26"), false);
    assert.equal(persisted.includes(created.commissionerKey), false);
    assert.match(persisted, /joinCodeHash/);

    await assert.rejects(
      service.join({
        joinCode: "PLAY2Q26",
        managerName: "Wrong Sport",
        teamId: basketball.id
      }),
      MiniLeagueValidationError
    );
    const joined = await service.join({
      joinCode: "PLAY 2Q26",
      managerName: "Blake",
      teamId: "football-rivals"
    });
    assert.equal(joined.members.length, 2);
    assert.equal(joined.matchups.length, 4);
    assert.equal("joinCodeHash" in joined, false);

    await assert.rejects(
      service.join({ joinCode: "PLAY2Q26", managerName: "blake" }),
      MiniLeagueConflictError
    );
    await Promise.all([
      service.join({ joinCode: "PLAY2Q26", managerName: "Casey" }),
      service.join({ joinCode: "PLAY2Q26", managerName: "Devon" })
    ]);
    const afterConcurrentJoins = await service.get(joined.id);
    assert.equal(afterConcurrentJoins.members.length, 4);
    const scored = await service.recordScore({
      leagueId: afterConcurrentJoins.id,
      matchupId: afterConcurrentJoins.matchups[0].id,
      homePoints: 122.75,
      awayPoints: 118.5,
      commissionerKey: created.commissionerKey
    });
    assert.equal(scored.completedMatchupCount, 1);
    assert.equal(scored.standings[0].wins, 1);
    await assert.rejects(
      service.join({ joinCode: "PLAY2Q26", managerName: "Emery" }),
      MiniLeagueConflictError
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("mini-league APIs create, join, list, retrieve, and replace official results", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-mini-api-"));
  const teamStore = createTeamStore({ file: path.join(directory, "teams.json") });
  const miniLeagueStore = createMiniLeagueStore({
    file: path.join(directory, "mini-leagues.json")
  });
  const router = createSportsHubRouter({
    teamStore,
    miniLeagueStore,
    importStore: createImportStore({ file: path.join(directory, "imports.json") }),
    analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") }),
    checkInStore: createCheckInStore({ file: path.join(directory, "check-ins.json") }),
    now: () => new Date(NOW)
  });

  try {
    await teamStore.save(football);
    await teamStore.save({ ...football, id: "api-rivals", name: "API Rivals" });
    await withServer(router, async (base) => {
      const created = await requestJson(`${base}/mini-leagues`, "POST", {
        name: "Phone League",
        ownerName: "Avery",
        sport: "FOOTBALL",
        teamId: football.id,
        scoringPeriodCount: 4
      });
      assert.equal(created.response.status, 201);
      assert.match(created.body.joinCode, /^[A-HJ-NP-Z2-9]{8}$/);
      assert.match(created.body.commissionerKey, /^[A-Za-z0-9_-]{32,128}$/);
      assert.equal("joinCodeHash" in created.body.league, false);

      const capability = await requestJson(`${base}/mini-leagues/status`);
      assert.equal(capability.response.status, 200);
      assert.equal(capability.body.authorization.authenticatedAccounts, false);
      assert.equal(capability.body.storage.migrationReady, true);

      const deniedVerify = await requestJson(
        `${base}/mini-leagues/${created.body.league.id}/commissioner/verify`,
        "POST",
        {},
        { "x-mini-league-commissioner-key": "wrong_commissioner_key_abcdefghijklmnopqrstuvwxyz" }
      );
      assert.equal(deniedVerify.response.status, 403);
      const rotated = await requestJson(
        `${base}/mini-leagues/${created.body.league.id}/join-code/rotate`,
        "POST",
        {},
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(rotated.response.status, 200);
      assert.notEqual(rotated.body.joinCode, created.body.joinCode);

      const oldCode = await requestJson(`${base}/mini-leagues/join`, "POST", {
        joinCode: created.body.joinCode,
        managerName: "Old Code"
      });
      assert.equal(oldCode.response.status, 404);

      const joined = await requestJson(`${base}/mini-leagues/join`, "POST", {
        joinCode: rotated.body.joinCode,
        managerName: "Blake",
        teamId: "api-rivals"
      });
      assert.equal(joined.response.status, 201);
      assert.equal(joined.body.league.members.length, 2);

      const matchup = joined.body.league.matchups[0];
      const unauthorized = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/matchups/${matchup.id}/score`,
        "PUT",
        { homePoints: 88.5, awayPoints: 88.5 }
      );
      assert.equal(unauthorized.response.status, 403);
      const scored = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/matchups/${matchup.id}/score`,
        "PUT",
        { homePoints: 88.5, awayPoints: 88.5 },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(scored.response.status, 200);
      assert.equal(scored.body.league.standings[0].ties, 1);

      const locked = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/scoring-periods/1/lock`,
        "PUT",
        { locked: true },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(locked.response.status, 200);
      assert.deepEqual(locked.body.league.lockedScoringPeriods, [1]);

      const blockedCorrection = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/matchups/${matchup.id}/score`,
        "PUT",
        { homePoints: 99, awayPoints: 88.5 },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(blockedCorrection.response.status, 409);

      const unlocked = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/scoring-periods/1/lock`,
        "PUT",
        { locked: false },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(unlocked.response.status, 200);

      const replaced = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/matchups/${matchup.id}/score`,
        "PUT",
        { homePoints: 99, awayPoints: 88.5 },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(replaced.response.status, 200);
      assert.equal(replaced.body.league.standings[0].wins, 1);
      assert.equal(replaced.body.league.auditTrail.at(-1).type, "RESULT_CORRECTED");

      const listed = await requestJson(`${base}/mini-leagues`);
      assert.equal(listed.response.status, 200);
      assert.equal(listed.body.count, 1);
      assert.equal(JSON.stringify(listed.body).includes("joinCodeHash"), false);
      assert.equal(JSON.stringify(listed.body).includes("commissionerKeyHash"), false);
      assert.equal(JSON.stringify(listed.body).includes(created.body.commissionerKey), false);

      const invalid = await requestJson(
        `${base}/mini-leagues/${joined.body.league.id}/matchups/${matchup.id}/score`,
        "PUT",
        { homePoints: -1, awayPoints: 2 },
        { "x-mini-league-commissioner-key": created.body.commissionerKey }
      );
      assert.equal(invalid.response.status, 400);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("commissioner access protects rotation, scoring, period locks, and audit history", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-league-access-"));
  const miniLeagueStore = createMiniLeagueStore({
    file: path.join(directory, "mini-leagues.json")
  });
  const teamStore = createTeamStore({ file: path.join(directory, "teams.json") });
  const codes = ["PLAY2Q26", "NEXT2Q26"];
  let id = 0;
  const commissionerKey = "commissioner_key_abcdefghijklmnopqrstuvwxyz";
  const service = createMiniLeagueService({
    miniLeagueStore,
    teamStore,
    now: () => new Date(NOW),
    createId: (kind) => `${kind}-${++id}`,
    createJoinCode: () => codes.shift(),
    leagueAccessProvider: createLocalLeagueAccessProvider({
      createKey: () => commissionerKey
    })
  });

  try {
    const created = await service.create({
      name: "Commissioner Test",
      ownerName: "Avery",
      scoringPeriodCount: 3,
      sport: "FOOTBALL"
    });
    await assert.rejects(
      service.verifyCommissioner({
        leagueId: created.league.id,
        commissionerKey: "wrong_commissioner_key_abcdefghijklmnopqrstuvwxyz"
      }),
      LeagueAuthorizationError
    );
    assert.equal((await service.verifyCommissioner({
      leagueId: created.league.id,
      commissionerKey
    })).authorized, true);

    const rotated = await service.rotateJoinCode({
      leagueId: created.league.id,
      commissionerKey
    });
    assert.equal(rotated.joinCode, "NEXT2Q26");
    await assert.rejects(
      service.join({ joinCode: "PLAY2Q26", managerName: "Old Code" }),
      /League code not found/
    );
    const joined = await service.join({
      joinCode: rotated.joinCode,
      managerName: "Blake"
    });
    const matchup = joined.matchups[0];
    const scored = await service.recordScore({
      leagueId: joined.id,
      matchupId: matchup.id,
      homePoints: 111,
      awayPoints: 104,
      commissionerKey
    });
    assert.equal(scored.auditTrail.at(-1).type, "RESULT_RECORDED");
    const locked = await service.setScoringPeriodLock({
      leagueId: joined.id,
      scoringPeriod: 1,
      locked: true,
      commissionerKey
    });
    assert.deepEqual(locked.lockedScoringPeriods, [1]);
    await assert.rejects(
      service.recordScore({
        leagueId: joined.id,
        matchupId: matchup.id,
        homePoints: 112,
        awayPoints: 104,
        commissionerKey
      }),
      MiniLeagueConflictError
    );
    await service.setScoringPeriodLock({
      leagueId: joined.id,
      scoringPeriod: 1,
      locked: false,
      commissionerKey
    });
    const corrected = await service.recordScore({
      leagueId: joined.id,
      matchupId: matchup.id,
      homePoints: 112,
      awayPoints: 104,
      commissionerKey
    });
    assert.deepEqual(corrected.auditTrail.map((event) => event.type), [
      "JOIN_CODE_ROTATED",
      "RESULT_RECORDED",
      "SCORING_PERIOD_LOCKED",
      "SCORING_PERIOD_UNLOCKED",
      "RESULT_CORRECTED"
    ]);
    assert.deepEqual(corrected.auditTrail.at(-1).previousResult, {
      homePoints: 111,
      awayPoints: 104
    });
    assert.equal("commissionerKeyHash" in corrected, false);
    assert.equal("joinCodeHash" in corrected, false);
    assert.equal(service.status().storage.migrationReady, true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("version 1.0 leagues migrate safely and commissioner access can be claimed once", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-league-migration-"));
  const file = path.join(directory, "mini-leagues.json");
  const legacy = {
    ...baseLeague(),
    schemaVersion: "sports-hub-mini-league/1.0"
  };
  await fs.writeFile(file, `${JSON.stringify({
    version: 1,
    profiles: { default: [legacy] }
  }, null, 2)}\n`);
  const miniLeagueStore = createMiniLeagueStore({ file });
  const commissionerKey = "claimed_commissioner_key_abcdefghijklmnopq";
  const service = createMiniLeagueService({
    miniLeagueStore,
    teamStore: createTeamStore({ file: path.join(directory, "teams.json") }),
    now: () => new Date(NOW),
    createId: (kind) => `${kind}-claimed`,
    leagueAccessProvider: createLocalLeagueAccessProvider({
      createKey: () => commissionerKey
    })
  });

  try {
    const migrated = await miniLeagueStore.get(legacy.id);
    assert.equal(migrated.schemaVersion, MINI_LEAGUE_SCHEMA_VERSION);
    assert.equal(migrated.authorizationMode, "LEGACY_UNCLAIMED");
    assert.equal(migrated.commissionerKeyHash, null);
    const claimed = await service.claimCommissioner(legacy.id);
    assert.equal(claimed.commissionerKey, commissionerKey);
    assert.equal(claimed.league.commissionerAccessConfigured, true);
    assert.equal(claimed.league.auditTrail[0].type, "COMMISSIONER_ACCESS_CLAIMED");
    assert.equal((await fs.readFile(file, "utf8")).includes(commissionerKey), false);
    await assert.rejects(
      service.claimCommissioner(legacy.id),
      MiniLeagueConflictError
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
