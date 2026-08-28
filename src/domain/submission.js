const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, field, { max = 500, optional = false } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized && !optional) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  if (normalized.length > max) throw Object.assign(new Error(`${field} is too long.`), { status: 400 });
  return normalized || null;
}

function url(value, field) {
  const normalized = text(value, field, { max: 1000, optional: true });
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw Object.assign(new Error(`${field} must be a valid http or https URL.`), { status: 400 });
  }
}

function uuid(value, field) {
  const normalized = text(value, field, { max: 36 });
  if (!UUID.test(normalized)) throw Object.assign(new Error(`${field} is invalid.`), { status: 400 });
  return normalized;
}

function date(value, field, optional = false) {
  const normalized = text(value, field, { max: 50, optional });
  if (!normalized) return null;
  const parsed = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? new Date(normalized)
    : easternLocalDate(normalized);
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error(`${field} must be a valid date and time.`), { status: 400 });
  return parsed.toISOString();
}

function easternLocalDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  function offsetAt(timestamp) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - timestamp;
  }
  const firstPass = utcGuess - offsetAt(utcGuess);
  return new Date(utcGuess - offsetAt(firstPass));
}

function validateSubmission(body) {
  if (body.website) throw Object.assign(new Error("Submission was not accepted."), { status: 400 });
  const startsAt = date(body.starts_at, "Start date");
  const endsAt = date(body.ends_at, "End date", true);
  if (endsAt && endsAt <= startsAt) throw Object.assign(new Error("End date must be after the start date."), { status: 400 });
  const contactEmail = text(body.contact_email, "Contact email", { max: 254 });
  if (!EMAIL.test(contactEmail)) throw Object.assign(new Error("Contact email is invalid."), { status: 400 });
  return {
    title: text(body.event_name ?? body.title, "Event name", { max: 160 }),
    description: text(body.description, "Description", { max: 5000 }),
    city_id: uuid(body.city_id, "City"),
    category_id: uuid(body.category_id, "Category"),
    starts_at: startsAt,
    ends_at: endsAt,
    venue_name: text(body.venue_name, "Venue", { max: 180 }),
    venue_address: text(body.venue_address, "Address", { max: 300 }),
    venue_neighborhood: text(body.venue_neighborhood, "Neighborhood", { max: 120, optional: true }),
    ticket_price_label: text(body.ticket_price_label, "Ticket price", { max: 80, optional: true }),
    ticket_url: url(body.ticket_url, "Ticket link"),
    instagram: text(body.instagram, "Instagram", { max: 200, optional: true }),
    organizer_name: text(body.organizer_name, "Organizer name", { max: 160 }),
    contact_name: text(body.contact_name, "Contact name", { max: 160 }),
    contact_email: contactEmail.toLowerCase(),
    contact_phone: text(body.contact_phone, "Contact phone", { max: 50, optional: true })
  };
}

module.exports = { easternLocalDate, validateSubmission };
