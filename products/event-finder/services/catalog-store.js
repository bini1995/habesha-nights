const fs = require("fs/promises");
const path = require("path");

const DEFAULT_CATALOG_FILE = path.join(
  __dirname, "..", "..", "..", "logs", "event-finder", "catalog.json"
);

function createCatalogStore({ catalogFile = DEFAULT_CATALOG_FILE } = {}) {
  let writeQueue = Promise.resolve();

  async function load() {
    try {
      const catalog = JSON.parse(await fs.readFile(catalogFile, "utf8"));
      return {
        version: 1,
        updatedAt: catalog.updatedAt ?? null,
        events: Array.isArray(catalog.events) ? catalog.events : []
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { version: 1, updatedAt: null, events: [] };
      }
      throw error;
    }
  }

  async function write(catalog) {
    await fs.mkdir(path.dirname(catalogFile), { recursive: true });
    const temporaryFile = `${catalogFile}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, catalogFile);
  }

  function replaceSource(source, incomingEvents) {
    const operation = writeQueue.then(async () => {
      const current = await load();
      const byId = new Map(
        current.events
          .filter((event) => event.source !== source)
          .map((event) => [event.id, event])
      );

      for (const event of incomingEvents) {
        byId.set(event.id, event);
      }

      const events = [...byId.values()].sort((a, b) =>
        a.startsAt.localeCompare(b.startsAt)
      );
      const catalog = {
        version: 1,
        updatedAt: new Date().toISOString(),
        events
      };
      await write(catalog);
      return catalog;
    });

    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function query(filters = {}) {
    const catalog = await load();
    const borough = filters.borough?.replace(/[ -]+/g, "_").toUpperCase();
    const category = filters.category?.replace(/[ -]+/g, "_").toUpperCase();
    const limit = filters.limit === undefined ? 250 : Number(filters.limit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("limit must be an integer from 1 to 1000.");
    }

    const events = catalog.events.filter((event) => {
      return (!borough || event.venue.borough === borough)
        && (!category || event.category === category)
        && (!filters.source || event.source === filters.source.toLowerCase())
        && (!filters.startsAfter || event.startsAt >= new Date(filters.startsAfter).toISOString())
        && (!filters.startsBefore || event.startsAt <= new Date(filters.startsBefore).toISOString());
    }).slice(0, limit);

    return { updatedAt: catalog.updatedAt, events };
  }

  return { load, query, replaceSource };
}

module.exports = { DEFAULT_CATALOG_FILE, createCatalogStore };
