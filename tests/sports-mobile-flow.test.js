const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { chromium } = require("playwright");
const { createSportsHubRouter } = require("../products/sports-hub");
const { createTeamStore } = require("../products/sports-hub/services/team-store");
const { createImportStore } = require("../products/sports-hub/services/import-store");
const { createAnalysisStore } = require("../products/sports-hub/services/analysis-store");

async function testServer() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-mobile-"));
  const app = express();
  app.use(express.json());
  app.use("/api/sports-hub", createSportsHubRouter({
    teamStore: createTeamStore({ file: path.join(directory, "teams.json") }),
    importStore: createImportStore({ file: path.join(directory, "imports.json") }),
    analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") })
  }));
  app.get("/", (request, response) => response.sendFile(path.join(__dirname, "..", "public", "sports-hub", "index.html")));
  app.use(express.static(path.join(__dirname, "..", "public")));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  return { directory, server, base: `http://127.0.0.1:${server.address().port}` };
}

test("390px builders validate only the visible step and preserve corrected data", async () => {
  const runtime = await testServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const sport of ["football", "basketball", "soccer"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${runtime.base}/sports-hub/${sport}/`);
      await page.getByLabel("Team name").fill(`${sport} mobile team`);
      await page.getByRole("button", { name: "Next: add lineup" }).click();
      await assert.doesNotReject(() => page.getByRole("heading", { name: "Add your lineup" }).waitFor());

      await page.getByRole("button", { name: "Back" }).click();
      assert.equal(await page.getByLabel("Team name").inputValue(), `${sport} mobile team`);
      await page.getByRole("button", { name: "Next: add lineup" }).click();
      await page.getByRole("button", { name: "Review lineup" }).click();
      assert.match(await page.locator("#step-error").innerText(), /Add a name for each lineup spot/);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("p-name")), true);

      const names = page.locator(".p-name");
      for (let index = 0; index < await names.count(); index += 1) await names.nth(index).fill(`${sport} player ${index + 1}`);
      await page.getByRole("button", { name: "Review lineup" }).click();
      await page.getByRole("button", { name: "Back" }).click();
      assert.equal(await names.first().inputValue(), `${sport} player 1`);
      await page.getByRole("button", { name: "Review lineup" }).click();
      await page.getByRole("button", { name: "Get my score" }).click();
      await page.getByText("Your Team Score").waitFor();
      assert.match(await page.locator(".technical").textContent(), /Missing projections are never invented/);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});

test("root metadata and mobile navigation present Sports Hub first with legacy tools in Labs", async () => {
  const html = await fs.readFile(path.join(__dirname, "..", "public", "sports-hub", "index.html"), "utf8");
  assert.match(html, /<title>Sports Hub/);
  assert.match(html, /rel="canonical" href="\/"/);
  assert.match(html, /aria-label="Sports navigation"/);
  assert.match(html, /<summary>Labs & more<\/summary>/);
  assert.doesNotMatch(html.match(/<nav class="topbar"[\s\S]*?<\/nav>/)[0], /Opportunity Agent|Event Finder/);
});
