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
const { createCheckInStore } = require("../products/sports-hub/services/check-in-store");
const { createMiniLeagueStore } = require("../products/sports-hub/services/mini-league-store");

async function testServer({ playerIdentityService, rosterImageParser } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sports-mobile-"));
  const teamStore = createTeamStore({ file: path.join(directory, "teams.json") });
  const app = express();
  app.use("/api/sports-hub/roster-images", express.json({ limit: "9mb" }));
  app.use(express.json());
  app.use("/api/sports-hub", createSportsHubRouter({
    teamStore,
    importStore: createImportStore({ file: path.join(directory, "imports.json") }),
    analysisStore: createAnalysisStore({ file: path.join(directory, "analyses.json") }),
    checkInStore: createCheckInStore({ file: path.join(directory, "check-ins.json") }),
    miniLeagueStore: createMiniLeagueStore({ file: path.join(directory, "mini-leagues.json") }),
    playerIdentityService,
    rosterImageParser
  }));
  app.get("/vendor/supabase.js", (request, response) => response.sendFile(
    path.join(
      path.dirname(require.resolve("@supabase/supabase-js/package.json")),
      "dist",
      "umd",
      "supabase.js"
    )
  ));
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

test("390px account page explains local mode without exposing a broken login", async () => {
  const runtime = await testServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${runtime.base}/sports-hub/account/`);
    await page.getByRole("heading", { name: "Local Sports Hub is ready." }).waitFor();
    assert.equal(await page.locator("#account-signin").isHidden(), true);
    assert.equal(await page.getByRole("link", { name: "Use local leagues" }).isVisible(), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
    await page.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});

test("390px results save a check-in and open the team progress timeline", async () => {
  const runtime = await testServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${runtime.base}/sports-hub/football/?demo=1`);
    await page.getByText("Your Team Score").waitFor();
    await page.getByRole("button", { name: "Save check-in" }).click();
    await page.getByText(/Baseline saved at/).waitFor();
    await page.getByRole("link", { name: "View progress" }).click();
    await page.getByRole("heading", { name: "See what changed." }).waitFor();
    await page.getByText("Latest Team Score").waitFor();
    assert.match(await page.locator("#history-summary").innerText(), /First check-in/i);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
    await page.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});

