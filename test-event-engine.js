const watches = require("./config/watches");

const {
  createEvents,
  getNotifiableEvents
} = require("./services/event-engine");

const watch = watches[0];

const changes = [
  {
    type: "STATUS_CHANGED",
    time: "6:00pm",
    oldStatus: "Sold Out",
    newStatus: "Available",
    current: {
      time: "6:00pm",
      datetime: "2026-07-30T22:00:00.000Z",
      status: "Available",
      url:
        "https://www.amctheatres.com/showtimes/test"
    }
  },
  {
    type: "SHOWTIME_REMOVED",
    time: "10:00pm",
    previous: {
      time: "10:00pm",
      status: "Almost Full"
    }
  }
];

const events = createEvents({
  watch,
  changes
});

console.log("All events:");
console.dir(events, {
  depth: null
});

console.log("\nNotifiable events:");
console.table(
  getNotifiableEvents(events).map((event) => ({
    type: event.type,
    severity: event.severity,
    time: event.showtime.time,
    status: event.showtime.status
  }))
);
