const leagueHub = document.querySelector("#league-hub");
const leagueHome = document.querySelector("#league-home");
const leagueList = document.querySelector("#league-list");
const leagueEmpty = document.querySelector("#league-empty");
const leagueStatus = document.querySelector("#league-status");
const leagueCount = document.querySelector("#league-count");
const createForm = document.querySelector("#create-league");
const joinForm = document.querySelector("#join-league");
const createSport = document.querySelector("#create-sport");
const createTeam = document.querySelector("#create-team");
const joinTeam = document.querySelector("#join-team");
const periodSelect = document.querySelector("#period-select");
const matchupList = document.querySelector("#matchup-list");
const commissionerState = document.querySelector("#commissioner-state");
const commissionerUnlock = document.querySelector("#commissioner-unlock");
const commissionerActions = document.querySelector("#commissioner-actions");
const commissionerStatus = document.querySelector("#commissioner-status");
const memberAccessState = document.querySelector("#member-access-state");
const memberUnlock = document.querySelector("#member-unlock");
const memberAccessStatus = document.querySelector("#member-access-status");

let teams = [];
let leagues = [];
let currentLeague = null;
let commissionerAuthorized = false;
let currentMember = null;

function commissionerStorageKey(leagueId) {
  return `sports-hub-commissioner:${leagueId}`;
}

function commissionerKey() {
  if (!currentLeague) return "";
  return sessionStorage.getItem(commissionerStorageKey(currentLeague.id)) ?? "";
}

function saveCommissionerKey(leagueId, value) {
  sessionStorage.setItem(commissionerStorageKey(leagueId), value);
}

function commissionerHeaders() {
  return { "x-mini-league-commissioner-key": commissionerKey() };
}

function memberStorageKey(leagueId) {
  return `sports-hub-member:${leagueId}`;
}

function memberKey() {
  if (!currentLeague) return "";
  return sessionStorage.getItem(memberStorageKey(currentLeague.id)) ?? "";
}

function saveMemberKey(leagueId, value) {
  sessionStorage.setItem(memberStorageKey(leagueId), value);
}

