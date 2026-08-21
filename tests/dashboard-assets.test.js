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
