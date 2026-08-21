const BOROUGHS = Object.freeze([
  "BRONX",
  "BROOKLYN",
  "MANHATTAN",
  "QUEENS",
  "STATEN_ISLAND"
]);

const CATEGORIES = Object.freeze([
  "ARTS",
  "COMEDY",
  "COMMUNITY",
  "FAMILY",
  "FILM",
  "FOOD",
  "MUSIC",
  "NIGHTLIFE",
  "SPORTS",
  "THEATER",
  "OTHER"
]);

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function optionalText(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value).trim() || null;
}

function normalizeEnum(value, allowed, field) {
  const normalized = requireText(value, field)
    .replace(/[ -]+/g, "_")
    .toUpperCase();

  if (!allowed.includes(normalized)) {
    throw new Error(
      `${field} must be one of: ${allowed.join(", ")}.`
    );
  }

  return normalized;
}

function normalizeDate(value, field) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date.`);
  }

  return date.toISOString();
}

function normalizeUrl(value) {
  const url = new URL(requireText(value, "url"));

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("url must use http or https.");
  }

  return url.toString();
}

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array.");
  }

  return [...new Set(
    tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean)
  )];
}

function createEvent(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Event data is required.");
  }

  const source = requireText(input.source, "source")
    .toLowerCase();
  const externalId = requireText(
    input.externalId,
    "externalId"
  );
  const startsAt = normalizeDate(input.startsAt, "startsAt");
  const endsAt = input.endsAt
    ? normalizeDate(input.endsAt, "endsAt")
    : null;

  if (endsAt && endsAt < startsAt) {
    throw new Error("endsAt must not be before startsAt.");
  }

  const borough = normalizeEnum(
    input.venue?.borough,
    BOROUGHS,
    "venue.borough"
  );

  return Object.freeze({
    id: `${source}:${externalId}`,
    source,
    externalId,
    title: requireText(input.title, "title"),
    description: optionalText(input.description),
    startsAt,
    endsAt,
    timezone: "America/New_York",
    category: normalizeEnum(
      input.category ?? "OTHER",
      CATEGORIES,
      "category"
    ),
    venue: Object.freeze({
      name: requireText(input.venue?.name, "venue.name"),
      borough,
      address: optionalText(input.venue?.address)
    }),
    url: normalizeUrl(input.url),
    tags: Object.freeze(normalizeTags(input.tags))
  });
}

module.exports = {
  BOROUGHS,
  CATEGORIES,
  createEvent
};
