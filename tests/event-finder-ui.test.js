const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildCatalogQuery,
  escapeHtml,
  matchesSearch,
  nycMidnightIso,
  summarizeQualityHistory
} = require("../public/event-finder/event-finder");

const fixture = require("./fixtures/nyc-parks-events.json");

test("Event Finder builds API filters for an entire NYC calendar day", () => {
  const query = new URLSearchParams(buildCatalogQuery({
    borough: "brooklyn",
    category: "music",
    date: "2026-08-21"
  }));

  assert.equal(query.get("borough"), "brooklyn");
  assert.equal(query.get("category"), "music");
  assert.equal(query.get("startsAfter"), "2026-08-21T04:00:00.000Z");
  assert.equal(query.get("startsBefore"), "2026-08-22T03:59:59.999Z");
  assert.equal(query.get("limit"), "5000");
});

test("Event Finder date conversion handles standard time", () => {
  assert.equal(nycMidnightIso("2026-11-02"), "2026-11-02T05:00:00.000Z");
});

test("Event Finder search includes title, venue, description, and tags", () => {
  const event = {
    ...fixture[0],
    venue: { name: fixture[0].location, address: fixture[0].parknames },
    tags: ["pickleball", "family"]
  };

  assert.equal(matchesSearch(event, "pickleball"), true);
  assert.equal(matchesSearch(event, "greenbelt"), true);
  assert.equal(matchesSearch(event, "opera"), false);
});

test("Event Finder rendering helper escapes untrusted catalog text", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
});

test("all product pages expose consistent accessible navigation", () => {
  const publicDirectory = path.join(__dirname, "..", "public");
  const pages = [
    "index.html",
    "event-finder/index.html",
    "sports-hub/index.html"
  ];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(publicDirectory, page), "utf8");
    assert.match(html, /aria-label="(?:Product|Sports) navigation"/);
    assert.match(html, /href="\/opportunity-agent\/"[^>]*>Opportunity Agent/);
    assert.match(html, /href="\/event-finder\/">(?:Event Finder|NYC Event Finder|NYC Events)/);
    assert.match(html, /href="(?:\/sports-hub\/|\/)"[^>]*>(?:Sports Hub|SPORTS HUB|Sports)/);
  }
});

test("Event Finder page provides accessible loading and error announcements", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "event-finder", "index.html"),
    "utf8"
  );

  assert.match(html, /id="updated-status" aria-live="polite"/);
  assert.match(html, /id="loading-state" role="status"/);
  assert.match(html, /id="error-state" role="alert"/);
  assert.match(html, /id="event-grid"/);
  assert.match(html, /role="tablist" aria-label="Event views"/);
  assert.match(html, /id="recommended-tab"/);
  assert.match(html, /id="saved-tab"/);
  assert.match(html, /id="preferences-dialog" aria-labelledby="preferences-heading"/);
  assert.match(html, /id="quality-summary" aria-live="polite"/);
});

test("Event Finder UI calls each Phase 2B API and renders recommendation reasons", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "public", "event-finder", "event-finder.js"),
    "utf8"
  );

  assert.match(script, /\/api\/event-finder\/saved-events/);
  assert.match(script, /\/api\/event-finder\/preferences/);
  assert.match(script, /\/api\/event-finder\/recommendations/);
  assert.match(script, /\/api\/event-finder\/quality/);
  assert.match(script, /recommendation-reasons/);
});

test("Event Finder summarizes quality history in plain language", () => {
  assert.equal(summarizeQualityHistory([]), "No refresh trend recorded yet.");
  assert.match(summarizeQualityHistory([
    { normalizedCount: 120, boroughCoverage: 5, rejectedCount: 2, duplicateCount: 1 },
    { normalizedCount: 100, boroughCoverage: 5, rejectedCount: 3, duplicateCount: 0 }
  ]), /normalized event count up 20; latest rejected 2, duplicates 1/);
});
