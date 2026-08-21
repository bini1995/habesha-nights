const path = require("path");
const { createAtomicJsonStore } = require("./atomic-json-store");
const { DEFAULT_PREFERENCES, normalizePreferences } = require("../domain/preferences");

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PREFERENCES_FILE = path.join(
  __dirname, "..", "..", "..", "logs", "event-finder", "preferences.json"
);

function createPreferencesStore({ file = DEFAULT_PREFERENCES_FILE } = {}) {
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, profiles: {} })
  });

  async function get(profileId = DEFAULT_PROFILE_ID) {
    const data = await store.load();
    return normalizePreferences(data.profiles?.[profileId] ?? DEFAULT_PREFERENCES);
  }

  async function set(preferences, profileId = DEFAULT_PROFILE_ID) {
    const normalized = normalizePreferences(preferences);
    await store.update((data) => ({
      version: 1,
      profiles: {
        ...(data.profiles ?? {}),
        [profileId]: normalized
      }
    }));
    return normalized;
  }

  return { get, set };
}

module.exports = { DEFAULT_PREFERENCES_FILE, createPreferencesStore };
