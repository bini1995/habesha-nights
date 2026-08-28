const crypto = require("node:crypto");
const { normalizeSource } = require("../domain/engagement");

function serviceError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function unwrap(result, fallback = "Database request failed.") {
  if (result.error) throw serviceError(result.error.message || fallback, 502);
  return result.data;
}

function related(value) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function mapEvent(row) {
  const city = related(row.cities);
  const category = related(row.event_categories);
  const venue = related(row.venues);
  const organizer = related(row.organizers);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    city: city?.short_code ?? city?.name ?? null,
    category: category?.name ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    imageUrl: row.image_url,
    priceLabel: row.ticket_price_label || (row.ticket_price_cents === 0 ? "Free" : null),
    featured: row.featured,
    promoted: row.promoted,
    hasTickets: Boolean(row.ticket_url),
    venue: venue ? { name: venue.name, neighborhood: venue.neighborhood, address: venue.address } : null,
    organizer: organizer ? { id: organizer.id, name: organizer.name, instagram: organizer.instagram, website: organizer.website, verified: organizer.verified } : null
  };
}

const EVENT_SELECT = `
  id, slug, title, summary, description, starts_at, ends_at, image_url,
  ticket_url, ticket_price_cents, ticket_price_label, featured, promoted,
  cities!inner(id, name, slug, short_code),
  event_categories!inner(id, name, slug),
  venues(id, name, address, neighborhood),
  organizers(id, name, instagram, website, verified)
`;

