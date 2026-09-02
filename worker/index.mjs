const EVENT_SELECT = "id,slug,title,summary,description,starts_at,ends_at,image_url,ticket_url,ticket_price_cents,ticket_price_label,featured,promoted,cities!inner(id,name,slug,short_code),event_categories!inner(id,name,slug),venues(id,name,address,neighborhood),organizers(id,name,instagram,website,verified)";
const SOURCES = new Set(["instagram", "tiktok", "google", "organizer", "whatsapp", "direct", "other"]);
const FALLBACK_ASSET_ORIGIN = "https://raw.githubusercontent.com/bini1995/habesha-nights/1328777dfbb5547ae32be07343ea9ca38b52039e/public";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function escapeMarkup(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function escapeXml(value = "") {
  return escapeMarkup(value);
}

async function searchFiles(url, env) {
  if (url.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (url.pathname === "/sitemap.xml") {
    let events = [];
    try {
      events = await database(env, `/rest/v1/events?${queryString({ select: "slug,updated_at", status: "eq.approved", starts_at: `gte.${new Date().toISOString()}`, order: "starts_at.asc" })}`);
    } catch {}
    const eventUrls = events.map((event) => `<url><loc>${escapeXml(`${url.origin}/events/${encodeURIComponent(event.slug)}`)}</loc><lastmod>${escapeXml(new Date(event.updated_at).toISOString())}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeXml(`${url.origin}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${eventUrls}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=1800" } });
  }
  return null;
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clean(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function required(value, label, max) {
  const result = clean(value, max);
  if (!result) throw httpError(`${label} is required.`);
  return result;
}
function validEmail(value) {
  const result = required(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw httpError("Enter a valid email address.");
  return result;
}
function validUuid(value, label) {
  const result = required(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw httpError(`${label} is invalid.`);
  return result;
}
function validUrl(value, label = "Link") {
  const result = clean(value, 2000);
  if (!result) return null;
  try {
    const url = new URL(result);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch { throw httpError(`${label} must be an http or https link.`); }
}
function validDate(value, label, optional = false) {
  const result = clean(value, 80);
  if (!result && optional) return null;
  if (!result) throw httpError(`${label} is required.`);
  const date = new Date(result);
  if (Number.isNaN(date.getTime())) throw httpError(`${label} is invalid.`);
  return date.toISOString();
}
function normalizeSource(value, referrer = "") {
  const requested = clean(value, 40).toLowerCase();
  if (SOURCES.has(requested)) return requested;
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch {}
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("google.")) return "google";
  if (host.includes("whatsapp.com") || host.includes("wa.me")) return "whatsapp";
  return host ? "other" : "direct";
}

function submissionInput(input) {
  const startsAt = validDate(input.event_name ? input.starts_at : input.starts_at, "Start date and time");
  const endsAt = validDate(input.ends_at, "End date and time", true);
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) throw httpError("End date must be after the start date.");
  if (clean(input.website)) throw httpError("Submission could not be accepted.");
  return {
    title: required(input.event_name, "Event name", 160),
    description: required(input.description, "Description", 5000),
    city_id: validUuid(input.city_id, "City"),
    category_id: validUuid(input.category_id, "Category"),
    starts_at: startsAt,
    ends_at: endsAt,
    venue_name: required(input.venue_name, "Venue", 180),
    venue_address: required(input.venue_address, "Address", 300),
    venue_neighborhood: clean(input.venue_neighborhood, 120) || null,
    ticket_price_label: clean(input.ticket_price_label, 80) || null,
    ticket_url: validUrl(input.ticket_url, "Ticket link"),
    instagram: clean(input.instagram, 200) || null,
    organizer_name: required(input.organizer_name, "Organizer name", 160),
    contact_name: required(input.contact_name, "Contact name", 160),
    contact_email: validEmail(input.contact_email),
    contact_phone: clean(input.contact_phone, 50) || null
  };
}

function claimInput(input) {
  return {
    contact_name: required(input.contact_name, "Contact name", 160),
    contact_email: validEmail(input.contact_email),
    instagram: clean(input.instagram, 200) || null,
    relationship: required(input.relationship, "Relationship to the event", 240),
    correction_notes: clean(input.correction_notes, 2500) || null
  };
}

function promotionInput(input) {
  return {
    event_id: clean(input.event_id, 36) || null,
    event_name: required(input.event_name, "Event name", 160),
    organizer_name: required(input.organizer_name, "Organizer name", 160),
    contact_email: validEmail(input.contact_email),
    instagram: clean(input.instagram, 200) || null,
    requested_placement: "weekend_featured",
    quoted_price_cents: 0
  };
}

async function limit(request, env) {
  if (!env.SUBMISSION_RATE_LIMITER) return;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const pathname = new URL(request.url).pathname;
  const { success } = await env.SUBMISSION_RATE_LIMITER.limit({ key: `${ip}:${pathname}` });
  if (!success) throw httpError("Too many requests. Please try again later.", 429);
}

async function database(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw httpError("Supabase is not configured yet.", 503);
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.single ? { accept: "application/vnd.pgrst.object+json" } : {}),
      ...(options.prefer ? { prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (options.maybeSingle && response.status === 406) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw httpError(data?.message || data?.error || "Database request failed.", 502);
  return data;
}

function related(value) { return Array.isArray(value) ? (value[0] || null) : (value || null); }
function publicEvent(row) {
  const city = related(row.cities);
  const category = related(row.event_categories);
  const venue = related(row.venues);
  const organizer = related(row.organizers);
  return {
    id: row.id, slug: row.slug, title: row.title, summary: row.summary, description: row.description,
    city: city?.short_code || city?.name || null, cityName: city?.name || null, category: category?.name || null,
    startsAt: row.starts_at, endsAt: row.ends_at, imageUrl: row.image_url,
    ticketPriceCents: row.ticket_price_cents,
    priceLabel: row.ticket_price_label || (row.ticket_price_cents === 0 ? "Free" : null),
    featured: row.featured, promoted: row.promoted, hasTickets: Boolean(row.ticket_url),
    venue: venue ? { name: venue.name, neighborhood: venue.neighborhood, address: venue.address } : null,
    organizer: organizer ? { id: organizer.id, name: organizer.name, instagram: organizer.instagram, website: organizer.website, verified: organizer.verified } : null
  };
}

function eventJsonLd(event, canonicalUrl, origin) {
  const location = {
    "@type": "Place",
    name: event.venue?.name || "Venue to be announced",
    address: {
      "@type": "PostalAddress",
      streetAddress: event.venue?.address || event.cityName || event.city,
      addressLocality: event.cityName || event.city,
      addressCountry: "US"
    }
  };
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || event.summary,
    startDate: event.startsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location,
    image: [event.imageUrl || `${origin}/og.png`],
    url: canonicalUrl,
    organizer: { "@type": "Organization", name: event.organizer?.name || "Independent organizer" }
  };
  if (event.endsAt) data.endDate = event.endsAt;
  if (event.hasTickets) {
    data.offers = {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock"
    };
    if (Number.isInteger(event.ticketPriceCents)) data.offers.price = (event.ticketPriceCents / 100).toFixed(2);
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(value));
}

function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== "") params.set(key, value);
  return params.toString();
}

async function listEvents(env, search) {
  const values = { select: EVENT_SELECT, status: "eq.approved", starts_at: `gte.${new Date().toISOString()}`, order: "promoted.desc,featured.desc,starts_at.asc" };
  if (search.get("city")) values["cities.short_code"] = `eq.${clean(search.get("city"), 10).toUpperCase()}`;
  if (search.get("category")) values["event_categories.slug"] = `eq.${clean(search.get("category"), 100).toLowerCase()}`;
  const term = clean(search.get("query"), 120).replace(/[%_,()]/g, " ").trim();
  if (term) values.or = `(title.ilike.*${term}*,summary.ilike.*${term}*,description.ilike.*${term}*)`;
  return (await database(env, `/rest/v1/events?${queryString(values)}`)).map(publicEvent);
}

async function getEventRow(env, slug, columns = EVENT_SELECT) {
  return database(env, `/rest/v1/events?${queryString({ select: columns, status: "eq.approved", slug: `eq.${slug}` })}`, { single: true, maybeSingle: true });
}

async function hashIp(env, request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || !env.CLICK_HASH_SALT) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.CLICK_HASH_SALT), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function metadata(env, request, requestedSource, requestedReferrer) {
  const referrer = clean(requestedReferrer || request.headers.get("referer"), 1000) || null;
  return {
    source: normalizeSource(requestedSource, referrer), referrer,
    user_agent: clean(request.headers.get("user-agent"), 1000) || null,
    ip_hash: await hashIp(env, request)
  };
}

async function authorized(request, env) {
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = env.ADMIN_TOKEN || "";
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  return Boolean(supplied && expected) && crypto.subtle.timingSafeEqual(suppliedHash, expectedHash);
}

async function bodyJson(request) { return request.json().catch(() => ({})); }

async function handlePublicApi(request, env, url, segments) {
  if (url.pathname === "/api") return json({ product: "Habesha Nights", status: "ready", dataMode: env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? "supabase" : "setup-required" });
  if (url.pathname === "/api/events" && request.method === "GET") return json({ events: await listEvents(env, url.searchParams) });
  if (segments[1] === "events" && segments[2] && !segments[3] && request.method === "GET") {
    const row = await getEventRow(env, clean(segments[2], 220));
    return row ? json({ event: publicEvent(row) }) : json({ error: "Event not found." }, 404);
  }
  if (segments[1] === "events" && segments[2] && segments[3] === "view" && request.method === "POST") {
    const row = await getEventRow(env, clean(segments[2], 220), "id");
    if (!row) return json({ error: "Event not found." }, 404);
    const input = await bodyJson(request);
    await database(env, "/rest/v1/event_views", { method: "POST", prefer: "return=minimal", body: { event_id: row.id, visitor_id: clean(input.visitor_id, 100) || null, ...(await metadata(env, request, input.source, input.referrer)) } });
    return json({ recorded: true }, 201);
  }
  if (segments[1] === "events" && segments[2] && segments[3] === "claims" && request.method === "POST") {
    await limit(request, env);
    const row = await getEventRow(env, clean(segments[2], 220), "id");
    if (!row) return json({ error: "Event not found." }, 404);
    const rows = await database(env, "/rest/v1/event_claims?select=id,status", { method: "POST", prefer: "return=representation", body: { event_id: row.id, ...claimInput(await bodyJson(request)), status: "pending" } });
    return json({ claim: rows[0], message: "Your claim is pending verification." }, 201);
  }
  if (url.pathname === "/api/businesses" && request.method === "GET") {
    const values = { select: "id,name,category,description,neighborhood,website,instagram,promoted,cities!inner(name,short_code)", status: "eq.approved", order: "promoted.desc,name.asc" };
    if (url.searchParams.get("city")) values["cities.short_code"] = `eq.${clean(url.searchParams.get("city"), 10).toUpperCase()}`;
    const rows = await database(env, `/rest/v1/businesses?${queryString(values)}`);
    return json({ businesses: rows.map((row) => ({ ...row, city: related(row.cities)?.short_code, cities: undefined })) });
  }
  if (url.pathname === "/api/reference-data" && request.method === "GET") {
    const [cities, categories] = await Promise.all([
      database(env, `/rest/v1/cities?${queryString({ select: "id,name,slug,short_code", active: "eq.true", order: "name.asc" })}`),
      database(env, `/rest/v1/event_categories?${queryString({ select: "id,name,slug", active: "eq.true", order: "sort_order.asc" })}`)
    ]);
    return json({ cities, categories });
  }
  if (url.pathname === "/api/submissions" && request.method === "POST") {
    await limit(request, env);
    const form = await request.formData();
    const input = submissionInput(Object.fromEntries(form.entries()));
    const id = crypto.randomUUID();
    const flyer = form.get("image");
    let imageUrl = null;
    if (flyer && typeof flyer === "object" && flyer.size) {
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[flyer.type];
      if (!extension) throw httpError("Flyer must be a JPG, PNG, or WebP image.");
      if (flyer.size > 5 * 1024 * 1024) throw httpError("Flyer must be 5 MB or smaller.");
      const objectPath = `submissions/${id}.${extension}`;
      const upload = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_FLYER_BUCKET || "event-flyers"}/${objectPath}`, { method: "POST", headers: { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "content-type": flyer.type, "x-upsert": "false" }, body: await flyer.arrayBuffer() });
      if (!upload.ok) throw httpError("Flyer upload failed.", 502);
      imageUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_FLYER_BUCKET || "event-flyers"}/${objectPath}`;
    }
    const rows = await database(env, "/rest/v1/submissions?select=id,status", { method: "POST", prefer: "return=representation", body: { id, ...input, image_url: imageUrl, status: "pending" } });
    return json({ submission: rows[0], message: "Your event is pending review." }, 201);
  }
  if (url.pathname === "/api/promotion-requests" && request.method === "POST") {
    await limit(request, env);
    const rows = await database(env, "/rest/v1/promotion_requests?select=id,status", { method: "POST", prefer: "return=representation", body: { ...promotionInput(await bodyJson(request)), status: "pending" } });
    return json({ request: rows[0], message: "Your free launch spotlight request is in. We’ll follow up to confirm timing and placement." }, 201);
  }
  return json({ error: "API route not found." }, 404);
}

async function analytics(env) {
  const [events, clicks, views] = await Promise.all([
    database(env, `/rest/v1/events?${queryString({ select: "id,title,slug", status: "eq.approved", order: "title.asc" })}`),
    database(env, "/rest/v1/outbound_clicks?select=event_id,source"),
    database(env, "/rest/v1/event_views?select=id,event_id,visitor_id,source")
  ]);
  const rows = new Map(events.map((event) => [event.id, { ...event, views: 0, visitors: new Set(), ticketClicks: 0, traffic: {} }]));
  for (const view of views) {
    const item = rows.get(view.event_id); if (!item) continue;
    item.views += 1; item.visitors.add(view.visitor_id || `anonymous-${view.id}`); item.traffic[view.source] = (item.traffic[view.source] || 0) + 1;
  }
  for (const click of clicks) { const item = rows.get(click.event_id); if (item) item.ticketClicks += 1; }
  return [...rows.values()].map((item) => ({ ...item, visitors: undefined, uniqueVisitors: item.visitors.size, clickThroughRate: item.views ? Math.round(item.ticketClicks / item.views * 1000) / 10 : 0, traffic: Object.entries(item.traffic).map(([source, count]) => ({ source, views: count, percentage: Math.round(count / item.views * 100) })).sort((a, b) => b.views - a.views) })).sort((a, b) => b.views - a.views || b.ticketClicks - a.ticketClicks);
}

async function tractionSummary(env) {
  const now = new Date().toISOString();
  const [events, clicks, views, claims, submissions, promotions] = await Promise.all([
    database(env, `/rest/v1/events?${queryString({ select: "id", status: "eq.approved", starts_at: `gte.${now}` })}`),
    database(env, "/rest/v1/outbound_clicks?select=id"),
    database(env, "/rest/v1/event_views?select=id,visitor_id"),
    database(env, "/rest/v1/event_claims?select=id,contact_email&status=neq.rejected"),
    database(env, "/rest/v1/submissions?select=id,contact_email&status=neq.rejected"),
    database(env, "/rest/v1/promotion_requests?select=id&status=neq.rejected")
  ]);
  const organizerContacts = new Set([
    ...claims.map((item) => item.contact_email?.toLowerCase()).filter(Boolean),
    ...submissions.map((item) => item.contact_email?.toLowerCase()).filter(Boolean)
  ]);
  const uniqueVisitors = new Set(views.map((view) => view.visitor_id || `anonymous-${view.id}`));
  return {
    publishedEvents: events.length,
    eventViews: views.length,
    uniqueVisitors: uniqueVisitors.size,
    ticketClicks: clicks.length,
    organizerActivations: organizerContacts.size,
    spotlightRequests: promotions.length
  };
}

async function handleAdminApi(request, env, url, segments) {
  if (!(await authorized(request, env))) return json({ error: env.ADMIN_TOKEN ? "Admin token is invalid." : "Admin access is not configured." }, env.ADMIN_TOKEN ? 401 : 503);
  if (url.pathname === "/api/admin/submissions" && request.method === "GET") {
    const status = clean(url.searchParams.get("status"), 20) || "pending";
    return json({ submissions: await database(env, `/rest/v1/submissions?${queryString({ select: "*,cities(id,name,short_code),event_categories(id,name,slug)", status: `eq.${status}`, order: "created_at.asc" })}`) });
  }
  if (segments[2] === "submissions" && segments[3] && request.method === "PUT") {
    const rows = await database(env, `/rest/v1/submissions?${queryString({ id: `eq.${segments[3]}`, status: "eq.pending", select: "*" })}`, { method: "PATCH", prefer: "return=representation", body: submissionInput(await bodyJson(request)) });
    if (!rows[0]) throw httpError("Pending submission not found.", 404);
    return json({ submission: rows[0] });
  }
  if (segments[2] === "submissions" && segments[3] && segments[4] === "approve" && request.method === "POST") {
    const eventId = await database(env, "/rest/v1/rpc/approve_event_submission", { method: "POST", body: { p_submission_id: segments[3] } });
    return json({ eventId });
  }
  if (segments[2] === "submissions" && segments[3] && segments[4] === "reject" && request.method === "POST") {
    const input = await bodyJson(request);
    const rows = await database(env, `/rest/v1/submissions?${queryString({ id: `eq.${segments[3]}`, status: "eq.pending", select: "*" })}`, { method: "PATCH", prefer: "return=representation", body: { status: "rejected", review_notes: clean(input.reviewNotes, 2500) || null, reviewed_at: new Date().toISOString() } });
    return json({ submission: rows[0] });
  }
  if (url.pathname === "/api/admin/analytics" && request.method === "GET") return json({ events: await analytics(env) });
  if (url.pathname === "/api/admin/traction" && request.method === "GET") return json({ summary: await tractionSummary(env) });
  if (url.pathname === "/api/admin/claims" && request.method === "GET") {
    const status = clean(url.searchParams.get("status"), 20) || "pending";
    return json({ claims: await database(env, `/rest/v1/event_claims?${queryString({ select: "*,events(id,slug,title,organizers(name))", status: `eq.${status}`, order: "created_at.asc" })}`) });
  }
  if (segments[2] === "claims" && segments[3] && segments[4] && request.method === "POST") {
    const input = await bodyJson(request);
    await database(env, "/rest/v1/rpc/moderate_event_claim", { method: "POST", body: { p_claim_id: segments[3], p_status: segments[4], p_review_notes: clean(input.reviewNotes, 2500) || null } });
    return json({ claim: { id: segments[3], status: segments[4] } });
  }
  if (url.pathname === "/api/admin/promotion-requests" && request.method === "GET") {
    const status = clean(url.searchParams.get("status"), 20) || "pending";
    return json({ requests: await database(env, `/rest/v1/promotion_requests?${queryString({ select: "*,events(id,slug,title)", status: `eq.${status}`, order: "created_at.asc" })}`) });
  }
  if (segments[2] === "promotion-requests" && segments[3] && request.method === "PUT") {
    const input = await bodyJson(request);
    if (!["pending", "contacted", "approved", "rejected", "completed"].includes(input.status)) throw httpError("Invalid promotion status.");
    const rows = await database(env, `/rest/v1/promotion_requests?${queryString({ id: `eq.${segments[3]}`, select: "*" })}`, { method: "PATCH", prefer: "return=representation", body: { status: input.status, review_notes: clean(input.reviewNotes, 2500) || null, updated_at: new Date().toISOString() } });
    return json({ request: rows[0] });
  }
  return json({ error: "Admin route not found." }, 404);
}

async function fetchAsset(request, env, url, pathname) {
  if (env.ASSETS) return env.ASSETS.fetch(new Request(new URL(pathname, url), request));
  const upstream = await fetch(`${FALLBACK_ASSET_ORIGIN}${pathname}`);
  if (!upstream.ok) return upstream;
  const headers = new Headers(upstream.headers);
  const extension = pathname.split(".").pop();
  const contentType = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8", png: "image/png", svg: "image/svg+xml", webmanifest: "application/manifest+json; charset=utf-8" }[extension];
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=300");
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function eventPage(request, env, url, slug) {
  const row = await getEventRow(env, clean(slug, 220));
  if (!row) return new Response("Event not found.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const event = publicEvent(row);
  const templateResponse = await fetchAsset(request, env, url, "/event");
  if (!templateResponse.ok) return templateResponse;
  const canonicalUrl = `${url.origin}/events/${encodeURIComponent(event.slug)}`;
  const description = clean(event.summary || event.description, 240).replace(/\s+/g, " ");
  const requestedSource = clean(url.searchParams.get("source"), 40).toLowerCase();
  const source = SOURCES.has(requestedSource) ? requestedSource : "direct";
  const ticketQuery = source ? `?source=${encodeURIComponent(source)}` : "";
  const media = event.imageUrl
    ? `<img class="event-flyer" src="${escapeMarkup(event.imageUrl)}" alt="Event flyer for ${escapeMarkup(event.title)}">`
    : '<div class="event-flyer-placeholder" aria-hidden="true">H</div>';
  const ticketButton = event.hasTickets
    ? `<a class="primary" href="/go/${encodeURIComponent(event.slug)}${ticketQuery}" target="_blank" rel="noopener">View tickets ↗</a>`
    : '<button class="primary disabled" type="button" disabled>Tickets not listed</button>';
  const replacements = {
    "__EVENT_META_DESCRIPTION__": escapeMarkup(description),
    "__EVENT_META_TITLE__": escapeMarkup(`${event.title} — Habesha Nights`),
    "__EVENT_URL__": escapeMarkup(canonicalUrl),
    "__EVENT_IMAGE_URL__": escapeMarkup(event.imageUrl || `${url.origin}/og.png`),
    "__EVENT_JSON_LD__": eventJsonLd(event, canonicalUrl, url.origin),
    "__EVENT_SLUG_ATTR__": escapeMarkup(event.slug),
    "__EVENT_TITLE_ATTR__": escapeMarkup(event.title),
    "__EVENT_MEDIA__": media,
    "__EVENT_CITY__": escapeMarkup(event.city),
    "__EVENT_CATEGORY__": escapeMarkup(event.category),
    "__EVENT_TITLE__": escapeMarkup(event.title),
    "__EVENT_DATE__": escapeMarkup(formatEventDate(event.startsAt)),
    "__EVENT_PRICE__": escapeMarkup(event.priceLabel || "See organizer"),
    "__EVENT_DESCRIPTION__": escapeMarkup(event.description),
    "__EVENT_VENUE__": escapeMarkup(event.venue?.name || "Venue to be announced"),
    "__EVENT_ADDRESS__": escapeMarkup(event.venue?.address || event.cityName || event.city),
    "__EVENT_ORGANIZER__": escapeMarkup(event.organizer?.name || "Independent organizer"),
    "__EVENT_TICKET_BUTTON__": ticketButton
  };
  let html = await templateResponse.text();
  for (const [token, value] of Object.entries(replacements)) html = html.replaceAll(token, value);
  const headers = new Headers(templateResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=300");
  return new Response(html, { status: 200, headers });
}

async function serveAsset(request, env, url) {
  const target = url.pathname === "/" ? "/index.html" : url.pathname === "/admin" ? "/admin/index.html" : url.pathname;
  if (target === "/event" || target === "/event.html") return new Response("Not found.", { status: 404 });
  let response = await fetchAsset(request, env, url, target);
  if (response.status === 404 && !target.includes(".")) response = await fetchAsset(request, env, url, "/index.html");
  if (target === "/index.html" && response.ok) {
    const html = (await response.text()).replaceAll("__SITE_ORIGIN__", url.origin);
    return new Response(html, { status: response.status, headers: { ...Object.fromEntries(response.headers), "content-type": "text/html; charset=utf-8" } });
  }
  return response;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/health") return json({ status: "ok", database: env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? "configured" : "not-configured" });
  const searchFile = await searchFiles(url, env);
  if (searchFile) return searchFile;
  if (segments[0] === "api" && segments[1] === "admin") return handleAdminApi(request, env, url, segments);
  if (segments[0] === "api") return handlePublicApi(request, env, url, segments);
  if (segments[0] === "go" && segments[1] && request.method === "GET") {
    const event = await getEventRow(env, clean(segments[1], 220), "id,ticket_url");
    if (!event?.ticket_url) return new Response("Ticket link not found.", { status: 404 });
    await database(env, "/rest/v1/outbound_clicks", { method: "POST", prefer: "return=minimal", body: { event_id: event.id, destination_url: event.ticket_url, ...(await metadata(env, request, url.searchParams.get("source"), request.headers.get("referer"))) } });
    return Response.redirect(event.ticket_url, 302);
  }
  if (segments[0] === "events" && segments[1] && !segments[2] && request.method === "GET") return eventPage(request, env, url, segments[1]);
  return serveAsset(request, env, url);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      if ((error.status || 500) >= 500) console.error(error);
      return json({ error: (error.status || 500) < 500 ? error.message : "Something went wrong." }, error.status || 500);
    }
  }
};
