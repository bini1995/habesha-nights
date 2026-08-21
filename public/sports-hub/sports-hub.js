const rows = document.querySelector("#roster-rows");
const notice = document.querySelector("#notice");
let availablePlayers = [];

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function positionsFor(sport) { return sport === "BASKETBALL" ? ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"] : ["QB", "RB", "WR", "TE", "K", "DST", "FLEX"]; }

function addRosterRow(slot = {}) {
  const sport = document.querySelector("#sport").value;
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input data-field="name" aria-label="Player name" required value="${escapeHtml(slot.player?.name ?? "")}"></td><td><select data-field="position" aria-label="Position">${positionsFor(sport).map((position) => `<option ${position === slot.player?.position ? "selected" : ""}>${position}</option>`).join("")}</select></td><td><select data-field="role" aria-label="Roster role"><option ${slot.role === "STARTER" ? "selected" : ""}>STARTER</option><option ${slot.role !== "STARTER" ? "selected" : ""}>BENCH</option></select></td><td><input data-field="points" aria-label="Projected fantasy points" type="number" min="0" max="1000" step="0.1" value="${escapeHtml(slot.projection?.projectedFantasyPoints ?? "")}"></td><td><input data-field="availability" aria-label="Availability from zero to one" type="number" min="0" max="1" step="0.05" value="${escapeHtml(slot.projection?.availability ?? "")}"></td><td><button type="button" class="remove-player" aria-label="Remove player">×</button></td>`;
  tr.querySelector(".remove-player").addEventListener("click", () => tr.remove());
  rows.append(tr);
}

function populate(team) {
  document.querySelector("#sport").value = team.sport;
  document.querySelector("#team-name").value = team.name;
  document.querySelector("#league-name").value = team.leagueSettings.name;
  document.querySelector("#starter-positions").value = team.leagueSettings.starterPositions.join(",");
  rows.replaceChildren(); team.roster.forEach(addRosterRow); availablePlayers = team.availablePlayers ?? [];
}

function buildTeam() {
  const sport = document.querySelector("#sport").value;
  const roster = [...rows.querySelectorAll("tr")].map((row, index) => {
    const get = (field) => row.querySelector(`[data-field="${field}"]`).value;
    const name = get("name").trim();
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player"}-${index + 1}`;
    const projected = get("points"); const availability = get("availability");
    return { id: `slot-${index + 1}`, role: get("role"), player: { id, name, sport, position: get("position"), status: availability === "" ? "UNKNOWN" : "ACTIVE" }, projection: projected === "" && availability === "" ? null : { playerId: id, projectedFantasyPoints: projected === "" ? null : Number(projected), availability: availability === "" ? null : Number(availability), source: "MANUAL_ENTRY" } };
  });
  return { id: `team-${Date.now()}`, name: document.querySelector("#team-name").value, sport, leagueSettings: { name: document.querySelector("#league-name").value, sport, starterPositions: document.querySelector("#starter-positions").value.split(",").map((value) => value.trim()).filter(Boolean), scoringLabel: "User-supplied projected fantasy points" }, roster };
}

async function loadSample(sport) {
  notice.textContent = "Loading sample…";
  const response = await fetch(`/api/sports-hub/samples/${sport}`);
  if (!response.ok) throw new Error("The sample could not be loaded.");
  const sample = await response.json(); populate(sample);
  document.querySelector("#team-json").value = "";
  notice.textContent = `${sport[0].toUpperCase()}${sport.slice(1)} sample loaded. You can edit it before analyzing.`;
}

function labelComponent(key) { return ({ starterStrength: "Starter strength", benchDepth: "Bench depth", positionalBalance: "Positional balance", projectedProduction: "Projected production", availabilityRisk: "Availability & risk" })[key] ?? key; }
function recommendationTitle(item) { return item.action === "START_PLAYER" ? `Start ${item.playerStarted.name}` : `Add ${item.playerAdded.name}`; }

function render(result) {
  const { analysis } = result;
  document.querySelector("#overall-score").textContent = analysis.overallScore;
  document.querySelector("#grade").textContent = analysis.letterGrade;
  document.querySelector("#score-version").textContent = `Team Score v${analysis.teamScoreVersion}`;
  document.querySelector("#confidence").textContent = `${analysis.dataCompleteness.confidence} confidence · ${analysis.dataCompleteness.percentage}% complete`;
  document.querySelector("#components").innerHTML = Object.entries(analysis.components).map(([key, value]) => `<div class="component"><div><span>${labelComponent(key)}</span><strong>${value}</strong></div><div class="meter" aria-label="${labelComponent(key)} ${value} out of 100"><span style="width:${value}%"></span></div></div>`).join("");
  document.querySelector("#reasons").innerHTML = `<ul>${analysis.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`;
  document.querySelector("#recommendations").innerHTML = result.recommendations.length ? result.recommendations.map((item) => `<article class="recommendation"><span class="rank">${item.rank}</span><div><h3>${escapeHtml(recommendationTitle(item))}</h3><p>${escapeHtml(item.reason)}</p></div><span class="improvement">+${item.expectedScoreImprovement} Team Score</span></article>`).join("") : "<p>No positive roster moves were found in the supplied options.</p>";
  const premium = document.querySelector("#premium-placeholder"); premium.hidden = result.lockedRecommendationCount === 0;
  if (!premium.hidden) premium.querySelector("strong").textContent = `${result.lockedRecommendationCount} more ranked move${result.lockedRecommendationCount === 1 ? "" : "s"} available`;
  document.querySelector("#results").hidden = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#add-player").addEventListener("click", () => addRosterRow());
document.querySelector("#sport").addEventListener("change", (event) => { rows.replaceChildren(); document.querySelector("#starter-positions").value = event.target.value === "BASKETBALL" ? "PG,SG,SF,PF,C" : "QB,RB,WR,TE"; addRosterRow({ role: "STARTER" }); });
document.querySelectorAll("[data-sample]").forEach((button) => button.addEventListener("click", () => loadSample(button.dataset.sample).catch((error) => { notice.textContent = error.message; })));
document.querySelector("#apply-json").addEventListener("click", () => { try { const data = JSON.parse(document.querySelector("#team-json").value); populate(data); notice.textContent = "JSON applied. Submit to validate and analyze it."; } catch (error) { notice.textContent = `Invalid JSON: ${error.message}`; } });
document.querySelector("#team-form").addEventListener("submit", async (event) => {
  event.preventDefault(); notice.textContent = "Saving and analyzing your roster…";
  try {
    let team = buildTeam(); const json = document.querySelector("#team-json").value.trim(); if (json) team = JSON.parse(json);
    const saved = await fetch("/api/sports-hub/teams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(team) });
    const savedBody = await saved.json(); if (!saved.ok) throw new Error(savedBody.error ?? "Team validation failed.");
    const analyzed = await fetch(`/api/sports-hub/teams/${encodeURIComponent(savedBody.team.id)}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ availablePlayers }) });
    const result = await analyzed.json(); if (!analyzed.ok) throw new Error(result.error ?? "Analysis failed.");
    render(result); notice.textContent = "Analysis complete and team saved locally.";
  } catch (error) { notice.textContent = error.message; }
});

loadSample("football").catch(() => { addRosterRow({ role: "STARTER" }); notice.textContent = "Enter a roster to begin."; });
if (typeof module !== "undefined") module.exports = { escapeHtml, labelComponent, positionsFor };
