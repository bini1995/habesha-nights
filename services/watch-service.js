const fs = require("fs");
const path = require("path");
const { getProvider } = require("./providers");

const DEFAULT_WATCHES_FILE = path.join(__dirname, "..", "config", "watches.json");

function createWatchService({ watchesFile = DEFAULT_WATCHES_FILE } = {}) {
  function readWatches() {
    const watches = JSON.parse(fs.readFileSync(watchesFile, "utf8"));
    if (!Array.isArray(watches)) throw new Error("Watches file must contain an array.");
    return watches;
  }

  function writeWatches(watches) {
    fs.writeFileSync(watchesFile, `${JSON.stringify(watches, null, 2)}\n`, "utf8");
  }

  function getAllWatches() {
    return readWatches();
  }

  function getEnabledWatches() {
    return readWatches().filter((watch) => watch.enabled !== false);
  }

  function validateNewWatch(watch) {
    if (!watch || typeof watch !== "object" || Array.isArray(watch)) {
      throw new Error("Watch data is required.");
    }
    if (typeof watch.id !== "string" || !watch.id.trim()) {
      throw new Error("Watch id is required.");
    }
    const id = watch.id.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id)) {
      throw new Error("Watch id must use 1-80 letters, numbers, hyphens, or underscores.");
    }
    if (typeof watch.provider !== "string" || !watch.provider.trim()) {
      throw new Error("Provider is required.");
    }
    getProvider(watch.provider);
    if (typeof watch.pageUrl !== "string" || !watch.pageUrl.trim()) {
      throw new Error("Page URL is required.");
    }
    let url;
    try {
      url = new URL(watch.pageUrl);
    } catch {
      throw new Error("Page URL must be a valid http or https URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Page URL must be a valid http or https URL.");
    }
    return {
      ...watch,
      id,
      provider: watch.provider.trim().toUpperCase(),
      pageUrl: url.toString(),
      enabled: watch.enabled !== false
    };
  }

  function createWatch(watch) {
    const watches = readWatches();
    const newWatch = validateNewWatch(watch);
    if (watches.some((existingWatch) => existingWatch.id === newWatch.id)) {
      throw new Error(`A watch with id "${newWatch.id}" already exists.`);
    }
    watches.push(newWatch);
    writeWatches(watches);
    return newWatch;
  }

  function deleteWatch(id) {
    const watches = readWatches();
    const watchIndex = watches.findIndex((watch) => watch.id === id);
    if (watchIndex === -1) throw new Error(`No watch found with id "${id}".`);
    const [deletedWatch] = watches.splice(watchIndex, 1);
    writeWatches(watches);
    return deletedWatch;
  }

  function setWatchEnabled(id, enabled) {
    const watches = readWatches();
    const watch = watches.find((existingWatch) => existingWatch.id === id);
    if (!watch) throw new Error(`No watch found with id "${id}".`);
    if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false.");
    watch.enabled = enabled;
    writeWatches(watches);
    return watch;
  }

  return {
    createWatch,
    deleteWatch,
    getAllWatches,
    getEnabledWatches,
    setWatchEnabled,
    validateNewWatch
  };
}

const defaultService = createWatchService();

module.exports = {
  DEFAULT_WATCHES_FILE,
  createWatchService,
  ...defaultService
};
