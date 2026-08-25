const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_ANALYSES_FILE = path.join(__dirname, "..", "..", "..", "logs", "sports-hub", "analyses.json");
function createAnalysisStore({ file = DEFAULT_ANALYSES_FILE } = {}) {
  const store = createAtomicJsonStore({ file, createDefault: () => ({ version: 1, profiles: {} }) });
  async function save(record, profileId = "default") {
    await store.update((data) => ({ version: 1, profiles: { ...(data.profiles ?? {}), [profileId]: [record, ...(data.profiles?.[profileId] ?? [])].slice(0, 500) } }));
    return record;
  }
  async function list(profileId = "default") { const data = await store.load(); return data.profiles?.[profileId] ?? []; }
  async function get(analysisId, profileId = "default") {
    return (await list(profileId)).find(
      (record) => record.analysisId === analysisId
    ) ?? null;
  }
  return { get, list, save };
}
module.exports = { DEFAULT_ANALYSES_FILE, createAnalysisStore };
