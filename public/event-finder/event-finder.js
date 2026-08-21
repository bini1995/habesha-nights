const BOROUGH_LABELS = Object.freeze({
  BRONX: "Bronx",
  BROOKLYN: "Brooklyn",
  MANHATTAN: "Manhattan",
  QUEENS: "Queens",
  STATEN_ISLAND: "Staten Island"
});

let catalogEvents = [];
let searchTimer = null;
let currentView = "browse";
let savedEventIds = new Set();
let preferences = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nycMidnightIso(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day);
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
    instant += desiredUtc - Date.UTC(
      displayed.year, displayed.month - 1, displayed.day,
      displayed.hour, displayed.minute, displayed.second
    );
  }

  return new Date(instant).toISOString();
}

function buildCatalogQuery(filters) {
  const query = new URLSearchParams({ limit: "5000" });
  if (filters.borough) query.set("borough", filters.borough);
  if (filters.category) query.set("category", filters.category);

  if (filters.date) {
    const [year, month, day] = filters.date.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString().slice(0, 10);
    query.set("startsAfter", nycMidnightIso(filters.date));
    query.set("startsBefore", new Date(
      new Date(nycMidnightIso(nextDate)).getTime() - 1
    ).toISOString());
  }

  return query.toString();
}

function matchesSearch(event, search) {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return true;
  return [event.title, event.description, event.venue?.name, event.venue?.address, ...(event.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(term);
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatUpdated(value) {
  if (!value) return "Catalog has not been refreshed yet";
  return `Last updated ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value))}`;
}

function summarizeQualityHistory(entries) {
  if (!entries.length) return "No refresh trend recorded yet.";
  if (entries.length === 1) {
    return `Trend started: ${entries[0].normalizedCount} normalized events across ${entries[0].boroughCoverage}/5 boroughs.`;
  }
  const newest = entries[0];
  const oldest = entries.at(-1);
  const change = newest.normalizedCount - oldest.normalizedCount;
  const direction = change === 0 ? "stable" : change > 0 ? `up ${change}` : `down ${Math.abs(change)}`;
  return `Last ${entries.length} refreshes: normalized event count ${direction}; latest rejected ${newest.rejectedCount}, duplicates ${newest.duplicateCount}.`;
}

function currentFilters() {
  return {
    search: document.getElementById("search").value,
    borough: document.getElementById("borough").value,
    category: document.getElementById("category").value,
    date: document.getElementById("date").value
  };
}

function renderEvents() {
  const filters = currentFilters();
  const events = currentView === "browse"
    ? catalogEvents.filter((event) => matchesSearch(event, filters.search))
    : catalogEvents;
  const grid = document.getElementById("event-grid");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("result-count");
  document.getElementById("calendar-all-link").hidden = currentView !== "saved" || events.length === 0;

  count.textContent = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  document.querySelector("#empty-state strong").textContent = {
    browse: "No events match these filters.",
    recommended: "No recommendations are available yet.",
    saved: "You haven’t saved any events yet."
  }[currentView];
  document.querySelector("#empty-state span").textContent = {
    browse: "Try another borough, category, date, or search term.",
    recommended: "Update your preferences or refresh the event catalog.",
    saved: "Discover an event and choose Save event to keep a snapshot here."
  }[currentView];
  document.getElementById("empty-clear-button").hidden = currentView !== "browse";
  empty.hidden = events.length !== 0;
  grid.hidden = events.length === 0;

  grid.innerHTML = events.map((event) => {
    const borough = BOROUGH_LABELS[event.venue.borough] || event.venue.borough;
    const location = [event.venue.name, borough].filter(Boolean).join(" · ");
    const tags = (event.tags || []).slice(0, 3);
    return `
      <article class="event-card">
        <div class="event-meta">
          <span class="category-pill">${escapeHtml(event.category.replaceAll("_", " "))}</span>
          <span>${escapeHtml(formatEventDate(event.startsAt))}</span>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <p class="location">${escapeHtml(location)}</p>
        ${event.description ? `<p class="description">${escapeHtml(event.description)}</p>` : ""}
        ${event.reasons?.length ? `<ul class="recommendation-reasons">${event.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
        ${tags.length ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <details>
          <summary>Event details</summary>
          <dl>
            <div><dt>When</dt><dd>${escapeHtml(formatEventDate(event.startsAt))}${event.endsAt ? ` – ${escapeHtml(formatEventDate(event.endsAt))}` : ""}</dd></div>
            <div><dt>Where</dt><dd>${escapeHtml(location)}${event.venue.address && event.venue.address !== event.venue.name ? `<br>${escapeHtml(event.venue.address)}` : ""}</dd></div>
          </dl>
        </details>
        <div class="card-actions">
          <a class="official-link" href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">
            Official listing <span aria-hidden="true">↗</span>
            <span class="sr-only"> for ${escapeHtml(event.title)} (opens in a new tab)</span>
          </a>
          <button class="save-button ${savedEventIds.has(event.id) ? "saved" : ""}" type="button" data-event-id="${escapeHtml(event.id)}">
            ${savedEventIds.has(event.id) ? "Remove saved" : "Save event"}
          </button>
          ${currentView === "saved" ? `
            <a class="calendar-link" href="/api/event-finder/saved-events/${encodeURIComponent(event.id)}/calendar.ics">
              Add to calendar (.ics)<span class="sr-only"> for ${escapeHtml(event.title)}</span>
            </a>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "The request could not be completed.");
  return data;
}

async function loadSavedIds() {
  const data = await requestJson("/api/event-finder/saved-events");
  savedEventIds = new Set(data.savedEvents.map((item) => item.event.id));
  document.getElementById("saved-count").textContent = savedEventIds.size;
  return data.savedEvents;
}

async function loadEvents() {
  const loading = document.getElementById("loading-state");
  const error = document.getElementById("error-state");
  const grid = document.getElementById("event-grid");
  const empty = document.getElementById("empty-state");
  loading.hidden = false;
  error.hidden = true;
  grid.hidden = true;
  empty.hidden = true;

  try {
    const response = await fetch(`/api/event-finder/events?${buildCatalogQuery(currentFilters())}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The event catalog is unavailable.");
    catalogEvents = data.events || [];
    document.getElementById("updated-status").textContent = formatUpdated(data.updatedAt);
    renderEvents();
  } catch (requestError) {
    error.hidden = false;
    document.getElementById("error-message").textContent = requestError.message;
    document.getElementById("result-count").textContent = "";
  } finally {
    loading.hidden = true;
  }
}

async function loadRecommended() {
  const data = await requestJson("/api/event-finder/recommendations?limit=100");
  catalogEvents = data.recommendations.map((item) => ({
    ...item.event,
    reasons: item.reasons
  }));
  document.getElementById("updated-status").textContent = formatUpdated(data.updatedAt);
  renderEvents();
}

async function loadSaved() {
  const savedEvents = await loadSavedIds();
  catalogEvents = savedEvents.map((item) => item.event);
  renderEvents();
}

async function loadCurrentView() {
  const loading = document.getElementById("loading-state");
  const error = document.getElementById("error-state");
  loading.hidden = false;
  error.hidden = true;
  try {
    if (currentView === "recommended") await loadRecommended();
    else if (currentView === "saved") await loadSaved();
    else await loadEvents();
  } catch (viewError) {
    error.hidden = false;
    document.getElementById("error-message").textContent = viewError.message;
  } finally {
    loading.hidden = true;
  }
}

function switchView(view) {
  currentView = view;
  for (const tab of document.querySelectorAll("[role=tab]")) {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const filters = document.getElementById("filter-form");
  filters.hidden = view !== "browse";
  document.getElementById("results-heading").textContent = {
    browse: "Upcoming events",
    recommended: "Recommended for you",
    saved: "Your saved events"
  }[view];
  loadCurrentView();
}

async function toggleSaved(eventId) {
  if (savedEventIds.has(eventId)) {
    await requestJson(`/api/event-finder/saved-events/${encodeURIComponent(eventId)}`, {
      method: "DELETE"
    });
  } else {
    await requestJson("/api/event-finder/saved-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId })
    });
  }
  await loadSavedIds();
  if (currentView === "saved" || currentView === "recommended") await loadCurrentView();
  else renderEvents();
}

async function loadPreferences() {
  const data = await requestJson("/api/event-finder/preferences");
  preferences = data.preferences;
  const form = document.getElementById("preferences-form");
  for (const input of form.querySelectorAll("input[type=checkbox]")) {
    if (input.name === "preferredBoroughs") input.checked = preferences.preferredBoroughs.includes(input.value);
    if (input.name === "preferredCategories") input.checked = preferences.preferredCategories.includes(input.value);
  }
  document.getElementById("preference-keywords").value = preferences.keywords.join(", ");
  document.getElementById("hide-past-events").checked = preferences.hidePastEvents;
}

async function savePreferences(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("preferences-message");
  message.textContent = "";
  const values = new FormData(form);
  try {
    const data = await requestJson("/api/event-finder/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferredBoroughs: values.getAll("preferredBoroughs"),
        preferredCategories: values.getAll("preferredCategories"),
        keywords: String(values.get("keywords") || "").split(",").map((item) => item.trim()).filter(Boolean),
        hidePastEvents: values.get("hidePastEvents") === "on"
      })
    });
    preferences = data.preferences;
    document.getElementById("preferences-dialog").close();
    if (currentView === "recommended") await loadCurrentView();
  } catch (saveError) {
    message.textContent = saveError.message;
  }
}

async function loadQuality() {
  const { quality } = await requestJson("/api/event-finder/quality");
  const container = document.getElementById("quality-summary");
  if (!quality.catalogUpdatedAt) {
    container.innerHTML = "<span>No ingestion report yet</span>";
    return;
  }
  const rejected = Object.values(quality.sources || {})
    .reduce((total, source) => total + (source.rejected || 0), 0);
  container.innerHTML = `
    <span>${escapeHtml(quality.freshness.toLowerCase())} catalog</span>
    <span>${quality.catalogEvents} normalized events</span>
    <span>${rejected} incomplete source rows skipped</span>
    <span>Coverage: ${Object.keys(quality.byBorough || {}).length}/5 boroughs</span>
  `;
}

async function loadQualityHistory() {
  const data = await requestJson("/api/event-finder/quality/history?limit=12");
  document.getElementById("quality-trend").textContent = summarizeQualityHistory(data.entries);
}

async function refreshCatalog() {
  const button = document.getElementById("refresh-button");
  button.disabled = true;
  button.classList.add("refreshing");
  button.lastChild.textContent = " Refreshing…";

  try {
    const response = await fetch("/api/event-finder/refresh", { method: "POST" });
    if (!response.ok) throw new Error("The refresh could not be completed.");
    await loadCurrentView();
    await Promise.all([loadQuality(), loadQualityHistory()]);
  } catch (refreshError) {
    document.getElementById("loading-state").hidden = true;
    document.getElementById("error-state").hidden = false;
    document.getElementById("error-message").textContent = refreshError.message;
  } finally {
    button.disabled = false;
    button.classList.remove("refreshing");
    button.lastChild.textContent = " Refresh events";
  }
}

function clearFilters() {
  document.getElementById("filter-form").reset();
  loadEvents();
  document.getElementById("search").focus();
}

function initialize() {
  document.getElementById("filter-form").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("filter-form").addEventListener("change", loadEvents);
  document.getElementById("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderEvents, 150);
  });
  document.getElementById("refresh-button").addEventListener("click", refreshCatalog);
  document.getElementById("retry-button").addEventListener("click", loadCurrentView);
  document.getElementById("clear-button").addEventListener("click", clearFilters);
  document.getElementById("empty-clear-button").addEventListener("click", clearFilters);
  document.getElementById("event-grid").addEventListener("click", (event) => {
    const button = event.target.closest(".save-button");
    if (button) toggleSaved(button.dataset.eventId).catch((error) => {
      document.getElementById("error-state").hidden = false;
      document.getElementById("error-message").textContent = error.message;
    });
  });
  for (const tab of document.querySelectorAll("[role=tab]")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll("[role=tab]")];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      switchView(next.dataset.view);
      next.focus();
    });
  }
  const dialog = document.getElementById("preferences-dialog");
  document.getElementById("preferences-button").addEventListener("click", async () => {
    try {
      await loadPreferences();
      dialog.showModal();
    } catch (error) {
      document.getElementById("error-state").hidden = false;
      document.getElementById("error-message").textContent = error.message;
    }
  });
  document.getElementById("close-preferences").addEventListener("click", () => dialog.close());
  document.getElementById("cancel-preferences").addEventListener("click", () => dialog.close());
  document.getElementById("preferences-form").addEventListener("submit", savePreferences);
  Promise.all([loadSavedIds(), loadQuality(), loadQualityHistory()])
    .then(loadEvents)
    .catch((error) => {
      document.getElementById("loading-state").hidden = true;
      document.getElementById("error-state").hidden = false;
      document.getElementById("error-message").textContent = error.message;
    });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initialize);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildCatalogQuery,
    escapeHtml,
    formatUpdated,
    matchesSearch,
    nycMidnightIso,
    requestJson,
    summarizeQualityHistory
  };
}
