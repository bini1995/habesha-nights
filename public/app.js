let socket = null;

function connectWebSocket() {
  const protocol =
    window.location.protocol === "https:"
      ? "wss"
      : "ws";

  socket = new WebSocket(
    `${protocol}://${window.location.host}`
  );

  socket.addEventListener("open", () => {
    console.log(
      "WebSocket connected."
    );
  });

  socket.addEventListener("close", () => {
    console.log(
      "WebSocket disconnected. Reconnecting..."
    );

    setTimeout(
      connectWebSocket,
      3000
    );
  });

  socket.addEventListener(
    "message",
    async (event) => {
      const message = JSON.parse(event.data);

      console.log(
        "WebSocket:",
        message
      );

      if (message.type === "event") {
        await refreshState();
      }
    }
  );
}

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
    container.innerHTML = `
      <div class="empty-state">
        No watches are currently registered.
      </div>
    `;

    return;
  }

  container.innerHTML = watches
    .map((watch) => `
      <div class="watch-card">
        <div class="label">
          ${escapeHtml(
            watch.type ?? "Movie tickets"
          )}
        </div>

        <div class="watch-title">
          ${escapeHtml(
            watch.movie ??
            watch.title ??
            "Untitled watch"
          )}
        </div>

        <div class="details">
          ${escapeHtml(
            watch.theater ??
            watch.location ??
            "Location unavailable"
          )}

          ${watch.format
            ? " · " + escapeHtml(watch.format)
            : ""}
        </div>

        <div
          class="status ${watch.enabled === false
            ? "idle"
            : ""}"
        >
          ${watch.enabled === false
            ? "Disabled"
            : "Monitoring"}
        </div>

        <div class="watch-actions">
          <button
            class="secondary-button"
            type="button"
            onclick="toggleWatch(
              '${encodeURIComponent(watch.id)}',
              ${watch.enabled === false
                ? "true"
                : "false"}
            )"
          >
            ${watch.enabled === false
              ? "Enable"
              : "Disable"}
          </button>

          <button
            class="danger-button"
            type="button"
            onclick="removeWatch(
              '${encodeURIComponent(watch.id)}',
              '${escapeHtml(
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
    `)
    .join("");
}

function renderEvents(events) {
  const container =
    document.getElementById("event-list");

  if (!Array.isArray(events) ||
      events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No recent events have been recorded.
      </div>
    `;

    return;
  }

  container.innerHTML = events
    .map((event) => `
      <div class="event-card">
        <div class="label">
          ${escapeHtml(
            event.type ?? "Event"
          )}
        </div>

        <div class="event-title">
          ${escapeHtml(
            event.title ??
            "Activity recorded"
          )}
        </div>

        ${event.message
          ? `
            <div class="details">
              ${escapeHtml(event.message)}
            </div>
          `
          : ""}

        <div class="timestamp">
          ${formatDate(
            event.timestamp,
            "Time unavailable"
          )}
        </div>
      </div>
    `)
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
        `Request failed: ${response.status}`
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
        `Request failed: ${watchesResponse.status}`
      );
    }

    const watchesData =
      await watchesResponse.json();

    const eventsResponse =
      await fetch("/api/events", {
        cache: "no-store"
      });

    if (!eventsResponse.ok) {
      throw new Error(
        `Request failed: ${eventsResponse.status}`
      );
    }

    const eventsData =
      await eventsResponse.json();

    renderWatches(
      watchesData.watches
    );

    renderEvents(
      eventsData.events
    );
  } catch (error) {
    console.error(error);

    errorMessage.style.display = "block";
    connectionDot.style.background =
      "#ef4444";
    connectionText.textContent =
      "Application state unavailable";
  }
}

connectWebSocket();

refreshState();

setInterval(
  refreshState,
  5000
);
