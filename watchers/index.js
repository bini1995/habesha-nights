const amcWatcher = require("./amc");

const watchers = {
  AMC: amcWatcher
};

function getWatcher(provider) {
  if (!provider || typeof provider !== "string") {
    throw new Error("A watch provider is required.");
  }

  const normalizedProvider = provider.trim().toUpperCase();
  const watcher = watchers[normalizedProvider];

  if (!watcher) {
    throw new Error(
      `Unsupported watch provider: "${provider}".`
    );
  }

  return watcher;
}

function getSupportedProviders() {
  return Object.keys(watchers);
}

module.exports = {
  getWatcher,
  getSupportedProviders
};
