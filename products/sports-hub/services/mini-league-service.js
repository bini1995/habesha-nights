const crypto = require("crypto");
const {
  MAX_LEAGUE_MEMBERS,
  buildRoundRobinSchedule,
  calculateStandings,
  createMiniLeague,
  normalizeOfficialPoints
} = require("../domain/league");
const { normalizeSport } = require("../domain/sports");
const { DEFAULT_PROFILE_ID } = require("./team-store");

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class MiniLeagueValidationError extends Error {}
class MiniLeagueNotFoundError extends Error {}
class MiniLeagueConflictError extends Error {}

function normalizeJoinCode(value) {
  const code = String(value ?? "").trim().toUpperCase().replace(/[ -]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    throw new MiniLeagueValidationError("Enter a valid 8-character league code.");
  }
  return code;
}

function hashJoinCode(value) {
  return crypto.createHash("sha256").update(normalizeJoinCode(value)).digest("hex");
}

function generateJoinCode() {
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((byte) =>
    JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join("");
}

function publicLeague(league) {
  const { joinCodeHash, ...safe } = league;
  const standings = calculateStandings(league);
  return {
    ...safe,
    completedMatchupCount: league.matchups.filter((matchup) => matchup.scoredAt).length,
    standings
  };
}

function requireDisplayName(value, field = "managerName") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MiniLeagueValidationError(`${field} is required.`);
  }
  const name = value.trim();
  if (name.length > 50) {
    throw new MiniLeagueValidationError(`${field} must be 50 characters or fewer.`);
  }
  return name;
}

function requireLeagueName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MiniLeagueValidationError("leagueName is required.");
  }
  const name = value.trim();
  if (name.length > 80) {
    throw new MiniLeagueValidationError("leagueName must be 80 characters or fewer.");
  }
  return name;
}

