const fs = require("fs");
const path = require("path");

const WATCHES_FILE = path.join(
  __dirname,
  "..",
  "config",
  "watches.json"
);

function readWatches() {
  const raw = fs.readFileSync(
    WATCHES_FILE,
    "utf8"
  );

  const watches = JSON.parse(raw);

  if (!Array.isArray(watches)) {
    throw new Error(
      "config/watches.json must contain an array."
    );
  }

  return watches;
}

function writeWatches(watches) {
  fs.writeFileSync(
    WATCHES_FILE,
    JSON.stringify(watches, null, 2) + "\n",
    "utf8"
  );
}

function getAllWatches() {
  return readWatches();
}

function getEnabledWatches() {
  return readWatches().filter((watch) => {
    return watch.enabled !== false;
  });
}

function createWatch(watch) {
  const watches = readWatches();

  if (!watch || typeof watch !== "object") {
    throw new Error("Watch data is required.");
  }

  if (!watch.id || typeof watch.id !== "string") {
    throw new Error("Watch id is required.");
  }

  if (
    watches.some(
      (existingWatch) => existingWatch.id === watch.id
    )
  ) {
    throw new Error(
      `A watch with id "${watch.id}" already exists.`
    );
  }

  if (!watch.provider) {
    throw new Error("Provider is required.");
  }

  if (!watch.pageUrl) {
    throw new Error("Page URL is required.");
  }

  const newWatch = {
    ...watch,
    enabled: watch.enabled !== false
  };

  watches.push(newWatch);
  writeWatches(watches);

  return newWatch;
}

function deleteWatch(id) {
  const watches = readWatches();

  const watchIndex = watches.findIndex(
    (watch) => watch.id === id
  );

  if (watchIndex === -1) {
    throw new Error(
      `No watch found with id "${id}".`
    );
  }

  const [deletedWatch] =
    watches.splice(watchIndex, 1);

  writeWatches(watches);

  return deletedWatch;
}

function setWatchEnabled(id, enabled) {
  const watches = readWatches();

  const watch = watches.find(
    (existingWatch) => existingWatch.id === id
  );

  if (!watch) {
    throw new Error(
      `No watch found with id "${id}".`
    );
  }

  if (typeof enabled !== "boolean") {
    throw new Error(
      "Enabled must be true or false."
    );
  }

  watch.enabled = enabled;
  writeWatches(watches);

  return watch;
}

module.exports = {
  getAllWatches,
  getEnabledWatches,
  createWatch,
  deleteWatch,
  setWatchEnabled
};
