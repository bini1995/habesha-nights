const express = require("express");
const defaultWatchService = require("../services/watch-service");

function createWatchesRouter({ watchService = defaultWatchService } = {}) {
  const router = express.Router();

  router.get("/", (request, response) => {
    try {
      response.json({ watches: watchService.getAllWatches() });
    } catch (error) {
      console.error("Could not load watches:");
      console.error(error);
      response.status(500).json({ error: "Could not load watches." });
    }
  });

  router.post("/", (request, response) => {
    try {
      response.status(201).json({ watch: watchService.createWatch(request.body) });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/enabled", (request, response) => {
    try {
      response.json({
        watch: watchService.setWatchEnabled(request.params.id, request.body.enabled)
      });
    } catch (error) {
      response.status(error.message.startsWith("No watch found") ? 404 : 400)
        .json({ error: error.message });
    }
  });

  router.delete("/:id", (request, response) => {
    try {
      response.json({ watch: watchService.deleteWatch(request.params.id) });
    } catch (error) {
      response.status(404).json({ error: error.message });
    }
  });

  return router;
}

const router = createWatchesRouter();
router.createWatchesRouter = createWatchesRouter;

module.exports = router;
