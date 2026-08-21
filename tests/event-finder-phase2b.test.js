const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");

const { createEventFinderRouter } = require("../products/event-finder");
const { createEvent } = require("../products/event-finder/domain/event");
const { normalizePreferences } = require("../products/event-finder/domain/preferences");
const { recommendEvents } = require("../products/event-finder/domain/recommendations");
const { createCatalogStore } = require("../products/event-finder/services/catalog-store");
const { createPreferencesStore } = require("../products/event-finder/services/preferences-store");
const { createQualityStore } = require("../products/event-finder/services/quality-store");
const { createQualityHistoryStore } = require("../products/event-finder/services/quality-history-store");
const { createSavedEventsStore } = require("../products/event-finder/services/saved-events-store");
const { createSourceRegistry } = require("../products/event-finder/services/source-registry");

function event(overrides = {}) {
  return createEvent({
    source: "fixture",
    externalId: overrides.externalId ?? "music-1",
    title: overrides.title ?? "Prospect Park Jazz",
    description: overrides.description ?? "A free outdoor concert.",
    startsAt: overrides.startsAt ?? "2026-09-01T23:00:00Z",
    endsAt: overrides.endsAt ?? "2026-09-02T01:00:00Z",
    category: overrides.category ?? "MUSIC",
    venue: {
      name: overrides.venueName ?? "Prospect Park",
      borough: overrides.borough ?? "BROOKLYN"
    },
    url: "https://example.com/events/1",
    tags: overrides.tags ?? ["jazz", "free"]
  });
}

async function stores(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "event-phase2b-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return {
    directory,
    catalogStore: createCatalogStore({ catalogFile: path.join(directory, "catalog.json") }),
    preferencesStore: createPreferencesStore({ file: path.join(directory, "preferences.json") }),
    qualityStore: createQualityStore({ file: path.join(directory, "quality.json") }),
    qualityHistoryStore: createQualityHistoryStore({
      file: path.join(directory, "quality-history.json")
    }),
    savedEventsStore: createSavedEventsStore({ file: path.join(directory, "saved-events.json") })
  };
}

test("preferences normalize supported values and reject invalid input", () => {
  assert.deepEqual(normalizePreferences({
    preferredBoroughs: ["Brooklyn", "staten island"],
    preferredCategories: ["music"],
    keywords: [" Jazz ", "jazz"],
    hidePastEvents: false
  }), {
    preferredBoroughs: ["BROOKLYN", "STATEN_ISLAND"],
    preferredCategories: ["MUSIC"],
    keywords: ["jazz"],
    hidePastEvents: false
  });
  assert.throws(
    () => normalizePreferences({ preferredBoroughs: ["Hoboken"] }),
    /unsupported value/
  );
  assert.throws(
    () => normalizePreferences({ keywords: new Array(11).fill(0).map((_, i) => `tag-${i}`) }),
    /at most 10/
  );
});

test("saved events persist validated snapshots independently of the catalog", async (context) => {
  const { directory, catalogStore, savedEventsStore } = await stores(context);
  const snapshot = event();
  await catalogStore.replaceSource("fixture", [snapshot]);
  await savedEventsStore.save(snapshot);
  await catalogStore.replaceSource("fixture", []);

  const reopenedStore = createSavedEventsStore({
    file: path.join(directory, "saved-events.json")
  });
  const saved = await reopenedStore.list();
  assert.equal((await catalogStore.load()).events.length, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].event.title, "Prospect Park Jazz");
  assert.equal(await reopenedStore.remove(snapshot.id), true);
  assert.equal((await reopenedStore.list()).length, 0);
});

test("recommendations score deterministically and explain every match", () => {
  const recommendations = recommendEvents({
    events: [
      event(),
      event({ externalId: "sports-1", title: "Queens Tennis", category: "SPORTS", borough: "QUEENS", tags: ["tennis"] })
    ],
    preferences: normalizePreferences({
      preferredBoroughs: ["brooklyn"],
      preferredCategories: ["music"],
      keywords: ["jazz"]
    }),
    now: new Date("2026-08-21T00:00:00Z")
  });

  assert.equal(recommendations[0].event.id, "fixture:music-1");
  assert.equal(recommendations[0].score, 60);
  assert.deepEqual(recommendations[0].reasons, [
    "Matches your music preference",
    "In your preferred borough: brooklyn",
    "Matches your keyword “jazz”"
  ]);
  assert.deepEqual(recommendations[1].reasons, ["Upcoming soon in the NYC Parks calendar"]);

  const filtered = recommendEvents({
    events: [
      event(),
      event({ externalId: "past", startsAt: "2026-08-01T10:00:00Z", endsAt: "2026-08-01T12:00:00Z" })
    ],
    preferences: normalizePreferences({}),
    savedEventIds: ["fixture:music-1"],
    now: new Date("2026-08-21T00:00:00Z")
  });
  assert.deepEqual(filtered, []);
});

test("quality reports freshness, coverage, rejected rows, and duplicates", async (context) => {
  const { qualityStore } = await stores(context);
  const first = event();
  const report = await qualityStore.record({
    catalog: { updatedAt: new Date().toISOString(), events: [first] },
    sourceStats: { fixture: { received: 3, accepted: 2, rejected: 1 } }
  });
  const quality = await qualityStore.get();

  assert.equal(report.catalogEvents, 1);
  assert.equal(quality.freshness, "FRESH");
  assert.equal(quality.byBorough.BROOKLYN, 1);
  assert.equal(quality.sources.fixture.rejected, 1);
  assert.equal(quality.sources.fixture.duplicatesRemoved, 1);
});

test("Phase 2B APIs validate preferences and preserve saved snapshots", async (context) => {
  const state = await stores(context);
  const sourceRegistry = createSourceRegistry();
  const catalogEvent = event();
  await state.catalogStore.replaceSource("fixture", [catalogEvent]);
  const app = express();
  app.use(express.json());
  app.use("/api/event-finder", createEventFinderRouter({
    sourceRegistry,
    ...state
  }));
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/event-finder`;

  const invalid = await fetch(`${base}/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferredCategories: ["MAGIC"] })
  });
  assert.equal(invalid.status, 400);

  const updated = await fetch(`${base}/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferredCategories: ["music"], keywords: ["jazz"] })
  });
  assert.equal(updated.status, 200);
  const readPreferences = await (await fetch(`${base}/preferences`)).json();
  assert.deepEqual(readPreferences.preferences.preferredCategories, ["MUSIC"]);

  const saved = await fetch(`${base}/saved-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: catalogEvent.id })
  });
  assert.equal(saved.status, 201);
  await state.catalogStore.replaceSource("fixture", []);

  const listing = await (await fetch(`${base}/saved-events`)).json();
  assert.equal(listing.savedEvents[0].event.id, catalogEvent.id);
  const recommendations = await (await fetch(`${base}/recommendations`)).json();
  assert.equal(recommendations.count, 0);
  const quality = await (await fetch(`${base}/quality`)).json();
  assert.equal(quality.quality.freshness, "NEVER_REFRESHED");

  const removed = await fetch(`${base}/saved-events/${encodeURIComponent(catalogEvent.id)}`, {
    method: "DELETE"
  });
  assert.equal(removed.status, 204);
});
