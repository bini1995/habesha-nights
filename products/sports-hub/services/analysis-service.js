const crypto = require("crypto");
const { analyzeTeam, recommendImprovements, TEAM_SCORE_VERSION } = require("../domain/team-analysis");
const { checksum } = require("../domain/import-schema");

function createAnalysisService({ analysisStore, entitlementService, now = () => new Date() }) {
  async function analyze({ team, availablePlayers = [], importRecord = null }) {
    const analysis = analyzeTeam(team);
    const allRecommendations = recommendImprovements(team, availablePlayers);
    const entitlement = await entitlementService.getEntitlement(team.profileId);
    const entitled = entitlementService.applyRecommendationEntitlement(allRecommendations, entitlement);
    const projectionDate = importRecord?.snapshot?.projectionDate ?? null;
    const ageDays = projectionDate ? Math.max(0, (now().getTime() - new Date(projectionDate).getTime()) / 86400000) : null;
    const stale = ageDays !== null && ageDays > 7;
    const provenance = Object.freeze({
      source: importRecord?.sourceType ?? "MANUAL_ENTRY",
      projectionDate,
      scoringPeriod: importRecord?.scoringPeriod ?? null,
      analysisVersion: TEAM_SCORE_VERSION,
      importVersion: importRecord?.schemaVersion ?? null,
      importId: importRecord?.importId ?? null,
      contentChecksum: importRecord?.contentChecksum ?? null,
      snapshotChecksum: null,
      freshness: projectionDate ? { ageDays: Math.round(ageDays * 10) / 10, status: stale ? "STALE" : "FRESH" } : { ageDays: null, status: "UNKNOWN" },
      staleDataWarning: stale ? `Projection data is ${Math.round(ageDays)} days old; refresh it before making roster decisions.` : null
    });
    const inputSnapshot = Object.freeze({ team, availablePlayers, provenance: { ...provenance, snapshotChecksum: undefined } });
    const snapshotChecksum = checksum(JSON.stringify(inputSnapshot));
    const finalProvenance = Object.freeze({ ...provenance, snapshotChecksum });
    const analysisId = `analysis-${crypto.randomUUID()}`;
    const finalAnalysis = Object.freeze({ ...analysis, provenance: finalProvenance });
    await analysisStore.save(Object.freeze({ analysisId, profileId: team.profileId, teamId: team.id, importId: importRecord?.importId ?? null, analyzedAt: now().toISOString(), inputSnapshot: Object.freeze({ team, availablePlayers, provenance: finalProvenance }), inputChecksum: snapshotChecksum, outputSnapshot: finalAnalysis, schemaVersion: "sports-hub-analysis-snapshot/2.0" }), team.profileId);
    return Object.freeze({ analysisId, analysis: finalAnalysis, entitlement: entitled.tier, recommendations: entitled.recommendations, lockedRecommendationCount: entitled.lockedRecommendationCount });
  }
  return { analyze };
}
module.exports = { createAnalysisService };
