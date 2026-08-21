const {
  normalizeSport
} = require("./sports");

const {
  SCORING_VERSION,
  getScoringRules
} = require("./scoring");

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function normalizeTeam(team, index) {
  if (!team || typeof team !== "object") {
    throw new Error(`teams[${index}] must be an object.`);
  }

  return Object.freeze({
    id: requireText(team.id, `teams[${index}].id`),
    name: requireText(team.name, `teams[${index}].name`),
    managerId: requireText(
      team.managerId,
      `teams[${index}].managerId`
    ),
    roster: Object.freeze(
      Array.isArray(team.roster) ? [...team.roster] : []
    )
  });
}

function assertUnique(teams, field) {
  const values = teams.map((team) => team[field]);

  if (new Set(values).size !== values.length) {
    throw new Error(`Team ${field} values must be unique.`);
  }
}

function createLeague(input) {
  if (!input || typeof input !== "object") {
    throw new Error("League data is required.");
  }

  if (!Array.isArray(input.teams) || input.teams.length < 2) {
    throw new Error("A mini-league requires at least two teams.");
  }

  const teams = input.teams.map(normalizeTeam);

  assertUnique(teams, "id");
  assertUnique(teams, "managerId");

  const sport = normalizeSport(input.sport);

  return Object.freeze({
    id: requireText(input.id, "id"),
    name: requireText(input.name, "name"),
    sport,
    status: "DRAFT",
    scoringVersion: SCORING_VERSION,
    scoringRules: getScoringRules(
      sport,
      input.scoringRules ?? {}
    ),
    teams: Object.freeze(teams)
  });
}

module.exports = {
  createLeague
};