function memberHeaders() {
  return { "x-mini-league-member-key": memberKey() };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sportLabel(value) {
  const text = String(value ?? "").toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "Sport";
}

function points(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function teamOptions(sport) {
  const available = teams.filter((team) => !sport || team.sport === sport);
  return [
    '<option value="">Play without a linked team</option>',
    ...available.map((team) =>
      `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)} · ${escapeHtml(sportLabel(team.sport))}</option>`)
  ].join("");
}

function populateTeams() {
  createTeam.innerHTML = teamOptions(createSport.value);
  joinTeam.innerHTML = teamOptions();
}

function renderLeagueList() {
  leagueCount.textContent = `${leagues.length} ${leagues.length === 1 ? "league" : "leagues"}`;
  leagueEmpty.hidden = leagues.length !== 0;
  leagueList.innerHTML = leagues.map((league) => {
    const next = league.matchups.find((matchup) => !matchup.scoredAt);
    return `<button class="league-list-card" type="button" data-league-id="${escapeHtml(league.id)}">
      <span class="league-card-sport">${escapeHtml(sportLabel(league.sport))}</span>
      <strong>${escapeHtml(league.name)}</strong>
      <span>${league.members.length} ${league.members.length === 1 ? "manager" : "managers"} · ${league.completedMatchupCount}/${league.matchups.length} results</span>
      <small>${next ? `Next: period ${next.scoringPeriod}` : "Waiting for another manager"}</small>
    </button>`;
  }).join("");
  leagueList.querySelectorAll("[data-league-id]").forEach((button) => {
    button.addEventListener("click", () => openLeague(button.dataset.leagueId));
  });
}

function managerName(memberId) {
  return currentLeague.members.find((member) => member.id === memberId)?.displayName ?? "Manager";
}

function teamName(teamId) {
  return teams.find((team) => team.id === teamId)?.name ?? null;
}

function renderStandings() {
  document.querySelector("#completed-count").textContent =
    `${currentLeague.completedMatchupCount} recorded`;
  document.querySelector("#standings-list").innerHTML = currentLeague.standings
    .map((row) => `<article class="standing-row${row.rank === 1 && row.played ? " leader" : ""}">
      <span class="standing-manager"><b>${row.rank}</b><span><strong>${escapeHtml(row.displayName)}</strong><small>${escapeHtml(teamName(row.teamId) ?? "No linked team")}</small></span></span>
      <span><small>W-L-T</small>${row.wins}-${row.losses}-${row.ties}</span>
      <span><small>PF</small>${points(row.pointsFor)}</span>
      <span class="${row.pointDifferential > 0 ? "positive" : ""}"><small>Diff</small>${row.pointDifferential > 0 ? "+" : ""}${points(row.pointDifferential)}</span>
    </article>`).join("");
}

function renderMembers() {
  document.querySelector("#member-count").textContent =
    `${currentLeague.members.length}/12`;
  document.querySelector("#member-list").innerHTML = currentLeague.members
    .map((member) => {
      const membership = currentLeague.memberships.find((item) =>
        item.memberId === member.id);
      const access = currentLeague.memberAccessStatus.find((item) =>
        item.memberId === member.id);
      return `<article class="member-card">
        <span class="member-avatar" aria-hidden="true">${escapeHtml(member.displayName[0].toUpperCase())}</span>
        <span><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(teamName(membership?.teamId) ?? "No linked team")} · ${access?.configured ? "Access ready" : "Needs member key"}</small></span>
        <span class="member-tools">${member.role === "OWNER" ? '<b class="owner-pill">Owner</b>' : ""}${commissionerAuthorized ? `<button class="member-reset" type="button" data-member-id="${escapeHtml(member.id)}">Reset access</button>` : ""}</span>
      </article>`;
    }).join("");
  document.querySelectorAll(".member-reset").forEach((button) => {
    button.addEventListener("click", () => rotateMemberAccess(button.dataset.memberId));
  });
}

function selectedPeriod() {
  return Number(periodSelect.value || 1);
}

function currentPeriodLocked() {
  return currentLeague.lockedScoringPeriods.includes(selectedPeriod());
}

function renderMemberControls() {
  memberAccessState.textContent = currentMember
    ? `${currentMember.displayName} unlocked`
    : "View only";
  memberAccessState.classList.toggle("active", Boolean(currentMember));
  memberUnlock.hidden = Boolean(currentMember);
}

function renderCommissionerControls() {
  const configured = currentLeague.commissionerAccessConfigured;
  commissionerState.textContent = commissionerAuthorized
    ? "Commissioner controls on"
    : "View only";
  commissionerState.classList.toggle("active", commissionerAuthorized);
  commissionerUnlock.hidden = commissionerAuthorized || !configured;
  document.querySelector("#claim-commissioner").hidden =
    configured || commissionerAuthorized;
  commissionerActions.hidden = !commissionerAuthorized;
  const lockButton = document.querySelector("#toggle-period-lock");
  lockButton.textContent = currentPeriodLocked()
    ? `Unlock period ${selectedPeriod()}`
    : `Lock period ${selectedPeriod()}`;
}

function activityMessage(event) {
  const actor = managerName(event.actorMemberId);
  if (event.type === "RESULT_RECORDED") {
    return `Period ${event.scoringPeriod} result recorded: ${points(event.nextResult.homePoints)}–${points(event.nextResult.awayPoints)}.`;
  }
  if (event.type === "RESULT_CORRECTED") {
    return `Period ${event.scoringPeriod} corrected from ${points(event.previousResult.homePoints)}–${points(event.previousResult.awayPoints)} to ${points(event.nextResult.homePoints)}–${points(event.nextResult.awayPoints)}.`;
  }
  if (event.type === "SCORING_PERIOD_LOCKED") {
    return `Scoring period ${event.scoringPeriod} locked.`;
  }
  if (event.type === "SCORING_PERIOD_UNLOCKED") {
    return `Scoring period ${event.scoringPeriod} unlocked.`;
  }
  if (event.type === "JOIN_CODE_ROTATED") {
    return "Friend join code rotated. The previous code stopped working.";
  }
  if (event.type === "COMMISSIONER_KEY_ROTATED") {
    return "Commissioner key replaced. The previous key stopped working.";
  }
  if (event.type === "MEMBER_ACCESS_ROTATED") {
    return `${managerName(event.targetMemberId)} received replacement member access.`;
  }
  if (event.type === "SCORE_PROPOSED") {
    return `${actor} proposed ${points(event.nextResult.homePoints)}–${points(event.nextResult.awayPoints)} for period ${event.scoringPeriod}.`;
  }
  if (event.type === "SCORE_PROPOSAL_APPROVED") {
    return `${actor} approved a ${points(event.nextResult.homePoints)}–${points(event.nextResult.awayPoints)} proposal for period ${event.scoringPeriod}.`;
  }
  if (event.type === "SCORE_PROPOSAL_REJECTED") {
    return `${actor} rejected a score proposal for period ${event.scoringPeriod}.`;
  }
  return "Legacy commissioner access claimed.";
}

function renderActivity() {
  const events = [...currentLeague.auditTrail].reverse();
  document.querySelector("#activity-count").textContent =
    `${events.length} ${events.length === 1 ? "change" : "changes"}`;
  document.querySelector("#activity-list").innerHTML = events.length
    ? events.map((event) => `<article class="activity-row">
      <span class="activity-dot" aria-hidden="true"></span>
      <span><strong>${escapeHtml(activityMessage(event))}</strong><time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(new Date(event.occurredAt).toLocaleString())}</time></span>
    </article>`).join("")
    : '<div class="matchup-empty"><strong>No commissioner changes yet.</strong><p>Recorded results and settings changes will appear here.</p></div>';
}

function renderProposals() {
  const proposals = [...currentLeague.scoreProposals]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const pending = proposals.filter((proposal) => proposal.status === "PENDING");
  document.querySelector("#proposal-count").textContent =
    `${pending.length} pending`;
  document.querySelector("#proposal-list").innerHTML = proposals.length
    ? proposals.slice(0, 30).map((proposal) => {
      const matchup = currentLeague.matchups.find((item) =>
        item.id === proposal.matchupId);
      const statusLabel = proposal.status.toLowerCase();
      return `<article class="proposal-card ${statusLabel}">
        <div><span class="proposal-state">${escapeHtml(statusLabel)}</span><strong>Period ${matchup.scoringPeriod}: ${escapeHtml(managerName(matchup.homeMemberId))} ${points(proposal.homePoints)}–${points(proposal.awayPoints)} ${escapeHtml(managerName(matchup.awayMemberId))}</strong><small>Proposed by ${escapeHtml(managerName(proposal.proposedByMemberId))} · ${escapeHtml(new Date(proposal.createdAt).toLocaleString())}</small></div>
        ${commissionerAuthorized && proposal.status === "PENDING" ? `<div class="proposal-actions"><button class="primary" type="button" data-proposal-id="${escapeHtml(proposal.id)}" data-decision="APPROVE">Approve</button><button class="quiet" type="button" data-proposal-id="${escapeHtml(proposal.id)}" data-decision="REJECT">Reject</button></div>` : ""}
      </article>`;
    }).join("")
    : '<div class="matchup-empty"><strong>No score proposals yet.</strong><p>A manager in a matchup can submit one after unlocking their member access.</p></div>';
  document.querySelectorAll("[data-proposal-id][data-decision]").forEach((button) => {
    button.addEventListener("click", () => resolveProposal(
      button.dataset.proposalId,
      button.dataset.decision
    ));
  });
}

function renderMatchups() {
  const period = selectedPeriod();
  const periodLocked = currentPeriodLocked();
  const matchups = currentLeague.matchups.filter((matchup) =>
    matchup.scoringPeriod === period);
  if (currentLeague.members.length < 2) {
    matchupList.innerHTML = `<div class="matchup-empty"><strong>Waiting for a rival.</strong><p>Share the private code you saved when this league was created.</p></div>`;
    return;
  }
  if (!matchups.length) {
    matchupList.innerHTML = `<div class="matchup-empty"><strong>Bye period</strong><p>No matchup is scheduled here.</p></div>`;
    return;
  }
  matchupList.innerHTML = matchups.map((matchup) => {
    const scored = Boolean(matchup.scoredAt);
    const memberCanPropose = currentMember &&
      [matchup.homeMemberId, matchup.awayMemberId].includes(currentMember.id);
    const memberProposalPending = !commissionerAuthorized && currentMember &&
      currentLeague.scoreProposals.some((proposal) =>
        proposal.matchupId === matchup.id &&
        proposal.proposedByMemberId === currentMember.id &&
        proposal.status === "PENDING");
    const disabled = (!commissionerAuthorized && !memberCanPropose) ||
      periodLocked || memberProposalPending;
    const actionLabel = periodLocked
      ? "Period locked"
      : commissionerAuthorized
        ? (scored ? "Update result" : "Record result")
        : memberCanPropose
          ? (memberProposalPending ? "Proposal pending" : "Propose result")
          : "League access required";
    return `<form class="matchup-card score-form${periodLocked ? " locked" : ""}" data-matchup-id="${escapeHtml(matchup.id)}">
      <div class="matchup-number">Period ${matchup.scoringPeriod}${periodLocked ? " · Locked" : ""}</div>
      <label><span>${escapeHtml(managerName(matchup.homeMemberId))}</span><small>Official points</small>
        <input name="homePoints" inputmode="decimal" type="number" min="0" max="10000" step="0.01" value="${scored ? escapeHtml(matchup.homePoints) : ""}" placeholder="0.00" ${disabled ? "disabled" : ""} required>
      </label>
      <span class="versus" aria-hidden="true">vs</span>
      <label><span>${escapeHtml(managerName(matchup.awayMemberId))}</span><small>Official points</small>
        <input name="awayPoints" inputmode="decimal" type="number" min="0" max="10000" step="0.01" value="${scored ? escapeHtml(matchup.awayPoints) : ""}" placeholder="0.00" ${disabled ? "disabled" : ""} required>
      </label>
      <button class="${scored ? "quiet" : "primary"}" type="submit" ${disabled ? "disabled" : ""}>${actionLabel}</button>
      ${scored ? `<small class="recorded-label">Recorded ${escapeHtml(new Date(matchup.scoredAt).toLocaleString())}</small>` : ""}
    </form>`;
  }).join("");
  matchupList.querySelectorAll(".score-form").forEach((form) => {
    form.addEventListener("submit", submitScore);
  });
}

function showPrivateSecrets({
  joinCode,
  commissionerKey: newCommissionerKey,
  memberKey: newMemberKey,
  memberLabel
} = {}) {
  const invitePanel = document.querySelector("#invite-panel");
  const joinSecret = document.querySelector("#join-code-secret");
  const commissionerSecret = document.querySelector("#commissioner-key-secret");
  const memberSecret = document.querySelector("#member-key-secret");
  joinSecret.hidden = !joinCode;
  commissionerSecret.hidden = !newCommissionerKey;
  memberSecret.hidden = !newMemberKey;
  invitePanel.hidden = !joinCode && !newCommissionerKey && !newMemberKey;
  if (joinCode) document.querySelector("#invite-code").textContent = joinCode;
  if (newCommissionerKey) {
    document.querySelector("#commissioner-key-value").textContent =
      newCommissionerKey;
  }
  if (newMemberKey) {
    document.querySelector("#member-key-label").textContent =
      memberLabel ?? "Your member key";
    document.querySelector("#member-key-value").textContent = newMemberKey;
  }
}

function renderLeague(league, privateSecrets = {}) {
  currentLeague = league;
  if (privateSecrets.commissionerKey) {
    saveCommissionerKey(league.id, privateSecrets.commissionerKey);
  }
  if (privateSecrets.memberKey) {
    saveMemberKey(league.id, privateSecrets.memberKey);
  }
  commissionerAuthorized = Boolean(commissionerKey());
  currentMember = privateSecrets.memberId
    ? league.members.find((member) => member.id === privateSecrets.memberId) ?? null
    : league.members.find((member) => member.id === currentMember?.id) ?? null;
  leagueHub.hidden = true;
  leagueHome.hidden = false;
  history.replaceState(null, "", `?leagueId=${encodeURIComponent(league.id)}`);
  document.querySelector("#league-sport").textContent = sportLabel(league.sport);
  document.querySelector("#league-name").textContent = league.name;
  document.querySelector("#league-meta").textContent =
    `${league.members.length} ${league.members.length === 1 ? "manager" : "managers"} · ${league.scoringPeriodCount} scoring periods`;
  document.querySelector("#league-state").textContent =
    league.status === "IN_PROGRESS" ? "Scoring started" : "Open to join";
  showPrivateSecrets(privateSecrets);
  periodSelect.innerHTML = Array.from({ length: league.scoringPeriodCount }, (_, index) =>
    `<option value="${index + 1}">Period ${index + 1}</option>`).join("");
  const next = league.matchups.find((matchup) => !matchup.scoredAt);
  periodSelect.value = String(next?.scoringPeriod ?? league.matchups.at(-1)?.scoringPeriod ?? 1);
  renderStandings();
  renderMembers();
  renderMemberControls();
  renderCommissionerControls();
  renderMatchups();
  renderProposals();
  renderActivity();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function verifyStoredCommissioner() {
  if (!commissionerKey()) {
    commissionerAuthorized = false;
    renderCommissionerControls();
    renderMembers();
    renderMatchups();
    renderProposals();
    return;
  }
  try {
    await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/commissioner/verify`,
      { method: "POST", headers: commissionerHeaders() }
    );
    commissionerAuthorized = true;
  } catch (error) {
    commissionerAuthorized = false;
    if (error.status === 403) {
      sessionStorage.removeItem(commissionerStorageKey(currentLeague.id));
      commissionerStatus.textContent = "The saved commissioner key is no longer valid.";
    }
  }
  renderCommissionerControls();
  renderMembers();
  renderMatchups();
  renderProposals();
}

async function verifyStoredMember() {
  if (!memberKey()) {
    currentMember = null;
    renderMemberControls();
    renderMatchups();
    return;
  }
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/member/verify`,
      { method: "POST", headers: memberHeaders() }
    );
    currentMember = body.member;
  } catch (error) {
    currentMember = null;
    if (error.status === 403) {
      sessionStorage.removeItem(memberStorageKey(currentLeague.id));
      memberAccessStatus.textContent = "The saved member key is no longer valid.";
    }
  }
  renderMemberControls();
  renderMatchups();
}

async function openLeague(leagueId) {
  leagueStatus.textContent = "Opening league…";
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(leagueId)}`
    );
    renderLeague(body.league);
    await verifyStoredCommissioner();
    await verifyStoredMember();
  } catch (error) {
    leagueStatus.textContent = error.message;
  }
}

async function submitScore(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  const directEntry = commissionerAuthorized;
  document.querySelector("#score-status").textContent = directEntry
    ? "Recording official result…"
    : "Sending your score proposal…";
  button.disabled = true;
  try {
    const body = await requestJson(
      directEntry
        ? `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/matchups/${encodeURIComponent(form.dataset.matchupId)}/score`
        : `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/matchups/${encodeURIComponent(form.dataset.matchupId)}/proposals`,
      {
        method: directEntry ? "PUT" : "POST",
        headers: {
          "content-type": "application/json",
          ...(directEntry ? commissionerHeaders() : memberHeaders())
        },
        body: JSON.stringify({
          homePoints: data.get("homePoints"),
          awayPoints: data.get("awayPoints")
        })
      }
    );
    currentLeague = body.league;
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    document.querySelector("#league-state").textContent =
      body.league.status === "IN_PROGRESS" ? "Scoring started" : "Open to join";
    document.querySelector("#score-status").textContent = directEntry
      ? "Result recorded. Standings updated."
      : "Proposal sent. Standings will wait for commissioner approval.";
    renderStandings();
    renderCommissionerControls();
    renderMatchups();
    renderProposals();
    renderActivity();
  } catch (error) {
    document.querySelector("#score-status").textContent = error.message;
    if (error.status === 403 && directEntry) {
      commissionerAuthorized = false;
      sessionStorage.removeItem(commissionerStorageKey(currentLeague.id));
      commissionerStatus.textContent =
        "Commissioner access expired. Unlock the controls again.";
      renderCommissionerControls();
      renderMembers();
      renderMatchups();
      renderProposals();
    }
    if (error.status === 403 && !directEntry) {
      currentMember = null;
      sessionStorage.removeItem(memberStorageKey(currentLeague.id));
      memberAccessStatus.textContent =
        "Member access expired. Unlock proposals again.";
      renderMemberControls();
      renderMatchups();
    }
    button.disabled = false;
  }
}

async function resolveProposal(proposalId, decision) {
  const status = document.querySelector("#proposal-status");
  status.textContent = `${decision === "APPROVE" ? "Approving" : "Rejecting"} proposal…`;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/proposals/${encodeURIComponent(proposalId)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...commissionerHeaders()
        },
        body: JSON.stringify({ decision })
      }
    );
    currentLeague = body.league;
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    document.querySelector("#league-state").textContent =
      body.league.status === "IN_PROGRESS" ? "Scoring started" : "Open to join";
    status.textContent = decision === "APPROVE"
      ? "Proposal approved. Standings updated."
      : "Proposal rejected. Standings were not changed.";
    renderStandings();
    renderCommissionerControls();
    renderMatchups();
    renderProposals();
    renderActivity();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function rotateMemberAccess(memberId) {
  const member = currentLeague.members.find((item) => item.id === memberId);
  commissionerStatus.textContent = `Creating replacement access for ${member.displayName}…`;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/members/${encodeURIComponent(memberId)}/access/rotate`,
      { method: "POST", headers: commissionerHeaders() }
    );
    currentLeague = body.league;
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    if (currentMember?.id === memberId) {
      saveMemberKey(currentLeague.id, body.memberKey);
    }
    commissionerStatus.textContent =
      `${member.displayName}'s previous member key stopped working.`;
    showPrivateSecrets({
      memberKey: body.memberKey,
      memberLabel: `Replacement member key for ${member.displayName}`
    });
    renderMembers();
    renderActivity();
  } catch (error) {
    commissionerStatus.textContent = error.message;
  }
}

