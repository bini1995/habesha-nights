const {
  getEnabledWatches
} = require("./watch-service");

const {
  getProvider
} = require("./providers");

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

const WATCH_DELAY_MILLISECONDS = 2000;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getWatchLabel(watch) {
  return (
    watch.movie ??
    watch.name ??
    watch.id ??
    "Unknown watch"
  );
}

function isWatcherError(
  watcher,
  error,
  errorClassName
) {
  const ErrorClass =
    watcher?.[errorClassName];

  return (
    typeof ErrorClass === "function" &&
    error instanceof ErrorClass
  );
}

async function runSingleWatch(watch) {
  const label = getWatchLabel(watch);
  const checkedAt = new Date().toISOString();

  incrementStat("totalChecks");

  console.log("");
  console.log(
    `[${new Date().toLocaleString()}] ` +
    `Checking ${label} (${watch.id})...`
  );

  let watcher;

  try {
    watcher = getProvider(
      watch.provider
    );

    const previous =
      await loadLatestSnapshot(watch);

    let current;

    try {
      current =
        await watcher.runWatcher(watch);
    } catch (error) {
      if (
        isWatcherError(
          watcher,
          error,
          "RateLimitError"
        )
      ) {
        console.log(
          `${watch.provider} rate limited ` +
          `${watch.id}.`
        );

        incrementStat("rateLimits");

        addEvent({
          type: "RATE_LIMITED",
          watchId: watch.id,
          title:
            `${label} check was rate limited`,
          message:
            "The previous snapshot was preserved. " +
            "Other watches using this provider will " +
            "be skipped until the next scheduled run."
        });

        return {
          watchId: watch.id,
          provider: watch.provider,
          checkedAt,
          status: "RATE_LIMITED"
        };
      }

      if (
        isWatcherError(
          watcher,
          error,
          "NoShowtimesError"
        )
      ) {
        console.log(error.message);

        addEvent({
          type: "NO_SHOWTIMES",
          watchId: watch.id,
          title:
            `${label} has no matching showtimes`,
          message: error.message
        });

        return {
          watchId: watch.id,
          provider: watch.provider,
          checkedAt,
          status: "NO_SHOWTIMES",
          message: error.message
        };
      }

      throw error;
    }

    if (!previous) {
      console.log(
        `Saving initial snapshot for ${watch.id}...`
      );

      await saveSnapshot({
        watch,
        result: current
      });

      incrementStat(
        "successfulChecks"
      );

      addEvent({
        type: "INITIALIZED",
        watchId: watch.id,
        title:
          `${label} watch initialized`,
        message:
          "The first snapshot was saved. " +
          "Future checks will be compared against it."
      });

      return {
        watchId: watch.id,
        provider: watch.provider,
        checkedAt,
        status: "INITIALIZED",
        showtimeCount:
          current.showtimeCount ?? 0
      };
    }

    const changes = compareShowtimes(
      previous,
      current
    );

    if (changes.length === 0) {
      console.log(
        `No changes for ${watch.id}.`
      );

      await saveSnapshot({
        watch,
        result: current
      });

      incrementStat(
        "successfulChecks"
      );

      addEvent({
        type: "NO_CHANGES",
        watchId: watch.id,
        title:
          `${label} checked successfully`,
        message:
          "No new ticket availability was detected."
      });

      return {
        watchId: watch.id,
        provider: watch.provider,
        checkedAt,
        status: "NO_CHANGES",
        showtimeCount:
          current.showtimeCount ?? 0
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
        type:
          event.type ??
          "WATCH_EVENT",
        watchId: watch.id,
        title:
          event.title ??
          `${label} activity detected`,
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
        index += 1
      ) {
        incrementStat(
          "notificationsSent"
        );
      }

      console.log(
        `Sent ${notifiable.length} notification(s) ` +
        `for ${watch.id}.`
      );
    }

    await saveSnapshot({
      watch,
      result: current
    });

    incrementStat(
      "successfulChecks"
    );

    return {
      watchId: watch.id,
      provider: watch.provider,
      checkedAt,
      status: "CHANGES_FOUND",
      changes: changes.length,
      events: events.length,
      notifications:
        notifiable.length,
      showtimeCount:
        current.showtimeCount ?? 0
    };
  } catch (error) {
    incrementStat("errors");

    console.error(
      `Watch ${watch.id} failed:`
    );
    console.error(error);

    addEvent({
      type: "ERROR",
      watchId: watch.id,
      title:
        `${label} check failed`,
      message: error.message
    });

    return {
      watchId: watch.id,
      provider: watch.provider,
      checkedAt,
      status: "ERROR",
      error: error.message
    };
  }
}

function summarizeResults(results) {
  const counts = {};

  for (const result of results) {
    counts[result.status] =
      (counts[result.status] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([status, count]) => {
      return `${count} ${status}`;
    })
    .join(", ");
}

async function runMonitor() {
  const watches =
    getEnabledWatches();

  setWatches(watches);

  if (watches.length === 0) {
    updateMonitor({
      status: "Idle",
      lastResult:
        "No enabled watches"
    });

    addEvent({
      type: "NO_WATCHES",
      title: "No enabled watches",
      message:
        "Add or enable a watch before running the monitor."
    });

    return {
      status: "NO_WATCHES",
      results: []
    };
  }

  const checkedAt =
    new Date().toISOString();

  updateMonitor({
    status: "Checking",
    lastCheck: checkedAt,
    lastResult: null
  });

  const results = [];
  const rateLimitedProviders =
    new Set();

  for (
    let index = 0;
    index < watches.length;
    index += 1
  ) {
    const watch = watches[index];

    const normalizedProvider =
      String(
        watch.provider ?? ""
      )
        .trim()
        .toUpperCase();

    if (
      rateLimitedProviders.has(
        normalizedProvider
      )
    ) {
      console.log("");
      console.log(
        `Skipping ${watch.id} because ` +
        `${watch.provider} was rate limited earlier ` +
        `in this run.`
      );

      results.push({
        watchId: watch.id,
        provider: watch.provider,
        checkedAt:
          new Date().toISOString(),
        status:
          "SKIPPED_RATE_LIMITED"
      });

      continue;
    }

    const result =
      await runSingleWatch(watch);

    results.push(result);

    if (
      result.status ===
      "RATE_LIMITED"
    ) {
      rateLimitedProviders.add(
        normalizedProvider
      );
    }

    const hasAnotherWatch =
      index < watches.length - 1;

    if (hasAnotherWatch) {
      await wait(
        WATCH_DELAY_MILLISECONDS
      );
    }
  }

  const summary =
    summarizeResults(results);

  const errorCount =
    results.filter(
      (result) =>
        result.status === "ERROR"
    ).length;

  const rateLimitCount =
    results.filter(
      (result) =>
        result.status ===
          "RATE_LIMITED" ||
        result.status ===
          "SKIPPED_RATE_LIMITED"
    ).length;

  updateMonitor({
    status:
      errorCount > 0
        ? "Error"
        : "Idle",
    lastResult: summary
  });

  console.log("");
  console.log(
    `Monitor run complete: ${summary}`
  );

  if (rateLimitCount > 0) {
    return {
      status: "RATE_LIMITED",
      checkedAt,
      summary,
      results
    };
  }

  if (errorCount > 0) {
    return {
      status: "PARTIAL_FAILURE",
      checkedAt,
      summary,
      results
    };
  }

  return {
    status: "COMPLETED",
    checkedAt,
    summary,
    results
  };
}

module.exports = {
  runMonitor,
  runSingleWatch
};
