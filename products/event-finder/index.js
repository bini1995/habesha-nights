const express = require("express");

const {
  createSourceRegistry
} = require("./services/source-registry");
const { createCatalogStore } = require("./services/catalog-store");
const { createNycParksAdapter } = require("./sources/nyc-parks");

function createDefaultSourceRegistry() {
  const registry = createSourceRegistry();
  let invalidRows = 0;
  registry.register("nyc-parks", createNycParksAdapter({
    onInvalidRow() {
      invalidRows += 1;
      if (invalidRows === 1) {
        console.warn("NYC Parks ingestion skipped one or more invalid rows.");
      }
    }
  }));
  return registry;
}

function createEventFinderRouter({
  sourceRegistry = createDefaultSourceRegistry(),
  catalogStore = createCatalogStore()
} = {}) {
  const router = express.Router();

  router.get("/", (request, response) => {
    response.json({
      product: "NYC Event Finder",
      status: "ready",
      sources: sourceRegistry.getSourceNames()
    });
  });

  router.get("/events", async (request, response) => {
    try {
      const result = await catalogStore.query(request.query);

      response.json({
        updatedAt: result.updatedAt,
        count: result.events.length,
        events: result.events
      });
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  router.post("/refresh", async (request, response) => {
    try {
      const events = await sourceRegistry.collect();
      const sources = sourceRegistry.getSourceNames();
      let catalog;

      for (const source of sources) {
        catalog = await catalogStore.replaceSource(
          source,
          events.filter((event) => event.source === source)
        );
      }

      response.json({
        updatedAt: catalog?.updatedAt ?? null,
        count: events.length,
        sources
      });
    } catch (error) {
      console.error("Could not refresh NYC events:");
      console.error(error);
      response.status(502).json({ error: "Could not refresh NYC events." });
    }
  });

  return router;
}

module.exports = {
  createDefaultSourceRegistry,
  createEventFinderRouter
};