function createMarketplaceService({ supabase, config }) {
  if (!supabase) return createUnconfiguredMarketplaceService();

  async function listEvents(filters = {}) {
    let query = supabase.from("events").select(EVENT_SELECT)
      .eq("status", "approved")
      .gte("starts_at", new Date().toISOString())
      .order("promoted", { ascending: false })
      .order("featured", { ascending: false })
      .order("starts_at", { ascending: true });
    if (filters.city) query = query.eq("cities.short_code", filters.city.toUpperCase());
    if (filters.category) query = query.eq("event_categories.slug", filters.category.toLowerCase());
    if (filters.query) {
      const safeQuery = String(filters.query).replace(/[%_,()]/g, " ").trim();
      if (safeQuery) query = query.or(`title.ilike.%${safeQuery}%,summary.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`);
    }
    return unwrap(await query).map(mapEvent);
  }

  async function getEvent(slug) {
    const data = unwrap(await supabase.from("events").select(EVENT_SELECT).eq("status", "approved").eq("slug", slug).maybeSingle());
    return data ? mapEvent(data) : null;
  }

  async function listBusinesses(filters = {}) {
    let query = supabase.from("businesses").select("id, name, category, description, neighborhood, website, instagram, promoted, cities!inner(name, short_code)").eq("status", "approved").order("promoted", { ascending: false }).order("name");
    if (filters.city) query = query.eq("cities.short_code", filters.city.toUpperCase());
    return unwrap(await query).map((row) => ({ ...row, city: related(row.cities)?.short_code, cities: undefined }));
  }

  async function listReferenceData() {
    const [cities, categories] = await Promise.all([
      supabase.from("cities").select("id, name, slug, short_code").eq("active", true).order("name"),
      supabase.from("event_categories").select("id, name, slug").eq("active", true).order("sort_order")
    ]);
    return { cities: unwrap(cities), categories: unwrap(categories) };
  }

  async function uploadFlyer(file, submissionId) {
    if (!file) return null;
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.mimetype];
    if (!extension) throw serviceError("Flyer must be a JPG, PNG, or WebP image.", 400);
    const path = `submissions/${submissionId}.${extension}`;
    unwrap(await supabase.storage.from(config.flyerBucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: false }), "Flyer upload failed.");
    return supabase.storage.from(config.flyerBucket).getPublicUrl(path).data.publicUrl;
  }

  async function createSubmission(input, file) {
    const id = crypto.randomUUID();
    let imageUrl = null;
    try {
      imageUrl = await uploadFlyer(file, id);
      const submission = unwrap(await supabase.from("submissions").insert({ id, ...input, image_url: imageUrl, status: "pending" }).select().single());
      return submission;
    } catch (error) {
      if (imageUrl) await supabase.storage.from(config.flyerBucket).remove([imageUrl.split(`/${config.flyerBucket}/`)[1]]).catch(() => {});
      throw error;
    }
  }

  async function listSubmissions(status = "pending") {
    return unwrap(await supabase.from("submissions").select("*, cities(id, name, short_code), event_categories(id, name, slug)").eq("status", status).order("created_at"));
  }

  async function updateSubmission(id, changes) {
    return unwrap(await supabase.from("submissions").update(changes).eq("id", id).eq("status", "pending").select().single());
  }

  async function approveSubmission(id) {
    return unwrap(await supabase.rpc("approve_event_submission", { p_submission_id: id }));
  }

  async function rejectSubmission(id, reviewNotes) {
    return unwrap(await supabase.from("submissions").update({ status: "rejected", review_notes: reviewNotes || null, reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select().single());
  }

  function privacyMetadata(metadata = {}) {
    const ipHash = metadata.ip && config.clickHashSalt
      ? crypto.createHmac("sha256", config.clickHashSalt).update(metadata.ip).digest("hex")
      : null;
    return {
      referrer: metadata.referrer || null,
      user_agent: metadata.userAgent || null,
      ip_hash: ipHash,
      source: normalizeSource(metadata.source, metadata.referrer)
    };
  }

  async function recordEventView(slug, input, metadata) {
    const event = unwrap(await supabase.from("events").select("id").eq("slug", slug).eq("status", "approved").maybeSingle());
    if (!event) return null;
    const row = unwrap(await supabase.from("event_views").insert({
      event_id: event.id,
      visitor_id: input.visitor_id || null,
      ...privacyMetadata({ ...metadata, source: input.source, referrer: input.referrer || metadata.referrer })
    }).select("id").single());
    return row.id;
  }

  async function createClaim(slug, input) {
    const event = unwrap(await supabase.from("events").select("id").eq("slug", slug).eq("status", "approved").maybeSingle());
    if (!event) throw serviceError("Event not found.", 404);
    return unwrap(await supabase.from("event_claims").insert({ event_id: event.id, ...input, status: "pending" }).select("id, status").single());
  }

  async function createPromotionRequest(input) {
    return unwrap(await supabase.from("promotion_requests").insert({ ...input, status: "pending" }).select("id, status").single());
  }

  async function listClaims(status = "pending") {
    return unwrap(await supabase.from("event_claims").select("*, events(id, slug, title, organizers(name))").eq("status", status).order("created_at"));
  }

  async function moderateClaim(id, status, reviewNotes) {
    unwrap(await supabase.rpc("moderate_event_claim", { p_claim_id: id, p_status: status, p_review_notes: reviewNotes || null }));
    return { id, status };
  }

  async function listPromotionRequests(status = "pending") {
    return unwrap(await supabase.from("promotion_requests").select("*, events(id, slug, title)").eq("status", status).order("created_at"));
  }

  async function updatePromotionRequest(id, status, reviewNotes) {
    const allowed = new Set(["pending", "contacted", "approved", "rejected", "completed"]);
    if (!allowed.has(status)) throw serviceError("Invalid promotion status.", 400);
    return unwrap(await supabase.from("promotion_requests").update({ status, review_notes: reviewNotes || null, updated_at: new Date().toISOString() }).eq("id", id).select().single());
  }

  async function resolveTicket(slug, metadata) {
    const event = unwrap(await supabase.from("events").select("id, ticket_url").eq("slug", slug).eq("status", "approved").maybeSingle());
    if (!event?.ticket_url) return null;
    unwrap(await supabase.from("outbound_clicks").insert({ event_id: event.id, destination_url: event.ticket_url, ...privacyMetadata(metadata) }));
    return event.ticket_url;
  }

  async function getAnalytics() {
    const [eventsResult, clicksResult, viewsResult] = await Promise.all([
      supabase.from("events").select("id, title, slug").eq("status", "approved").order("title"),
      supabase.from("outbound_clicks").select("event_id, source"),
      supabase.from("event_views").select("id, event_id, visitor_id, source")
    ]);
    const events = unwrap(eventsResult);
    const rows = new Map(events.map((event) => [event.id, { ...event, views: 0, uniqueVisitors: new Set(), ticketClicks: 0, traffic: {} }]));
    for (const view of unwrap(viewsResult)) {
      const item = rows.get(view.event_id);
      if (!item) continue;
      item.views += 1;
      item.uniqueVisitors.add(view.visitor_id || `anonymous-${view.id}`);
      item.traffic[view.source] = (item.traffic[view.source] || 0) + 1;
    }
    for (const click of unwrap(clicksResult)) {
      const item = rows.get(click.event_id);
      if (item) item.ticketClicks += 1;
    }
    return [...rows.values()].map((item) => ({
      ...item,
      uniqueVisitors: item.uniqueVisitors.size,
      clickThroughRate: item.views ? Math.round((item.ticketClicks / item.views) * 1000) / 10 : 0,
      traffic: Object.entries(item.traffic).map(([source, views]) => ({ source, views, percentage: item.views ? Math.round((views / item.views) * 100) : 0 })).sort((a, b) => b.views - a.views)
    })).sort((a, b) => b.views - a.views || b.ticketClicks - a.ticketClicks);
  }

  return { configured: true, approveSubmission, createClaim, createPromotionRequest, createSubmission, getAnalytics, getEvent, listBusinesses, listClaims, listEvents, listPromotionRequests, listReferenceData, listSubmissions, moderateClaim, recordEventView, rejectSubmission, resolveTicket, updatePromotionRequest, updateSubmission };
}

function createUnconfiguredMarketplaceService() {
  const unavailable = async () => { throw serviceError("Supabase is not configured yet.", 503); };
  return {
    configured: false,
    listEvents: async () => [],
    listBusinesses: async () => [],
    listReferenceData: async () => ({ cities: [], categories: [] }),
    getEvent: async () => null,
    approveSubmission: unavailable,
    createClaim: unavailable,
    createPromotionRequest: unavailable,
    createSubmission: unavailable,
    getAnalytics: unavailable,
    listClaims: unavailable,
    listPromotionRequests: unavailable,
    listSubmissions: unavailable,
    moderateClaim: unavailable,
    recordEventView: unavailable,
    rejectSubmission: unavailable,
    resolveTicket: unavailable,
    updatePromotionRequest: unavailable,
    updateSubmission: unavailable
  };
}

module.exports = { createMarketplaceService, createUnconfiguredMarketplaceService, mapEvent };
