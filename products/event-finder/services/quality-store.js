const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_QUALITY_FILE = path.join(
  __dirname, "..", "..", "..", "logs", "event-finder", "quality.json"
);

function createQualityStore({ file = DEFAULT_QUALITY_FILE, freshHours = 24 } = {}) {
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, lastRefresh: null })
  });

  async function record({ catalog, sourceStats }) {
    const byBorough = {};
    const byCategory = {};
    for (const event of catalog.events) {
      byBorough[event.venue.borough] = (byBorough[event.venue.borough] ?? 0) + 1;
      byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
    }
    const sources = Object.fromEntries(Object.entries(sourceStats).map(([source, stats]) => {
      const catalogEvents = catalog.events.filter((event) => event.source === source).length;
      return [source, stats ? {
        ...stats,
        catalogEvents,
        duplicatesRemoved: Math.max(0, stats.accepted - catalogEvents)
      } : { catalogEvents }];
    }));
    const report = {
      recordedAt: new Date().toISOString(),
      catalogUpdatedAt: catalog.updatedAt,
      catalogEvents: catalog.events.length,
      earliestEventAt: catalog.events[0]?.startsAt ?? null,
      latestEventAt: catalog.events.at(-1)?.startsAt ?? null,
      byBorough,
      byCategory,
      sources
    };
    await store.update(() => ({ version: 1, lastRefresh: report }));
    return report;
  }

  async function get() {
    const data = await store.load();
    const report = data.lastRefresh;
    const ageMinutes = report?.catalogUpdatedAt
      ? Math.max(0, Math.round((Date.now() - new Date(report.catalogUpdatedAt).getTime()) / 60000))
      : null;
    return {
      ...report,
      ageMinutes,
      freshness: ageMinutes === null ? "NEVER_REFRESHED" : ageMinutes <= freshHours * 60 ? "FRESH" : "STALE",
      freshWithinHours: freshHours
    };
  }

  return { get, record };
}

module.exports = { DEFAULT_QUALITY_FILE, createQualityStore };
