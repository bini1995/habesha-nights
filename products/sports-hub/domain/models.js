const { normalizeSport } = require("./sports");
const { getScoringRules } = require("./scoring");

const ROSTER_ROLES = Object.freeze(["STARTER", "BENCH"]);
const PLAYER_STATUSES = Object.freeze(["ACTIVE", "QUESTIONABLE", "DOUBTFUL", "OUT", "UNKNOWN"]);

const POSITIONS = Object.freeze({
  FOOTBALL: Object.freeze(["QB", "RB", "WR", "TE", "K", "DST", "FLEX"]),
  BASKETBALL: Object.freeze(["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"]),
  SOCCER: Object.freeze(["GK", "DEF", "MID", "FWD"])
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function requireText(value, field, maximum = 120) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }
  const text = value.trim();
  if (text.length > maximum) throw new Error(`${field} must be ${maximum} characters or fewer.`);
  return text;
}

function requireId(value, field) {
  const id = requireText(value, field, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`${field} may contain only letters, numbers, hyphens, and underscores.`);
  }
  return id;
}

function optionalNumber(value, field, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function createPlayer(input, sport, field = "player") {
  requireObject(input, field);
  const normalizedSport = normalizeSport(input.sport ?? sport);
  const position = requireText(input.position, `${field}.position`, 10).toUpperCase();
  if (!POSITIONS[normalizedSport].includes(position)) {
    throw new Error(`${field}.position is not supported for ${normalizedSport}.`);
  }
  const status = String(input.status ?? "UNKNOWN").trim().toUpperCase();
  if (!PLAYER_STATUSES.includes(status)) {
    throw new Error(`${field}.status must be one of: ${PLAYER_STATUSES.join(", ")}.`);
  }
  return deepFreeze({
    id: requireId(input.id, `${field}.id`),
    name: requireText(input.name, `${field}.name`),
    sport: normalizedSport,
    position,
    status
  });
}

function createPlayerProjection(input, playerId, field = "projection") {
  if (input === undefined || input === null) return null;
  requireObject(input, field);
  return deepFreeze({
    playerId: requireId(input.playerId ?? playerId, `${field}.playerId`),
    projectedFantasyPoints: optionalNumber(input.projectedFantasyPoints, `${field}.projectedFantasyPoints`, { minimum: 0, maximum: 1000 }),
    availability: optionalNumber(input.availability, `${field}.availability`, { minimum: 0, maximum: 1 }),
    risk: optionalNumber(input.risk, `${field}.risk`, { minimum: 0, maximum: 1 }),
    source: input.source ? requireText(input.source, `${field}.source`, 80) : "USER_SUPPLIED"
  });
}

function createRosterSlot(input, sport, index = 0) {
  requireObject(input, `roster[${index}]`);
  const role = String(input.role ?? "BENCH").trim().toUpperCase();
  if (!ROSTER_ROLES.includes(role)) {
    throw new Error(`roster[${index}].role must be STARTER or BENCH.`);
  }
  const player = createPlayer(input.player, sport, `roster[${index}].player`);
  const projection = createPlayerProjection(input.projection, player.id, `roster[${index}].projection`);
  if (projection && projection.playerId !== player.id) {
    throw new Error(`roster[${index}].projection.playerId must match the player.`);
  }
  return deepFreeze({
    id: requireId(input.id ?? `slot-${index + 1}`, `roster[${index}].id`),
    role,
    player,
    projection
  });
}

function createLeagueSettings(input, sport) {
  requireObject(input, "leagueSettings");
  const normalizedSport = normalizeSport(input.sport ?? sport);
  const starterPositions = Array.isArray(input.starterPositions) ? input.starterPositions.map((position, index) => {
    const normalized = requireText(position, `leagueSettings.starterPositions[${index}]`, 10).toUpperCase();
    if (!POSITIONS[normalizedSport].includes(normalized)) {
      throw new Error(`leagueSettings.starterPositions[${index}] is not supported for ${normalizedSport}.`);
    }
    return normalized;
  }) : [];
  if (starterPositions.length === 0) throw new Error("leagueSettings.starterPositions requires at least one position.");
  return deepFreeze({
    sport: normalizedSport,
    name: input.name ? requireText(input.name, "leagueSettings.name") : "My League",
    starterPositions,
    scoringLabel: input.scoringLabel ? requireText(input.scoringLabel, "leagueSettings.scoringLabel", 80) : "Custom fantasy points",
    scoringRules: getScoringRules(normalizedSport, input.scoringRules ?? {})
  });
}

function createTeam(input, { profileId = "default", now = () => new Date() } = {}) {
  requireObject(input, "team");
  const sport = normalizeSport(input.sport);
  const leagueSettings = createLeagueSettings(input.leagueSettings, sport);
  if (leagueSettings.sport !== sport) throw new Error("team and leagueSettings sports must match.");
  if (!Array.isArray(input.roster) || input.roster.length === 0) throw new Error("roster requires at least one player.");
  const roster = input.roster.map((slot, index) => createRosterSlot(slot, sport, index));
  const playerIds = roster.map((slot) => slot.player.id);
  if (new Set(playerIds).size !== playerIds.length) throw new Error("Roster player IDs must be unique.");
  return deepFreeze({
    id: requireId(input.id, "team.id"),
    profileId: requireId(profileId, "profileId"),
    name: requireText(input.name, "team.name"),
    sport,
    leagueSettings,
    roster,
    createdAt: input.createdAt ?? now().toISOString(),
    updatedAt: now().toISOString()
  });
}

function createAvailablePlayer(input, sport, index = 0) {
  requireObject(input, `availablePlayers[${index}]`);
  const player = createPlayer(input.player ?? input, sport, `availablePlayers[${index}].player`);
  return deepFreeze({
    player,
    projection: createPlayerProjection(input.projection, player.id, `availablePlayers[${index}].projection`)
  });
}

module.exports = {
  PLAYER_STATUSES,
  POSITIONS,
  ROSTER_ROLES,
  createAvailablePlayer,
  createLeagueSettings,
  createPlayer,
  createPlayerProjection,
  createRosterSlot,
  createTeam,
  deepFreeze
};
