const test = require("node:test");
const assert = require("node:assert/strict");

const { createDashboardApp } = require("../services/dashboard");

test("Event Finder interface assets are served with browser-safe content types", async (context) => {
  const server = createDashboardApp().listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const expectations = [
    ["/event-finder/", /^text\/html/, /<title>NYC Event Finder<\/title>/],
    ["/event-finder/event-finder.css", /^text\/css/, /\.event-grid/],
    ["/event-finder/event-finder.js", /^(text|application)\/javascript/, /loadQualityHistory/]
  ];

  for (const [route, contentType, marker] of expectations) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type"), contentType, route);
    assert.match(await response.text(), marker, route);
  }
});

test("Sports Hub interface assets are served with browser-safe content types", async (context) => {
  const server = createDashboardApp().listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const expectations = [
    ["/", /^text\/html/, /Sports Hub · Your lineup/],
    ["/sports-hub/", /^text\/html/, /What do you play/],
    ["/sports-hub/football/", /^text\/html/, /Step 1 of 3/],
    ["/sports-hub/basketball/", /^text\/html/, /Fantasy Basketball/],
    ["/sports-hub/soccer/", /^text\/html/, /Fantasy Soccer/],
    ["/sports-hub/import/", /^text\/html/, /Preview import/],
    ["/sports-hub/consumer.css", /^text\/css/, /prefers-reduced-motion/],
    ["/sports-hub/portal.js", /^(text|application)\/javascript/, /roster-images\/parse/],
    ["/sports-hub/sports-hub.css", /^text\/css/, /\.score-layout/],
    ["/sports-hub/sports-import.css", /^text\/css/, /\.import-workspace/],
    ["/sports-hub/sports-hub.js", /^(text|application)\/javascript/, /lockedRecommendationCount/]
  ];
  for (const [route, contentType, marker] of expectations) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type"), contentType, route);
    assert.match(await response.text(), marker, route);
  }
});
