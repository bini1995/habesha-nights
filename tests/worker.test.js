const assert = require("node:assert/strict");
const { timingSafeEqual } = require("node:crypto");
const test = require("node:test");

test("Cloudflare worker exposes the private traction summary", async () => {
  const originalFetch = global.fetch;
  const originalTimingSafeEqual = global.crypto.subtle.timingSafeEqual;
  if (!originalTimingSafeEqual) {
    Object.defineProperty(global.crypto.subtle, "timingSafeEqual", {
      configurable: true,
      value: (left, right) => timingSafeEqual(Buffer.from(left), Buffer.from(right))
    });
  }
  global.fetch = async (input) => {
    const url = new URL(String(input));
    let data = [];
    if (url.pathname.endsWith("/events")) data = [{ id: "event-1" }, { id: "event-2" }];
    if (url.pathname.endsWith("/outbound_clicks")) data = [{ id: "click-1" }];
    if (url.pathname.endsWith("/event_views")) data = [
      { id: "view-1", visitor_id: "visitor-1" },
      { id: "view-2", visitor_id: "visitor-1" },
      { id: "view-3", visitor_id: null }
    ];
    if (url.pathname.endsWith("/event_claims")) data = [{ id: "claim-1", contact_email: "organizer@example.com" }];
    if (url.pathname.endsWith("/submissions")) data = [{ id: "submission-1", contact_email: "ORGANIZER@example.com" }];
    if (url.pathname.endsWith("/promotion_requests")) data = [{ id: "promotion-1" }];
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const worker = (await import(`../worker/index.mjs?test=${Date.now()}`)).default;
    const response = await worker.fetch(new Request("https://habesha.test/api/admin/traction", {
      headers: { authorization: "Bearer private-token" }
    }), {
      ADMIN_TOKEN: "private-token",
      SUPABASE_URL: "https://database.test",
      SUPABASE_SECRET_KEY: "database-secret"
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).summary, {
      publishedEvents: 2,
      eventViews: 3,
      uniqueVisitors: 2,
      ticketClicks: 1,
      organizerActivations: 1,
      spotlightRequests: 1
    });
  } finally {
    global.fetch = originalFetch;
    if (!originalTimingSafeEqual) delete global.crypto.subtle.timingSafeEqual;
  }
});
