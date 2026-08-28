const express = require("express");
const multer = require("multer");
const { validateSubmission } = require("../domain/submission");
const { validateClaim, validateEventView, validatePromotionRequest } = require("../domain/engagement");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function createSubmissionLimiter({ limit = 5, windowMs = 60 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || "unknown";
    const recent = (attempts.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return response.status(429).json({ error: "Too many submissions. Please try again later." });
    recent.push(now);
    attempts.set(key, recent);
    next();
  };
}

function createApiRouter({ marketplace }) {
  const router = express.Router();
  router.get("/", (request, response) => response.json({ product: "Habesha Nights", status: "ready", dataMode: marketplace.configured ? "supabase" : "setup-required" }));
  router.get("/events", asyncRoute(async (request, response) => response.json({ events: await marketplace.listEvents(request.query) })));
  router.get("/events/:slug", asyncRoute(async (request, response) => {
    const event = await marketplace.getEvent(request.params.slug);
    if (!event) return response.status(404).json({ error: "Event not found." });
    response.json({ event });
  }));
  router.post("/events/:slug/view", asyncRoute(async (request, response) => {
    const viewId = await marketplace.recordEventView(request.params.slug, validateEventView(request.body), { ip: request.ip, referrer: request.get("referer"), userAgent: request.get("user-agent") });
    if (!viewId) return response.status(404).json({ error: "Event not found." });
    response.status(201).json({ recorded: true });
  }));
  router.post("/events/:slug/claims", createSubmissionLimiter({ limit: 3 }), asyncRoute(async (request, response) => {
    const claim = await marketplace.createClaim(request.params.slug, validateClaim(request.body));
    response.status(201).json({ claim, message: "Your claim is pending verification." });
  }));
  router.get("/businesses", asyncRoute(async (request, response) => response.json({ businesses: await marketplace.listBusinesses(request.query) })));
  router.get("/reference-data", asyncRoute(async (request, response) => response.json(await marketplace.listReferenceData())));
  router.post("/submissions", createSubmissionLimiter(), upload.single("image"), asyncRoute(async (request, response) => {
    const submission = await marketplace.createSubmission(validateSubmission(request.body), request.file);
    response.status(201).json({ submission: { id: submission.id, status: submission.status }, message: "Your event is pending review." });
  }));
  router.post("/promotion-requests", createSubmissionLimiter({ limit: 3 }), asyncRoute(async (request, response) => {
    const requestItem = await marketplace.createPromotionRequest(validatePromotionRequest(request.body));
    response.status(201).json({ request: requestItem, message: "We’ll follow up about featured placement." });
  }));
  return router;
}

module.exports = { asyncRoute, createApiRouter, createSubmissionLimiter };
