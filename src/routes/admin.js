const crypto = require("node:crypto");
const express = require("express");
const { asyncRoute } = require("./api");
const { validateSubmission } = require("../domain/submission");

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createAdminRouter({ marketplace, adminToken }) {
  const router = express.Router();
  router.use((request, response, next) => {
    if (!adminToken) return response.status(503).json({ error: "Admin access is not configured." });
    const supplied = request.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!tokenMatches(supplied, adminToken)) return response.status(401).json({ error: "Admin token is invalid." });
    next();
  });
  router.get("/submissions", asyncRoute(async (request, response) => response.json({ submissions: await marketplace.listSubmissions(request.query.status || "pending") })));
  router.put("/submissions/:id", asyncRoute(async (request, response) => response.json({ submission: await marketplace.updateSubmission(request.params.id, validateSubmission(request.body)) })));
  router.post("/submissions/:id/approve", asyncRoute(async (request, response) => response.json({ eventId: await marketplace.approveSubmission(request.params.id) })));
  router.post("/submissions/:id/reject", asyncRoute(async (request, response) => response.json({ submission: await marketplace.rejectSubmission(request.params.id, request.body?.reviewNotes) })));
  router.get("/analytics", asyncRoute(async (request, response) => response.json({ events: await marketplace.getAnalytics() })));
  router.get("/traction", asyncRoute(async (request, response) => response.json({ summary: await marketplace.getTractionSummary() })));
  router.get("/claims", asyncRoute(async (request, response) => response.json({ claims: await marketplace.listClaims(request.query.status || "pending") })));
  router.post("/claims/:id/:status", asyncRoute(async (request, response) => response.json({ claim: await marketplace.moderateClaim(request.params.id, request.params.status, request.body?.reviewNotes) })));
  router.get("/promotion-requests", asyncRoute(async (request, response) => response.json({ requests: await marketplace.listPromotionRequests(request.query.status || "pending") })));
  router.put("/promotion-requests/:id", asyncRoute(async (request, response) => response.json({ request: await marketplace.updatePromotionRequest(request.params.id, request.body?.status, request.body?.reviewNotes) })));
  return router;
}

module.exports = { createAdminRouter, tokenMatches };
