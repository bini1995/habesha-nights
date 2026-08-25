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

const SUPABASE_BROWSER_BUNDLE = Path.join(
  Path.dirname(require.resolve("@supabase/supabase-js/package.json")),
  "dist",
  "umd",
  "supabase.js"
);

const {
  getAllWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
} = require("./watch-service");

function createDashboardApp({ sportsHubOptions = {} } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    "/api/sports-hub/roster-images",
    express.json({ limit: "9mb" })
  );
  app.use(express.json());
  app.use("/api/test", testRouter);

  app.use("/health", healthRouter);

  app.use("/api/state", stateRouter);

  app.use("/api/providers", providersRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/watches", watchesRouter);
  if (process.env.EVENT_FINDER_ENABLED !== "false") {
    app.use(
      "/api/event-finder",
      createEventFinderRouter()
    );
  }
  app.use(
    "/api/sports-hub",
    createSportsHubRouter(sportsHubOptions)
  );

  app.get("/vendor/supabase.js", (request, response) => {
    response.set("cache-control", "public, max-age=86400");
    response.sendFile(SUPABASE_BROWSER_BUNDLE);
  });

  app.get("/", (request, response) => {
    response.sendFile(Path.join(__dirname, "..", "public", "sports-hub", "index.html"));
  });
  app.get("/opportunity-agent/", (request, response) => {
    response.sendFile(Path.join(__dirname, "..", "public", "index.html"));
  });

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
