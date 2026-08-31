const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/app");

function fakeMarketplace() {
  return {
    configured: true,
    listEvents: async () => [{ slug: "new-year", city: "DMV", title: "Ethiopian New Year" }],
    getEvent: async (slug) => slug === "new-year" ? { slug, title: "Ethiopian New Year" } : null,
    listBusinesses: async () => [],
    listReferenceData: async () => ({ cities: [{ id: "00000000-0000-4000-8000-000000000102", name: "Washington, DC / DMV" }], categories: [{ id: "00000000-0000-4000-8000-000000000206", name: "Festivals" }] }),
    createSubmission: async (submission) => ({ id: "11111111-1111-4111-8111-111111111111", status: "pending", ...submission }),
    listSubmissions: async () => [{ id: "11111111-1111-4111-8111-111111111111", status: "pending" }],
    updateSubmission: async (id, changes) => ({ id, ...changes }),
    approveSubmission: async () => "22222222-2222-4222-8222-222222222222",
    rejectSubmission: async (id) => ({ id, status: "rejected" }),
    recordEventView: async () => 1,
    createClaim: async () => ({ id: "claim-1", status: "pending" }),
    createPromotionRequest: async () => ({ id: "promo-1", status: "pending" }),
    listClaims: async () => [],
    listPromotionRequests: async () => [],
    moderateClaim: async (id, status) => ({ id, status }),
    updatePromotionRequest: async (id, status) => ({ id, status }),
    getAnalytics: async () => [{ id: "event-1", title: "Ethiopian New Year", views: 412, uniqueVisitors: 300, ticketClicks: 87, clickThroughRate: 21.1, traffic: [{ source: "instagram", percentage: 48 }] }],
    resolveTicket: async (slug) => slug === "new-year" ? "https://tickets.example.com/new-year" : null
  };
}

async function withServer(run) {
  const config = { adminToken: "phase-two-secret" };
  const server = createApp({ config, marketplace: fakeMarketplace() }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("approved events and reference data are public", () => withServer(async (base) => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok", database: "configured" });
  const { events } = await (await fetch(`${base}/api/events?city=DMV`)).json();
  assert.equal(events[0].slug, "new-year");
  assert.equal((await (await fetch(`${base}/api/reference-data`)).json()).cities.length, 1);
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/og\\.png`));
  assert.match(page, new RegExp(`<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/">`));
  assert.doesNotMatch(page, /__SITE_ORIGIN__/);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), new RegExp(`Sitemap: ${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml`));
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), new RegExp(`<loc>${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/</loc>`));
  assert.match(page, /Get featured · free/);
  assert.doesNotMatch(page, /Get featured · \$39/);
}));

test("organizer submission enters pending moderation", () => withServer(async (base) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ event_name: "Ethiopian New Year", description: "A community celebration with live music.", city_id: "00000000-0000-4000-8000-000000000102", category_id: "00000000-0000-4000-8000-000000000206", starts_at: "2026-09-12T18:00", venue_name: "Community Hall", venue_address: "123 Main Street", organizer_name: "DMV Culture Table", contact_name: "Aster Example", contact_email: "aster@example.com" })) form.set(key, value);
  const response = await fetch(`${base}/api/submissions`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).submission.status, "pending");
}));

test("admin moderation requires the private token", () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/admin/submissions`)).status, 401);
  const response = await fetch(`${base}/api/admin/submissions`, { headers: { Authorization: "Bearer phase-two-secret" } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).submissions.length, 1);
}));

test("tracked ticket route records then redirects without exposing destination in event API", () => withServer(async (base) => {
  const response = await fetch(`${base}/go/new-year?source=instagram`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://tickets.example.com/new-year");
}));

test("views, claims, promotions, and analytics support the traction loop", () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/events/new-year/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitor_id: "visitor-1", source: "instagram" }) })).status, 201);
  assert.equal((await fetch(`${base}/api/events/new-year/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_name: "Aster", contact_email: "aster@example.com", relationship: "Organizer" }) })).status, 201);
  assert.equal((await fetch(`${base}/api/promotion-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_name: "Ethiopian New Year", organizer_name: "DMV Culture Table", contact_email: "aster@example.com" }) })).status, 201);
  const response = await fetch(`${base}/api/admin/analytics`, { headers: { Authorization: "Bearer phase-two-secret" } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).events[0].clickThroughRate, 21.1);
}));

test("retired sports and watch APIs remain gone", () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/sports-hub`)).status, 404);
  assert.equal((await fetch(`${base}/api/watches`)).status, 404);
}));
