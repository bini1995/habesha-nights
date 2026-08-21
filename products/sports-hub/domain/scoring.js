const {
  normalizeSport
} = require("./sports");

const SCORING_VERSION = "1.0";

const DEFAULT_RULES = Object.freeze({
  FOOTBALL: Object.freeze({
    passingYards: 0.04,
    passingTouchdowns: 4,
    interceptions: -2,
    rushingYards: 0.1,
    rushingTouchdowns: 6,
    receivingYards: 0.1,
    receivingTouchdowns: 6,
    receptions: 1,
    twoPointConversions: 2,
    fumblesLost: -2
  }),
  BASKETBALL: Object.freeze({
    points: 1,
    rebounds: 1.2,
    assists: 1.5,
    steals: 3,
    blocks: 3,
    turnovers: -1
  }),
  // Soccer leagues vary widely. Team Analyzer uses supplied projected fantasy
  // points and deliberately does not claim a universal official scoring model.
  SOCCER: Object.freeze({})
});

function validateNumber(value, field) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${field} must be a finite number.`);
  }

  return number;
}

function getScoringRules(sport, overrides = {}) {
  const normalizedSport = normalizeSport(sport);

  if (
    !overrides ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    throw new Error("scoring rules must be an object.");
  }

  const rules = {
    ...DEFAULT_RULES[normalizedSport]
  };

  for (const [stat, value] of Object.entries(overrides)) {
    if (!(stat in rules)) {
      throw new Error(
        `Unknown ${normalizedSport.toLowerCase()} scoring stat: ${stat}.`
      );
    }

    rules[stat] = validateNumber(value, `scoringRules.${stat}`);
  }

  return Object.freeze(rules);
}

function scoreStatLine({
  sport,
  stats,
  scoringRules = {}
}) {
  const normalizedSport = normalizeSport(sport);
  const rules = getScoringRules(
    normalizedSport,
    scoringRules
  );

  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    throw new Error("stats must be an object.");
  }

  const breakdown = [];
  let total = 0;

  for (const [stat, multiplier] of Object.entries(rules)) {
    const value = validateNumber(stats[stat] ?? 0, `stats.${stat}`);
    const points = value * multiplier;

    if (value !== 0) {
      breakdown.push({
        stat,
        value,
        multiplier,
        points
      });
    }

    total += points;
  }

  return Object.freeze({
    sport: normalizedSport,
    scoringVersion: SCORING_VERSION,
    total: Math.round(total * 100) / 100,
    breakdown: Object.freeze(breakdown)
  });
}

module.exports = {
  SCORING_VERSION,
  DEFAULT_RULES,
  getScoringRules,
  scoreStatLine
};
