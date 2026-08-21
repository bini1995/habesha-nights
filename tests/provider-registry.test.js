const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProvider,
  getSupportedProviders
} = require("../services/providers");

test("lists supported providers", () => {
  assert.deepEqual(getSupportedProviders(), ["AMC"]);
});

test("resolves provider names case-insensitively", () => {
  const provider = getProvider("  amc  ");

  assert.equal(typeof provider.runWatcher, "function");
  assert.equal(typeof provider.RateLimitError, "function");
  assert.equal(typeof provider.NoShowtimesError, "function");
});

test("rejects a missing provider", () => {
  assert.throws(
    () => getProvider(),
    /A watch provider is required\./
  );
});

test("rejects an unsupported provider", () => {
  assert.throws(
    () => getProvider("Ticketmaster"),
    /Unsupported watch provider: "Ticketmaster"\./
  );
});
