const fs = require("fs/promises");
const path = require("path");

const EVENTS_FILE = path.join(
  __dirname,
  "..",
  "logs",
  "events.json"
);

async function loadEvents() {
  try {
    const data = await fs.readFile(EVENTS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveEvent(event) {
  const events = await loadEvents();

  events.unshift(event);

  await fs.mkdir(path.dirname(EVENTS_FILE), {
    recursive: true
  });

  await fs.writeFile(
    EVENTS_FILE,
    JSON.stringify(events.slice(0, 1000), null, 2) + "\n",
    "utf8"
  );
}

module.exports = {
  loadEvents,
  saveEvent
};
