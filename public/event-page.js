const page = document.body;
const slug = page.dataset.eventSlug;
const title = page.dataset.eventTitle;
const params = new URLSearchParams(window.location.search);
const knownSources = new Set(["instagram", "tiktok", "google", "organizer", "whatsapp", "direct", "other"]);
const requestedSource = (params.get("source") || params.get("utm_source") || "").toLowerCase();
const source = knownSources.has(requestedSource) ? requestedSource : "direct";
const visitorId = (() => {
  try {
    const existing = localStorage.getItem("hn_visitor_id");
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem("hn_visitor_id", created);
    return created;
  } catch { return ""; }
})();

fetch(`/api/events/${encodeURIComponent(slug)}/view`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visitor_id: visitorId, source, referrer: document.referrer })
}).catch(() => {});

document.querySelector("[data-share-page]").addEventListener("click", async () => {
  const status = document.querySelector("[data-share-status]");
  const url = new URL(window.location.href);
  url.search = "";
  if (source) url.searchParams.set("source", source);
  try {
    if (navigator.share) await navigator.share({ title, text: `See ${title} on Habesha Nights`, url: url.toString() });
    else {
      await navigator.clipboard.writeText(url.toString());
      status.textContent = "Event link copied.";
    }
  } catch {}
});

const claimDialog = document.querySelector("#claim-dialog");
document.querySelector("[data-open-claim]").addEventListener("click", () => claimDialog.showModal());
claimDialog.querySelector(".close").addEventListener("click", () => claimDialog.close());
document.querySelector("#claim-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const status = document.querySelector("#claim-status");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Sending claim for verification…";
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(slug)}/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Request failed.");
    form.reset();
    status.classList.add("success");
    status.textContent = result.message;
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  } finally { button.disabled = false; }
});
