const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");

const {
  createEvent
} = require("../products/event-finder/domain/event");

const {
  createSourceRegistry
} = require(
  "../products/event-finder/services/source-registry"
);
const {
  createNycParksAdapter,
  normalizeParksEvent,
  nycDateTimeToIso
} = require("../products/event-finder/sources/nyc-parks");
const {
  createCatalogStore
} = require("../products/event-finder/services/catalog-store");
const {
  createEventFinderRouter
} = require("../products/event-finder");

const parksFixture = require("./fixtures/nyc-parks-events.json");

const sampleEvent = {
  externalId: "event-1",
  title: "Outdoor Jazz",
  startsAt: "2026-09-01T23:00:00Z",
  category: "music",
  venue: {
    name: "Prospect Park",
    borough: "Brooklyn"
  },
  url: "https://example.com/events/1",
  tags: ["Jazz", " Free ", "jazz"]
};

test("normalizes a source event into the NYC event contract", () => {
  const event = createEvent({
    ...sampleEvent,
    source: "Example Source"
  });

  assert.equal(event.id, "example source:event-1");
  assert.equal(event.category, "MUSIC");
  assert.equal(event.venue.borough, "BROOKLYN");
  assert.deepEqual(event.tags, ["jazz", "free"]);
  assert.equal(event.timezone, "America/New_York");
});

test("rejects events outside the supported NYC boroughs", () => {
  assert.throws(
    () => createEvent({
      ...sampleEvent,
      source: "example",
      venue: {
        ...sampleEvent.venue,
        borough: "Jersey City"
      }
    }),
    /venue\.borough must be one of/
  );
});

test("collects and sorts normalized events from adapters", async () => {
  const registry = createSourceRegistry();

  registry.register("fixture", {
    async fetchEvents() {
      return [
        sampleEvent,
        {
          ...sampleEvent,
          externalId: "event-0",
          startsAt: "2026-08-30T20:00:00Z"
        }
      ];
    }
  });

  const events = await registry.collect();

  assert.deepEqual(
    events.map((event) => event.id),
    ["fixture:event-0", "fixture:event-1"]
  );
});

test("normalizes NYC Parks boroughs, categories, dates, and HTML", () => {
  const event = createEvent({
    ...normalizeParksEvent(parksFixture[0]),
    source: "nyc-parks"
  });

  assert.equal(event.externalId, "2181395");
  assert.equal(event.venue.borough, "STATEN_ISLAND");
  assert.equal(event.category, "SPORTS");
  assert.equal(event.startsAt, "2026-08-21T11:00:00.000Z");
  assert.equal(event.description, "Free fun & instruction for all skill levels.");
  assert.deepEqual(event.venue.coordinates, {
    latitude: 40.591982601343,
    longitude: -74.139472484589
  });
});

test("converts NYC local times across daylight-saving boundaries", () => {
  assert.equal(
    nycDateTimeToIso("2026-11-01", "2026-11-01 13:30:00"),
    "2026-11-01T18:30:00.000Z"
  );
});

test("normalizes Parks overnight events into the following day", () => {
  const event = normalizeParksEvent({
    ...parksFixture[0],
    starttime: "2026-08-21 18:00:00",
    endtime: "2026-08-21 07:00:00"
  });

  assert.equal(event.startsAt, "2026-08-21T22:00:00.000Z");
  assert.equal(event.endsAt, "2026-08-22T11:00:00.000Z");
});

test("NYC Parks adapter works with an offline fixture response", async () => {
  const adapter = createNycParksAdapter({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return parksFixture;
      }
    })
  });

  const events = await adapter.fetchEvents();
  assert.equal(events.length, 2);
  assert.equal(events[1].venue.borough, "BROOKLYN");
  assert.equal(events[1].category, "MUSIC");
});

test("NYC Parks adapter isolates malformed upstream rows", async () => {
  const invalidRows = [];
  const adapter = createNycParksAdapter({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [{ ...parksFixture[0], parkids: undefined }, parksFixture[1]];
      }
    }),
    onInvalidRow(result) {
      invalidRows.push(result);
    }
  });

  const events = await adapter.fetchEvents();
  assert.equal(events.length, 1);
  assert.equal(invalidRows.length, 1);
  assert.match(invalidRows[0].error.message, /Cannot determine borough/);
});

test("catalog replaces a source atomically, deduplicates, and filters", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "event-catalog-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createCatalogStore({
    catalogFile: path.join(directory, "catalog.json")
  });
  const first = createEvent({
    ...normalizeParksEvent(parksFixture[0]),
    source: "nyc-parks"
  });
  const second = createEvent({
    ...normalizeParksEvent(parksFixture[1]),
    source: "nyc-parks"
  });

  await store.replaceSource("nyc-parks", [first, first, second]);
  const sports = await store.query({
    borough: "staten island",
    category: "sports"
  });

  assert.equal((await store.load()).events.length, 2);
  assert.deepEqual(sports.events.map((event) => event.id), [first.id]);

  await store.replaceSource("nyc-parks", [second]);
  assert.deepEqual(
    (await store.load()).events.map((event) => event.id),
    [second.id]
  );
});

test("refresh and filtered read endpoints use the persisted catalog", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "event-api-"));
  const catalogStore = createCatalogStore({
    catalogFile: path.join(directory, "catalog.json")
  });
  const sourceRegistry = createSourceRegistry();
  sourceRegistry.register("nyc-parks", createNycParksAdapter({
    fetchImpl: async () => ({ ok: true, json: async () => parksFixture })
  }));
  const app = express();
  app.use("/api/event-finder", createEventFinderRouter({
    catalogStore,
    sourceRegistry
  }));
  const server = app.listen(0);
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/event-finder`;

  const refresh = await fetch(`${baseUrl}/refresh`, { method: "POST" });
  assert.equal(refresh.status, 200);
  assert.equal((await refresh.json()).count, 2);

  const read = await fetch(`${baseUrl}/events?borough=brooklyn&category=music`);
  const body = await read.json();
  assert.equal(read.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.events[0].id, "nyc-parks:event-2");
});
