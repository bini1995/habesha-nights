let adminToken = "";
const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const list = document.querySelector("#submission-list");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const dateTimeLocal = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const formatDate = (value) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

async function adminApi(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function submissionCard(item) {
  return `<article class="submission-card" data-id="${escapeHtml(item.id)}">
    <div class="submission-heading"><div><span class="city">${escapeHtml(item.cities?.short_code || "—")} · ${escapeHtml(item.event_categories?.name || "Uncategorized")}</span><h3>${escapeHtml(item.title)}</h3><p>${formatDate(item.starts_at)} · ${escapeHtml(item.venue_name)}</p></div>${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="Submitted flyer">` : ""}</div>
    <p class="description">${escapeHtml(item.description)}</p>
    <dl><div><dt>Organizer</dt><dd>${escapeHtml(item.organizer_name)}</dd></div><div><dt>Contact</dt><dd>${escapeHtml(item.contact_name)} · ${escapeHtml(item.contact_email)}</dd></div><div><dt>Tickets</dt><dd>${escapeHtml(item.ticket_price_label || "Not provided")} ${item.ticket_url ? `· <a href="${escapeHtml(item.ticket_url)}" target="_blank" rel="noopener">Open link ↗</a>` : ""}</dd></div></dl>
    <div class="actions"><button data-action="approve" type="button">Approve</button><button class="reject" data-action="reject" type="button">Reject</button><button class="secondary" data-action="edit" type="button">Edit</button></div>
    <form class="edit-form" hidden>
      <input name="city_id" type="hidden" value="${escapeHtml(item.city_id)}"><input name="category_id" type="hidden" value="${escapeHtml(item.category_id)}">
      <label>Event name<input name="event_name" value="${escapeHtml(item.title)}" required></label><label>Start<input name="starts_at" type="datetime-local" value="${dateTimeLocal(item.starts_at)}" required></label><label>End<input name="ends_at" type="datetime-local" value="${dateTimeLocal(item.ends_at)}"></label>
      <label class="wide">Description<textarea name="description" required>${escapeHtml(item.description)}</textarea></label><label>Venue<input name="venue_name" value="${escapeHtml(item.venue_name)}" required></label><label>Neighborhood<input name="venue_neighborhood" value="${escapeHtml(item.venue_neighborhood || "")}"></label><label class="wide">Address<input name="venue_address" value="${escapeHtml(item.venue_address)}" required></label>
      <label>Price<input name="ticket_price_label" value="${escapeHtml(item.ticket_price_label || "")}"></label><label>Ticket URL<input name="ticket_url" type="url" value="${escapeHtml(item.ticket_url || "")}"></label><label>Instagram<input name="instagram" value="${escapeHtml(item.instagram || "")}"></label><label>Organizer<input name="organizer_name" value="${escapeHtml(item.organizer_name)}" required></label><label>Contact<input name="contact_name" value="${escapeHtml(item.contact_name)}" required></label><label>Email<input name="contact_email" type="email" value="${escapeHtml(item.contact_email)}" required></label><label>Phone<input name="contact_phone" value="${escapeHtml(item.contact_phone || "")}"></label>
      <div class="wide actions"><button type="submit">Save changes</button><button class="secondary" data-action="cancel" type="button">Cancel</button></div>
    </form><p class="card-status" role="status"></p>
  </article>`;
}

function claimCard(item) {
  return `<article class="submission-card compact" data-id="${escapeHtml(item.id)}">
    <span class="city">Ownership request</span><h3>${escapeHtml(item.events?.title || "Event")}</h3>
    <p>${escapeHtml(item.contact_name)} · ${escapeHtml(item.contact_email)}${item.instagram ? ` · ${escapeHtml(item.instagram)}` : ""}</p>
    <p class="description"><strong>Relationship:</strong> ${escapeHtml(item.relationship)}</p>
    ${item.correction_notes ? `<p class="description">${escapeHtml(item.correction_notes)}</p>` : ""}
    <div class="actions"><button data-claim-action="approved" type="button">Verify</button><button class="reject" data-claim-action="rejected" type="button">Reject</button></div><p class="card-status" role="status"></p>
  </article>`;
}

function promotionCard(item) {
  const placement = item.quoted_price_cents > 0 ? `$${(item.quoted_price_cents / 100).toFixed(0)} weekend feature` : "Free launch spotlight";
  return `<article class="submission-card compact" data-id="${escapeHtml(item.id)}">
    <span class="city">${placement}</span><h3>${escapeHtml(item.event_name)}</h3>
    <p>${escapeHtml(item.organizer_name)} · ${escapeHtml(item.contact_email)}${item.instagram ? ` · ${escapeHtml(item.instagram)}` : ""}</p>
    <div class="actions"><button data-promotion-action="contacted" type="button">Mark contacted</button><button class="secondary" data-promotion-action="completed" type="button">Mark complete</button></div><p class="card-status" role="status"></p>
  </article>`;
}

const tractionGoals = [
  { key: "publishedEvents", label: "Upcoming events", target: 50 },
  { key: "uniqueVisitors", label: "Unique visitors", target: 500 },
  { key: "ticketClicks", label: "Ticket clicks", target: 100 },
  { key: "organizerActivations", label: "Claims or submissions", target: 5 },
  { key: "spotlightRequests", label: "Spotlight requests", target: 3 }
];

function renderScoreboard(summary) {
  document.querySelector("#goal-grid").innerHTML = tractionGoals.map((goal) => {
    const value = Number(summary[goal.key] || 0);
    const progress = Math.min(100, Math.round((value / goal.target) * 100));
    return `<article class="goal-card ${progress >= 100 ? "complete" : ""}">
      <div><span>${escapeHtml(goal.label)}</span><strong>${value}<small> / ${goal.target}</small></strong></div>
      <div class="goal-track" aria-label="${escapeHtml(goal.label)}: ${progress}% of target"><span style="width:${progress}%"></span></div>
      <p>${progress}% of target</p>
    </article>`;
  }).join("");
}

function campaignLinks(event) {
  return `<div class="campaign-links" aria-label="Campaign links for ${escapeHtml(event.title)}">
    <span>Copy link:</span>
    ${["organizer", "instagram", "whatsapp", "tiktok"].map((source) => `<button class="campaign-link" type="button" data-campaign-source="${source}" data-event-slug="${escapeHtml(event.slug)}">${source}</button>`).join("")}
  </div>`;
}

async function loadDashboard() {
  document.querySelector("#queue-status").textContent = "Refreshing…";
  const [{ submissions }, { events }, { claims }, { requests }, { summary }] = await Promise.all([
    adminApi("/api/admin/submissions"), adminApi("/api/admin/analytics"), adminApi("/api/admin/claims"), adminApi("/api/admin/promotion-requests"), adminApi("/api/admin/traction")
  ]);
  renderScoreboard(summary);
  document.querySelector("#pending-count").textContent = submissions.length;
  document.querySelector("#click-count").textContent = events.reduce((total, event) => total + event.ticketClicks, 0);
  document.querySelector("#view-count").textContent = events.reduce((total, event) => total + event.views, 0);
  document.querySelector("#claim-count").textContent = claims.length;
  list.innerHTML = submissions.length ? submissions.map(submissionCard).join("") : '<div class="empty">No pending submissions. The queue is clear.</div>';
  document.querySelector("#claim-list").innerHTML = claims.length ? claims.map(claimCard).join("") : '<div class="empty">No pending ownership claims.</div>';
  document.querySelector("#promotion-list").innerHTML = requests.length ? requests.map(promotionCard).join("") : '<div class="empty">No featured placement requests.</div>';
  document.querySelector("#analytics-list").innerHTML = events.length ? events.map((event) => `<article class="analytics-card"><h3>${escapeHtml(event.title)}</h3><div class="analytics-metrics"><span><strong>${event.views}</strong> views</span><span><strong>${event.uniqueVisitors}</strong> visitors</span><span><strong>${event.ticketClicks}</strong> clicks</span><span><strong>${event.clickThroughRate}%</strong> CTR</span></div><div class="traffic">${event.traffic.length ? event.traffic.map((item) => `<span>${escapeHtml(item.source)} ${item.percentage}%</span>`).join("") : "No traffic yet"}</div>${campaignLinks(event)}</article>`).join("") : '<div class="empty">No approved events yet.</div>';
  document.querySelector("#queue-status").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

document.querySelector("#login-form").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  adminToken = document.querySelector("#admin-token").value;
  const status = document.querySelector("#login-status");
  status.textContent = "Opening…";
  try { await loadDashboard(); loginPanel.hidden = true; dashboard.hidden = false; }
  catch (error) { adminToken = ""; status.textContent = error.message; }
});
document.querySelector("#refresh").addEventListener("click", () => loadDashboard().catch((error) => { document.querySelector("#queue-status").textContent = error.message; }));

list.addEventListener("click", async (click) => {
  const button = click.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest(".submission-card");
  const form = card.querySelector(".edit-form");
  const status = card.querySelector(".card-status");
  if (button.dataset.action === "edit") { form.hidden = false; button.hidden = true; return; }
  if (button.dataset.action === "cancel") { form.hidden = true; card.querySelector('[data-action="edit"]').hidden = false; return; }
  if (button.dataset.action === "reject" && !window.confirm("Reject this submission?")) return;
  button.disabled = true;
  status.textContent = `${button.textContent.trim()}ing…`;
  try {
    await adminApi(`/api/admin/submissions/${card.dataset.id}/${button.dataset.action}`, { method: "POST", body: JSON.stringify({}) });
    await loadDashboard();
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});

list.addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const form = submit.target;
  const card = form.closest(".submission-card");
  const status = card.querySelector(".card-status");
  const values = Object.fromEntries(new FormData(form));
  status.textContent = "Saving…";
  try { await adminApi(`/api/admin/submissions/${card.dataset.id}`, { method: "PUT", body: JSON.stringify(values) }); await loadDashboard(); }
  catch (error) { status.textContent = error.message; }
});

document.querySelector("#claim-list").addEventListener("click", async (click) => {
  const button = click.target.closest("[data-claim-action]");
  if (!button) return;
  const card = button.closest(".submission-card");
  const status = card.querySelector(".card-status");
  button.disabled = true;
  status.textContent = "Updating claim…";
  try { await adminApi(`/api/admin/claims/${card.dataset.id}/${button.dataset.claimAction}`, { method: "POST", body: JSON.stringify({}) }); await loadDashboard(); }
  catch (error) { status.textContent = error.message; button.disabled = false; }
});

document.querySelector("#promotion-list").addEventListener("click", async (click) => {
  const button = click.target.closest("[data-promotion-action]");
  if (!button) return;
  const card = button.closest(".submission-card");
  const status = card.querySelector(".card-status");
  button.disabled = true;
  status.textContent = "Updating request…";
  try { await adminApi(`/api/admin/promotion-requests/${card.dataset.id}`, { method: "PUT", body: JSON.stringify({ status: button.dataset.promotionAction }) }); await loadDashboard(); }
  catch (error) { status.textContent = error.message; button.disabled = false; }
});

document.querySelector("#analytics-list").addEventListener("click", async (click) => {
  const button = click.target.closest("[data-campaign-source]");
  if (!button) return;
  const url = new URL(`/events/${encodeURIComponent(button.dataset.eventSlug)}`, window.location.origin);
  url.searchParams.set("source", button.dataset.campaignSource);
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(url.toString());
    status.textContent = `${button.dataset.campaignSource} link copied.`;
  } catch {
    status.textContent = url.toString();
  }
});
