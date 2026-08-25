const crypto = require("node:crypto");

const TEAM_CHECK_IN_SCHEMA_VERSION = "sports-hub-team-check-in/1.0";

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

function requireNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a number.`);
  return number;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function createTeamCheckIn({
  analysisRecord,
  checkInId = `check-in-${crypto.randomUUID()}`,
  now = () => new Date()
}) {
  requireObject(analysisRecord, "analysisRecord");
  const analysis = requireObject(
    analysisRecord.outputSnapshot,
    "analysisRecord.outputSnapshot"
  );
  const inputSnapshot = requireObject(
    analysisRecord.inputSnapshot,
    "analysisRecord.inputSnapshot"
  );
  const team = requireObject(inputSnapshot.team, "inputSnapshot.team");
  if (!Array.isArray(team.roster) || team.roster.length === 0) {
    throw new Error("inputSnapshot.team.roster requires players.");
  }
  if (analysis.teamId !== analysisRecord.teamId || team.id !== analysisRecord.teamId) {
    throw new Error("Analysis and team IDs must match before saving a check-in.");
  }

  const roster = team.roster.map((slot, index) => {
    requireObject(slot, `roster[${index}]`);
    const player = requireObject(slot.player, `roster[${index}].player`);
    const projectedFantasyPoints = slot.projection?.projectedFantasyPoints;
    return {
      playerId: requireText(player.id, `roster[${index}].player.id`, 80),
      name: requireText(player.name, `roster[${index}].player.name`),
      position: requireText(player.position, `roster[${index}].player.position`, 10),
      projectedFantasyPoints: projectedFantasyPoints == null
        ? null
        : requireNumber(
          projectedFantasyPoints,
          `roster[${index}].projection.projectedFantasyPoints`
        ),
      role: requireText(slot.role, `roster[${index}].role`, 20),
      status: requireText(player.status, `roster[${index}].player.status`, 40)
    };
  });

  return deepFreeze({
    analysisId: requireText(analysisRecord.analysisId, "analysisId", 100),
    analysisVersion: requireText(
      analysis.teamScoreVersion,
      "analysis.teamScoreVersion",
      40
    ),
    checkInId: requireText(checkInId, "checkInId", 100),
    checkedInAt: now().toISOString(),
    components: Object.fromEntries(
      Object.entries(requireObject(analysis.components, "analysis.components"))
        .map(([key, value]) => [key, requireNumber(value, `components.${key}`)])
    ),
    confidence: requireText(
      analysis.dataCompleteness?.confidence,
      "analysis.dataCompleteness.confidence",
      20
    ),
    completenessPercentage: requireNumber(
      analysis.dataCompleteness?.percentage,
      "analysis.dataCompleteness.percentage"
    ),
    inputChecksum: requireText(
      analysisRecord.inputChecksum,
      "inputChecksum",
      128
    ),
    letterGrade: requireText(analysis.letterGrade, "analysis.letterGrade", 4),
    overallScore: requireNumber(analysis.overallScore, "analysis.overallScore"),
    profileId: requireText(analysisRecord.profileId, "profileId", 80),
    projectedRosterTotal: requireNumber(
      analysis.officialFantasyPoints?.projectedRosterTotal ?? 0,
      "analysis.officialFantasyPoints.projectedRosterTotal"
    ),
    projectionLabel: requireText(
      analysis.officialFantasyPoints?.label,
      "analysis.officialFantasyPoints.label"
    ),
    provenance: {
      freshness: analysis.provenance?.freshness ?? null,
      projectionDate: analysis.provenance?.projectionDate ?? null,
      scoringPeriod: analysis.provenance?.scoringPeriod ?? null,
      source: analysis.provenance?.source ?? "UNKNOWN"
    },
    roster,
    schemaVersion: TEAM_CHECK_IN_SCHEMA_VERSION,
    sport: requireText(analysis.sport, "analysis.sport", 20),
    teamId: requireText(analysisRecord.teamId, "teamId", 80),
    teamName: requireText(team.name, "team.name")
  });
}

function compareTeamCheckIns(current, previous = null) {
  requireObject(current, "currentCheckIn");
  if (!previous) {
    return deepFreeze({
      analysisVersionChanged: false,
      componentDeltas: {},
      direction: "BASELINE",
      hasPrevious: false,
      lineupChanges: [],
      playerChanges: { added: [], removed: [] },
      projectionChanges: [],
      projectionTotalDelta: null,
      scoreDelta: null,
      statusChanges: [],
      summary: [
        `Baseline saved at ${current.overallScore} out of 100.`
      ]
    });
  }
  if (current.teamId !== previous.teamId || current.sport !== previous.sport) {
    throw new Error("Only check-ins for the same team and sport can be compared.");
  }

  const currentPlayers = new Map(
    current.roster.map((player) => [player.playerId, player])
  );
  const previousPlayers = new Map(
    previous.roster.map((player) => [player.playerId, player])
  );
  const added = current.roster
    .filter((player) => !previousPlayers.has(player.playerId))
    .map((player) => ({ playerId: player.playerId, name: player.name }));
  const removed = previous.roster
    .filter((player) => !currentPlayers.has(player.playerId))
    .map((player) => ({ playerId: player.playerId, name: player.name }));
  const sharedPlayers = current.roster.filter((player) =>
    previousPlayers.has(player.playerId)
  );
  const lineupChanges = sharedPlayers
    .filter((player) => previousPlayers.get(player.playerId).role !== player.role)
    .map((player) => ({
      from: previousPlayers.get(player.playerId).role,
      name: player.name,
      playerId: player.playerId,
      to: player.role
    }));
  const statusChanges = sharedPlayers
    .filter((player) => previousPlayers.get(player.playerId).status !== player.status)
    .map((player) => ({
      from: previousPlayers.get(player.playerId).status,
      name: player.name,
      playerId: player.playerId,
      to: player.status
    }));
  const projectionChanges = sharedPlayers
    .filter((player) => {
      const before = previousPlayers.get(player.playerId).projectedFantasyPoints;
      return before != null &&
        player.projectedFantasyPoints != null &&
        before !== player.projectedFantasyPoints;
    })
    .map((player) => {
      const before = previousPlayers.get(player.playerId).projectedFantasyPoints;
      return {
        before,
        delta: round(player.projectedFantasyPoints - before),
        name: player.name,
        playerId: player.playerId,
        value: player.projectedFantasyPoints
      };
    });
  const analysisVersionChanged =
    current.analysisVersion !== previous.analysisVersion;
  const componentDeltas = analysisVersionChanged
    ? {}
    : Object.fromEntries(
      Object.entries(current.components).map(([key, value]) => [
        key,
        round(value - (previous.components[key] ?? 0))
      ])
    );
  const scoreDelta = analysisVersionChanged
    ? null
    : round(current.overallScore - previous.overallScore);
  const projectionTotalDelta = round(
    current.projectedRosterTotal - previous.projectedRosterTotal
  );
  const direction = analysisVersionChanged
    ? "VERSION_CHANGED"
    : scoreDelta > 0
      ? "IMPROVED"
      : scoreDelta < 0
        ? "DECLINED"
        : "UNCHANGED";
  const scoreSummary = analysisVersionChanged
    ? `Team Score changed from version ${previous.analysisVersion} to ${current.analysisVersion}; scores are not compared.`
    : scoreDelta > 0
      ? `Team Score improved by ${scoreDelta} point${scoreDelta === 1 ? "" : "s"}.`
      : scoreDelta < 0
        ? `Team Score decreased by ${Math.abs(scoreDelta)} point${scoreDelta === -1 ? "" : "s"}.`
        : "Team Score is unchanged.";
  const projectionSummary = projectionTotalDelta > 0
    ? `Roster projection increased by ${projectionTotalDelta}.`
    : projectionTotalDelta < 0
      ? `Roster projection decreased by ${Math.abs(projectionTotalDelta)}.`
      : "Roster projection is unchanged.";

  return deepFreeze({
    analysisVersionChanged,
    componentDeltas,
    direction,
    hasPrevious: true,
    lineupChanges,
    playerChanges: { added, removed },
    projectionChanges,
    projectionTotalDelta,
    scoreDelta,
    statusChanges,
    summary: [
      scoreSummary,
      projectionSummary,
      statusChanges.length
        ? `${statusChanges.length} player availability status ${statusChanges.length === 1 ? "changed" : "changes were recorded"}.`
        : "No player availability statuses changed."
    ]
  });
}

module.exports = {
  TEAM_CHECK_IN_SCHEMA_VERSION,
  compareTeamCheckIns,
  createTeamCheckIn
};
