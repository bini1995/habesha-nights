const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { parseCsv, parseImport } = require("../products/sports-hub/domain/import-schema");
const { createTeamStore } = require("../products/sports-hub/services/team-store");
const { createImportStore } = require("../products/sports-hub/services/import-store");
const { createAnalysisStore } = require("../products/sports-hub/services/analysis-store");
const { createSportsHubRouter } = require("../products/sports-hub");
const { recommendImprovements } = require("../products/sports-hub/domain/team-analysis");
const { CsvTeamImportAdapter, JsonTeamImportAdapter, OfflineSampleImportAdapter } = require("../products/sports-hub/domain/import-adapter");

const fixturePath = (name) => path.join(__dirname, "..", "products", "sports-hub", "fixtures", name);
async function fixture(name) { return fs.readFile(fixturePath(name), "utf8"); }
async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-import-"));
  return { directory, teamStore: createTeamStore({ file: path.join(directory, "teams.json") }), importStore: createImportStore({ file: path.join(directory, "imports.json") }), analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") }) };
}
async function withServer(dependencies, run) {
  const app = express(); app.use(express.json({ limit: "2mb" })); app.use("/api/sports-hub", createSportsHubRouter({ ...dependencies, now: () => new Date("2026-08-30T12:00:00.000Z") }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/sports-hub`); } finally { await new Promise((resolve) => server.close(resolve)); }
}
async function post(url, data) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); return { response, body: await response.json() }; }

test("CSV parser handles quoted values and imports football", async () => {
  const rows = parseCsv('name,note\n"River, Sam","He said ""go"""\n');
  assert.deepEqual(rows, [{ name: "River, Sam", note: 'He said "go"' }]);
  const result = parseImport({ sourceType: "CSV", sport: "football", content: await fixture("import-football.csv") });
  assert.equal(result.normalized.sport, "FOOTBALL"); assert.equal(result.normalized.team.roster.length, 5); assert.equal(result.normalized.availablePlayers.length, 3);
});

test("JSON and offline-sample imports normalize basketball with versioned fields", async () => {
  const content = await fixture("import-basketball.json");
  for (const sourceType of ["JSON", "OFFLINE_SAMPLE"]) {
    const result = parseImport({ sourceType, content, sport: "basketball" });
    assert.equal(result.normalized.schemaVersion, "sports-hub-import/1.0");
    assert.equal(result.normalized.manager.name, "Morgan Chen");
    assert.equal(result.normalized.team.leagueSettings.starterPositions.length, 5);
    assert.equal(Object.isFrozen(result.normalized), true);
  }
});

test("user-data adapters preserve the future licensed-provider boundary", async () => {
  const csv = await new CsvTeamImportAdapter().importTeam({ content: await fixture("import-football.csv"), sport: "FOOTBALL" });
  const jsonContent = await fixture("import-basketball.json");
  const json = await new JsonTeamImportAdapter().importTeam({ content: jsonContent, sport: "BASKETBALL" });
  const sample = await new OfflineSampleImportAdapter().importTeam({ content: jsonContent, sport: "BASKETBALL" });
  assert.equal(csv.sourceType, "CSV"); assert.equal(json.sourceType, "JSON"); assert.equal(sample.sourceType, "OFFLINE_SAMPLE");
});

test("imports reject duplicate players, invalid positions, and invalid projections", async () => {
  const basketball = JSON.parse(await fixture("import-basketball.json"));
  basketball.availablePlayers[0].player.id = basketball.roster[0].player.id;
  assert.throws(() => parseImport({ sourceType: "JSON", content: basketball }), /both the roster and waiver pool/);
  const malformed = await fixture("import-malformed.json");
  assert.throws(() => parseImport({ sourceType: "JSON", content: malformed }), /position is not supported|between 0 and 1000/);
});

test("preview does not persist; confirmation records checksum, history, and explicit updates", async () => {
  const dependencies = await setup();
  try { await withServer(dependencies, async (base) => {
    const content = await fixture("import-football.csv");
    const preview = await post(`${base}/imports/preview`, { sourceType: "CSV", sport: "FOOTBALL", filename: "my-team.csv", content });
    assert.equal(preview.response.status, 200); assert.equal((await dependencies.teamStore.list()).length, 0);
    assert.equal(preview.body.preview.checksum.length, 64); assert.equal(preview.body.preview.rowCounts.accepted, 8);
    const confirmed = await post(`${base}/imports/confirm`, { previewId: preview.body.preview.previewId, operation: "CREATE" });
    assert.equal(confirmed.response.status, 201); assert.equal((await dependencies.teamStore.list()).length, 1);
    assert.equal(confirmed.body.import.originalFilename, "my-team.csv"); assert.equal(confirmed.body.import.contentChecksum, preview.body.preview.checksum);
    const history = await (await fetch(`${base}/imports`)).json(); assert.equal(history.count, 1); assert.equal("snapshot" in history.imports[0], false);
    const detail = await (await fetch(`${base}/imports/${confirmed.body.import.importId}`)).json(); assert.equal(detail.import.snapshot.team.id, "imported-football");
    const secondPreview = await post(`${base}/imports/preview`, { sourceType: "CSV", sport: "FOOTBALL", content });
    const conflict = await post(`${base}/imports/confirm`, { previewId: secondPreview.body.preview.previewId, operation: "CREATE" }); assert.equal(conflict.response.status, 409);
    const thirdPreview = await post(`${base}/imports/preview`, { sourceType: "CSV", sport: "FOOTBALL", content });
    const update = await post(`${base}/imports/confirm`, { previewId: thirdPreview.body.preview.previewId, operation: "UPDATE" }); assert.equal(update.response.status, 201);
  }); } finally { await fs.rm(dependencies.directory, { recursive: true, force: true }); }
});

test("reanalyzing an import is reproducible, fresh-aware, immutable, and entitlement-safe", async () => {
  const dependencies = await setup();
  try { await withServer(dependencies, async (base) => {
    const content = await fixture("import-basketball.json");
    const preview = await post(`${base}/imports/preview`, { sourceType: "JSON", sport: "BASKETBALL", content });
    const confirmed = await post(`${base}/imports/confirm`, { previewId: preview.body.preview.previewId, operation: "CREATE" });
    const request = { importId: confirmed.body.import.importId };
    const first = await post(`${base}/teams/imported-basketball/reanalyze`, request); const second = await post(`${base}/teams/imported-basketball/reanalyze`, request);
    assert.equal(first.body.analysis.overallScore, second.body.analysis.overallScore);
    assert.equal(first.body.analysis.provenance.snapshotChecksum, second.body.analysis.provenance.snapshotChecksum);
    assert.equal(first.body.analysis.provenance.importVersion, "sports-hub-import/1.0");
    assert.equal(first.body.analysis.provenance.freshness.status, "STALE"); assert.match(first.body.analysis.provenance.staleDataWarning, /days old/);
    assert.equal(first.body.recommendations.length, 2); assert.ok(first.body.lockedRecommendationCount > 0);
    const normalized = parseImport({ sourceType: "JSON", content }).normalized;
    const all = recommendImprovements(normalized.team, normalized.availablePlayers);
    assert.equal(JSON.stringify(first.body).includes(all[2].reason), false);
    const snapshots = await dependencies.analysisStore.list(); assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].inputChecksum, snapshots[1].inputChecksum);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshots[0].inputSnapshot, "team"), true);
  }); } finally { await fs.rm(dependencies.directory, { recursive: true, force: true }); }
});

test("incomplete imports warn and templates use downloadable content types", async () => {
  const dependencies = await setup();
  try { await withServer(dependencies, async (base) => {
    const preview = await post(`${base}/imports/preview`, { sourceType: "JSON", content: await fixture("import-incomplete.json") });
    assert.equal(preview.response.status, 200); assert.ok(preview.body.preview.warnings.length >= 2); assert.equal(preview.body.preview.freshness.status, "STALE");
    const csv = await fetch(`${base}/import/templates/csv`); assert.match(csv.headers.get("content-type"), /^text\/csv/); assert.match(csv.headers.get("content-disposition"), /attachment/);
    const json = await fetch(`${base}/import/templates/json`); assert.match(json.headers.get("content-type"), /^application\/json/); assert.match(json.headers.get("content-disposition"), /attachment/);
  }); } finally { await fs.rm(dependencies.directory, { recursive: true, force: true }); }
});
