const TRAFFIC_SOURCES = new Set(["instagram", "tiktok", "google", "organizer", "whatsapp", "direct", "other"]);

function clean(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function required(value, label, maxLength) {
  const result = clean(value, maxLength);
  if (!result) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  return result;
}

function email(value) {
  const result = required(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }
  return result;
}

function normalizeSource(value, referrer = "") {
  const requested = clean(value, 40).toLowerCase();
  if (TRAFFIC_SOURCES.has(requested)) return requested;
  const host = (() => {
    try { return new URL(referrer).hostname.toLowerCase(); } catch { return ""; }
  })();
  if (host.includes("instagram.com") || host.includes("l.instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("google.")) return "google";
  if (host.includes("whatsapp.com") || host.includes("wa.me")) return "whatsapp";
  return host ? "other" : "direct";
}

function validateEventView(input = {}) {
  return {
    visitor_id: clean(input.visitor_id, 100) || null,
    source: normalizeSource(input.source, input.referrer),
    referrer: clean(input.referrer, 1000) || null
  };
}

function validateClaim(input = {}) {
  return {
    contact_name: required(input.contact_name, "Contact name", 160),
    contact_email: email(input.contact_email),
    instagram: clean(input.instagram, 200) || null,
    relationship: required(input.relationship, "Relationship to the event", 240),
    correction_notes: clean(input.correction_notes, 2500) || null
  };
}

function validatePromotionRequest(input = {}) {
  return {
    event_id: clean(input.event_id, 36) || null,
    event_name: required(input.event_name, "Event name", 160),
    organizer_name: required(input.organizer_name, "Organizer name", 160),
    contact_email: email(input.contact_email),
    instagram: clean(input.instagram, 200) || null,
    requested_placement: "weekend_featured",
    quoted_price_cents: 0
  };
}

module.exports = { normalizeSource, validateClaim, validateEventView, validatePromotionRequest };
