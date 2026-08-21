const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const football = require("../products/sports-hub/fixtures/football-team.json");
const basketball = require("../products/sports-hub/fixtures/basketball-team.json");
const { createTeam } = require("../products/sports-hub/domain/models");
const { TEAM_SCORE_VERSION, analyzeTeam, recommendImprovements } = require("../products/sports-hub/domain/team-analysis");
const { createTeamStore } = require("../products/sports-hub/services/team-store");
const { createEntitlementService, TIERS } = require("../products/sports-hub/services/entitlements");
const { createAnalysisStore } = require("../products/sports-hub/services/analysis-store");
const { createImportStore } = require("../products/sports-hub/services/import-store");
const { createSportsHubRouter } = require("../products/sports-hub");

async function temporaryStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-hub-test-"));
  return { directory, store: createTeamStore({ file: path.join(directory, "teams.json"), now: () => new Date("2026-08-21T12:00:00.000Z") }) };
}
async function withServer(router, run) {
  const app = express(); app.use(express.json()); app.use("/api/sports-hub", router);
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/sports-hub`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("football and basketball teams are validated and deeply immutable", () => {
  for (const fixture of [football, basketball]) {
    const team = createTeam(fixture);
    assert.equal(team.sport, fixture.sport);
    assert.equal(Object.isFrozen(team), true);
    assert.equal(Object.isFrozen(team.roster), true);
    assert.equal(Object.isFrozen(team.roster[0].player), true);
  }
});

test("team validation rejects sport, position, duplicate, and projection failures", () => {
  assert.throws(() => createTeam({ ...football, sport: "BASEBALL" }), /sport must be one of/);
  assert.throws(() => createTeam({ ...football, roster: [{ ...football.roster[0], player: { ...football.roster[0].player, position: "C" } }] }), /position is not supported/);
  assert.throws(() => createTeam({ ...football, roster: [football.roster[0], { ...football.roster[0], id: "other" }] }), /player IDs must be unique/);
  assert.throws(() => createTeam({ ...football, roster: [{ ...football.roster[0], projection: { projectedFantasyPoints: -1 } }] }), /between 0 and 1000/);
});

test("Team Score is deterministic, versioned, bounded, and distinct from other scores", () => {
  const first = analyzeTeam(football); const second = analyzeTeam(football);
  assert.equal(first.overallScore, second.overallScore);
  assert.equal(first.teamScoreVersion, TEAM_SCORE_VERSION);
  assert.ok(first.overallScore >= 0 && first.overallScore <= 100);
  assert.equal(first.officialFantasyPoints.projectedRosterTotal, 75);
  assert.equal(first.managerScore, null); assert.equal(first.aiRanking, null);
  assert.notEqual(first.overallScore, first.officialFantasyPoints.projectedRosterTotal);
  const basketballResult = analyzeTeam(basketball);
  assert.equal(basketballResult.sport, "BASKETBALL");
  assert.ok(basketballResult.overallScore >= 0 && basketballResult.overallScore <= 100);
});

test("missing projections reduce completeness without breaking analysis", () => {
  const incomplete = { ...football, roster: football.roster.map((slot) => ({ ...slot, projection: null })) };
  const result = analyzeTeam(incomplete);
  assert.equal(result.dataCompleteness.projectedPlayers, 0);
  assert.equal(result.dataCompleteness.confidence, "LOW");
  assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
});

test("recommendations are ranked deterministically with complete supporting inputs", () => {
  const recommendations = recommendImprovements(football, football.availablePlayers);
  assert.ok(recommendations.length >= 3);
  assert.deepEqual(recommendations, recommendImprovements(football, football.availablePlayers));
  recommendations.forEach((item, index) => {
    assert.equal(item.rank, index + 1); assert.ok(item.expectedScoreImprovement > 0);
    assert.ok(item.reason.length > 0); assert.ok(item.dataInputsUsed.length > 0);
    if (index > 0) assert.ok(recommendations[index - 1].expectedScoreImprovement >= item.expectedScoreImprovement);
  });
});

test("entitlements limit free recommendations and do not leak premium details", async () => {
  const all = recommendImprovements(football, football.availablePlayers);
  const service = createEntitlementService();
  const free = service.applyRecommendationEntitlement(all, await service.getEntitlement());
  assert.equal(free.tier, TIERS.FREE); assert.equal(free.recommendations.length, 2);
  assert.equal(free.lockedRecommendationCount, all.length - 2);
  assert.equal(JSON.stringify(free).includes(all[2].reason), false);
  const premiumService = createEntitlementService({ resolveTier: async () => TIERS.PREMIUM });
  const premium = premiumService.applyRecommendationEntitlement(all, await premiumService.getEntitlement());
  assert.equal(premium.recommendations.length, all.length);
});

test("teams persist under an isolated default profile", async () => {
  const { directory, store } = await temporaryStore();
  try {
    await store.save(football);
    const reloaded = createTeamStore({ file: path.join(directory, "teams.json") });
    assert.equal((await reloaded.list()).length, 1);
    assert.equal((await reloaded.get(football.id)).name, football.name);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("Sports Hub team APIs create, list, retrieve, analyze, and protect premium details", async () => {
  const { directory, store } = await temporaryStore();
  try {
    await withServer(createSportsHubRouter({ teamStore: store, analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") }), importStore: createImportStore({ file: path.join(directory, "imports.json") }) }), async (base) => {
      const created = await fetch(`${base}/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(football) });
      assert.equal(created.status, 201);
      assert.equal((await fetch(`${base}/teams`)).status, 200);
      assert.equal((await fetch(`${base}/teams/${football.id}`)).status, 200);
      const analyzed = await fetch(`${base}/teams/${football.id}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ availablePlayers: football.availablePlayers }) });
      const body = await analyzed.json();
      assert.equal(analyzed.status, 200); assert.equal(body.entitlement, "FREE");
      assert.equal(body.recommendations.length, 2); assert.ok(body.lockedRecommendationCount > 0);
      const all = recommendImprovements(football, football.availablePlayers);
      assert.equal(JSON.stringify(body).includes(all[2].reason), false);
      const invalid = await fetch(`${base}/teams`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(invalid.status, 400);
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
