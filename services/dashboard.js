const watchesRouter = require("../routes/watches");
const express = require("express");
const Path = require("path");
const testRouter = require("../routes/test");

const healthRouter = require("../routes/health");
const stateRouter = require("../routes/state");
const providersRouter = require("../routes/providers");
const eventsRouter = require("../routes/events");
const { initialize } = require("./websocket");
const {
  createEventFinderRouter
} = require("../products/event-finder");
const {
  createSportsHubRouter
} = require("../products/sports-hub");

const {
  getAllWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
} = require("./watch-service");

function createDashboardApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/api/test", testRouter);

  app.use("/health", healthRouter);

  app.use("/api/state", stateRouter);

  app.use("/api/providers", providersRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/watches", watchesRouter);
  app.use(
    "/api/event-finder",
    createEventFinderRouter()
  );
  app.use(
    "/api/sports-hub",
    createSportsHubRouter()
  );

  app.use(
    express.static(
      Path.join(__dirname, "..", "public")
    )
  );

  return app;
}

function createDashboardServer({
  port = 3000
} = {}) {
  const app = createDashboardApp();

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
  createDashboardApp,
  createDashboardServer
};
