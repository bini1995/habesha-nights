const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const football = require("../products/sports-hub/fixtures/football-team.json");

const {
  createTeam
} = require("../products/sports-hub/domain/models");

const {
  normalizePlayerName
} = require("../products/sports-hub/domain/player-identity");

const {
  OfflineSamplePlayerDataProvider
} = require("../products/sports-hub/services/player-data-provider");

const {
  createPlayerIdentityService
} = require("../products/sports-hub/services/player-identity-service");

const {
  createSportsHubRouter
} = require("../products/sports-hub");

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/sports-hub", router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    await run(`http://127.0.0.1:${server.address().port}/api/sports-hub`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("normalizes accents, punctuation, whitespace, and name suffixes", () => {
  assert.equal(normalizePlayerName("  Leo Martín Jr. "), "leo martin");
  assert.equal(normalizePlayerName("D'Andre   Cole"), "dandre cole");
});

test("resolves exact and alias names while surfacing ambiguity safely", async () => {
  const service = createPlayerIdentityService({
    now: () => new Date("2026-08-21T12:00:00.000Z")
  });
  const result = await service.resolveRoster({
    sport: "football",
    players: [{
      name: "Alex Carter",
      position: "QB"
    }, {
      name: "J. Miles",
      position: "WR"
    }, {
      name: "Casey Morgan",
      position: "UNKNOWN"
    }, {
      name: "Casey Morgan",
      position: "QB"
    }, {
      name: "Definitely Missing",
      position: "RB"
    }]
  });

  assert.equal(result.results[0].status, "MATCHED");
  assert.equal(result.results[0].selectedPlayerId, "f-qb-a");
  assert.equal(result.results[1].status, "MATCHED");
  assert.equal(result.results[1].candidates[0].matchMethod, "ALIAS");
  assert.equal(result.results[2].status, "AMBIGUOUS");
  assert.equal(result.results[2].candidates.length, 2);
  assert.equal(result.results[3].status, "MATCHED");
  assert.equal(result.results[3].selectedPlayerId, "f-amb-qb");
  assert.equal(result.results[4].status, "UNMATCHED");
  assert.deepEqual(result.counts, {
    ambiguous: 1,
    matched: 3,
    unmatched: 1
  });
  assert.equal(result.provider.live, false);
  assert.equal(result.provider.mode, "OFFLINE_SAMPLE");

  const typo = await service.resolveRoster({
    sport: "FOOTBALL",
    players: [{ name: "Alex Cartar", position: "QB" }]
  });
  assert.equal(typo.results[0].status, "AMBIGUOUS");
  assert.equal(typo.results[0].candidates[0].id, "f-qb-a");
  assert.equal(typo.results[0].candidates[0].matchMethod, "FUZZY");
});

test("keeps live projections and injuries behind explicit provider capabilities", async () => {
  const provider = new OfflineSamplePlayerDataProvider();
  assert.deepEqual(provider.status().capabilities, ["PLAYER_DIRECTORY"]);
  await assert.rejects(provider.getProjections(), /does not implement PROJECTIONS/);
  await assert.rejects(provider.getInjuries(), /does not implement INJURIES/);
});

test("validates and preserves confirmed player identity provenance", () => {
  const player = football.roster[0].player;
  const team = createTeam({
    ...football,
    roster: [{
      ...football.roster[0],
      player: {
        ...player,
        identity: {
          canonicalPlayerId: player.id,
          matchMethod: "USER_CONFIRMED",
          matchedAt: "2026-08-21T12:00:00.000Z",
          providerId: "offline-sample",
          providerPlayerId: player.id,
          sourceUpdatedAt: "2026-08-21T00:00:00.000Z"
        }
      }
    }]
  });

  assert.equal(team.roster[0].player.identity.canonicalPlayerId, player.id);
  assert.equal(Object.isFrozen(team.roster[0].player.identity), true);
  assert.throws(() => createTeam({
    ...football,
    roster: [{
      ...football.roster[0],
      player: {
        ...player,
        identity: {
          ...team.roster[0].player.identity,
          canonicalPlayerId: "different-player"
        }
      }
    }]
  }), /must match the player ID/);
});

test("player identity APIs expose provenance and reject invalid requests", async () => {
  await withServer(createSportsHubRouter(), async (base) => {
    const status = await fetch(`${base}/player-identities/status`);
    const statusBody = await status.json();
    assert.equal(status.status, 200);
    assert.equal(statusBody.liveData, false);
    assert.equal(statusBody.provider.id, "offline-sample");

    const resolved = await fetch(`${base}/player-identities/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sport: "SOCCER",
        players: [{ name: "Leo Martin", position: "FWD" }]
      })
    });
    const resolvedBody = await resolved.json();
    assert.equal(resolved.status, 200);
    assert.equal(resolvedBody.results[0].selectedPlayerId, "s-fwd-a");

    const invalid = await fetch(`${base}/player-identities/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ sport: "FOOTBALL", players: [] })
    });
    assert.equal(invalid.status, 400);
  });
});
