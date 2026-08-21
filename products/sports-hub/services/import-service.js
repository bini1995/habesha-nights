const crypto = require("crypto");
const path = require("path");
const { IMPORT_SCHEMA_VERSION, parseImport, checksum } = require("../domain/import-schema");

const PREVIEW_TTL_MS = 30 * 60 * 1000;
function createImportService({ teamStore, importStore, now = () => new Date() }) {
  const previews = new Map();
  function freshness(projectionDate) {
    const ageDays = Math.max(0, (now().getTime() - new Date(projectionDate).getTime()) / 86400000);
    return { projectionDate, ageDays: Math.round(ageDays * 10) / 10, status: ageDays > 7 ? "STALE" : "FRESH", stale: ageDays > 7 };
  }
  function preview({ sourceType, content, sport, filename = null }) {
    const parsed = parseImport({ sourceType, content, sport });
    const previewId = `preview-${crypto.randomUUID()}`; const createdAt = now().toISOString();
    const safeFilename = filename ? path.basename(String(filename)).slice(0, 255) : null;
    const result = { previewId, sourceType: parsed.sourceType, schemaVersion: IMPORT_SCHEMA_VERSION, checksum: parsed.checksum, filename: safeFilename, rowCounts: { total: parsed.rowCount, accepted: parsed.rowCount, rejected: 0 }, warnings: parsed.normalized.warnings, errors: [], freshness: freshness(parsed.normalized.projectionDate), normalized: parsed.normalized, createdAt, expiresAt: new Date(now().getTime() + PREVIEW_TTL_MS).toISOString() };
    previews.set(previewId, result); return result;
  }
  async function confirm({ previewId, operation = "CREATE" }, profileId = "default") {
    const pending = previews.get(previewId); if (!pending) throw new Error("Import preview was not found or has expired.");
    if (new Date(pending.expiresAt) <= now()) { previews.delete(previewId); throw new Error("Import preview has expired."); }
    const normalized = pending.normalized; const mode = String(operation).toUpperCase();
    if (!['CREATE', 'UPDATE'].includes(mode)) throw new Error("operation must be CREATE or UPDATE.");
    const team = mode === "CREATE" ? await teamStore.create(normalized.team, profileId) : await teamStore.update(normalized.team, profileId);
    const importId = `import-${crypto.randomUUID()}`;
    const record = Object.freeze({ importId, profileId, teamId: team.id, sourceType: pending.sourceType, schemaVersion: pending.schemaVersion, importedAt: now().toISOString(), season: normalized.season, scoringPeriod: normalized.scoringPeriod, originalFilename: pending.filename, rowCounts: pending.rowCounts, warnings: pending.warnings, contentChecksum: pending.checksum, dataFreshness: pending.freshness, snapshotChecksum: checksum(JSON.stringify({ team, availablePlayers: normalized.availablePlayers })), snapshot: { team, availablePlayers: normalized.availablePlayers, manager: normalized.manager, scoringRules: normalized.scoringRules, projectionDate: normalized.projectionDate, season: normalized.season, scoringPeriod: normalized.scoringPeriod } });
    await importStore.save(record, profileId); previews.delete(previewId); return record;
  }
  return { confirm, freshness, preview };
}
module.exports = { PREVIEW_TTL_MS, createImportService };
