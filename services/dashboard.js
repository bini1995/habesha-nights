const express = require("express");
const Path = require("path");
const testRouter = require("../routes/test");

const healthRouter = require("../routes/health");
const stateRouter = require("../routes/state");
const providersRouter = require("../routes/providers");
const eventsRouter = require("../routes/events");
const { initialize } = require("./websocket");

const {
  getAllWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
} = require("./watch-service");

function createDashboardServer({
  port = 3000
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/api/test", testRouter);

  app.use("/health", healthRouter);

  app.use("/api/state", stateRouter);

  app.use("/api/providers", providersRouter);
  app.use("/api/events", eventsRouter);

  app.get("/api/watches", (request, response) => {
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

  app.post("/api/watches", (request, response) => {
    try {
      const watch = createWatch(request.body);

      response.status(201).json({
        watch
      });
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  app.patch("/api/watches/:id/enabled", (request, response) => {
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

  app.delete("/api/watches/:id", (request, response) => {
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

  app.use(
    express.static(
      Path.join(__dirname, "..", "public")
    )
  );

  const server = app.listen(port, () => {
    console.log(
      `Dashboard available at http://localhost:${port}`
    );
  });

  initialize(server);

  return {
    app,
    server,

    stop() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

module.exports = {
  createDashboardServer
};