createSport.addEventListener("change", populateTeams);
periodSelect.addEventListener("change", () => {
  renderCommissionerControls();
  renderMatchups();
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#create-status");
  const button = createForm.querySelector("button[type=submit]");
  const data = new FormData(createForm);
  status.textContent = "Creating your private league…";
  button.disabled = true;
  try {
    const body = await requestJson("/api/sports-hub/mini-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        ownerName: data.get("ownerName"),
        scoringPeriodCount: Number(data.get("scoringPeriodCount")),
        sport: data.get("sport"),
        teamId: data.get("teamId") || null
      })
    });
    leagues = [body.league, ...leagues];
    renderLeague(body.league, {
      commissionerKey: body.commissionerKey,
      joinCode: body.joinCode,
      memberId: body.memberId,
      memberKey: body.memberKey,
      memberLabel: `${data.get("ownerName").trim()}'s member key`
    });
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#join-status");
  const button = joinForm.querySelector("button[type=submit]");
  const data = new FormData(joinForm);
  status.textContent = "Finding your league…";
  button.disabled = true;
  try {
    const body = await requestJson("/api/sports-hub/mini-leagues/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        joinCode: data.get("joinCode"),
        managerName: data.get("managerName"),
        teamId: data.get("teamId") || null
      })
    });
    leagues = [body.league, ...leagues.filter((league) =>
      league.id !== body.league.id)];
    renderLeague(body.league, {
      memberId: body.memberId,
      memberKey: body.memberKey,
      memberLabel: `${data.get("managerName").trim()}'s member key`
    });
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

