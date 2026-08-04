const express = require("express");

const {
  getAllWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
} = require("../services/watch-service");

const router = express.Router();

router.get("/", (request, response) => {
  try {
    response.json({
      watches: getAllWatches()
    });
  } catch (error) {
    console.error("Could not load watches:");
    console.error(error);

    response.status(500).json({
      error: "Could not load watches."
    });
  }
});

router.post("/", (request, response) => {
  try {
    const watch = createWatch(
      request.body
    );

    response.status(201).json({
      watch
    });
  } catch (error) {
    response.status(400).json({
      error: error.message
    });
  }
});

router.patch("/:id/enabled", (request, response) => {
  try {
    const watch = setWatchEnabled(
      request.params.id,
      request.body.enabled
    );

    response.json({
      watch
    });
  } catch (error) {
    const status =
      error.message.startsWith("No watch found")
        ? 404
        : 400;

    response.status(status).json({
      error: error.message
    });
  }
});

router.delete("/:id", (request, response) => {
  try {
    const deletedWatch = deleteWatch(
      request.params.id
    );

    response.json({
      watch: deletedWatch
    });
  } catch (error) {
    response.status(404).json({
      error: error.message
    });
  }
});

module.exports = router;
