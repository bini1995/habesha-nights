const {
  createEvent
} = require("../domain/event");

function createSourceRegistry() {
  const sources = new Map();

  function register(name, adapter) {
    const normalizedName = String(name ?? "")
      .trim()
      .toLowerCase();

    if (!normalizedName) {
      throw new Error("Event source name is required.");
    }

    if (!adapter || typeof adapter.fetchEvents !== "function") {
      throw new Error(
        `Event source "${name}" must provide fetchEvents().`
      );
    }

    if (sources.has(normalizedName)) {
      throw new Error(
        `Event source "${normalizedName}" is already registered.`
      );
    }

    sources.set(normalizedName, adapter);
  }

  function getSourceNames() {
    return [...sources.keys()];
  }

  function getSourceStats() {
    return Object.fromEntries([...sources].map(([name, adapter]) => [
      name,
      typeof adapter.getLastFetchStats === "function"
        ? adapter.getLastFetchStats()
        : null
    ]));
  }

  async function collect(filters = {}) {
    const events = [];

    for (const [source, adapter] of sources) {
      const sourceEvents = await adapter.fetchEvents(filters);

      if (!Array.isArray(sourceEvents)) {
        throw new Error(
          `Event source "${source}" must return an array.`
        );
      }

      for (const event of sourceEvents) {
        events.push(createEvent({
          ...event,
          source
        }));
      }
    }

    return events.sort((first, second) => {
      return first.startsAt.localeCompare(second.startsAt);
    });
  }

  return {
    register,
    getSourceNames,
    getSourceStats,
    collect
  };
}

module.exports = {
  createSourceRegistry
};
