const path = require("path");
const { createTeam } = require("../domain/models");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_TEAMS_FILE = path.join(__dirname, "..", "..", "..", "logs", "sports-hub", "teams.json");

function createTeamStore({ file = DEFAULT_TEAMS_FILE, now = () => new Date() } = {}) {
  const store = createAtomicJsonStore({ file, createDefault: () => ({ version: 1, profiles: {} }) });
  async function list(profileId = DEFAULT_PROFILE_ID) {
    const data = await store.load();
    return [...(data.profiles?.[profileId] ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function get(teamId, profileId = DEFAULT_PROFILE_ID) {
    return (await list(profileId)).find((team) => team.id === teamId) ?? null;
  }
  async function save(input, profileId = DEFAULT_PROFILE_ID) {
    const current = await get(input.id, profileId);
    const team = createTeam({ ...input, createdAt: current?.createdAt ?? input.createdAt }, { profileId, now });
    await store.update((data) => {
      const teams = data.profiles?.[profileId] ?? [];
      return { version: 1, profiles: { ...(data.profiles ?? {}), [profileId]: [team, ...teams.filter((item) => item.id !== team.id)] } };
    });
    return team;
  }
  return { get, list, save };
}

module.exports = { DEFAULT_PROFILE_ID, DEFAULT_TEAMS_FILE, createTeamStore };
