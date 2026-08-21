const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_QUALITY_HISTORY_FILE = path.join(
  __dirname, "..", "..", "..", "logs", "event-finder", "quality-history.json"
);
const DEFAULT_RETENTION = 90;

function summarizeQuality(quality) {
  const sourceValues = Object.values(quality.sources ?? {});
  return Object.freeze({
    refreshTime: quality.catalogUpdatedAt ?? quality.recordedAt,
    normalizedCount: quality.catalogEvents,
    rejectedCount: sourceValues.reduce((sum, source) => sum + (source.rejected ?? 0), 0),
    duplicateCount: sourceValues.reduce((sum, source) => sum + (source.duplicatesRemoved ?? 0), 0),
    boroughCoverage: Object.keys(quality.byBorough ?? {}).length,
    categoryCoverage: Object.keys(quality.byCategory ?? {}).length,
    catalogStartsAt: quality.earliestEventAt,
    catalogEndsAt: quality.latestEventAt
  });
}

function createQualityHistoryStore({
  file = DEFAULT_QUALITY_HISTORY_FILE,
  retention = DEFAULT_RETENTION
} = {}) {
  if (!Number.isInteger(retention) || retention < 1 || retention > 1000) {
    throw new Error("Quality history retention must be an integer from 1 to 1000.");
  }
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, entries: [] })
  });

  async function record(quality) {
    const entry = summarizeQuality(quality);
    await store.update((data) => ({
      version: 1,
      entries: [entry, ...(data.entries ?? [])].slice(0, retention)
    }));
    return entry;
  }

  async function list({ limit = 30 } = {}) {
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > retention) {
      throw new Error(`limit must be an integer from 1 to ${retention}.`);
    }
    const data = await store.load();
    return (data.entries ?? []).slice(0, normalizedLimit);
  }

  return { list, record, retention };
}

module.exports = {
  DEFAULT_QUALITY_HISTORY_FILE,
  DEFAULT_RETENTION,
  createQualityHistoryStore,
  summarizeQuality
};