commissionerUnlock.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#commissioner-key-input");
  const button = commissionerUnlock.querySelector("button[type=submit]");
  const key = input.value.trim();
  commissionerStatus.textContent = "Checking commissioner access…";
  button.disabled = true;
  try {
    await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/commissioner/verify`,
      {
        method: "POST",
        headers: { "x-mini-league-commissioner-key": key }
      }
    );
    saveCommissionerKey(currentLeague.id, key);
    commissionerAuthorized = true;
    input.value = "";
    commissionerStatus.textContent =
      "Commissioner controls unlocked for this browser session.";
    renderCommissionerControls();
    renderMembers();
    renderMatchups();
    renderProposals();
  } catch (error) {
    commissionerStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

memberUnlock.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#member-key-input");
  const button = memberUnlock.querySelector("button[type=submit]");
  const key = input.value.trim();
  memberAccessStatus.textContent = "Checking member access…";
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/member/verify`,
      {
        method: "POST",
        headers: { "x-mini-league-member-key": key }
      }
    );
    saveMemberKey(currentLeague.id, key);
    currentMember = body.member;
    input.value = "";
    memberAccessStatus.textContent =
      `${body.member.displayName} can now propose matchup scores.`;
    renderMemberControls();
    renderMatchups();
  } catch (error) {
    memberAccessStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#claim-commissioner").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  commissionerStatus.textContent = "Creating a commissioner key for this legacy league…";
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/commissioner/claim`,
      { method: "POST" }
    );
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    commissionerStatus.textContent =
      "Commissioner access claimed. Save the recovery key now.";
    renderLeague(body.league, { commissionerKey: body.commissionerKey });
  } catch (error) {
    commissionerStatus.textContent = error.message;
    button.disabled = false;
  }
});

document.querySelector("#rotate-join-code").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  commissionerStatus.textContent = "Rotating the friend code…";
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/join-code/rotate`,
      { method: "POST", headers: commissionerHeaders() }
    );
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    commissionerStatus.textContent =
      "Friend code rotated. The previous code no longer works.";
    renderLeague(body.league, { joinCode: body.joinCode });
  } catch (error) {
    commissionerStatus.textContent = error.message;
    button.disabled = false;
  }
});

