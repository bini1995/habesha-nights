const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { readConfig } = require("./config");
const { createAdminRouter } = require("./routes/admin");
const { createApiRouter } = require("./routes/api");
const { createMarketplaceService } = require("./services/marketplace-service");
const { createSupabaseClient } = require("./services/supabase-client");

const publicIndex = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const publicEvent = fs.readFileSync(path.join(__dirname, "..", "public", "event.html"), "utf8");

function publicOrigin(request) { return `${request.protocol}://${request.get("host")}`; }

function escapeMarkup(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function eventJsonLd(event, canonicalUrl, origin) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || event.summary,
    startDate: event.startsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue?.name || "Venue to be announced",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue?.address || event.cityName || event.city,
        addressLocality: event.cityName || event.city,
        addressCountry: "US"
      }
    },
    image: [event.imageUrl || `${origin}/og.png`],
    url: canonicalUrl,
    organizer: { "@type": "Organization", name: event.organizer?.name || "Independent organizer" }
  };
  if (event.endsAt) data.endDate = event.endsAt;
  if (event.hasTickets) {
    data.offers = { "@type": "Offer", url: canonicalUrl, priceCurrency: "USD", availability: "https://schema.org/InStock" };
    if (Number.isInteger(event.ticketPriceCents)) data.offers.price = (event.ticketPriceCents / 100).toFixed(2);
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderEventPage(event, origin, requestedSource = "") {
  const canonicalUrl = `${origin}/events/${encodeURIComponent(event.slug)}`;
  const description = String(event.summary || event.description || "Discover this event on Habesha Nights.").replace(/\s+/g, " ").slice(0, 240);
  const source = ["instagram", "tiktok", "google", "organizer", "whatsapp", "direct", "other"].includes(String(requestedSource).toLowerCase()) ? String(requestedSource).toLowerCase() : "direct";
  const media = event.imageUrl
    ? `<img class="event-flyer" src="${escapeMarkup(event.imageUrl)}" alt="Event flyer for ${escapeMarkup(event.title)}">`
    : '<div class="event-flyer-placeholder" aria-hidden="true">H</div>';
  const ticketButton = event.hasTickets
    ? `<a class="primary" href="/go/${encodeURIComponent(event.slug)}?source=${encodeURIComponent(source)}" target="_blank" rel="noopener">View tickets ↗</a>`
    : '<button class="primary disabled" type="button" disabled>Tickets not listed</button>';
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(event.startsAt));
  const replacements = {
    "__EVENT_META_DESCRIPTION__": escapeMarkup(description),
    "__EVENT_META_TITLE__": escapeMarkup(`${event.title} — Habesha Nights`),
    "__EVENT_URL__": escapeMarkup(canonicalUrl),
    "__EVENT_IMAGE_URL__": escapeMarkup(event.imageUrl || `${origin}/og.png`),
    "__EVENT_JSON_LD__": eventJsonLd(event, canonicalUrl, origin),
    "__EVENT_SLUG_ATTR__": escapeMarkup(event.slug),
    "__EVENT_TITLE_ATTR__": escapeMarkup(event.title),
    "__EVENT_MEDIA__": media,
    "__EVENT_CITY__": escapeMarkup(event.city),
    "__EVENT_CATEGORY__": escapeMarkup(event.category),
    "__EVENT_TITLE__": escapeMarkup(event.title),
    "__EVENT_DATE__": escapeMarkup(date),
    "__EVENT_PRICE__": escapeMarkup(event.priceLabel || "See organizer"),
    "__EVENT_DESCRIPTION__": escapeMarkup(event.description),
    "__EVENT_VENUE__": escapeMarkup(event.venue?.name || "Venue to be announced"),
    "__EVENT_ADDRESS__": escapeMarkup(event.venue?.address || event.cityName || event.city),
    "__EVENT_ORGANIZER__": escapeMarkup(event.organizer?.name || "Independent organizer"),
    "__EVENT_TICKET_BUTTON__": ticketButton
  };
  let html = publicEvent;
  for (const [token, value] of Object.entries(replacements)) html = html.replaceAll(token, value);
  return html;
}

function createApp(options = {}) {
  const config = options.config || readConfig();
  const marketplace = options.marketplace || createMarketplaceService({ supabase: createSupabaseClient(config), config });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (request, response) => response.json({ status: "ok", database: marketplace.configured ? "configured" : "not-configured" }));
  app.get("/robots.txt", (request, response) => response.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${publicOrigin(request)}/sitemap.xml\n`));
  app.get("/sitemap.xml", async (request, response, next) => {
    try {
      const origin = publicOrigin(request);
      let events = [];
      try { events = await marketplace.listEvents(); } catch {}
      const eventUrls = events.map((event) => `<url><loc>${escapeMarkup(`${origin}/events/${encodeURIComponent(event.slug)}`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`).join("");
      response.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeMarkup(`${origin}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${eventUrls}</urlset>`);
    } catch (error) { next(error); }
  });
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
  app.get("/events/:slug", async (request, response, next) => {
    try {
      const event = await marketplace.getEvent(request.params.slug);
      if (!event) return response.status(404).type("text").send("Event not found.");
      response.set("cache-control", "public, max-age=300").type("html").send(renderEventPage(event, publicOrigin(request), request.query.source));
    } catch (error) { next(error); }
  });
  app.get("/event.html", (request, response) => response.status(404).type("text").send("Not found."));
  app.get("/", (request, response) => {
    const origin = publicOrigin(request);
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

module.exports = { createApp, renderEventPage };
