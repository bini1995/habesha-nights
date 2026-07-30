const express = require("express");

const {
  getState
} = require("./state");

const {
  getAllWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
} = require("./watch-service");

function createDashboardServer({
  port = 3000
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({
      status: "ok",
      service: "nyc-opportunity-agent",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/state", (request, response) => {
    response.json(getState());
  });

  app.get("/api/watches", (request, response) => {
    try {
      response.json({
        watches: getAllWatches()
      });
    } catch (error) {
      console.error("Could not load watches:");
      console.error(error);

      response.status(500).json({
        error: "Could not load watches."
      });
    }
  });

  app.post("/api/watches", (request, response) => {
    try {
      const watch = createWatch(request.body);

      response.status(201).json({
        watch
      });
    } catch (error) {
      response.status(400).json({
        error: error.message
      });
    }
  });

  app.patch("/api/watches/:id/enabled", (request, response) => {
    try {
      const watch = setWatchEnabled(
        request.params.id,
        request.body.enabled
      );

      response.json({
        watch
      });
    } catch (error) {
      const status =
        error.message.startsWith("No watch found")
          ? 404
          : 400;

      response.status(status).json({
        error: error.message
      });
    }
  });

  app.delete("/api/watches/:id", (request, response) => {
    try {
      const deletedWatch = deleteWatch(
        request.params.id
      );

      response.json({
        watch: deletedWatch
      });
    } catch (error) {
      response.status(404).json({
        error: error.message
      });
    }
  });

  app.get("/", (request, response) => {
    response.type("html").send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          >

          <title>NYC Opportunity Agent</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              background: #f4f5f7;
              color: #111827;
              font-family:
                Inter,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
            }

            header {
              background: #111827;
              color: #ffffff;
              padding: 24px;
            }

            header > div {
              max-width: 1100px;
              margin: 0 auto;
            }

            main {
              max-width: 1100px;
              margin: 0 auto;
              padding: 36px 24px 60px;
            }

            h1 {
              margin: 0;
              font-size: 28px;
            }

            h2 {
              margin-top: 38px;
              margin-bottom: 14px;
              font-size: 20px;
            }

            p {
              line-height: 1.5;
            }

            .subtitle {
              margin-top: 8px;
              color: #cbd5e1;
            }

            .connection {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              margin-top: 16px;
              font-size: 13px;
              color: #cbd5e1;
            }

            .connection-dot {
              width: 9px;
              height: 9px;
              border-radius: 50%;
              background: #22c55e;
            }

            .grid {
              display: grid;
              grid-template-columns:
                repeat(auto-fit, minmax(210px, 1fr));
              gap: 18px;
            }

            .card {
              background: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 22px;
              box-shadow:
                0 8px 24px rgba(15, 23, 42, 0.06);
            }

            .label {
              color: #6b7280;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }

            .value {
              margin-top: 10px;
              font-size: 24px;
              font-weight: 700;
              overflow-wrap: anywhere;
            }

            .small-value {
              font-size: 17px;
            }

            .status {
              display: inline-block;
              margin-top: 10px;
              padding: 6px 10px;
              border-radius: 999px;
              background: #dcfce7;
              color: #166534;
              font-size: 13px;
              font-weight: 700;
            }

            .status.idle {
              background: #e0e7ff;
              color: #3730a3;
            }

            .status.error {
              background: #fee2e2;
              color: #991b1b;
            }

            .section-heading {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              margin-top: 38px;
              margin-bottom: 14px;
            }

            .section-heading h2 {
              margin: 0;
            }

            button {
              border: 0;
              border-radius: 10px;
              padding: 10px 15px;
              background: #111827;
              color: #ffffff;
              font: inherit;
              font-weight: 700;
              cursor: pointer;
            }

            button:hover {
              background: #1f2937;
            }

            .secondary-button {
              background: #e5e7eb;
              color: #111827;
            }

            .secondary-button:hover {
              background: #d1d5db;
            }

            .watch-form {
              margin-bottom: 18px;
              padding: 20px;
              background: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
            }

            .form-grid {
              display: grid;
              grid-template-columns:
                repeat(auto-fit, minmax(220px, 1fr));
              gap: 16px;
            }

            .form-field {
              display: grid;
              gap: 7px;
            }

            .form-field label {
              color: #374151;
              font-size: 13px;
              font-weight: 700;
            }

            .form-field input {
              width: 100%;
              border: 1px solid #cbd5e1;
              border-radius: 9px;
              padding: 10px 12px;
              font: inherit;
            }

            .form-actions {
              display: flex;
              gap: 10px;
              margin-top: 18px;
            }

            .watch-list,
            .event-list {
              display: grid;
              gap: 14px;
            }

            .watch-card,
            .event-card {
              background: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 20px;
            }

            .watch-actions {
              display: flex;
              gap: 10px;
              margin-top: 16px;
            }

            .danger-button {
              background: #fee2e2;
              color: #991b1b;
            }

            .danger-button:hover {
              background: #fecaca;
            }

            .watch-title,
            .event-title {
              margin-top: 7px;
              font-size: 19px;
              font-weight: 700;
            }

            .details {
              margin-top: 8px;
              color: #4b5563;
            }

            .timestamp {
              margin-top: 10px;
              color: #6b7280;
              font-size: 13px;
            }

            .empty-state {
              background: #ffffff;
              border: 1px dashed #cbd5e1;
              border-radius: 14px;
              padding: 28px;
              color: #64748b;
            }

            .error-message {
              display: none;
              margin-bottom: 18px;
              padding: 14px;
              border-radius: 10px;
              background: #fee2e2;
              color: #991b1b;
            }
          </style>
        </head>

        <body>
          <header>
            <div>
              <h1>NYC Opportunity Agent</h1>

              <div class="subtitle">
                Operations console for tickets, reservations,
                events, and other high-value opportunities.
              </div>

              <div class="connection">
                <span
                  class="connection-dot"
                  id="connection-dot"
                ></span>

                <span id="connection-text">
                  Connecting to application...
                </span>
              </div>
            </div>
          </header>

          <main>
            <div
              class="error-message"
              id="error-message"
            >
              The dashboard could not retrieve the latest
              application state.
            </div>

            <div class="grid">
              <div class="card">
                <div class="label">Monitor status</div>

                <div
                  class="value"
                  id="monitor-status"
                >
                  Loading...
                </div>

                <div
                  class="status idle"
                  id="monitor-status-chip"
                >
                  Loading
                </div>
              </div>

              <div class="card">
                <div class="label">Active watches</div>

                <div
                  class="value"
                  id="active-watches"
                >
                  0
                </div>
              </div>

              <div class="card">
                <div class="label">Total checks</div>

                <div
                  class="value"
                  id="total-checks"
                >
                  0
                </div>
              </div>

              <div class="card">
                <div class="label">Notifications sent</div>

                <div
                  class="value"
                  id="notifications-sent"
                >
                  0
                </div>
              </div>

              <div class="card">
                <div class="label">Last check</div>

                <div
                  class="value small-value"
                  id="last-check"
                >
                  Never
                </div>
              </div>

              <div class="card">
                <div class="label">Next check</div>

                <div
                  class="value small-value"
                  id="next-check"
                >
                  Not scheduled
                </div>
              </div>

              <div class="card">
                <div class="label">Rate limits</div>

                <div
                  class="value"
                  id="rate-limits"
                >
                  0
                </div>
              </div>

              <div class="card">
                <div class="label">Errors</div>

                <div
                  class="value"
                  id="errors"
                >
                  0
                </div>
              </div>
            </div>

            <div class="section-heading">
              <h2>Current watches</h2>

              <button
                type="button"
                onclick="
                  document
                    .getElementById('watch-form')
                    .hidden = false;
                "
              >
                + Add Watch
              </button>
            </div>

            <form
              class="watch-form"
              id="watch-form"
              hidden
              onsubmit="createWatch(event)"
            >
              <div class="form-grid">
                <div class="form-field">
                  <label for="watch-id">Watch ID</label>
                  <input
                    id="watch-id"
                    name="id"
                    placeholder="wicked-broadway"
                    required
                  >
                </div>

                <div class="form-field">
                  <label for="watch-movie">Movie or event</label>
                  <input
                    id="watch-movie"
                    name="movie"
                    placeholder="Wicked"
                    required
                  >
                </div>

                <div class="form-field">
                  <label for="watch-theater">Theater or location</label>
                  <input
                    id="watch-theater"
                    name="theater"
                    placeholder="AMC Lincoln Square 13"
                    required
                  >
                </div>

                <div class="form-field">
                  <label for="watch-format">Format</label>
                  <input
                    id="watch-format"
                    name="format"
                    placeholder="IMAX 70MM"
                  >
                </div>

                <div class="form-field">
                  <label for="watch-url">Page URL</label>
                  <input
                    id="watch-url"
                    name="pageUrl"
                    type="url"
                    placeholder="https://example.com"
                    required
                  >
                </div>
              </div>

              <div class="form-actions">
                <button type="submit">
                  Save Watch
                </button>

                <button
                  class="secondary-button"
                  type="button"
                  onclick="
                    document
                      .getElementById('watch-form')
                      .hidden = true;
                  "
                >
                  Cancel
                </button>
              </div>
            </form>

            <div
              class="watch-list"
              id="watch-list"
            >
              <div class="empty-state">
                Loading watches...
              </div>
            </div>

            <h2>Recent activity</h2>

            <div
              class="event-list"
              id="event-list"
            >
              <div class="empty-state">
                Loading recent activity...
              </div>
            </div>
          </main>

          <script>
            function escapeHtml(value = "") {
              return String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
            }

            function formatDate(value, fallback) {
              if (!value) {
                return fallback;
              }

              return new Intl.DateTimeFormat(
                "en-US",
                {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short"
                }
              ).format(new Date(value));
            }

            function renderWatches(watches) {
              const container =
                document.getElementById("watch-list");

              if (!Array.isArray(watches) ||
                  watches.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    No watches are currently registered.
                  </div>
                \`;

                return;
              }

              container.innerHTML = watches
                .map((watch) => \`
                  <div class="watch-card">
                    <div class="label">
                      \${escapeHtml(
                        watch.type ?? "Movie tickets"
                      )}
                    </div>

                    <div class="watch-title">
                      \${escapeHtml(
                        watch.movie ??
                        watch.title ??
                        "Untitled watch"
                      )}
                    </div>

                    <div class="details">
                      \${escapeHtml(
                        watch.theater ??
                        watch.location ??
                        "Location unavailable"
                      )}

                      \${watch.format
                        ? " · " + escapeHtml(watch.format)
                        : ""}
                    </div>

                    <div
                      class="status \${watch.enabled === false
                        ? "idle"
                        : ""}"
                    >
                      \${watch.enabled === false
                        ? "Disabled"
                        : "Monitoring"}
                    </div>

                    <div class="watch-actions">
                      <button
                        class="secondary-button"
                        type="button"
                        onclick="toggleWatch(
                          '\${encodeURIComponent(watch.id)}',
                          \${watch.enabled === false
                            ? "true"
                            : "false"}
                        )"
                      >
                        \${watch.enabled === false
                          ? "Enable"
                          : "Disable"}
                      </button>

                      <button
                        class="danger-button"
                        type="button"
                        onclick="removeWatch(
                          '\${encodeURIComponent(watch.id)}',
                          '\${escapeHtml(
                            watch.movie ??
                            watch.title ??
                            watch.id
                          )}'
                        )"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                \`)
                .join("");
            }

            function renderEvents(events) {
              const container =
                document.getElementById("event-list");

              if (!Array.isArray(events) ||
                  events.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    No recent events have been recorded.
                  </div>
                \`;

                return;
              }

              container.innerHTML = events
                .map((event) => \`
                  <div class="event-card">
                    <div class="label">
                      \${escapeHtml(
                        event.type ?? "Event"
                      )}
                    </div>

                    <div class="event-title">
                      \${escapeHtml(
                        event.title ??
                        "Activity recorded"
                      )}
                    </div>

                    \${event.message
                      ? \`
                        <div class="details">
                          \${escapeHtml(event.message)}
                        </div>
                      \`
                      : ""}

                    <div class="timestamp">
                      \${formatDate(
                        event.timestamp,
                        "Time unavailable"
                      )}
                    </div>
                  </div>
                \`)
                .join("");
            }

            function setMonitorStatus(status) {
              const value =
                document.getElementById(
                  "monitor-status"
                );

              const chip =
                document.getElementById(
                  "monitor-status-chip"
                );

              const normalizedStatus =
                String(status ?? "Idle");

              value.textContent = normalizedStatus;
              chip.textContent = normalizedStatus;

              chip.className = "status";

              if (
                normalizedStatus.toLowerCase() ===
                "idle"
              ) {
                chip.classList.add("idle");
              }

              if (
                normalizedStatus
                  .toLowerCase()
                  .includes("error")
              ) {
                chip.classList.add("error");
              }
            }

            async function toggleWatch(
              encodedId,
              enabled
            ) {
              const response = await fetch(
                "/api/watches/" +
                  encodedId +
                  "/enabled",
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    enabled
                  })
                }
              );

              const data = await response.json();

              if (!response.ok) {
                alert(
                  data.error ||
                  "Could not update watch."
                );

                return;
              }

              await refreshState();
            }

            async function removeWatch(
              encodedId,
              watchName
            ) {
              const confirmed = window.confirm(
                "Delete " + watchName + "?"
              );

              if (!confirmed) {
                return;
              }

              const response = await fetch(
                "/api/watches/" + encodedId,
                {
                  method: "DELETE"
                }
              );

              const data = await response.json();

              if (!response.ok) {
                alert(
                  data.error ||
                  "Could not delete watch."
                );

                return;
              }

              await refreshState();
            }

            async function createWatch(event) {
              event.preventDefault();

              const form = event.target;

              const watch = {
                id: form.id.value.trim(),
                provider: "AMC",
                type: "Movie Tickets",
                enabled: true,
                movie: form.movie.value.trim(),
                theater: form.theater.value.trim(),
                format: form.format.value.trim(),
                pageUrl: form.pageUrl.value.trim()
              };

              const response = await fetch(
                "/api/watches",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify(watch)
                }
              );

              const data = await response.json();

              if (!response.ok) {
                alert(data.error || "Could not create watch.");
                return;
              }

              form.reset();
              form.hidden = true;

              await refreshState();
            }

            async function refreshState() {
              const errorMessage =
                document.getElementById(
                  "error-message"
                );

              const connectionDot =
                document.getElementById(
                  "connection-dot"
                );

              const connectionText =
                document.getElementById(
                  "connection-text"
                );

              try {
                const response = await fetch(
                  "/api/state",
                  {
                    cache: "no-store"
                  }
                );

                if (!response.ok) {
                  throw new Error(
                    \`Request failed: \${response.status}\`
                  );
                }

                const state = await response.json();

                errorMessage.style.display = "none";
                connectionDot.style.background =
                  "#22c55e";
                connectionText.textContent =
                  "Live application state connected";

                setMonitorStatus(
                  state.monitor?.status ?? "Idle"
                );

                document.getElementById(
                  "active-watches"
                ).textContent =
                  state.watches?.length ?? 0;

                document.getElementById(
                  "total-checks"
                ).textContent =
                  state.stats?.totalChecks ?? 0;

                document.getElementById(
                  "notifications-sent"
                ).textContent =
                  state.stats?.notificationsSent ?? 0;

                document.getElementById(
                  "rate-limits"
                ).textContent =
                  state.stats?.rateLimits ?? 0;

                document.getElementById(
                  "errors"
                ).textContent =
                  state.stats?.errors ?? 0;

                document.getElementById(
                  "last-check"
                ).textContent = formatDate(
                  state.monitor?.lastCheck,
                  "Never"
                );

                document.getElementById(
                  "next-check"
                ).textContent = formatDate(
                  state.scheduler?.nextRun,
                  "Not scheduled"
                );

                const watchesResponse =
                  await fetch("/api/watches", {
                    cache: "no-store"
                  });

                if (!watchesResponse.ok) {
                  throw new Error(
                    \`Request failed: \${watchesResponse.status}\`
                  );
                }

                const watchesData =
                  await watchesResponse.json();

                renderWatches(
                  watchesData.watches
                );
                renderEvents(state.recentEvents);
              } catch (error) {
                console.error(error);

                errorMessage.style.display = "block";
                connectionDot.style.background =
                  "#ef4444";
                connectionText.textContent =
                  "Application state unavailable";
              }
            }

            refreshState();

            setInterval(
              refreshState,
              5000
            );
          </script>
        </body>
      </html>
    `);
  });

  const server = app.listen(port, () => {
    console.log(
      `Dashboard available at http://localhost:${port}`
    );
  });

  return {
    app,
    server,

    stop() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

module.exports = {
  createDashboardServer
};