function createMiniLeagueService({
  miniLeagueStore,
  teamStore,
  now = () => new Date(),
  createId = (kind) => `${kind}-${crypto.randomUUID()}`,
  createJoinCode = generateJoinCode
}) {
  if (!miniLeagueStore || !teamStore) {
    throw new Error("miniLeagueStore and teamStore are required.");
  }
  let mutationQueue = Promise.resolve();

  function serializeMutation(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function requireTeam(teamId, sport, profileId) {
    if (!teamId) return null;
    const team = await teamStore.get(String(teamId), profileId);
    if (!team) throw new MiniLeagueNotFoundError("Saved team not found.");
    if (team.sport !== sport) {
      throw new MiniLeagueValidationError(
        "The saved team must use the same sport as the mini-league."
      );
    }
    return team;
  }

  async function uniqueJoinCode(profileId) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = normalizeJoinCode(createJoinCode());
      if (!(await miniLeagueStore.findByJoinCodeHash(hashJoinCode(code), profileId))) {
        return code;
      }
    }
    throw new Error("A unique league code could not be generated.");
  }

  async function create(input, profileId = DEFAULT_PROFILE_ID) {
    try {
      const sport = normalizeSport(input?.sport);
      const leagueName = requireLeagueName(input?.name);
      const ownerName = requireDisplayName(input?.ownerName, "ownerName");
      const team = await requireTeam(input?.teamId, sport, profileId);
      const timestamp = now().toISOString();
      const leagueId = createId("league");
      const ownerMemberId = createId("member");
      const joinCode = await uniqueJoinCode(profileId);
      const members = [{
        id: ownerMemberId,
        displayName: ownerName,
        joinedAt: timestamp,
        role: "OWNER"
      }];
      const league = createMiniLeague({
        id: leagueId,
        profileId,
        name: leagueName,
        sport,
        ownerMemberId,
        joinCodeHash: hashJoinCode(joinCode),
        scoringPeriodCount: input?.scoringPeriodCount,
        members,
        memberships: [{ memberId: ownerMemberId, teamId: team?.id ?? null }],
        matchups: buildRoundRobinSchedule({
          leagueId,
          memberIds: [ownerMemberId],
          scoringPeriodCount: input?.scoringPeriodCount
        }),
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await miniLeagueStore.save(league, profileId);
      return { joinCode, league: publicLeague(league) };
    } catch (error) {
      if (error instanceof MiniLeagueNotFoundError ||
          error instanceof MiniLeagueValidationError) throw error;
      throw new MiniLeagueValidationError(error.message);
    }
  }

  async function list(profileId = DEFAULT_PROFILE_ID) {
    return Promise.all((await miniLeagueStore.list(profileId)).map(publicLeague));
  }

  async function get(leagueId, profileId = DEFAULT_PROFILE_ID) {
    const league = await miniLeagueStore.get(leagueId, profileId);
    if (!league) throw new MiniLeagueNotFoundError("Mini-league not found.");
    return publicLeague(league);
  }

  async function join(input, profileId = DEFAULT_PROFILE_ID) {
    const codeHash = hashJoinCode(input?.joinCode);
    const existing = await miniLeagueStore.findByJoinCodeHash(codeHash, profileId);
    if (!existing) throw new MiniLeagueNotFoundError("League code not found.");
    if (existing.matchups.some((matchup) => matchup.scoredAt)) {
      throw new MiniLeagueConflictError(
        "Membership is locked because league scoring has started."
      );
    }
    if (existing.members.length >= MAX_LEAGUE_MEMBERS) {
      throw new MiniLeagueConflictError("This mini-league is full.");
    }
    const managerName = requireDisplayName(input?.managerName);
    if (existing.members.some((member) =>
      member.displayName.toLocaleLowerCase() === managerName.toLocaleLowerCase())) {
      throw new MiniLeagueConflictError("That manager name is already in this league.");
    }
    const team = await requireTeam(input?.teamId, existing.sport, profileId);
    if (team && existing.memberships.some((membership) =>
      membership.teamId === team.id)) {
      throw new MiniLeagueConflictError("That saved team is already assigned in this league.");
    }
    const timestamp = now().toISOString();
    const memberId = createId("member");
    const members = [...existing.members, {
      id: memberId,
      displayName: managerName,
      joinedAt: timestamp,
      role: "MEMBER"
    }];
    const league = createMiniLeague({
      ...existing,
      members,
      memberships: [
        ...existing.memberships,
        { memberId, teamId: team?.id ?? null }
      ],
      matchups: buildRoundRobinSchedule({
        leagueId: existing.id,
        memberIds: members.map((member) => member.id),
        scoringPeriodCount: existing.scoringPeriodCount
      }),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return publicLeague(league);
  }

  async function recordScore({ leagueId, matchupId, homePoints, awayPoints }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await miniLeagueStore.get(leagueId, profileId);
    if (!existing) throw new MiniLeagueNotFoundError("Mini-league not found.");
    const matchup = existing.matchups.find((item) => item.id === matchupId);
    if (!matchup) throw new MiniLeagueNotFoundError("Matchup not found.");
    let normalizedHome;
    let normalizedAway;
    try {
      normalizedHome = normalizeOfficialPoints(homePoints, "homePoints");
      normalizedAway = normalizeOfficialPoints(awayPoints, "awayPoints");
    } catch (error) {
      throw new MiniLeagueValidationError(error.message);
    }
    if (normalizedHome === null || normalizedAway === null) {
      throw new MiniLeagueValidationError("Enter both official point totals.");
    }
    const timestamp = now().toISOString();
    const league = createMiniLeague({
      ...existing,
      matchups: existing.matchups.map((item) => item.id === matchupId
        ? {
          ...item,
          homePoints: normalizedHome,
          awayPoints: normalizedAway,
          scoredAt: timestamp
        }
        : item),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return publicLeague(league);
  }

  return {
    create: (...arguments_) => serializeMutation(() => create(...arguments_)),
    get,
    join: (...arguments_) => serializeMutation(() => join(...arguments_)),
    list,
    recordScore: (...arguments_) =>
      serializeMutation(() => recordScore(...arguments_))
  };
}

module.exports = {
  MiniLeagueConflictError,
  MiniLeagueNotFoundError,
  MiniLeagueValidationError,
  createMiniLeagueService,
  generateJoinCode,
  hashJoinCode,
  normalizeJoinCode,
  publicLeague
};
