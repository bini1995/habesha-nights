const express = require("express");

const {
  createSourceRegistry
} = require("./services/source-registry");
const { createCatalogStore } = require("./services/catalog-store");
const { createNycParksAdapter } = require("./sources/nyc-parks");
const { createPreferencesStore } = require("./services/preferences-store");
const { createSavedEventsStore } = require("./services/saved-events-store");
const { createQualityStore } = require("./services/quality-store");
const { recommendEvents } = require("./domain/recommendations");

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
  catalogStore = createCatalogStore(),
  preferencesStore = createPreferencesStore(),
  savedEventsStore = createSavedEventsStore(),
  qualityStore = createQualityStore()
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

      const quality = await qualityStore.record({
        catalog,
        sourceStats: sourceRegistry.getSourceStats()
      });

      response.json({
        updatedAt: catalog?.updatedAt ?? null,
        count: events.length,
        sources,
        quality
      });
    } catch (error) {
      console.error("Could not refresh NYC events:");
      console.error(error);
      response.status(502).json({ error: "Could not refresh NYC events." });
    }
  });

  router.get("/preferences", async (request, response) => {
    response.json({ preferences: await preferencesStore.get() });
  });

  router.put("/preferences", async (request, response) => {
    try {
      response.json({ preferences: await preferencesStore.set(request.body) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.get("/saved-events", async (request, response) => {
    const savedEvents = await savedEventsStore.list();
    response.json({ count: savedEvents.length, savedEvents });
  });

  router.post("/saved-events", async (request, response) => {
    try {
      if (typeof request.body?.eventId !== "string" || !request.body.eventId.trim()) {
        throw new Error("eventId is required.");
      }
      const event = await catalogStore.getById(request.body.eventId.trim());
      if (!event) {
        response.status(404).json({ error: "Event was not found in the current catalog." });
        return;
      }
      response.status(201).json({ savedEvent: await savedEventsStore.save(event) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.delete("/saved-events/:eventId", async (request, response) => {
    const removed = await savedEventsStore.remove(request.params.eventId);
    if (!removed) {
      response.status(404).json({ error: "Saved event was not found." });
      return;
    }
    response.status(204).end();
  });

  router.get("/recommendations", async (request, response) => {
    try {
      const limit = request.query.limit === undefined ? 20 : Number(request.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("limit must be an integer from 1 to 100.");
      }
      const [catalog, preferences, savedEvents] = await Promise.all([
        catalogStore.load(), preferencesStore.get(), savedEventsStore.list()
      ]);
      const recommendations = recommendEvents({
        events: catalog.events,
        preferences,
        savedEventIds: savedEvents.map((item) => item.event.id),
        limit
      });
      response.json({
        updatedAt: catalog.updatedAt,
        count: recommendations.length,
        recommendations
      });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.get("/quality", async (request, response) => {
    response.json({ quality: await qualityStore.get() });
  });

  return router;
}

module.exports = {
  createDefaultSourceRegistry,
  createEventFinderRouter
};
