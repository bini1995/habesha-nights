const {
  normalizeSport
} = require("./sports");

const {
  SCORING_VERSION,
  getScoringRules
} = require("./scoring");

const MINI_LEAGUE_SCHEMA_VERSION = "sports-hub-mini-league/1.0";
const MINI_LEAGUE_SCORING_SOURCE = "MANUAL_OFFICIAL_FANTASY_POINTS";
const MAX_LEAGUE_MEMBERS = 12;
const MAX_SCORING_PERIODS = 30;

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

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function requireBoundedText(value, field, maximum = 80) {
  const text = requireText(value, field);
  if (text.length > maximum) {
    throw new Error(`${field} must be ${maximum} characters or fewer.`);
  }
  return text;
}

function requireIsoDate(value, field) {
  const text = requireBoundedText(value, field, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${field} must be a valid ISO date.`);
  }
  return new Date(text).toISOString();
}

function normalizeScoringPeriodCount(value) {
  const count = Number(value ?? 14);
  if (!Number.isInteger(count) || count < 1 || count > MAX_SCORING_PERIODS) {
    throw new Error(
      `scoringPeriodCount must be between 1 and ${MAX_SCORING_PERIODS}.`
    );
  }
  return count;
}

function normalizeMember(member, index) {
  if (!member || typeof member !== "object") {
    throw new Error(`members[${index}] must be an object.`);
  }
  const role = String(member.role ?? "MEMBER").trim().toUpperCase();
  if (!["OWNER", "MEMBER"].includes(role)) {
    throw new Error(`members[${index}].role must be OWNER or MEMBER.`);
  }
  return {
    id: requireBoundedText(member.id, `members[${index}].id`),
    displayName: requireBoundedText(
      member.displayName,
      `members[${index}].displayName`
    ),
    joinedAt: requireIsoDate(member.joinedAt, `members[${index}].joinedAt`),
    role
  };
}

function normalizeMembership(membership, index) {
  if (!membership || typeof membership !== "object") {
    throw new Error(`memberships[${index}] must be an object.`);
  }
  return {
    memberId: requireBoundedText(
      membership.memberId,
      `memberships[${index}].memberId`
    ),
    teamId: membership.teamId
      ? requireBoundedText(membership.teamId, `memberships[${index}].teamId`)
      : null
  };
}

function normalizeOfficialPoints(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const points = Number(value);
  if (!Number.isFinite(points) || points < 0 || points > 10000) {
    throw new Error(`${field} must be between 0 and 10000.`);
  }
  return Math.round((points + Number.EPSILON) * 100) / 100;
}

function normalizeMatchup(matchup, index) {
  if (!matchup || typeof matchup !== "object") {
    throw new Error(`matchups[${index}] must be an object.`);
  }
  const scoringPeriod = Number(matchup.scoringPeriod);
  if (!Number.isInteger(scoringPeriod) || scoringPeriod < 1) {
    throw new Error(`matchups[${index}].scoringPeriod must be a positive integer.`);
  }
  const homePoints = normalizeOfficialPoints(
    matchup.homePoints,
    `matchups[${index}].homePoints`
  );
  const awayPoints = normalizeOfficialPoints(
    matchup.awayPoints,
    `matchups[${index}].awayPoints`
  );
  if ((homePoints === null) !== (awayPoints === null)) {
    throw new Error(`matchups[${index}] requires both point totals.`);
  }
  return {
    id: requireBoundedText(matchup.id, `matchups[${index}].id`),
    scoringPeriod,
    homeMemberId: requireBoundedText(
      matchup.homeMemberId,
      `matchups[${index}].homeMemberId`
    ),
    awayMemberId: requireBoundedText(
      matchup.awayMemberId,
      `matchups[${index}].awayMemberId`
    ),
    homePoints,
    awayPoints,
    scoredAt: homePoints === null
      ? null
      : requireIsoDate(matchup.scoredAt, `matchups[${index}].scoredAt`)
  };
}

function buildRoundRobinSchedule({ leagueId, memberIds, scoringPeriodCount }) {
  requireBoundedText(leagueId, "leagueId");
  const periodCount = normalizeScoringPeriodCount(scoringPeriodCount);
  if (!Array.isArray(memberIds)) throw new Error("memberIds must be an array.");
  const uniqueIds = [...new Set(memberIds.map((id, index) =>
    requireBoundedText(id, `memberIds[${index}]`)))].sort();
  if (uniqueIds.length !== memberIds.length) {
    throw new Error("memberIds must be unique.");
  }
  if (uniqueIds.length < 2) return Object.freeze([]);

  const participants = uniqueIds.length % 2 === 0
    ? uniqueIds
    : [...uniqueIds, null];
  const roundsPerCycle = participants.length - 1;
  let rotation = [...participants];
  const rounds = [];

  for (let round = 0; round < roundsPerCycle; round += 1) {
    const pairs = [];
    for (let pair = 0; pair < rotation.length / 2; pair += 1) {
      const first = rotation[pair];
      const second = rotation[rotation.length - 1 - pair];
      if (!first || !second) continue;
      pairs.push((round + pair) % 2 === 0
        ? [first, second]
        : [second, first]);
    }
    rounds.push(pairs);
    rotation = [rotation[0], rotation.at(-1), ...rotation.slice(1, -1)];
  }

  const matchups = [];
  for (let scoringPeriod = 1; scoringPeriod <= periodCount; scoringPeriod += 1) {
    const cycle = Math.floor((scoringPeriod - 1) / roundsPerCycle);
    const pairs = rounds[(scoringPeriod - 1) % roundsPerCycle];
    pairs.forEach(([first, second], index) => {
      const [homeMemberId, awayMemberId] = cycle % 2 === 0
        ? [first, second]
        : [second, first];
      matchups.push({
        id: `matchup-${scoringPeriod}-${index + 1}`,
        scoringPeriod,
        homeMemberId,
        awayMemberId,
        homePoints: null,
        awayPoints: null,
        scoredAt: null
      });
    });
  }
  return deepFreeze(matchups);
}

function createMiniLeague(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Mini-league data is required.");
  }
  const sport = normalizeSport(input.sport);
  const members = Array.isArray(input.members)
    ? input.members.map(normalizeMember)
    : [];
  if (members.length < 1 || members.length > MAX_LEAGUE_MEMBERS) {
    throw new Error(
      `members must contain between 1 and ${MAX_LEAGUE_MEMBERS} managers.`
    );
  }
  const memberIds = members.map((member) => member.id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error("Member IDs must be unique.");
  }
  const names = members.map((member) => member.displayName.toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    throw new Error("Manager names must be unique.");
  }
  if (members.filter((member) => member.role === "OWNER").length !== 1) {
    throw new Error("A mini-league requires exactly one owner.");
  }
  const ownerMemberId = requireBoundedText(input.ownerMemberId, "ownerMemberId");
  if (!members.some((member) =>
    member.id === ownerMemberId && member.role === "OWNER")) {
    throw new Error("ownerMemberId must identify the owner.");
  }

  const memberships = Array.isArray(input.memberships)
    ? input.memberships.map(normalizeMembership)
    : [];
  if (memberships.length !== members.length ||
      new Set(memberships.map((membership) => membership.memberId)).size !== members.length ||
      memberships.some((membership) => !memberIds.includes(membership.memberId))) {
    throw new Error("Each member requires exactly one team membership.");
  }
  const assignedTeams = memberships
    .map((membership) => membership.teamId)
    .filter(Boolean);
  if (new Set(assignedTeams).size !== assignedTeams.length) {
    throw new Error("A saved team may belong to only one manager in a league.");
  }

  const scoringPeriodCount = normalizeScoringPeriodCount(
    input.scoringPeriodCount
  );
  const matchups = Array.isArray(input.matchups)
    ? input.matchups.map(normalizeMatchup)
    : [];
  const matchupIds = matchups.map((matchup) => matchup.id);
  if (new Set(matchupIds).size !== matchupIds.length) {
    throw new Error("Matchup IDs must be unique.");
  }
  if (matchups.some((matchup) =>
    matchup.scoringPeriod > scoringPeriodCount ||
    matchup.homeMemberId === matchup.awayMemberId ||
    !memberIds.includes(matchup.homeMemberId) ||
    !memberIds.includes(matchup.awayMemberId))) {
    throw new Error("Each matchup must reference two league members and a valid period.");
  }

  const createdAt = requireIsoDate(input.createdAt, "createdAt");
  const updatedAt = requireIsoDate(input.updatedAt, "updatedAt");
  return deepFreeze({
    schemaVersion: MINI_LEAGUE_SCHEMA_VERSION,
    id: requireBoundedText(input.id, "id"),
    profileId: requireBoundedText(input.profileId, "profileId"),
    name: requireBoundedText(input.name, "name"),
    sport,
    status: matchups.some((matchup) => matchup.scoredAt)
      ? "IN_PROGRESS"
      : "OPEN",
    ownerMemberId,
    joinCodeHash: requireBoundedText(input.joinCodeHash, "joinCodeHash", 128),
    scoringPeriodCount,
    scoringSource: MINI_LEAGUE_SCORING_SOURCE,
    teamScoreAffectsStandings: false,
    managerScore: null,
    aiRanking: null,
    members,
    memberships,
    matchups,
    createdAt,
    updatedAt
  });
}

function calculateStandings(league) {
  const record = createMiniLeague(league);
  const rows = record.members.map((member) => {
    const membership = record.memberships.find((item) =>
      item.memberId === member.id);
    return {
      memberId: member.id,
      displayName: member.displayName,
      teamId: membership?.teamId ?? null,
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0
    };
  });
  const byMember = new Map(rows.map((row) => [row.memberId, row]));
  record.matchups.filter((matchup) => matchup.scoredAt).forEach((matchup) => {
    const home = byMember.get(matchup.homeMemberId);
    const away = byMember.get(matchup.awayMemberId);
    home.played += 1;
    away.played += 1;
    home.pointsFor += matchup.homePoints;
    home.pointsAgainst += matchup.awayPoints;
    away.pointsFor += matchup.awayPoints;
    away.pointsAgainst += matchup.homePoints;
    if (matchup.homePoints > matchup.awayPoints) {
      home.wins += 1;
      away.losses += 1;
    } else if (matchup.homePoints < matchup.awayPoints) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  });
  rows.forEach((row) => {
    row.pointsFor = Math.round((row.pointsFor + Number.EPSILON) * 100) / 100;
    row.pointsAgainst = Math.round((row.pointsAgainst + Number.EPSILON) * 100) / 100;
    row.pointDifferential = Math.round(
      (row.pointsFor - row.pointsAgainst + Number.EPSILON) * 100
    ) / 100;
  });
  rows.sort((left, right) =>
    right.wins - left.wins ||
    right.ties - left.ties ||
    right.pointDifferential - left.pointDifferential ||
    right.pointsFor - left.pointsFor ||
    left.displayName.localeCompare(right.displayName) ||
    left.memberId.localeCompare(right.memberId));
  return deepFreeze(rows.map((row, index) => ({ rank: index + 1, ...row })));
}

module.exports = {
  MAX_LEAGUE_MEMBERS,
  MAX_SCORING_PERIODS,
  MINI_LEAGUE_SCHEMA_VERSION,
  MINI_LEAGUE_SCORING_SOURCE,
  buildRoundRobinSchedule,
  calculateStandings,
  createLeague,
  createMiniLeague,
  normalizeOfficialPoints
};
