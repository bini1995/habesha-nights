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

async function testServer({ rosterImageParser } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-mobile-"));
  const teamStore = createTeamStore({ file: path.join(directory, "teams.json") });
  const app = express();
  app.use("/api/sports-hub/roster-images", express.json({ limit: "9mb" }));
  app.use(express.json());
  app.use("/api/sports-hub", createSportsHubRouter({
    teamStore,
    importStore: createImportStore({ file: path.join(directory, "imports.json") }),
    analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") }),
    rosterImageParser
  }));
  app.get("/", (request, response) => response.sendFile(path.join(__dirname, "..", "public", "sports-hub", "index.html")));
  app.use(express.static(path.join(__dirname, "..", "public")));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  return { directory, server, teamStore, base: `http://127.0.0.1:${server.address().port}` };
}

test("390px builders validate only the visible step and preserve corrected data", async () => {
  const runtime = await testServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
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
    await browser?.close();
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

test("390px screenshot scan requires consent and creates an editable roster preview", async () => {
  let received;
  const runtime = await testServer({
    rosterImageParser: {
      status() {
        return {
          enabled: true,
          maxBytes: 6 * 1024 * 1024,
          model: "test-model",
          schemaVersion: "test-schema",
          supportedTypes: ["image/png"]
        };
      },
      async parse(input) {
        received = input;
        return {
          extraction: {
            leagueName: "Phone League",
            players: [{
              confidence: 0.96,
              name: "Alex Carter",
              position: "QB",
              projectedFantasyPoints: null,
              role: "STARTER",
              sourceText: "QB Alex Carter",
              status: "ACTIVE"
            }, {
              confidence: 0.72,
              name: "Jordan Miles",
              position: "WR",
              projectedFantasyPoints: null,
              role: "BENCH",
              sourceText: "WR Jordan Miles",
              status: "UNKNOWN"
            }],
            sport: "FOOTBALL",
            teamName: "Screenshot Stars",
            warnings: ["One status was unclear."]
          },
          model: "test-model",
          responseId: "test-response",
          schemaVersion: "test-schema"
        };
      }
    }
  });
  const screenshot = path.join(runtime.directory, "roster.png");
  await fs.writeFile(
    screenshot,
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${runtime.base}/sports-hub/football/`);
    const picker = page.getByRole("button", { name: "Choose screenshot" });
    await picker.waitFor();
    assert.equal(await picker.isEnabled(), true);
    await page.locator("#scan-file").setInputFiles(screenshot);
    await page.getByRole("button", { name: "Scan my roster" }).click();
    assert.match(await page.locator("#scan-status").innerText(), /Confirm the image-processing disclosure/);
    await page.getByLabel(/I agree to send this image/).check();
    await page.getByRole("button", { name: "Scan my roster" }).click();
    await page.getByRole("heading", { name: "Add your lineup" }).waitFor();
    const extractedNames = page.locator(".p-name");
    assert.deepEqual([
      await extractedNames.nth(0).inputValue(),
      await extractedNames.nth(1).inputValue()
    ], ["Alex Carter", "Jordan Miles"]);
    assert.equal(await page.getByLabel("Team name").inputValue(), "Screenshot Stars");
    assert.equal(received.consent, true);
    assert.equal(received.sport, "FOOTBALL");
    assert.match(received.imageDataUrl, /^data:image\/png;base64,/);
    assert.equal((await runtime.teamStore.list()).length, 0);
    await page.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});
