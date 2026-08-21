const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEvent
} = require("../products/event-finder/domain/event");

const {
  createSourceRegistry
} = require(
  "../products/event-finder/services/source-registry"
);

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
