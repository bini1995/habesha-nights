const state = { city: "", category: "", query: "" };
const eventGrid = document.querySelector("#event-grid");
const eventState = document.querySelector("#event-state");
const count = document.querySelector("#result-count");
const eventDialog = document.querySelector("#event-dialog");
const submitDialog = document.querySelector("#submit-dialog");
const claimDialog = document.querySelector("#claim-dialog");
const promotionDialog = document.querySelector("#promotion-dialog");
const launchParams = new URLSearchParams(window.location.search);
const knownSources = new Set(["instagram", "tiktok", "google", "organizer", "whatsapp", "direct", "other"]);
const source = knownSources.has((launchParams.get("source") || launchParams.get("utm_source") || "").toLowerCase())
  ? (launchParams.get("source") || launchParams.get("utm_source")).toLowerCase()
  : "";
const visitorId = (() => {
  try {
    const existing = localStorage.getItem("hn_visitor_id");
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem("hn_visitor_id", created);
    return created;
  } catch { return ""; }
})();

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const formatDate = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(value));
const api = async (path, options) => {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};

function eventCard(event) {
  const image = event.imageUrl ? `<img class="event-image" src="${escapeHtml(event.imageUrl)}" alt="" loading="lazy">` : "";
  return `<article class="event-card ${event.featured ? "featured" : ""}">${image}
    <div class="card-top"><span class="pill">${escapeHtml(event.city)} · ${escapeHtml(event.category)}</span>${event.promoted ? '<span class="promoted">Promoted</span>' : ""}</div>
    <p class="date">${formatDate(event.startsAt)}</p><h3>${escapeHtml(event.title)}</h3><p class="summary">${escapeHtml(event.summary)}</p>
    <p class="venue">${escapeHtml(event.venue?.name || "Venue coming soon")} · ${escapeHtml(event.venue?.neighborhood || event.city)}</p>
    <div class="card-bottom"><strong>${escapeHtml(event.priceLabel || "See details")}</strong><button type="button" data-event="${escapeHtml(event.slug)}">View event <span>↗</span></button></div>
  </article>`;
}

function updateFeatured(event) {
  if (!event) return;
  const date = new Date(event.startsAt);
  document.querySelector("#featured-card").innerHTML = `<p>${event.promoted ? "Promoted event" : "Editor’s pick"}</p><div class="hero-date"><span>${date.toLocaleString("en-US", { month: "short" }).toUpperCase()}</span><strong>${date.getDate()}</strong></div><div><span class="pill">${escapeHtml(event.city)} · ${escapeHtml(event.category)}</span><h2>${escapeHtml(event.title)}</h2><p>${escapeHtml(event.venue?.neighborhood || event.venue?.name || event.city)}</p></div>`;
}

async function loadEvents() {
  eventState.hidden = false;
  eventGrid.innerHTML = "";
  const params = new URLSearchParams(Object.entries(state).filter(([, value]) => value));
  try {
    const { events } = await api(`/api/events?${params}`);
    count.textContent = `${events.length} event${events.length === 1 ? "" : "s"} found`;
    eventState.hidden = Boolean(events.length);
    eventState.textContent = events.length ? "" : "No approved events match yet. Be the first to submit one.";
    eventGrid.innerHTML = events.map(eventCard).join("");
    if (!state.city && !state.category && !state.query) updateFeatured(events[0]);
  } catch {
    eventState.textContent = "The live catalog isn’t connected yet. Check back soon or submit an event for review.";
    count.textContent = "Catalog setup in progress";
  }
}

async function loadReferenceData() {
  try {
    const { cities, categories } = await api("/api/reference-data");
    document.querySelector("#submission-city").insertAdjacentHTML("beforeend", cities.map((city) => `<option value="${escapeHtml(city.id)}">${escapeHtml(city.name)}</option>`).join(""));
    document.querySelector("#submission-category").insertAdjacentHTML("beforeend", categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join(""));
    document.querySelector("#category-filter").insertAdjacentHTML("beforeend", categories.map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join(""));
  } catch {
    document.querySelector("#submission-status").textContent = "Event submissions will open as soon as the database connection is complete.";
  }
}

document.querySelectorAll("[data-city]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-city]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.city = button.dataset.city;
  loadEvents();
}));
document.querySelector("[name=category]").addEventListener("change", (event) => { state.category = event.target.value; loadEvents(); });
let searchTimer;
document.querySelector("[name=query]").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = event.target.value; loadEvents(); }, 220);
});