test("390px mini-league flow proposes, approves, and locks an official result", async () => {
  const runtime = await testServer();
  let browser;
  try {
    const football = require("../products/sports-hub/fixtures/football-team.json");
    await runtime.teamStore.save(football);
    await runtime.teamStore.save({
      ...football,
      id: "mobile-rivals",
      name: "Mobile Rivals"
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${runtime.base}/sports-hub/leagues/`);
    await page.getByRole("heading", { name: "Play together." }).waitFor();

    const createForm = page.locator("#create-league");
    await createForm.getByLabel("League name").fill("Sunday Crew");
    await createForm.getByLabel("Your display name").fill("Avery");
    await createForm.getByLabel("Your saved team Optional").selectOption(football.id);
    await createForm.getByRole("button", { name: "Create private league" }).click();
    await page.getByRole("heading", { name: "Save your private keys." }).waitFor();
    const code = await page.locator("#invite-code").innerText();
    const commissionerKey = await page.locator("#commissioner-key-value").innerText();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.match(commissionerKey, /^[A-Za-z0-9_-]{32,128}$/);

    await page.getByRole("button", { name: "All leagues" }).click();
    const joinForm = page.locator("#join-league");
    await joinForm.getByLabel("League code").fill(code);
    await joinForm.getByLabel("Your display name").fill("Blake");
    await joinForm.getByLabel(/Your saved team/).selectOption("mobile-rivals");
    await joinForm.getByRole("button", { name: "Join league" }).click();
    await page.getByText("2 managers · 14 scoring periods").waitFor();
    const memberKey = await page.locator("#member-key-value").innerText();
    assert.match(memberKey, /^[A-Za-z0-9_-]{32,128}$/);

    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "League access required" }).waitFor();
    await page.getByLabel("Member key").fill(memberKey);
    await page.getByRole("button", { name: "Unlock proposals" }).click();
    await page.getByText("Blake can now propose matchup scores.").waitFor();

    const matchup = page.locator(".matchup-card").first();
    await matchup.locator('input[name="homePoints"]').fill("121.5");
    await matchup.locator('input[name="awayPoints"]').fill("116.25");
    await matchup.getByRole("button", { name: "Propose result" }).click();
    await page.getByText("Proposal sent. Standings will wait for commissioner approval.").waitFor();
    assert.match(await page.locator(".standings-list").innerText(), /0-0-0/);

    await page.getByLabel("Commissioner key").fill(commissionerKey);
    await page.getByRole("button", { name: "Unlock controls" }).click();
    await page.getByText("Commissioner controls unlocked for this browser session.").waitFor();
    await page.locator(".proposal-card.pending").getByRole("button", { name: "Approve" }).click();
    await page.getByText("Proposal approved. Standings updated.").waitFor();
    await page.getByText("Scoring started").waitFor();
    assert.match(await page.locator(".standings-list").innerText(), /1-0-0/);
    assert.match(await page.locator(".score-truth").innerText(), /never changes wins or losses/i);
    await page.getByRole("button", { name: "Lock period 1" }).click();
    await page.locator("#commissioner-status").getByText("Scoring period 1 locked.").waitFor();
    assert.equal(await matchup.locator('input[name="homePoints"]').isDisabled(), true);
    assert.match(await page.locator("#activity-list").innerText(), /Scoring period 1 locked/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
    await page.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});

test("390px screenshot scan requires consent and creates an editable roster preview", async () => {
  let received;
  const runtime = await testServer({
    playerIdentityService: {
      status() {
        return {
          enabled: true,
          liveData: false,
          provider: {
            capabilities: ["PLAYER_DIRECTORY"],
            id: "test-directory",
            live: false,
            mode: "OFFLINE_SAMPLE",
            name: "Test directory",
            updatedAt: "2026-08-21T00:00:00.000Z"
          },
          schemaVersion: "test-identity-schema"
        };
      },
      async resolveRoster() {
        const provider = this.status().provider;
        return {
          counts: { ambiguous: 1, matched: 1, unmatched: 0 },
          provider,
          resolvedAt: "2026-08-21T12:00:00.000Z",
          schemaVersion: "test-identity-schema",
          sport: "FOOTBALL",
          results: [{
            candidates: [{
              confidence: 1,
              id: "f-qb-a",
              matchMethod: "EXACT_NAME",
              name: "Alex Carter",
              position: "QB",
              providerId: provider.id,
              providerPlayerId: "provider-alex",
              sport: "FOOTBALL",
              teamLabel: "Brooklyn Test"
            }],
            input: { name: "Alex Carter", position: "QB", sport: "FOOTBALL" },
            inputIndex: 0,
            selectedPlayerId: "f-qb-a",
            status: "MATCHED"
          }, {
            candidates: [{
              confidence: 0.86,
              id: "f-wr-a",
              matchMethod: "FUZZY",
              name: "Jordan Miles",
              position: "WR",
              providerId: provider.id,
              providerPlayerId: "provider-jordan-a",
              sport: "FOOTBALL",
              teamLabel: "Queens Test"
            }, {
              confidence: 0.82,
              id: "f-wr-b",
              matchMethod: "FUZZY",
              name: "Jordan Miles",
              position: "WR",
              providerId: provider.id,
              providerPlayerId: "provider-jordan-b",
              sport: "FOOTBALL",
              teamLabel: "Bronx Test"
            }],
            input: { name: "Jordan Miles", position: "WR", sport: "FOOTBALL" },
            inputIndex: 1,
            selectedPlayerId: null,
            status: "AMBIGUOUS"
          }]
        };
      }
    },
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
    const identityChoice = page.getByLabel("Which player is this?");
    await identityChoice.waitFor();
    await page.getByRole("button", { name: "Review lineup" }).click();
    assert.match(await page.locator("#step-error").innerText(), /Choose the matching player/);
    await identityChoice.selectOption("f-wr-b");
    await page.getByRole("button", { name: "Review lineup" }).click();
    await page.getByRole("button", { name: "Get my score" }).click();
    await page.getByText("Your Team Score").waitFor();
    const savedTeams = await runtime.teamStore.list();
    assert.equal(savedTeams.length, 1);
    assert.equal(savedTeams[0].roster[0].player.identity.matchMethod, "EXACT_NAME");
    assert.equal(savedTeams[0].roster[1].player.identity.matchMethod, "USER_CONFIRMED");
    assert.equal(savedTeams[0].roster[1].player.identity.canonicalPlayerId, "f-wr-b");
    await page.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => runtime.server.close(resolve));
    await fs.rm(runtime.directory, { recursive: true, force: true });
  }
});
