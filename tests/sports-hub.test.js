const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scoreStatLine
} = require("../products/sports-hub/domain/scoring");

const {
  createLeague
} = require("../products/sports-hub/domain/league");

test("scores a football stat line deterministically", () => {
  const result = scoreStatLine({
    sport: "football",
    stats: {
      passingYards: 250,
      passingTouchdowns: 2,
      interceptions: 1,
      rushingYards: 30
    }
  });

  assert.equal(result.total, 19);
  assert.equal(result.scoringVersion, "1.0");
});

test("scores a basketball stat line deterministically", () => {
  const result = scoreStatLine({
    sport: "basketball",
    stats: {
      points: 24,
      rebounds: 10,
      assists: 8,
      steals: 2,
      turnovers: 3
    }
  });

  assert.equal(result.total, 51);
});

test("supports validated scoring overrides", () => {
  const result = scoreStatLine({
    sport: "football",
    scoringRules: {
      passingTouchdowns: 6
    },
    stats: {
      passingTouchdowns: 2
    }
  });

  assert.equal(result.total, 12);
});

test("creates a draft mini-league with unique managers", () => {
  const league = createLeague({
    id: "friends-2026",
    name: "Friends League",
    sport: "basketball",
    teams: [
      {
        id: "team-1",
        name: "Queens Buckets",
        managerId: "manager-1"
      },
      {
        id: "team-2",
        name: "Brooklyn Boards",
        managerId: "manager-2"
      }
    ]
  });

  assert.equal(league.status, "DRAFT");
  assert.equal(league.sport, "BASKETBALL");
  assert.equal(league.teams.length, 2);
});

test("rejects duplicate mini-league managers", () => {
  assert.throws(
    () => createLeague({
      id: "friends-2026",
      name: "Friends League",
      sport: "football",
      teams: [
        {
          id: "team-1",
          name: "Team One",
          managerId: "manager-1"
        },
        {
          id: "team-2",
          name: "Team Two",
          managerId: "manager-1"
        }
      ]
    }),
    /Team managerId values must be unique\./
  );
});
