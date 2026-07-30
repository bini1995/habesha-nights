const { chromium } = require("playwright");

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
  }
}

class NoShowtimesError extends Error {
  constructor(message) {
    super(message);
    this.name = "NoShowtimesError";
  }
}

function normalizeText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

async function detectBlocking(page) {
  const title = normalizeText(await page.title().catch(() => ""));
  const bodyText = normalizeText(
    await page.locator("body").innerText().catch(() => "")
  );

  const combinedText = `${title} ${bodyText}`.toLowerCase();

  const isRateLimited =
    combinedText.includes("error 1015") ||
    combinedText.includes("rate limited") ||
    combinedText.includes("too many requests");

  if (isRateLimited) {
    throw new RateLimitError(
      "AMC temporarily rate-limited this connection."
    );
  }

  const isAccessDenied =
    combinedText.includes("access denied") ||
    combinedText.includes("error 1020");

  if (isAccessDenied) {
    throw new Error(
      "AMC denied access. The watcher will not attempt to bypass it."
    );
  }
}

async function discoverDates(page) {
  const values = await page
    .locator('select[name="date"] option')
    .evaluateAll(options =>
      options
        .map(option => option.value)
        .filter(Boolean)
    );

  return values;
}

function buildDateUrl(baseUrl, date) {
  const url = new URL(baseUrl);

  url.searchParams.set("date", date);

  return url.toString();
}


async function runWatcher(config) {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();

    /*
     * Avoid downloading large resources that the watcher does not need.
     * We still load AMC normally and do not bypass security controls.
     */
    await context.route("**/*", async (route) => {
      const resourceType = route.request().resourceType();

      if (
        resourceType === "image" ||
        resourceType === "media" ||
        resourceType === "font"
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });

    const page = await context.newPage();

    const response = await page.goto(config.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    if (response?.status() === 429) {
      throw new RateLimitError(
        "AMC returned HTTP 429 Too Many Requests."
      );
    }

    await detectBlocking(page);

    const {
      formatHeading,
      showtimes
    } = await extractShowtimes(
      page,
      config,
      null
    );


async function extractShowtimes(page, config, date) {
  const movieLink = page.getByRole("link", {
    name: config.movie,
    exact: true
  });

  try {
    await movieLink.waitFor({
    state: "visible",
    timeout: 30000
    });
  } catch (error) {
    await detectBlocking(page);

    throw new Error(
    `Could not find ${config.movie} on the AMC showtimes page.`
    );
  }

  const movieSection = movieLink.locator(
    "xpath=ancestor::section[1]"
  );

  const sectionText = normalizeText(
    await movieSection.innerText()
  );

  if (
    sectionText.includes(
    "No remaining showtimes today"
    )
  ) {
    throw new NoShowtimesError(
    `${config.movie} has no showtimes today.`
    );
  }

  const availableFormats = (
    await movieSection.locator("h3").allInnerTexts()
  )
    .map(normalizeText)
    .filter(Boolean);

  const format = movieSection
    .locator("li")
    .filter({
    has: page.locator("h3").filter({
      hasText: config.format
    })
    })
    .first();

  try {
    await format.waitFor({
    state: "visible",
    timeout: 30000
    });
  } catch {
    throw new Error(
    `Could not find "${config.format}". Formats found: ${availableFormats.join(", ")}`
    );
  }

  const formatHeading = normalizeText(
    await format.locator("h3").innerText()
  );

  const links = format.locator(
    "a[href*='/showtimes/']"
  );

  const showtimes = [];
  const count = await links.count();

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const timeElement = link.locator("time");

    const time = normalizeText(
    await timeElement.innerText()
    );

    const datetime = await timeElement.getAttribute(
    "datetime"
    );

    const href = await link.getAttribute("href");

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
    url: new URL(href, config.pageUrl).href
    });
  }


  return {
    formatHeading,
    showtimes
  };
}

    return {
      theater: config.theater,
      movie: config.movie,
      format: config.format,
      formatHeading,
      checkedAt: new Date().toISOString(),
      showtimeCount: showtimes.length,
      showtimes
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  RateLimitError,
  NoShowtimesError,
  runWatcher
};
