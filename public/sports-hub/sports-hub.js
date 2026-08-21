const rows = document.querySelector("#roster-rows");
const notice = document.querySelector("#notice");
let availablePlayers = [];
let currentPreview = null;

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
  const provenance = document.querySelector("#provenance");
  if (analysis.provenance) {
    provenance.hidden = false;
    provenance.innerHTML = `<strong>Input provenance</strong><span>${escapeHtml(analysis.provenance.source)}</span><span>${escapeHtml(analysis.provenance.scoringPeriod ?? "No scoring period")}</span><span>Projection: ${escapeHtml(analysis.provenance.projectionDate ?? "not supplied")}</span><span>Analysis v${escapeHtml(analysis.provenance.analysisVersion)}</span>${analysis.provenance.staleDataWarning ? `<em>${escapeHtml(analysis.provenance.staleDataWarning)}</em>` : ""}`;
  } else provenance.hidden = true;
  document.querySelector("#components").innerHTML = Object.entries(analysis.components).map(([key, value]) => `<div class="component"><div><span>${labelComponent(key)}</span><strong>${value}</strong></div><div class="meter" aria-label="${labelComponent(key)} ${value} out of 100"><span style="width:${value}%"></span></div></div>`).join("");
  document.querySelector("#reasons").innerHTML = `<ul>${analysis.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`;
  document.querySelector("#recommendations").innerHTML = result.recommendations.length ? result.recommendations.map((item) => `<article class="recommendation"><span class="rank">${item.rank}</span><div><h3>${escapeHtml(recommendationTitle(item))}</h3><p>${escapeHtml(item.reason)}</p></div><span class="improvement">+${item.expectedScoreImprovement} Team Score</span></article>`).join("") : "<p>No positive roster moves were found in the supplied options.</p>";
  const premium = document.querySelector("#premium-placeholder"); premium.hidden = result.lockedRecommendationCount === 0;
  if (!premium.hidden) premium.querySelector("strong").textContent = `${result.lockedRecommendationCount} more ranked move${result.lockedRecommendationCount === 1 ? "" : "s"} available`;
  document.querySelector("#results").hidden = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadImportExample(format) {
  const response = await fetch(`/api/sports-hub/import/templates/${format.toLowerCase()}`);
  if (!response.ok) throw new Error("Example import could not be loaded.");
  document.querySelector("#import-format").value = format;
  document.querySelector("#import-sport").value = format === "CSV" ? "FOOTBALL" : "BASKETBALL";
  document.querySelector("#import-data").value = await response.text();
  document.querySelector("#import-notice").textContent = `${format} example loaded. Preview it to validate every field.`;
}

function renderImportPreview(preview) {
  currentPreview = preview;
  const normalized = preview.normalized;
  document.querySelector("#preview-title").textContent = `${normalized.team.name} · ${normalized.sport === "FOOTBALL" ? "Football" : "Basketball"}`;
  document.querySelector("#preview-freshness").textContent = `${preview.freshness.status} · ${preview.freshness.ageDays} days old`;
  document.querySelector("#preview-fields").innerHTML = [
    ["Manager", normalized.manager.name], ["League", normalized.team.leagueSettings.name], ["Season", normalized.season], ["Scoring period", normalized.scoringPeriod], ["Roster", `${normalized.team.roster.length} players`], ["Waiver pool", `${normalized.availablePlayers.length} players`], ["Accepted", preview.rowCounts.accepted], ["Checksum", preview.checksum.slice(0, 12)]
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  document.querySelector("#preview-messages").innerHTML = normalized.warnings.length ? `<div class="warnings"><strong>Warnings</strong><ul>${normalized.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : `<p class="success">No validation warnings.</p>`;
  document.querySelector("#import-preview").hidden = false;
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

document.querySelector("#import-file").addEventListener("change", async (event) => {
  const [file] = event.target.files; if (!file) return;
  document.querySelector("#import-data").value = await file.text();
  document.querySelector("#import-format").value = file.name.toLowerCase().endsWith(".json") ? "JSON" : "CSV";
  document.querySelector("#import-notice").textContent = `${file.name} is ready to preview. The raw file remains in your browser.`;
});
document.querySelector("#load-csv-example").addEventListener("click", () => loadImportExample("CSV").catch((error) => { document.querySelector("#import-notice").textContent = error.message; }));
document.querySelector("#load-json-example").addEventListener("click", () => loadImportExample("JSON").catch((error) => { document.querySelector("#import-notice").textContent = error.message; }));
document.querySelector("#import-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const importNotice = document.querySelector("#import-notice"); importNotice.textContent = "Parsing and validating import…";
  try {
    const file = document.querySelector("#import-file").files[0];
    const response = await fetch("/api/sports-hub/imports/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceType: document.querySelector("#import-format").value, sport: document.querySelector("#import-sport").value, filename: file?.name ?? null, content: document.querySelector("#import-data").value }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Import preview failed.");
    renderImportPreview(body.preview); importNotice.textContent = "Preview ready. Review it before confirming.";
  } catch (error) { currentPreview = null; document.querySelector("#import-preview").hidden = true; importNotice.textContent = error.message; }
});
document.querySelector("#confirm-import").addEventListener("click", async () => {
  const importNotice = document.querySelector("#import-notice");
  if (!currentPreview) { importNotice.textContent = "Preview an import before confirming."; return; }
  importNotice.textContent = "Confirming import and recording provenance…";
  try {
    const confirmed = await fetch("/api/sports-hub/imports/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ previewId: currentPreview.previewId, operation: document.querySelector("#import-operation").value }) });
    const confirmedBody = await confirmed.json(); if (!confirmed.ok) throw new Error(confirmedBody.error ?? "Import confirmation failed.");
    const analyzed = await fetch(`/api/sports-hub/teams/${encodeURIComponent(confirmedBody.import.teamId)}/reanalyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importId: confirmedBody.import.importId }) });
    const result = await analyzed.json(); if (!analyzed.ok) throw new Error(result.error ?? "Imported team analysis failed.");
    render(result); importNotice.textContent = "Import confirmed. Team, provenance, and analysis snapshot saved."; currentPreview = null;
  } catch (error) { importNotice.textContent = error.message; }
});

loadSample("football").catch(() => { addRosterRow({ role: "STARTER" }); notice.textContent = "Enter a roster to begin."; });
if (typeof module !== "undefined") module.exports = { escapeHtml, labelComponent, positionsFor };
