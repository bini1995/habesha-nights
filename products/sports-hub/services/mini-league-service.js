const crypto = require("crypto");
const {
  MAX_LEAGUE_AUDIT_EVENTS,
  MAX_LEAGUE_MEMBERS,
  buildRoundRobinSchedule,
  calculateStandings,
  createMiniLeague,
  normalizeOfficialPoints
} = require("../domain/league");
const { normalizeSport } = require("../domain/sports");
const { DEFAULT_PROFILE_ID } = require("./team-store");
const {
  LeagueAuthorizationError,
  createLocalLeagueAccessProvider
} = require("./league-access-provider");

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
  const { commissionerKeyHash, joinCodeHash, ...safe } = league;
  const standings = calculateStandings(league);
  return {
    ...safe,
    commissionerAccessConfigured: Boolean(commissionerKeyHash),
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
  createJoinCode = generateJoinCode,
  leagueAccessProvider = createLocalLeagueAccessProvider()
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

  function appendAudit(league, event) {
    return [...(league.auditTrail ?? []), event]
      .slice(-MAX_LEAGUE_AUDIT_EVENTS);
  }

  function auditEvent(type, league, timestamp, details = {}) {
    return {
      id: createId("audit"),
      type,
      occurredAt: timestamp,
      actorMemberId: league.ownerMemberId,
      scoringPeriod: details.scoringPeriod ?? null,
      matchupId: details.matchupId ?? null,
      previousResult: details.previousResult ?? null,
      nextResult: details.nextResult ?? null
    };
  }

  async function requireLeague(leagueId, profileId) {
    const league = await miniLeagueStore.get(leagueId, profileId);
    if (!league) throw new MiniLeagueNotFoundError("Mini-league not found.");
    return league;
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
      const commissionerKey = leagueAccessProvider.issueCommissionerKey();
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
        authorizationMode: "COMMISSIONER_KEY",
        commissionerKeyHash:
          leagueAccessProvider.hashCommissionerKey(commissionerKey),
        joinCodeHash: hashJoinCode(joinCode),
        scoringPeriodCount: input?.scoringPeriodCount,
        lockedScoringPeriods: [],
        members,
        memberships: [{ memberId: ownerMemberId, teamId: team?.id ?? null }],
        matchups: buildRoundRobinSchedule({
          leagueId,
          memberIds: [ownerMemberId],
          scoringPeriodCount: input?.scoringPeriodCount
        }),
        auditTrail: [],
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await miniLeagueStore.save(league, profileId);
      return { commissionerKey, joinCode, league: publicLeague(league) };
    } catch (error) {
      if (error instanceof MiniLeagueNotFoundError ||
          error instanceof MiniLeagueValidationError) throw error;
      if (error.code) throw error;
      throw new MiniLeagueValidationError(error.message);
    }
  }

  async function list(profileId = DEFAULT_PROFILE_ID) {
    return Promise.all((await miniLeagueStore.list(profileId)).map(publicLeague));
  }

  async function get(leagueId, profileId = DEFAULT_PROFILE_ID) {
    return publicLeague(await requireLeague(leagueId, profileId));
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

  async function recordScore({ leagueId, matchupId, homePoints, awayPoints, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    const matchup = existing.matchups.find((item) => item.id === matchupId);
    if (!matchup) throw new MiniLeagueNotFoundError("Matchup not found.");
    if (existing.lockedScoringPeriods.includes(matchup.scoringPeriod)) {
      throw new MiniLeagueConflictError(
        `Scoring period ${matchup.scoringPeriod} is locked.`
      );
    }
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
    const previousResult = matchup.scoredAt
      ? { homePoints: matchup.homePoints, awayPoints: matchup.awayPoints }
      : null;
    const nextResult = {
      homePoints: normalizedHome,
      awayPoints: normalizedAway
    };
    const event = auditEvent(
      matchup.scoredAt ? "RESULT_CORRECTED" : "RESULT_RECORDED",
      existing,
      timestamp,
      {
        scoringPeriod: matchup.scoringPeriod,
        matchupId,
        previousResult,
        nextResult
      }
    );
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
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return publicLeague(league);
  }

  async function verifyCommissioner({ leagueId, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const league = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(league, commissionerKey);
    return {
      authorized: true,
      ownerMemberId: league.ownerMemberId
    };
  }

  async function claimCommissioner(leagueId, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    if (existing.commissionerKeyHash ||
        existing.authorizationMode !== "LEGACY_UNCLAIMED") {
      throw new MiniLeagueConflictError(
        "Commissioner access is already configured for this league."
      );
    }
    const commissionerKey = leagueAccessProvider.issueCommissionerKey();
    const timestamp = now().toISOString();
    const event = auditEvent(
      "COMMISSIONER_ACCESS_CLAIMED",
      existing,
      timestamp
    );
    const league = createMiniLeague({
      ...existing,
      authorizationMode: "COMMISSIONER_KEY",
      commissionerKeyHash:
        leagueAccessProvider.hashCommissionerKey(commissionerKey),
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return { commissionerKey, league: publicLeague(league) };
  }

  async function rotateJoinCode({ leagueId, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    const joinCode = await uniqueJoinCode(profileId);
    const timestamp = now().toISOString();
    const event = auditEvent("JOIN_CODE_ROTATED", existing, timestamp);
    const league = createMiniLeague({
      ...existing,
      joinCodeHash: hashJoinCode(joinCode),
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return { joinCode, league: publicLeague(league) };
  }

  async function setScoringPeriodLock({ leagueId, scoringPeriod, locked, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    const period = Number(scoringPeriod);
    if (!Number.isInteger(period) || period < 1 ||
        period > existing.scoringPeriodCount) {
      throw new MiniLeagueValidationError("Select a valid scoring period.");
    }
    if (typeof locked !== "boolean") {
      throw new MiniLeagueValidationError("locked must be true or false.");
    }
    const currentlyLocked = existing.lockedScoringPeriods.includes(period);
    if (currentlyLocked === locked) return publicLeague(existing);
    if (locked) {
      const periodMatchups = existing.matchups.filter((matchup) =>
        matchup.scoringPeriod === period);
      if (!periodMatchups.length || periodMatchups.some((matchup) =>
        !matchup.scoredAt)) {
        throw new MiniLeagueConflictError(
          "Record every matchup result before locking this scoring period."
        );
      }
    }
    const timestamp = now().toISOString();
    const event = auditEvent(
      locked ? "SCORING_PERIOD_LOCKED" : "SCORING_PERIOD_UNLOCKED",
      existing,
      timestamp,
      { scoringPeriod: period }
    );
    const lockedScoringPeriods = locked
      ? [...existing.lockedScoringPeriods, period]
      : existing.lockedScoringPeriods.filter((item) => item !== period);
    const league = createMiniLeague({
      ...existing,
      lockedScoringPeriods,
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return publicLeague(league);
  }

  function status() {
    return {
      authorization: leagueAccessProvider.status(),
      storage: miniLeagueStore.status?.() ?? {
        id: "custom",
        hosted: false,
        migrationReady: false
      }
    };
  }

  return {
    claimCommissioner: (...arguments_) =>
      serializeMutation(() => claimCommissioner(...arguments_)),
    create: (...arguments_) => serializeMutation(() => create(...arguments_)),
    get,
    join: (...arguments_) => serializeMutation(() => join(...arguments_)),
    list,
    recordScore: (...arguments_) =>
      serializeMutation(() => recordScore(...arguments_)),
    rotateJoinCode: (...arguments_) =>
      serializeMutation(() => rotateJoinCode(...arguments_)),
    setScoringPeriodLock: (...arguments_) =>
      serializeMutation(() => setScoringPeriodLock(...arguments_)),
    status,
    verifyCommissioner
  };
}

module.exports = {
  MiniLeagueConflictError,
  MiniLeagueNotFoundError,
  MiniLeagueValidationError,
  LeagueAuthorizationError,
  createMiniLeagueService,
  generateJoinCode,
  hashJoinCode,
  normalizeJoinCode,
  publicLeague
};
