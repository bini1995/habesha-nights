const DATASET_URL =
  "https://data.cityofnewyork.us/resource/w3wp-dpdi.json?$limit=50000";

const BOROUGH_BY_PARK_PREFIX = Object.freeze({
  B: "BROOKLYN",
  M: "MANHATTAN",
  Q: "QUEENS",
  R: "STATEN_ISLAND",
  X: "BRONX"
});

const CATEGORY_RULES = Object.freeze([
  ["SPORTS", /sports|fitness|exercise|running|walking|swimming|aquatics|pickleball|basketball|baseball|soccer|tennis|yoga|zumba/i],
  ["MUSIC", /music|concert|dance performance/i],
  ["FILM", /film|movie|cinema/i],
  ["THEATER", /theater|theatre|performance|puppet|marionette/i],
  ["ARTS", /art|craft|exhibit|gallery|museum|photography/i],
  ["FOOD", /food|culinary|cooking|market/i],
  ["FAMILY", /kids|children|family|school/i],
  ["COMMUNITY", /volunteer|community|stewardship|festival|education|nature|birding|gardening/i]
]);

function decodeHtml(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function boroughFromParkId(parkId) {
  const prefix = String(parkId ?? "").trim().charAt(0).toUpperCase();
  const borough = BOROUGH_BY_PARK_PREFIX[prefix];

  if (!borough) {
    throw new Error(`Cannot determine borough from Parks park ID "${parkId}".`);
  }

  return borough;
}

function categoryFromParks(categories) {
  const text = String(categories ?? "");
  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
  return match?.[0] ?? "OTHER";
}

function splitCategories(categories) {
  return String(categories ?? "")
    .split("|")
    .map((category) => decodeHtml(category)?.toLowerCase())
    .filter(Boolean);
}

function parseCoordinates(value) {
  const [latitude, longitude] = String(value ?? "")
    .split(",")
    .map(Number);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function nycDateTimeToIso(dateValue, timeValue) {
  const dateMatch = String(dateValue ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = String(timeValue ?? "").match(/(\d{2}):(\d{2})(?::(\d{2}))?/);

  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid Parks date/time: "${dateValue}" "${timeValue}".`);
  }

  const parts = [
    Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3] ?? 0)
  ];
  const desiredUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  let instant = desiredUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const displayed = Object.fromEntries(
      formatter.formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    const displayedUtc = Date.UTC(
      displayed.year, displayed.month - 1, displayed.day,
      displayed.hour, displayed.minute, displayed.second
    );
    instant += desiredUtc - displayedUtc;
  }

  return new Date(instant).toISOString();
}

function linkUrl(value) {
  return typeof value === "object" && value !== null ? value.url : value;
}

function normalizeParksEvent(row) {
  const startDate = row.startdate;
  const endDate = row.enddate || row.startdate;
  const startsAt = nycDateTimeToIso(startDate, row.starttime);
  let endsAt = row.endtime
    ? nycDateTimeToIso(endDate, row.endtime)
    : null;

  // Parks represents overnight events with the same start/end calendar date.
  if (endsAt && endsAt < startsAt && endDate === startDate) {
    endsAt = new Date(new Date(endsAt).getTime() + 86_400_000).toISOString();
  }

  return {
    externalId: String(row.guid),
    title: decodeHtml(row.title),
    description: decodeHtml(row.description),
    startsAt,
    endsAt,
    category: categoryFromParks(row.categories),
    venue: {
      name: decodeHtml(row.location) || decodeHtml(row.parknames),
      borough: boroughFromParkId(row.parkids),
      address: decodeHtml(row.parknames),
      parkId: row.parkids,
      coordinates: parseCoordinates(row.coordinates)
    },
    url: linkUrl(row.link),
    tags: splitCategories(row.categories)
  };
}

function createNycParksAdapter({
  fetchImpl = globalThis.fetch,
  datasetUrl = DATASET_URL,
  onInvalidRow = () => {}
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  let lastFetchStats = null;

  return {
    getLastFetchStats() {
      return lastFetchStats;
    },

    async fetchEvents() {
      const response = await fetchImpl(datasetUrl, {
        headers: { accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`NYC Parks dataset returned HTTP ${response.status}.`);
      }

      const rows = await response.json();
      if (!Array.isArray(rows)) {
        throw new Error("NYC Parks dataset did not return an array.");
      }

      const events = [];
      let rejected = 0;

      for (const row of rows) {
        try {
          events.push(normalizeParksEvent(row));
        } catch (error) {
          rejected += 1;
          onInvalidRow({ row, error });
        }
      }

      lastFetchStats = {
        received: rows.length,
        accepted: events.length,
        rejected
      };

      return events;
    }
  };
}

module.exports = {
  DATASET_URL,
  boroughFromParkId,
  categoryFromParks,
  createNycParksAdapter,
  normalizeParksEvent,
  nycDateTimeToIso
};
