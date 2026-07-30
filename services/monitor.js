const {
  getEnabledWatches
} = require("./watch-service");

const {
  getWatcher
} = require("../watchers");

const {
  compareShowtimes
} = require("./compare");

const {
  createEvents,
  getNotifiableEvents
} = require("./event-engine");

const {
  loadLatestSnapshot,
  saveSnapshot
} = require("./snapshot-store");


const {
  sendEventEmail
} = require("./email");

const {
  updateMonitor,
  incrementStat,
  setWatches,
  addEvent
} = require("./state");

async function runMonitor() {
  const watches = getEnabledWatches();

  setWatches(watches);

  if (watches.length === 0) {
    updateMonitor({
      status: "Idle",
      lastResult: "No enabled watches"
    });

    addEvent({
      type: "NO_WATCHES",
      title: "No enabled watches",
      message:
        "Add or enable a watch before running the monitor."
    });

    return {
      status: "NO_WATCHES"
    };
  }

  const watch = watches[0];
  const watcher = getWatcher(watch.provider);
  const checkedAt = new Date().toISOString();

  incrementStat("totalChecks");

  updateMonitor({
    status: "Checking",
    lastCheck: checkedAt,
    lastResult: null
  });

  console.log("");
  console.log(
    `[${new Date().toLocaleString()}] Checking ${watch.movie}...`
  );

  try {
    const previous = await loadLatestSnapshot();

    let current;

    try {
      current = await watcher.runWatcher(watch);
    } catch (error) {
      if (
        watcher.RateLimitError &&
        error instanceof watcher.RateLimitError
      ) {
        console.log("AMC rate limited this check.");

        incrementStat("rateLimits");

        updateMonitor({
          status: "Idle",
          lastResult: "Rate limited"
        });

        addEvent({
          type: "RATE_LIMITED",
          title: `${watch.movie} check was rate limited`,
          message:
            "The previous snapshot was preserved and the scheduler will use the longer retry interval."
        });

        return {
          status: "RATE_LIMITED"
        };
      }

      if (
        watcher.NoShowtimesError &&
        error instanceof watcher.NoShowtimesError
      ) {
        console.log(error.message);

        updateMonitor({
          status: "Idle",
          lastResult: "No showtimes today"
        });

        addEvent({
          type: "NO_SHOWTIMES",
          title: `${watch.movie} has no showtimes`,
          message: error.message
        });

        return {
          status: "NO_SHOWTIMES"
        };
      }

      throw error;
    }

    if (!previous) {
      console.log("Saving initial snapshot...");

      await saveSnapshot({
        watch,
        result: current
      });

      incrementStat("successfulChecks");

      updateMonitor({
        status: "Idle",
        lastResult: "Initial snapshot saved"
      });

      addEvent({
        type: "INITIALIZED",
        title: `${watch.movie} watch initialized`,
        message:
          "The first snapshot was saved. Future checks will be compared against it."
      });

      return {
        status: "INITIALIZED"
      };
    }

    const changes = compareShowtimes(
      previous,
      current
    );

    if (changes.length === 0) {
      console.log("No changes.");

      await saveSnapshot({
        watch,
        result: current
      });

      incrementStat("successfulChecks");

      updateMonitor({
        status: "Idle",
        lastResult: "No changes"
      });

      addEvent({
        type: "NO_CHANGES",
        title: `${watch.movie} checked successfully`,
        message: "No new ticket availability was detected."
      });

      return {
        status: "NO_CHANGES"
      };
    }

    const events = createEvents({
      watch,
      changes
    });

    const notifiable =
      getNotifiableEvents(events);

    for (const event of events) {
      addEvent({
        type: event.type ?? "WATCH_EVENT",
        title:
          event.title ??
          `${watch.movie} activity detected`,
        message:
          event.message ??
          event.description ??
          null
      });
    }

    if (notifiable.length > 0) {
      await sendEventEmail({
        watch,
        current,
        events: notifiable
      });

      for (
        let index = 0;
        index < notifiable.length;
        index++
      ) {
        incrementStat("notificationsSent");
      }

      console.log(
        `Sent ${notifiable.length} notification(s).`
      );
    }

    await saveSnapshot({
        watch,
        result: current
      });

    incrementStat("successfulChecks");

    updateMonitor({
      status: "Idle",
      lastResult:
        `${changes.length} change(s), ` +
        `${notifiable.length} notification(s)`
    });

    return {
      status: "CHANGES_FOUND",
      changes: changes.length,
      events: events.length,
      notifications: notifiable.length
    };
  } catch (error) {
    incrementStat("errors");

    updateMonitor({
      status: "Error",
      lastResult: error.message
    });

    addEvent({
      type: "ERROR",
      title: `${watch.movie} check failed`,
      message: error.message
    });

    throw error;
  }
}

module.exports = {
  runMonitor
};
