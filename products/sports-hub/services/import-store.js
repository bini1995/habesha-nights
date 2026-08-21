const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_IMPORTS_FILE = path.join(__dirname, "..", "..", "..", "logs", "sports-hub", "imports.json");
function createImportStore({ file = DEFAULT_IMPORTS_FILE } = {}) {
  const store = createAtomicJsonStore({ file, createDefault: () => ({ version: 1, profiles: {} }) });
  async function list(profileId = "default") { const data = await store.load(); return [...(data.profiles?.[profileId] ?? [])].sort((a, b) => b.importedAt.localeCompare(a.importedAt)); }
  async function get(importId, profileId = "default") { return (await list(profileId)).find((item) => item.importId === importId) ?? null; }
  async function save(record, profileId = "default") {
    await store.update((data) => ({ version: 1, profiles: { ...(data.profiles ?? {}), [profileId]: [record, ...(data.profiles?.[profileId] ?? [])] } }));
    return record;
  }
  return { get, list, save };
}
module.exports = { DEFAULT_IMPORTS_FILE, createImportStore };
