const { chromium } = require("playwright");
const fs = require("fs/promises");
const path = require("path");

const CONFIG = {
  pageUrl:
    "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes",
  movie: "The Odyssey",
  format: "IMAX 70MM"
};

const OUTPUT_FILE = path.join(
  __dirname,
  "logs",
  "latest-showtimes.json"
);

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function extractShowtimes(page) {
  const movieLink = page.getByRole("link", {
    name: CONFIG.movie,
    exact: true
  });

  await movieLink.waitFor({
    state: "visible",
    timeout: 30000
  });

  const movieSection = movieLink.locator(
    "xpath=ancestor::section[1]"
  );

  const format = movieSection
    .locator("li[role='listitem']")
    .filter({
      has: page.locator("h3").filter({
        hasText: CONFIG.format
      })
    })
    .first();

  await format.waitFor({
    state: "visible",
    timeout: 30000
  });

  const formatHeading = normalizeText(
    await format.locator("h3").innerText()
  );

  const showtimeLinks = format.locator(
    "a[href*='/showtimes/']"
  );

  const showtimeCount = await showtimeLinks.count();

  const showtimes = [];

  for (let index = 0; index < showtimeCount; index += 1) {
    const link = showtimeLinks.nth(index);
    const timeElement = link.locator("time");

    const time = normalizeText(
      await timeElement.innerText()
    );

    const datetime = await timeElement.getAttribute(
      "datetime"
    );

    const relativeUrl = await link.getAttribute("href");

    const statuses = await link
      .locator(".sr-only")
      .allInnerTexts();

    const status =
      statuses
        .map(normalizeText)
        .filter(Boolean)
        .join(", ") || "Available";

    showtimes.push({
      time,
      datetime,
      status,
      url: new URL(relativeUrl, CONFIG.pageUrl).href
    });
  }

  return {
    movie: CONFIG.movie,
    format: CONFIG.format,
    formatHeading,
    theater: "AMC Lincoln Square 13",
    checkedAt: new Date().toISOString(),
    showtimeCount,
    showtimes
  };
}

async function saveResults(results) {
  await fs.mkdir(path.dirname(OUTPUT_FILE), {
    recursive: true
  });

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(results, null, 2),
    "utf8"
  );
}

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();

    console.log(
      `Checking ${CONFIG.movie} — ${CONFIG.format}...`
    );

    await page.goto(CONFIG.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const results = await extractShowtimes(page);

    await saveResults(results);

    console.log(
      `Found ${results.showtimeCount} matching showtimes:\n`
    );

    for (const showtime of results.showtimes) {
      console.log(
        `${showtime.time} — ${showtime.status}`
      );
      console.log(showtime.url);
      console.log("");
    }

    console.log(`Saved results to: ${OUTPUT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Watcher failed:");
  console.error(error);
  process.exit(1);
});
