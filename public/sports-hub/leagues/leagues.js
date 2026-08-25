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

let teams = [];
let leagues = [];
let currentLeague = null;

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
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
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
      return `<article class="member-card">
        <span class="member-avatar" aria-hidden="true">${escapeHtml(member.displayName[0].toUpperCase())}</span>
        <span><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(teamName(membership?.teamId) ?? "No linked team")}</small></span>
        ${member.role === "OWNER" ? '<b class="owner-pill">Owner</b>' : ""}
      </article>`;
    }).join("");
}

function selectedPeriod() {
  return Number(periodSelect.value || 1);
}

function renderMatchups() {
  const period = selectedPeriod();
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
    return `<form class="matchup-card score-form" data-matchup-id="${escapeHtml(matchup.id)}">
      <div class="matchup-number">Period ${matchup.scoringPeriod}</div>
      <label><span>${escapeHtml(managerName(matchup.homeMemberId))}</span><small>Official points</small>
        <input name="homePoints" inputmode="decimal" type="number" min="0" max="10000" step="0.01" value="${scored ? escapeHtml(matchup.homePoints) : ""}" placeholder="0.00" required>
      </label>
      <span class="versus" aria-hidden="true">vs</span>
      <label><span>${escapeHtml(managerName(matchup.awayMemberId))}</span><small>Official points</small>
        <input name="awayPoints" inputmode="decimal" type="number" min="0" max="10000" step="0.01" value="${scored ? escapeHtml(matchup.awayPoints) : ""}" placeholder="0.00" required>
      </label>
      <button class="${scored ? "quiet" : "primary"}" type="submit">${scored ? "Update result" : "Record result"}</button>
      ${scored ? `<small class="recorded-label">Recorded ${escapeHtml(new Date(matchup.scoredAt).toLocaleString())}</small>` : ""}
    </form>`;
  }).join("");
  matchupList.querySelectorAll(".score-form").forEach((form) => {
    form.addEventListener("submit", submitScore);
  });
}

function renderLeague(league, joinCode) {
  currentLeague = league;
  leagueHub.hidden = true;
  leagueHome.hidden = false;
  history.replaceState(null, "", `?leagueId=${encodeURIComponent(league.id)}`);
  document.querySelector("#league-sport").textContent = sportLabel(league.sport);
  document.querySelector("#league-name").textContent = league.name;
  document.querySelector("#league-meta").textContent =
    `${league.members.length} ${league.members.length === 1 ? "manager" : "managers"} · ${league.scoringPeriodCount} scoring periods`;
  document.querySelector("#league-state").textContent =
    league.status === "IN_PROGRESS" ? "Scoring started" : "Open to join";
  const invitePanel = document.querySelector("#invite-panel");
  invitePanel.hidden = !joinCode;
  if (joinCode) document.querySelector("#invite-code").textContent = joinCode;
  periodSelect.innerHTML = Array.from({ length: league.scoringPeriodCount }, (_, index) =>
    `<option value="${index + 1}">Period ${index + 1}</option>`).join("");
  const next = league.matchups.find((matchup) => !matchup.scoredAt);
  periodSelect.value = String(next?.scoringPeriod ?? league.matchups.at(-1)?.scoringPeriod ?? 1);
  renderStandings();
  renderMembers();
  renderMatchups();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openLeague(leagueId) {
  leagueStatus.textContent = "Opening league…";
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(leagueId)}`
    );
    renderLeague(body.league);
  } catch (error) {
    leagueStatus.textContent = error.message;
  }
}

async function submitScore(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  document.querySelector("#score-status").textContent = "Recording official result…";
  button.disabled = true;
  try {
    const body = await requestJson(
      `/api/sports-hub/mini-leagues/${encodeURIComponent(currentLeague.id)}/matchups/${encodeURIComponent(form.dataset.matchupId)}/score`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
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
    document.querySelector("#score-status").textContent =
      "Result recorded. Standings updated.";
    renderStandings();
    renderMatchups();
  } catch (error) {
    document.querySelector("#score-status").textContent = error.message;
    button.disabled = false;
  }
}

createSport.addEventListener("change", populateTeams);
periodSelect.addEventListener("change", renderMatchups);

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
    renderLeague(body.league, body.joinCode);
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
    renderLeague(body.league);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

document.querySelector("#back-to-leagues").addEventListener("click", () => {
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
