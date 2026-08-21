const path = require("path");
const { createEvent } = require("../domain/event");
const { createAtomicJsonStore } = require("./atomic-json-store");

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_SAVED_EVENTS_FILE = path.join(
  __dirname, "..", "..", "..", "logs", "event-finder", "saved-events.json"
);

function createSavedEventsStore({ file = DEFAULT_SAVED_EVENTS_FILE } = {}) {
  const store = createAtomicJsonStore({
    file,
    createDefault: () => ({ version: 1, profiles: {} })
  });

  async function list(profileId = DEFAULT_PROFILE_ID) {
    const data = await store.load();
    return [...(data.profiles?.[profileId] ?? [])]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async function save(event, profileId = DEFAULT_PROFILE_ID) {
    const snapshot = createEvent(event);
    const entry = { savedAt: new Date().toISOString(), event: snapshot };
    await store.update((data) => {
      const current = data.profiles?.[profileId] ?? [];
      return {
        version: 1,
        profiles: {
          ...(data.profiles ?? {}),
          [profileId]: [entry, ...current.filter((item) => item.event.id !== snapshot.id)]
        }
      };
    });
    return entry;
  }

  async function remove(eventId, profileId = DEFAULT_PROFILE_ID) {
    let removed = false;
    await store.update((data) => {
      const current = data.profiles?.[profileId] ?? [];
      const events = current.filter((item) => item.event.id !== eventId);
      removed = events.length !== current.length;
      return {
        version: 1,
        profiles: { ...(data.profiles ?? {}), [profileId]: events }
      };
    });
    return removed;
  }

  return { list, remove, save };
}

module.exports = { DEFAULT_SAVED_EVENTS_FILE, createSavedEventsStore };
