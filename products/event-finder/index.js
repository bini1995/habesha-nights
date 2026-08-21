const express = require("express");

const {
  createSourceRegistry
} = require("./services/source-registry");

function createEventFinderRouter({
  sourceRegistry = createSourceRegistry()
} = {}) {
  const router = express.Router();

  router.get("/", (request, response) => {
    response.json({
      product: "NYC Event Finder",
      status: "foundation",
      sources: sourceRegistry.getSourceNames()
    });
  });

  router.get("/events", async (request, response) => {
    try {
      const events = await sourceRegistry.collect({
        startsAfter: request.query.startsAfter ?? null,
        category: request.query.category ?? null,
        borough: request.query.borough ?? null
      });

      response.json({
        events
      });
    } catch (error) {
      console.error("Could not collect NYC events:");
      console.error(error);

      response.status(502).json({
        error: "Could not collect NYC events."
      });
    }
  });

  return router;
}

module.exports = {
  createEventFinderRouter
};
