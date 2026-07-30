const {
  updateScheduler
} = require("./state");

function minutesToMilliseconds(minutes) {
  return minutes * 60 * 1000;
}

function addJitter(milliseconds, jitterPercent = 0.1) {
  const maximumJitter = milliseconds * jitterPercent;
  const randomOffset =
    Math.random() * maximumJitter * 2 - maximumJitter;

  return Math.max(
    1000,
    Math.round(milliseconds + randomOffset)
  );
}

function formatDelay(milliseconds) {
  const minutes = milliseconds / 60000;

  if (minutes < 1) {
    return `${Math.round(milliseconds / 1000)} seconds`;
  }

  return `${minutes.toFixed(1)} minutes`;
}

function createScheduler({
  task,
  normalIntervalMinutes = 30,
  rateLimitIntervalMinutes = 180
}) {
  let timer = null;
  let stopped = false;
  let running = false;

  async function scheduleNext(delayMilliseconds) {
    if (stopped) {
      return;
    }

    const jitteredDelay = addJitter(
      delayMilliseconds
    );

    updateScheduler({
      nextRun: new Date(
        Date.now() + jitteredDelay
      ).toISOString()
    });

    console.log(
      `Next check in approximately ` +
      `${formatDelay(jitteredDelay)}.`
    );

    timer = setTimeout(
      run,
      jitteredDelay
    );
  }

  async function run() {
    if (stopped || running) {
      return;
    }

    running = true;

    updateScheduler({
      running: true,
      lastRun: new Date().toISOString()
    });

    try {
      const result = await task();

      if (result?.status === "RATE_LIMITED") {
        await scheduleNext(
          minutesToMilliseconds(
            rateLimitIntervalMinutes
          )
        );

        return;
      }

      await scheduleNext(
        minutesToMilliseconds(
          normalIntervalMinutes
        )
      );
    } catch (error) {
      console.error("");
      console.error("Scheduled check failed:");
      console.error(error);

      await scheduleNext(
        minutesToMilliseconds(
          normalIntervalMinutes
        )
      );
    } finally {
      running = false;

      updateScheduler({
        running: false
      });
    }
  }

  function start() {
    if (stopped) {
      throw new Error(
        "A stopped scheduler cannot be restarted."
      );
    }

    console.log("Scheduler started.");

    updateScheduler({
      running: true
    });

    run();
  }

  function stop() {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    updateScheduler({
      running: false,
      nextRun: null
    });

    console.log("Scheduler stopped.");
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createScheduler
};
