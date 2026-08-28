const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { readConfig } = require("./config");
const { createAdminRouter } = require("./routes/admin");
const { createApiRouter } = require("./routes/api");
const { createMarketplaceService } = require("./services/marketplace-service");
const { createSupabaseClient } = require("./services/supabase-client");

const publicIndex = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function createApp(options = {}) {
  const config = options.config || readConfig();
  const marketplace = options.marketplace || createMarketplaceService({ supabase: createSupabaseClient(config), config });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (request, response) => response.json({ status: "ok", database: marketplace.configured ? "configured" : "not-configured" }));
  app.use("/api/admin", createAdminRouter({ marketplace, adminToken: config.adminToken }));
  app.use("/api", createApiRouter({ marketplace }));
  app.use("/api", (request, response) => response.status(404).json({ error: "API route not found." }));
  app.get("/go/:slug", async (request, response, next) => {
    try {
      const destination = await marketplace.resolveTicket(request.params.slug, { ip: request.ip, referrer: request.get("referer"), userAgent: request.get("user-agent"), source: request.query.source });
      if (!destination) return response.status(404).send("Ticket link not found.");
      response.set("cache-control", "no-store").redirect(302, destination);
    } catch (error) { next(error); }
  });
  app.get("/", (request, response) => {
    const origin = `${request.protocol}://${request.get("host")}`;
    response.type("html").send(publicIndex.replaceAll("__SITE_ORIGIN__", origin));
  });
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.get("/{*path}", (request, response) => response.sendFile(path.join(__dirname, "..", "public", "index.html")));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const isUploadLimit = error?.code === "LIMIT_FILE_SIZE";
    const status = isUploadLimit ? 400 : (Number(error.status) || 500);
    if (status >= 500) console.error(error);
    response.status(status).json({ error: isUploadLimit ? "Flyer must be 5 MB or smaller." : (status < 500 ? error.message : "Something went wrong.") });
  });
  return app;
}

module.exports = { createApp };
