const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");

const watchesRouter = require("../routes/watches");
const { createWatchService, DEFAULT_WATCHES_FILE } = require("../services/watch-service");

async function fixture(context) {
  const realBefore = await fs.readFile(DEFAULT_WATCHES_FILE, "utf8");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "watch-crud-"));
  const watchesFile = path.join(directory, "watches.json");
  await fs.writeFile(watchesFile, "[]\n", "utf8");
  context.after(async () => {
    assert.equal(await fs.readFile(DEFAULT_WATCHES_FILE, "utf8"), realBefore);
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { watchesFile, watchService: createWatchService({ watchesFile }) };
}

function validWatch(overrides = {}) {
  return {
    id: "fixture-watch",
    provider: "AMC",
    movie: "Fixture Movie",
    pageUrl: "https://example.com/showtimes",
    ...overrides
  };
}

test("watch validation rejects malformed IDs, providers, and URLs in an isolated file", async (context) => {
  const { watchService } = await fixture(context);
  assert.throws(() => watchService.createWatch(validWatch({ id: "bad id!" })), /Watch id must/);
  assert.throws(() => watchService.createWatch(validWatch({ provider: "Unknown" })), /Unsupported watch provider/);
  assert.throws(() => watchService.createWatch(validWatch({ pageUrl: "javascript:alert(1)" })), /valid http or https/);
  assert.deepEqual(watchService.getAllWatches(), []);
});

test("watch CRUD API creates, lists, toggles, and deletes using a temporary config", async (context) => {
  const { watchService } = await fixture(context);
  const app = express();
  app.use(express.json());
  app.use("/api/watches", watchesRouter.createWatchesRouter({ watchService }));
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/watches`;

  const created = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validWatch())
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).watch.enabled, true);
  assert.equal((await (await fetch(base)).json()).watches.length, 1);

  const duplicate = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validWatch())
  });
  assert.equal(duplicate.status, 400);

  const toggled = await fetch(`${base}/fixture-watch/enabled`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  });
  assert.equal((await toggled.json()).watch.enabled, false);
  assert.equal((await fetch(`${base}/fixture-watch`, { method: "DELETE" })).status, 200);
  assert.deepEqual(watchService.getAllWatches(), []);
});
