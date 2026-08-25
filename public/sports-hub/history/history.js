"use strict";

const teamSelect = document.querySelector("#history-team");
const status = document.querySelector("#history-status");
const empty = document.querySelector("#history-empty");
const summary = document.querySelector("#history-summary");
const timeline = document.querySelector("#history-timeline");
const timelineList = document.querySelector("#timeline-list");
const analyzeTeam = document.querySelector("#analyze-team");
const emptyAnalyze = document.querySelector("#empty-analyze");
const requestedTeamId = new URLSearchParams(location.search).get("teamId");

const escapeHtml = (value) => String(value ?? "").replace(
  /[&<>'"]/g,
  (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]
);

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function signed(value) {
  if (value == null) return "Baseline";
  if (value > 0) return `+${value}`;
  return String(value);
}

function sportUrl(sport) {
  return `/sports-hub/${String(sport).toLowerCase()}/`;
}

function directionLabel(direction) {
  if (direction === "IMPROVED") return "Score improved";
  if (direction === "DECLINED") return "Score decreased";
  if (direction === "UNCHANGED") return "Score unchanged";
  if (direction === "VERSION_CHANGED") return "Scoring version changed";
  return "First check-in";
}

function changeDetails(comparison) {
  const details = [];
  comparison.statusChanges.forEach((change) => {
    details.push(`${change.name}: ${change.from} → ${change.to}`);
  });
  comparison.lineupChanges.forEach((change) => {
    details.push(`${change.name}: ${change.from} → ${change.to}`);
  });
  comparison.playerChanges.added.forEach((player) => {
    details.push(`${player.name} added`);
  });
  comparison.playerChanges.removed.forEach((player) => {
    details.push(`${player.name} removed`);
  });
  comparison.projectionChanges.slice(0, 5).forEach((change) => {
    details.push(`${change.name} projection: ${signed(change.delta)}`);
  });
  return details;
}

function renderHistory(body) {
  const team = body.team;
  const entries = body.timeline;
  const analyzeUrl = sportUrl(team.sport);
  analyzeTeam.href = analyzeUrl;
  emptyAnalyze.href = analyzeUrl;
  status.textContent = "";
  empty.hidden = entries.length > 0;
  summary.hidden = entries.length === 0;
  timeline.hidden = entries.length === 0;
  if (!entries.length) return;

  const latest = entries[0];
  summary.innerHTML = `<div class="progress-score"><p class="kicker">Latest Team Score</p><strong>${latest.checkIn.overallScore}</strong><span>Grade ${escapeHtml(latest.checkIn.letterGrade)}</span></div><div class="progress-verdict"><span class="direction ${latest.comparison.direction.toLowerCase()}">${directionLabel(latest.comparison.direction)}</span><h2 id="history-summary-title">${escapeHtml(team.name)}</h2><div class="progress-stats"><div><small>Score change</small><strong>${signed(latest.comparison.scoreDelta)}</strong></div><div><small>Projection change</small><strong>${signed(latest.comparison.projectionTotalDelta)}</strong></div><div><small>Check-ins</small><strong>${entries.length}</strong></div></div><p>${escapeHtml(latest.comparison.summary.join(" "))}</p></div>`;

  timelineList.innerHTML = entries.map(({ checkIn, comparison }) => {
    const details = changeDetails(comparison);
    const detailMarkup = details.length
      ? `<details><summary>What changed</summary><ul>${details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`
      : "";
    return `<article class="check-in-card"><header><div><time datetime="${escapeHtml(checkIn.checkedInAt)}">${formatDate(checkIn.checkedInAt)}</time><span class="direction ${comparison.direction.toLowerCase()}">${directionLabel(comparison.direction)}</span></div><strong>${checkIn.overallScore}<small>/100</small></strong></header><div class="check-in-metrics"><div><small>Grade</small><strong>${escapeHtml(checkIn.letterGrade)}</strong></div><div><small>Roster projection</small><strong>${checkIn.projectedRosterTotal}</strong></div><div><small>Completeness</small><strong>${checkIn.completenessPercentage}%</strong></div></div><p>${escapeHtml(comparison.summary[0])}</p>${detailMarkup}<small class="snapshot-note">Saved with Team Score ${escapeHtml(checkIn.analysisVersion)} · ${escapeHtml(checkIn.confidence.toLowerCase())} confidence</small></article>`;
  }).join("");
}

async function loadHistory(teamId) {
  status.textContent = "Loading progress…";
  empty.hidden = true;
  summary.hidden = true;
  timeline.hidden = true;
  try {
    const response = await fetch(
      `/api/sports-hub/teams/${encodeURIComponent(teamId)}/check-ins`
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Progress could not be loaded.");
    history.replaceState(null, "", `?teamId=${encodeURIComponent(teamId)}`);
    renderHistory(body);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function start() {
  try {
    const response = await fetch("/api/sports-hub/teams");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Teams could not be loaded.");
    if (!body.teams.length) {
      teamSelect.innerHTML = '<option value="">No saved teams</option>';
      teamSelect.disabled = true;
      status.textContent = "Analyze a team first, then save its score as a check-in.";
      empty.hidden = false;
      return;
    }
    teamSelect.innerHTML = body.teams.map((team) =>
      `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)} · ${escapeHtml(team.sport[0] + team.sport.slice(1).toLowerCase())}</option>`
    ).join("");
    const selected = body.teams.some((team) => team.id === requestedTeamId)
      ? requestedTeamId
      : body.teams[0].id;
    teamSelect.value = selected;
    teamSelect.onchange = () => loadHistory(teamSelect.value);
    await loadHistory(selected);
  } catch (error) {
    status.textContent = error.message;
  }
}

start();

if (typeof module !== "undefined") {
  module.exports = { changeDetails, escapeHtml, signed };
}
