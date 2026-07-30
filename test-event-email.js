require("dotenv").config();

const watches = require("./config/watches");

const {
  createEvents,
  getNotifiableEvents
} = require("./services/event-engine");

const {
  sendEventEmail
} = require("./services/email");

function getTomorrowAtSixEastern() {
  const now = new Date();

  const easternDateParts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(now);

  const values = Object.fromEntries(
    easternDateParts.map((part) => [
      part.type,
      part.value
    ])
  );

  const todayAtNoonUtc = new Date(
    `${values.year}-${values.month}-${values.day}` +
    "T12:00:00.000Z"
  );

  todayAtNoonUtc.setUTCDate(
    todayAtNoonUtc.getUTCDate() + 1
  );

  const tomorrowParts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(todayAtNoonUtc);

  const tomorrow = Object.fromEntries(
    tomorrowParts.map((part) => [
      part.type,
      part.value
    ])
  );

  /*
   * July is during Eastern Daylight Time, so 6:00 PM
   * Eastern equals 10:00 PM UTC.
   *
   * This is test data only. Real AMC timestamps come
   * directly from the page.
   */
  return new Date(
    `${tomorrow.year}-${tomorrow.month}-${tomorrow.day}` +
    "T22:00:00.000Z"
  ).toISOString();
}

async function main() {
  const watch = watches[0];
  const datetime = getTomorrowAtSixEastern();

  const changes = [
    {
      type: "STATUS_CHANGED",
      time: "6:00pm",
      oldStatus: "Sold Out",
      newStatus: "Available",
      current: {
        time: "6:00pm",
        datetime,
        status: "Available",
        url: watch.pageUrl
      }
    }
  ];

  const events = createEvents({
    watch,
    changes
  });

  const notifiableEvents =
    getNotifiableEvents(events);

  if (notifiableEvents.length === 0) {
    throw new Error(
      "The test did not create a notifiable event."
    );
  }

  const result = await sendEventEmail({
    watch,
    current: {
      checkedAt: new Date().toISOString()
    },
    events: notifiableEvents
  });

  console.log("Event email sent:");
  console.log(result);
}

main().catch((error) => {
  console.error("Event email test failed:");
  console.error(error);
  process.exit(1);
});