eventGrid.addEventListener("click", async (click) => {
  const button = click.target.closest("[data-event]");
  if (!button) return;
  try {
    const { event } = await api(`/api/events/${encodeURIComponent(button.dataset.event)}`);
    api(`/api/events/${encodeURIComponent(event.slug)}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitor_id: visitorId, source, referrer: document.referrer }) }).catch(() => {});
    const tracking = source ? `?source=${encodeURIComponent(source)}` : "";
    const tickets = event.hasTickets ? `<a class="primary" href="/go/${encodeURIComponent(event.slug)}${tracking}" target="_blank" rel="noopener">View tickets ↗</a>` : '<button class="primary disabled" type="button" disabled>Tickets not listed</button>';
    const image = event.imageUrl ? `<img class="detail-image" src="${escapeHtml(event.imageUrl)}" alt="Event flyer for ${escapeHtml(event.title)}">` : "";
    document.querySelector("#event-detail").innerHTML = `${image}<p class="eyebrow dark">${escapeHtml(event.city)} · ${escapeHtml(event.category)}</p><h2>${escapeHtml(event.title)}</h2><p class="dialog-date">${formatDate(event.startsAt)} · ${escapeHtml(event.priceLabel || "See organizer")}</p><p>${escapeHtml(event.description)}</p><div class="detail-box"><strong>${escapeHtml(event.venue?.name || "Venue coming soon")}</strong><span>${escapeHtml(event.venue?.address || event.city)}</span></div><p class="organizer">Presented by <strong>${escapeHtml(event.organizer?.name || "Independent organizer")}</strong></p><div class="detail-actions">${tickets}<button class="claim-button" type="button" data-claim-event="${escapeHtml(event.slug)}" data-event-title="${escapeHtml(event.title)}">Claim this event</button></div>`;
    eventDialog.showModal();
  } catch { eventState.textContent = "That event could not be opened."; }
});

document.querySelectorAll("dialog .close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("[data-open-submit]").forEach((button) => button.addEventListener("click", () => submitDialog.showModal()));
document.querySelectorAll("[data-open-promotion]").forEach((button) => button.addEventListener("click", () => promotionDialog.showModal()));
document.querySelector("#event-detail").addEventListener("click", (click) => {
  const button = click.target.closest("[data-claim-event]");
  if (!button) return;
  eventDialog.close();
  document.querySelector("#claim-event-slug").value = button.dataset.claimEvent;
  document.querySelector("#claim-event-name").textContent = button.dataset.eventTitle;
  claimDialog.showModal();
});
document.querySelector("#submission-form").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const form = submit.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const status = document.querySelector("#submission-status");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Sending your event for review…";
  try {
    const result = await api("/api/submissions", { method: "POST", body: new FormData(form) });
    form.reset();
    status.classList.add("success");
    status.textContent = `${result.message} Save this reference: ${result.submission.id.slice(0, 8).toUpperCase()}.`;
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  } finally { button.disabled = false; }
});

document.querySelector("#claim-form").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const form = submit.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const status = document.querySelector("#claim-status");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Sending claim for verification…";
  try {
    const slug = document.querySelector("#claim-event-slug").value;
    const body = Object.fromEntries(new FormData(form));
    const result = await api(`/api/events/${encodeURIComponent(slug)}/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    form.reset();
    status.classList.add("success");
    status.textContent = result.message;
  } catch (error) { status.classList.add("error"); status.textContent = error.message; }
  finally { button.disabled = false; }
});

document.querySelector("#promotion-form").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const form = submit.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const status = document.querySelector("#promotion-status");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Sending your request…";
  try {
    const body = Object.fromEntries(new FormData(form));
    const result = await api("/api/promotion-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    form.reset();
    status.classList.add("success");
    status.textContent = result.message;
  } catch (error) { status.classList.add("error"); status.textContent = error.message; }
  finally { button.disabled = false; }
});

api("/api/businesses").then(({ businesses }) => {
  document.querySelector("#business-grid").innerHTML = businesses.length
    ? businesses.map((business) => `<article><p class="eyebrow dark">${escapeHtml(business.category)} · ${escapeHtml(business.city)}</p><h3>${escapeHtml(business.name)}</h3><p>${escapeHtml(business.description)}</p><span>${escapeHtml(business.neighborhood || business.city)}${business.promoted ? " · Featured partner" : ""}</span></article>`).join("")
    : '<div class="empty-businesses">Approved community businesses will appear here.</div>';
}).catch(() => {});

loadReferenceData();
loadEvents();
