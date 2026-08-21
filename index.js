require("dotenv").config();

const {
  createScheduler
} = require("./services/scheduler");

const {
  createDashboardServer
} = require("./services/dashboard");

const {
  runMonitor
} = require("./services/monitor");

const dashboard = createDashboardServer({
  port: 3000
});

const scheduler = createScheduler({
  task: runMonitor,
  normalIntervalMinutes: 30,
  rateLimitIntervalMinutes: 180
});

if (process.env.LEGACY_MONITORING_ENABLED !== "false") {
  scheduler.start();
} else {
  console.log("Legacy monitoring is disabled by configuration.");
}

process.on("SIGINT", async () => {
  console.log("");
  console.log("Stopping application...");

  scheduler.stop();

  await dashboard.stop();

  console.log("Application stopped.");

  process.exit(0);
});
