const crypto = require("crypto");
const {
  MAX_LEAGUE_AUDIT_EVENTS,
  MAX_LEAGUE_MEMBERS,
  MAX_SCORE_PROPOSALS,
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
  const {
    commissionerKeyHash,
    joinCodeHash,
    memberAccess,
    ...safe
  } = league;
  const standings = calculateStandings(league);
  return {
    ...safe,
    commissionerAccessConfigured: Boolean(commissionerKeyHash),
    memberAccessStatus: memberAccess.map((access) => ({
      memberId: access.memberId,
      configured: Boolean(access.memberKeyHash)
    })),
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
      actorMemberId: details.actorMemberId ?? league.ownerMemberId,
      targetMemberId: details.targetMemberId ?? null,
      scoringPeriod: details.scoringPeriod ?? null,
      matchupId: details.matchupId ?? null,
      proposalId: details.proposalId ?? null,
      previousResult: details.previousResult ?? null,
      nextResult: details.nextResult ?? null
    };
  }

  async function requireLeague(leagueId, profileId) {
    const league = await miniLeagueStore.get(leagueId, profileId);
    if (!league) throw new MiniLeagueNotFoundError("Mini-league not found.");
    return league;
  }

  function normalizeScoreInput(homePoints, awayPoints) {
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
    return { homePoints: normalizedHome, awayPoints: normalizedAway };
  }

  function appendProposal(league, proposal) {
    const proposals = [...league.scoreProposals, proposal];
    if (proposals.length <= MAX_SCORE_PROPOSALS) return proposals;
    const removableIndex = proposals.findIndex((item) =>
      item.status !== "PENDING");
    if (removableIndex === -1) {
      throw new MiniLeagueConflictError(
        "Resolve an existing score proposal before adding another one."
      );
    }
    proposals.splice(removableIndex, 1);
    return proposals;
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
      const memberKey = leagueAccessProvider.issueMemberKey();
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
        memberAccess: [{
          memberId: ownerMemberId,
          mode: "MEMBER_KEY",
          memberKeyHash: leagueAccessProvider.hashMemberKey(memberKey)
        }],
        matchups: buildRoundRobinSchedule({
          leagueId,
          memberIds: [ownerMemberId],
          scoringPeriodCount: input?.scoringPeriodCount
        }),
        scoreProposals: [],
        auditTrail: [],
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await miniLeagueStore.save(league, profileId);
      return {
        commissionerKey,
        joinCode,
        memberId: ownerMemberId,
        memberKey,
        league: publicLeague(league)
      };
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
    if (existing.matchups.some((matchup) => matchup.scoredAt) ||
        existing.scoreProposals.length > 0) {
      throw new MiniLeagueConflictError(
        "Membership is locked because score reporting has started."
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
    const memberKey = leagueAccessProvider.issueMemberKey();
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
      memberAccess: [
        ...existing.memberAccess,
        {
          memberId,
          mode: "MEMBER_KEY",
          memberKeyHash: leagueAccessProvider.hashMemberKey(memberKey)
        }
      ],
      matchups: buildRoundRobinSchedule({
        leagueId: existing.id,
        memberIds: members.map((member) => member.id),
        scoringPeriodCount: existing.scoringPeriodCount
      }),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return {
      memberId,
      memberKey,
      league: publicLeague(league)
    };
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
      scoreProposals: existing.scoreProposals.map((proposal) =>
        proposal.matchupId === matchupId && proposal.status === "PENDING"
          ? {
            ...proposal,
            status: "SUPERSEDED",
            resolvedAt: timestamp,
            resolvedByMemberId: existing.ownerMemberId
          }
          : proposal),
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

  async function verifyMember({ leagueId, memberKey }, profileId = DEFAULT_PROFILE_ID) {
    const league = await requireLeague(leagueId, profileId);
    const memberId = leagueAccessProvider.assertMember(league, memberKey);
    const member = league.members.find((item) => item.id === memberId);
    return {
      authorized: true,
      member: {
        id: member.id,
        displayName: member.displayName,
        role: member.role
      }
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

  async function rotateCommissionerKey({ leagueId, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    const replacementKey = leagueAccessProvider.issueCommissionerKey();
    const replacementHash =
      leagueAccessProvider.hashCommissionerKey(replacementKey);
    if (replacementHash === existing.commissionerKeyHash) {
      throw new MiniLeagueConflictError(
        "A replacement commissioner key could not be generated. Try again."
      );
    }
    const timestamp = now().toISOString();
    const event = auditEvent(
      "COMMISSIONER_KEY_ROTATED",
      existing,
      timestamp
    );
    const league = createMiniLeague({
      ...existing,
      commissionerKeyHash: replacementHash,
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return { commissionerKey: replacementKey, league: publicLeague(league) };
  }

  async function rotateMemberKey({ leagueId, memberId, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    if (!existing.members.some((member) => member.id === memberId)) {
      throw new MiniLeagueNotFoundError("League member not found.");
    }
    const memberKey = leagueAccessProvider.issueMemberKey();
    const memberKeyHash = leagueAccessProvider.hashMemberKey(memberKey);
    const current = existing.memberAccess.find((access) =>
      access.memberId === memberId);
    if (current.memberKeyHash === memberKeyHash) {
      throw new MiniLeagueConflictError(
        "A replacement member key could not be generated. Try again."
      );
    }
    const timestamp = now().toISOString();
    const event = auditEvent(
      "MEMBER_ACCESS_ROTATED",
      existing,
      timestamp,
      { targetMemberId: memberId }
    );
    const league = createMiniLeague({
      ...existing,
      memberAccess: existing.memberAccess.map((access) =>
        access.memberId === memberId
          ? { memberId, mode: "MEMBER_KEY", memberKeyHash }
          : access),
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return { memberId, memberKey, league: publicLeague(league) };
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

  async function proposeScore({ leagueId, matchupId, homePoints, awayPoints, memberKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    const memberId = leagueAccessProvider.assertMember(existing, memberKey);
    const matchup = existing.matchups.find((item) => item.id === matchupId);
    if (!matchup) throw new MiniLeagueNotFoundError("Matchup not found.");
    if (![matchup.homeMemberId, matchup.awayMemberId].includes(memberId)) {
      throw new LeagueAuthorizationError(
        "Only a manager in this matchup can propose its result."
      );
    }
    if (existing.lockedScoringPeriods.includes(matchup.scoringPeriod)) {
      throw new MiniLeagueConflictError(
        `Scoring period ${matchup.scoringPeriod} is locked.`
      );
    }
    if (existing.scoreProposals.some((proposal) =>
      proposal.matchupId === matchupId &&
      proposal.proposedByMemberId === memberId &&
      proposal.status === "PENDING")) {
      throw new MiniLeagueConflictError(
        "You already have a pending proposal for this matchup."
      );
    }
    const normalized = normalizeScoreInput(homePoints, awayPoints);
    const timestamp = now().toISOString();
    const proposal = {
      id: createId("proposal"),
      matchupId,
      proposedByMemberId: memberId,
      homePoints: normalized.homePoints,
      awayPoints: normalized.awayPoints,
      status: "PENDING",
      createdAt: timestamp,
      resolvedAt: null,
      resolvedByMemberId: null
    };
    const event = auditEvent(
      "SCORE_PROPOSED",
      existing,
      timestamp,
      {
        actorMemberId: memberId,
        scoringPeriod: matchup.scoringPeriod,
        matchupId,
        proposalId: proposal.id,
        nextResult: normalized
      }
    );
    const league = createMiniLeague({
      ...existing,
      scoreProposals: appendProposal(existing, proposal),
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return { proposal, league: publicLeague(league) };
  }

  async function resolveScoreProposal({ leagueId, proposalId, decision, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const existing = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(existing, commissionerKey);
    const proposal = existing.scoreProposals.find((item) =>
      item.id === proposalId);
    if (!proposal) throw new MiniLeagueNotFoundError("Score proposal not found.");
    if (proposal.status !== "PENDING") {
      throw new MiniLeagueConflictError("This score proposal is already resolved.");
    }
    const normalizedDecision = String(decision ?? "").trim().toUpperCase();
    if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
      throw new MiniLeagueValidationError("decision must be APPROVE or REJECT.");
    }
    const matchup = existing.matchups.find((item) =>
      item.id === proposal.matchupId);
    if (normalizedDecision === "APPROVE" &&
        existing.lockedScoringPeriods.includes(matchup.scoringPeriod)) {
      throw new MiniLeagueConflictError(
        `Scoring period ${matchup.scoringPeriod} is locked.`
      );
    }
    const timestamp = now().toISOString();
    const previousResult = matchup.scoredAt
      ? { homePoints: matchup.homePoints, awayPoints: matchup.awayPoints }
      : null;
    const nextResult = {
      homePoints: proposal.homePoints,
      awayPoints: proposal.awayPoints
    };
    const approved = normalizedDecision === "APPROVE";
    const scoreProposals = existing.scoreProposals.map((item) => {
      if (item.id === proposalId) {
        return {
          ...item,
          status: approved ? "APPROVED" : "REJECTED",
          resolvedAt: timestamp,
          resolvedByMemberId: existing.ownerMemberId
        };
      }
      if (approved && item.matchupId === proposal.matchupId &&
          item.status === "PENDING") {
        return {
          ...item,
          status: "SUPERSEDED",
          resolvedAt: timestamp,
          resolvedByMemberId: existing.ownerMemberId
        };
      }
      return item;
    });
    const event = auditEvent(
      approved ? "SCORE_PROPOSAL_APPROVED" : "SCORE_PROPOSAL_REJECTED",
      existing,
      timestamp,
      {
        scoringPeriod: matchup.scoringPeriod,
        matchupId: matchup.id,
        proposalId,
        previousResult,
        nextResult: approved ? nextResult : null
      }
    );
    const league = createMiniLeague({
      ...existing,
      matchups: approved
        ? existing.matchups.map((item) => item.id === matchup.id
          ? {
            ...item,
            homePoints: proposal.homePoints,
            awayPoints: proposal.awayPoints,
            scoredAt: timestamp
          }
          : item)
        : existing.matchups,
      scoreProposals,
      auditTrail: appendAudit(existing, event),
      updatedAt: timestamp
    });
    await miniLeagueStore.save(league, profileId);
    return publicLeague(league);
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
      if (existing.scoreProposals.some((proposal) =>
        proposal.status === "PENDING" && periodMatchups.some((matchup) =>
          matchup.id === proposal.matchupId))) {
        throw new MiniLeagueConflictError(
          "Approve or reject every pending proposal before locking this period."
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

  async function exportLeague({ leagueId, commissionerKey }, profileId = DEFAULT_PROFILE_ID) {
    const league = await requireLeague(leagueId, profileId);
    leagueAccessProvider.assertCommissioner(league, commissionerKey);
    const {
      authorizationMode,
      commissionerKeyHash,
      joinCodeHash,
      memberAccess,
      profileId: ignoredProfileId,
      ...portableLeague
    } = league;
    void authorizationMode;
    void commissionerKeyHash;
    void joinCodeHash;
    void memberAccess;
    void ignoredProfileId;
    return {
      schemaVersion: "sports-hub-league-export/1.0",
      exportedAt: now().toISOString(),
      secretsIncluded: false,
      requiresAccessReissue: true,
      league: portableLeague
    };
  }

  function status() {
    return {
      authorization: leagueAccessProvider.status(),
      migration: {
        exportSchemaVersion: "sports-hub-league-export/1.0",
        secretsIncluded: false,
        requiresAccessReissue: true
      },
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
    exportLeague,
    get,
    join: (...arguments_) => serializeMutation(() => join(...arguments_)),
    list,
    recordScore: (...arguments_) =>
      serializeMutation(() => recordScore(...arguments_)),
    proposeScore: (...arguments_) =>
      serializeMutation(() => proposeScore(...arguments_)),
    resolveScoreProposal: (...arguments_) =>
      serializeMutation(() => resolveScoreProposal(...arguments_)),
    rotateCommissionerKey: (...arguments_) =>
      serializeMutation(() => rotateCommissionerKey(...arguments_)),
    rotateJoinCode: (...arguments_) =>
      serializeMutation(() => rotateJoinCode(...arguments_)),
    rotateMemberKey: (...arguments_) =>
      serializeMutation(() => rotateMemberKey(...arguments_)),
    setScoringPeriodLock: (...arguments_) =>
      serializeMutation(() => setScoringPeriodLock(...arguments_)),
    status,
    verifyCommissioner,
    verifyMember
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
