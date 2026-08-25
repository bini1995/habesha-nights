const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");
const { DEFAULT_PROFILE_ID } = require("./team-store");
const { migrateMiniLeague } = require("../domain/league");

const DEFAULT_MINI_LEAGUES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "logs",
  "sports-hub",
  "mini-leagues.json"
);
const MAX_LEAGUES_PER_PROFILE = 100;

function createMiniLeagueStore({ file = DEFAULT_MINI_LEAGUES_FILE } = {}) {
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, profiles: {} })
  });

  async function list(profileId = DEFAULT_PROFILE_ID) {
    const data = await store.load();
    return [...(data.profiles?.[profileId] ?? [])]
      .map(migrateMiniLeague)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function get(leagueId, profileId = DEFAULT_PROFILE_ID) {
    return (await list(profileId)).find((league) => league.id === leagueId) ?? null;
  }

  async function findByJoinCodeHash(joinCodeHash, profileId = DEFAULT_PROFILE_ID) {
    return (await list(profileId)).find((league) =>
      league.joinCodeHash === joinCodeHash) ?? null;
  }

  async function save(league, profileId = DEFAULT_PROFILE_ID) {
    await store.update((data) => {
      const leagues = data.profiles?.[profileId] ?? [];
      const next = [
        league,
        ...leagues.filter((item) => item.id !== league.id)
      ].slice(0, MAX_LEAGUES_PER_PROFILE);
      return {
        version: 1,
        profiles: {
          ...(data.profiles ?? {}),
          [profileId]: next
        }
      };
    });
    return league;
  }

  function status() {
    return Object.freeze({
      id: "atomic-json-local",
      version: 1,
      durability: "LOCAL_SINGLE_DEVICE",
      hosted: false,
      transactionalAudit: true,
      migrationReady: true
    });
  }

  return { findByJoinCodeHash, get, list, save, status };
}

module.exports = {
  DEFAULT_MINI_LEAGUES_FILE,
  MAX_LEAGUES_PER_PROFILE,
  createMiniLeagueStore
};
