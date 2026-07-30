const { saveEvent } = require("./event-store");
const { broadcast } = require("./websocket");

const state = {
  startedAt: new Date().toISOString(),

  scheduler: {
    running: false,
    nextRun: null,
    lastRun: null
  },

  monitor: {
    status: "Idle",
    lastCheck: null,
    lastResult: null
  },

  stats: {
    totalChecks: 0,
    successfulChecks: 0,
    notificationsSent: 0,
    rateLimits: 0,
    errors: 0
  },

  watches: [],

  recentEvents: []
};

function getState() {
  return state;
}

function updateScheduler(updates) {
  Object.assign(state.scheduler, updates);
}

function updateMonitor(updates) {
  Object.assign(state.monitor, updates);
}

function incrementStat(statName) {
  if (typeof state.stats[statName] === "number") {
    state.stats[statName]++;
  }
}

function setWatches(watches) {
  state.watches = watches;
}

function addEvent(event) {
  const newEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };

  state.recentEvents.unshift(newEvent);

  state.recentEvents =
    state.recentEvents.slice(0, 50);

  saveEvent(newEvent).catch((error) => {
    console.error(
      "Failed to persist event:",
      error
    );
  });

  broadcast("event", newEvent);
}

module.exports = {
  getState,
  updateScheduler,
  updateMonitor,
  incrementStat,
  setWatches,
  addEvent
};
