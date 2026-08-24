const { normalizeSport } = require("./sports");

const PLAYER_DATA_SCHEMA_VERSION = "sports-hub-player-data/1.0";
const PLAYER_DATA_TYPES = Object.freeze([
  "PROJECTIONS",
  "INJURIES",
  "SCHEDULES"
]);
const ROSTER_STATUSES = Object.freeze([
  "ACTIVE",
  "INACTIVE",
  "PRACTICE_SQUAD",
  "SUSPENDED",
  "UNKNOWN"
]);
const INJURY_STATUSES = Object.freeze([
  "HEALTHY",
  "QUESTIONABLE",
  "DOUBTFUL",
  "OUT",
  "IR",
  "UNKNOWN"
]);
const DEFAULT_FRESHNESS_THRESHOLDS_SECONDS = Object.freeze({
  INJURIES: 24 * 60 * 60,
  PROJECTIONS: 48 * 60 * 60,
  SCHEDULES: 7 * 24 * 60 * 60
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

function requireText(value, field, maximum = 160) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }
  const text = value.trim();
  if (text.length > maximum) {
    throw new Error(`${field} must be ${maximum} characters or fewer.`);
  }
  return text;
}

function requireExternalId(value, field) {
  const id = requireText(String(value ?? ""), field);
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) {
    throw new Error(`${field} contains unsupported characters.`);
  }
  return id;
}

function requireIsoDate(value, field) {
  const text = requireText(value, field, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${field} must be a valid ISO date.`);
  }
  return new Date(text).toISOString();
}

function requireNumber(value, field, { minimum = -Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`${field} must be a number of at least ${minimum}.`);
  }
  return number;
}

function createFreshness(
  sourceUpdatedAt,
  dataType,
  {
    now = () => new Date(),
    thresholds = DEFAULT_FRESHNESS_THRESHOLDS_SECONDS
  } = {}
) {
  const updatedAt = requireIsoDate(sourceUpdatedAt, "sourceUpdatedAt");
  const checkedAt = now().toISOString();
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.parse(checkedAt) - Date.parse(updatedAt)) / 1000)
  );
  const thresholdSeconds = thresholds[dataType];
  if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
    throw new Error(`No freshness threshold is configured for ${dataType}.`);
  }
  return deepFreeze({
    ageSeconds,
    checkedAt,
    sourceUpdatedAt: updatedAt,
    status: ageSeconds <= thresholdSeconds ? "FRESH" : "STALE",
    thresholdSeconds
  });
}

function createCommonRecord(input, dataType, options) {
  requireObject(input, "record");
  return {
    canonicalPlayerId: requireExternalId(
      input.canonicalPlayerId,
      "record.canonicalPlayerId"
    ),
    freshness: createFreshness(input.sourceUpdatedAt, dataType, options),
    providerId: requireExternalId(input.providerId, "record.providerId"),
    providerPlayerId: requireExternalId(
      input.providerPlayerId,
      "record.providerPlayerId"
    ),
    sourceUpdatedAt: requireIsoDate(
      input.sourceUpdatedAt,
      "record.sourceUpdatedAt"
    ),
    sport: normalizeSport(input.sport)
  };
}

function createProjectionRecord(input, options = {}) {
  const common = createCommonRecord(input, "PROJECTIONS", options);
  return deepFreeze({
    ...common,
    projectedFantasyPoints: requireNumber(
      input.projectedFantasyPoints,
      "record.projectedFantasyPoints",
      { minimum: 0 }
    ),
    scoringPeriod: requireText(input.scoringPeriod, "record.scoringPeriod", 80),
    season: requireText(String(input.season ?? ""), "record.season", 40),
    source: requireText(input.source, "record.source", 100)
  });
}

function normalizeStatus(value, allowed, field) {
  const status = requireText(value ?? "UNKNOWN", field, 40)
    .toUpperCase()
    .replaceAll(" ", "_");
  if (!allowed.includes(status)) {
    throw new Error(`${field} is not supported.`);
  }
  return status;
}

function createInjuryRecord(input, options = {}) {
  const common = createCommonRecord(input, "INJURIES", options);
  return deepFreeze({
    ...common,
    bodyPart: input.bodyPart
      ? requireText(input.bodyPart, "record.bodyPart", 80)
      : null,
    injuryStatus: normalizeStatus(
      input.injuryStatus,
      INJURY_STATUSES,
      "record.injuryStatus"
    ),
    note: input.note ? requireText(input.note, "record.note", 240) : null,
    rosterStatus: normalizeStatus(
      input.rosterStatus,
      ROSTER_STATUSES,
      "record.rosterStatus"
    )
  });
}

function createScheduleRecord(input, options = {}) {
  requireObject(input, "record");
  const sport = normalizeSport(input.sport);
  const sourceUpdatedAt = requireIsoDate(
    input.sourceUpdatedAt,
    "record.sourceUpdatedAt"
  );
  return deepFreeze({
    awayTeam: requireText(input.awayTeam, "record.awayTeam", 80),
    freshness: createFreshness(
      sourceUpdatedAt,
      "SCHEDULES",
      options
    ),
    gameId: requireExternalId(input.gameId, "record.gameId"),
    homeTeam: requireText(input.homeTeam, "record.homeTeam", 80),
    providerId: requireExternalId(input.providerId, "record.providerId"),
    scheduledAt: requireIsoDate(input.scheduledAt, "record.scheduledAt"),
    scoringPeriod: requireText(input.scoringPeriod, "record.scoringPeriod", 80),
    season: requireText(String(input.season ?? ""), "record.season", 40),
    sourceUpdatedAt,
    sport,
    status: requireText(input.status, "record.status", 40).toUpperCase()
  });
}

function createPlayerDataEnvelope({
  dataType,
  fetchedAt,
  provider,
  records,
  rejectedRecords = [],
  sport
}) {
  const normalizedType = requireText(dataType, "dataType", 40).toUpperCase();
  if (!PLAYER_DATA_TYPES.includes(normalizedType)) {
    throw new Error(`Unsupported player data type: ${dataType}.`);
  }
  if (!Array.isArray(records) || !Array.isArray(rejectedRecords)) {
    throw new Error("records and rejectedRecords must be arrays.");
  }
  requireObject(provider, "provider");
  return deepFreeze({
    dataType: normalizedType,
    fetchedAt: requireIsoDate(fetchedAt, "fetchedAt"),
    provider,
    records: [...records],
    rejectedCount: rejectedRecords.length,
    rejectedRecords: rejectedRecords.map((record) => ({
      index: requireNumber(record.index, "rejectedRecords.index", { minimum: 0 }),
      reason: requireText(record.reason, "rejectedRecords.reason", 240)
    })),
    schemaVersion: PLAYER_DATA_SCHEMA_VERSION,
    sport: normalizeSport(sport)
  });
}

module.exports = {
  DEFAULT_FRESHNESS_THRESHOLDS_SECONDS,
  INJURY_STATUSES,
  PLAYER_DATA_SCHEMA_VERSION,
  PLAYER_DATA_TYPES,
  ROSTER_STATUSES,
  createFreshness,
  createInjuryRecord,
  createPlayerDataEnvelope,
  createProjectionRecord,
  createScheduleRecord
};
