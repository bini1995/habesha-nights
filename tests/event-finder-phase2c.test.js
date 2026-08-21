const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");

const { createEventFinderRouter } = require("../products/event-finder");
const { createCalendar, escapeCalendarText } = require("../products/event-finder/domain/calendar");
const { createEvent } = require("../products/event-finder/domain/event");
const { createCatalogStore } = require("../products/event-finder/services/catalog-store");
const { createPreferencesStore } = require("../products/event-finder/services/preferences-store");
const { createQualityHistoryStore } = require("../products/event-finder/services/quality-history-store");
const { createQualityStore } = require("../products/event-finder/services/quality-store");
const { createSavedEventsStore } = require("../products/event-finder/services/saved-events-store");
const { createSourceRegistry } = require("../products/event-finder/services/source-registry");

function fixtureEvent(overrides = {}) {
  return createEvent({
    source: "fixture",
    externalId: overrides.externalId ?? "overnight-1",
    title: overrides.title ?? "Jazz, Art & Night",
    description: overrides.description ?? "Bring friends; stay late.\nFree entry.",
    startsAt: overrides.startsAt ?? "2026-11-02T23:00:00Z",
    endsAt: overrides.endsAt ?? "2026-11-03T12:00:00Z",
    category: "MUSIC",
    venue: { name: "Prospect Park, Bandshell", borough: "BROOKLYN" },
    url: "https://example.com/events/overnight",
    tags: ["jazz"]
  });
}

async function createStores(context, retention = 90) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "event-phase2c-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return {
    directory,
    catalogStore: createCatalogStore({ catalogFile: path.join(directory, "catalog.json") }),
    preferencesStore: createPreferencesStore({ file: path.join(directory, "preferences.json") }),
    qualityStore: createQualityStore({ file: path.join(directory, "quality.json") }),
    qualityHistoryStore: createQualityHistoryStore({
      file: path.join(directory, "quality-history.json"), retention
    }),
    savedEventsStore: createSavedEventsStore({ file: path.join(directory, "saved-events.json") })
  };
}

test("quality history records required metrics and enforces retention", async (context) => {
  const { qualityHistoryStore } = await createStores(context, 2);
  for (let index = 1; index <= 3; index += 1) {
    await qualityHistoryStore.record({
      recordedAt: `2026-08-2${index}T12:00:00.000Z`,
      catalogUpdatedAt: `2026-08-2${index}T12:00:00.000Z`,
      catalogEvents: index * 100,
      earliestEventAt: "2026-08-21T12:00:00.000Z",
      latestEventAt: "2026-09-03T23:00:00.000Z",
      byBorough: { BROOKLYN: 1, QUEENS: 1 },
      byCategory: { MUSIC: 1 },
      sources: { fixture: { rejected: index, duplicatesRemoved: index - 1 } }
    });
  }
  const entries = await qualityHistoryStore.list({ limit: 2 });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].normalizedCount, 300);
  assert.equal(entries[0].rejectedCount, 3);
  assert.equal(entries[0].duplicateCount, 2);
  assert.equal(entries[0].boroughCoverage, 2);
  assert.equal(entries[0].categoryCoverage, 1);
  assert.equal(entries[0].catalogStartsAt, "2026-08-21T12:00:00.000Z");
  assert.equal(entries[0].catalogEndsAt, "2026-09-03T23:00:00.000Z");
});

test("calendar export escapes text, folds lines, and uses NYC local overnight times", () => {
  assert.equal(escapeCalendarText("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
  const calendar = createCalendar([
    fixtureEvent({ description: "A very long description ".repeat(8) })
  ], { generatedAt: "2026-08-21T12:34:56Z" });

  assert.match(calendar, /BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(calendar, /TZID:America\/New_York/);
  assert.match(calendar, /DTSTART;TZID=America\/New_York:20261102T180000/);
  assert.match(calendar, /DTEND;TZID=America\/New_York:20261103T070000/);
  assert.match(calendar, /SUMMARY:Jazz\\, Art & Night/);
  assert.match(calendar, /\r\n /);
  assert.ok(calendar.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.match(calendar, /END:VCALENDAR\r\n$/);
});

test("quality history and saved calendar APIs return persisted data", async (context) => {
  const stores = await createStores(context);
  const event = fixtureEvent();
  await stores.catalogStore.replaceSource("fixture", [event]);
  await stores.savedEventsStore.save(event);
  await stores.qualityHistoryStore.record({
    catalogUpdatedAt: "2026-08-21T12:00:00.000Z",
    catalogEvents: 1,
    earliestEventAt: event.startsAt,
    latestEventAt: event.startsAt,
    byBorough: { BROOKLYN: 1 },
    byCategory: { MUSIC: 1 },
    sources: { fixture: { rejected: 0, duplicatesRemoved: 0 } }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/event-finder", createEventFinderRouter({
    sourceRegistry: createSourceRegistry(),
    ...stores
  }));
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/event-finder`;

  const history = await fetch(`${base}/quality/history`);
  const historyBody = await history.json();
  assert.equal(history.status, 200);
  assert.equal(historyBody.entries[0].normalizedCount, 1);

  for (const route of [
    "/saved-events/calendar.ics",
    `/saved-events/${encodeURIComponent(event.id)}/calendar.ics`
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/calendar/);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    assert.match(await response.text(), /BEGIN:VEVENT/);
  }
});
