const path = require("node:path");

const {
  createAtomicJsonStore
} = require("./atomic-json-store");

const DEFAULT_CHECK_INS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "logs",
  "sports-hub",
  "check-ins.json"
);
const CHECK_IN_RETENTION = 260;

function createCheckInStore({ file = DEFAULT_CHECK_INS_FILE } = {}) {
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, profiles: {} })
  });

  async function list(teamId, profileId = "default") {
    const data = await store.load();
    return (data.profiles?.[profileId] ?? [])
      .filter((record) => record.teamId === teamId)
      .sort((left, right) => right.checkedInAt.localeCompare(left.checkedInAt));
  }

  async function get(checkInId, profileId = "default") {
    const data = await store.load();
    return (data.profiles?.[profileId] ?? [])
      .find((record) => record.checkInId === checkInId) ?? null;
  }

  async function findByAnalysisId(analysisId, profileId = "default") {
    const data = await store.load();
    return (data.profiles?.[profileId] ?? [])
      .find((record) => record.analysisId === analysisId) ?? null;
  }

  async function save(record, profileId = "default") {
    await store.update((data) => {
      const current = data.profiles?.[profileId] ?? [];
      const withoutDuplicate = current.filter(
        (item) => item.checkInId !== record.checkInId &&
          item.analysisId !== record.analysisId
      );
      return {
        version: 1,
        profiles: {
          ...(data.profiles ?? {}),
          [profileId]: [record, ...withoutDuplicate].slice(0, CHECK_IN_RETENTION)
        }
      };
    });
    return record;
  }

  return Object.freeze({
    findByAnalysisId,
    get,
    list,
    save
  });
}

module.exports = {
  CHECK_IN_RETENTION,
  DEFAULT_CHECK_INS_FILE,
  createCheckInStore
};
