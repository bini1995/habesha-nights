const assert = require("node:assert/strict");
const test = require("node:test");
const { createUnconfiguredMarketplaceService, mapEvent } = require("../src/services/marketplace-service");

test("production fallback contains no mock catalog", async () => {
  const service = createUnconfiguredMarketplaceService();
  assert.deepEqual(await service.listEvents(), []);
  assert.deepEqual(await service.listBusinesses(), []);
  await assert.rejects(service.createSubmission({}), /not configured/);
});

test("database event records map to the public API without exposing ticket destinations", () => {
  const event = mapEvent({ id: "1", slug: "new-year", title: "New Year", summary: "Community celebration", description: "Details", starts_at: "2026-09-12T18:00:00Z", ends_at: null, image_url: null, ticket_url: "https://tickets.example.com", ticket_price_cents: 2500, ticket_price_label: "$25", featured: false, promoted: false, cities: { short_code: "DMV" }, event_categories: { name: "Festivals" }, venues: { name: "Hall", address: "123 Main", neighborhood: "Silver Spring" }, organizers: { id: "o1", name: "Organizer", verified: true } });
  assert.equal(event.hasTickets, true);
  assert.equal(event.ticketUrl, undefined);
  assert.equal(event.ticketPriceCents, 2500);
  assert.equal(event.city, "DMV");
});
