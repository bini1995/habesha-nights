const BOROUGH_LABELS = Object.freeze({
  BRONX: "Bronx",
  BROOKLYN: "Brooklyn",
  MANHATTAN: "Manhattan",
  QUEENS: "Queens",
  STATEN_ISLAND: "Staten Island"
});

let catalogEvents = [];
let searchTimer = null;

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
  const events = catalogEvents.filter((event) => matchesSearch(event, filters.search));
  const grid = document.getElementById("event-grid");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("result-count");

  count.textContent = `${events.length} ${events.length === 1 ? "event" : "events"}`;
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
        ${tags.length ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <details>
          <summary>Event details</summary>
          <dl>
            <div><dt>When</dt><dd>${escapeHtml(formatEventDate(event.startsAt))}${event.endsAt ? ` – ${escapeHtml(formatEventDate(event.endsAt))}` : ""}</dd></div>
            <div><dt>Where</dt><dd>${escapeHtml(location)}${event.venue.address && event.venue.address !== event.venue.name ? `<br>${escapeHtml(event.venue.address)}` : ""}</dd></div>
          </dl>
        </details>
        <a class="official-link" href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">
          View official listing <span aria-hidden="true">↗</span>
          <span class="sr-only"> for ${escapeHtml(event.title)} (opens in a new tab)</span>
        </a>
      </article>
    `;
  }).join("");
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

async function refreshCatalog() {
  const button = document.getElementById("refresh-button");
  button.disabled = true;
  button.classList.add("refreshing");
  button.lastChild.textContent = " Refreshing…";

  try {
    const response = await fetch("/api/event-finder/refresh", { method: "POST" });
    if (!response.ok) throw new Error("The refresh could not be completed.");
    await loadEvents();
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
  document.getElementById("retry-button").addEventListener("click", loadEvents);
  document.getElementById("clear-button").addEventListener("click", clearFilters);
  document.getElementById("empty-clear-button").addEventListener("click", clearFilters);
  loadEvents();
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
    nycMidnightIso
  };
}