document.querySelector("#rotate-commissioner-key").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  commissionerStatus.textContent = "Replacing the commissioner key…";
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/commissioner/rotate`,
      { method: "POST", headers: commissionerHeaders() }
    );
    saveCommissionerKey(currentLeague.id, body.commissionerKey);
    currentLeague = body.league;
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    commissionerStatus.textContent =
      "Commissioner key replaced. Save the new recovery key now.";
    showPrivateSecrets({ commissionerKey: body.commissionerKey });
    renderActivity();
  } catch (error) {
    commissionerStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#download-league-export").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  commissionerStatus.textContent = "Preparing a secret-free migration copy…";
  button.disabled = true;
  try {
    const response = await fetch(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/export`,
      { headers: commissionerHeaders() }
    );
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || "Migration copy could not be prepared.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mini-league-${currentLeague.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    commissionerStatus.textContent =
      "Migration copy downloaded without join or access secrets.";
  } catch (error) {
    commissionerStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#toggle-period-lock").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const period = selectedPeriod();
  const locked = !currentPeriodLocked();
  commissionerStatus.textContent =
    `${locked ? "Locking" : "Unlocking"} scoring period ${period}…`;
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/scoring-periods/${period}/lock`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...commissionerHeaders()
        },
        body: JSON.stringify({ locked })
      }
    );
    currentLeague = body.league;
    leagues = leagues.map((league) =>
      league.id === body.league.id ? body.league : league);
    commissionerStatus.textContent =
      `Scoring period ${period} ${locked ? "locked" : "unlocked"}.`;
    renderCommissionerControls();
    renderMatchups();
    renderActivity();
  } catch (error) {
    commissionerStatus.textContent = error.message;
    button.disabled = false;
  }
});

document.querySelector("#back-to-leagues").addEventListener("click", () => {
  currentMember = null;
  leagueHome.hidden = true;
  leagueHub.hidden = false;
  document.querySelector("#invite-panel").hidden = true;
  history.replaceState(null, "", "/sports-hub/leagues/");
  renderLeagueList();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#copy-code").addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(document.querySelector("#invite-code").textContent);
    status.textContent = "League code copied.";
  } catch {
    status.textContent = "Select and copy the code above.";
  }
});

document.querySelector("#copy-commissioner-key").addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(
      document.querySelector("#commissioner-key-value").textContent
    );
    status.textContent = "Commissioner key copied. Store it somewhere private.";
  } catch {
    status.textContent = "Select and copy the commissioner key above.";
  }
});

document.querySelector("#copy-member-key").addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(
      document.querySelector("#member-key-value").textContent
    );
    status.textContent = "Member key copied. Share it only with that manager.";
  } catch {
    status.textContent = "Select and copy the member key above.";
  }
});

async function start() {
  try {
    const [teamBody, leagueBody] = await Promise.all([
      requestJson("/api/sports-hub/teams"),
      requestJson("/api/sports-hub/mini-leagues")
    ]);
    teams = teamBody.teams;
    leagues = leagueBody.leagues;
    populateTeams();
    renderLeagueList();
    leagueStatus.textContent = leagues.length
      ? "Choose a league or start a new one."
      : "No mini-leagues on this device yet.";
    const requested = new URLSearchParams(location.search).get("leagueId");
    if (requested) await openLeague(requested);
  } catch (error) {
    leagueStatus.textContent = error.message;
  }
}

start();

if (typeof module !== "undefined") {
  module.exports = { escapeHtml, points, sportLabel };
}
