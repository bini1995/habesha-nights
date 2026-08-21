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
  const title = normalizeText(
    await page.title().catch(() => "")
  );

  const bodyText = normalizeText(
    await page.locator("body").innerText().catch(() => "")
  );

  const combinedText = `${title} ${bodyText}`.toLowerCase();

  if (
    combinedText.includes("error 1015") ||
    combinedText.includes("rate limited") ||
    combinedText.includes("too many requests")
  ) {
    throw new RateLimitError(
      "AMC temporarily rate-limited this connection."
    );
  }

  if (
    combinedText.includes("access denied") ||
    combinedText.includes("error 1020")
  ) {
    throw new Error(
      "AMC denied access. The watcher will not attempt to bypass it."
    );
  }
}

async function loadPage(page, url) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  if (response?.status() === 429) {
    throw new RateLimitError(
      "AMC returned HTTP 429 Too Many Requests."
    );
  }

  await detectBlocking(page);
}

async function discoverDates(page) {
  const select = page.locator(
    'select[name="date"]'
  );

  await select
    .waitFor({
      state: "attached",
      timeout: 15000
    })
    .catch(() => {});

  if ((await select.count()) === 0) {
    return {
      dates: [],
      selectedDate: null
    };
  }

  return select.evaluate((element) => {
    const dates = Array.from(element.options)
      .map((option) => option.value)
      .filter(Boolean);

    return {
      dates: [...new Set(dates)],
      selectedDate: element.value || null
    };
  });
}

function buildDateUrl(baseUrl, date) {
  const url = new URL(baseUrl);

  if (date) {
    url.searchParams.set("date", date);
  }

  return url.toString();
}

async function extractShowtimes(
  page,
  config,
  date
) {
  const movieLink = page
    .getByRole("link", {
      name: config.movie,
      exact: true
    })
    .first();

  try {
    await movieLink.waitFor({
      state: "visible",
      timeout: 30000
    });
  } catch {
    await detectBlocking(page);

    return {
      date,
      movieFound: false,
      formatFound: false,
      formatHeading: null,
      showtimes: []
    };
  }

  const movieSection = movieLink.locator(
    "xpath=ancestor::section[1]"
  );

  const sectionText = normalizeText(
    await movieSection.innerText()
  ).toLowerCase();

  if (
    sectionText.includes(
      "no remaining showtimes today"
    ) ||
    sectionText.includes(
      "no showtimes available"
    )
  ) {
    return {
      date,
      movieFound: true,
      formatFound: false,
      formatHeading: null,
      showtimes: []
    };
  }

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
      timeout: 5000
    });
  } catch {
    return {
      date,
      movieFound: true,
      formatFound: false,
      formatHeading: null,
      showtimes: []
    };
  }

  const formatHeading = normalizeText(
    await format.locator("h3").innerText()
  );

  const links = format.locator(
    "a[href*='/showtimes/']"
  );

  const showtimes = [];
  const count = await links.count();

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const link = links.nth(index);
    const timeElement = link.locator("time");

    const time = normalizeText(
      await timeElement.innerText()
    );

    const datetime =
      await timeElement.getAttribute(
        "datetime"
      );

    const href = await link.getAttribute(
      "href"
    );

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
      url: href
        ? new URL(
            href,
            config.pageUrl
          ).href
        : config.pageUrl
    });
  }

  return {
    date,
    movieFound: true,
    formatFound: true,
    formatHeading,
    showtimes
  };
}

function deduplicateShowtimes(
  showtimes
) {
  const unique = new Map();

  for (const showtime of showtimes) {
    const key = [
      showtime.datetime ?? "",
      showtime.time ?? "",
      showtime.url ?? ""
    ].join("|");

    if (!unique.has(key)) {
      unique.set(key, showtime);
    }
  }

  return [...unique.values()].sort(
    (first, second) => {
      const firstValue =
        first.datetime ??
        first.time ??
        "";

      const secondValue =
        second.datetime ??
        second.time ??
        "";

      return firstValue.localeCompare(
        secondValue
      );
    }
  );
}

async function scanDate(
  page,
  config,
  date
) {
  await loadPage(
    page,
    buildDateUrl(
      config.pageUrl,
      date
    )
  );

  return extractShowtimes(
    page,
    config,
    date
  );
}

async function runWatcher(config) {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context =
      await browser.newContext();

    await context.route(
      "**/*",
      async (route) => {
        const resourceType =
          route
            .request()
            .resourceType();

        if (
          resourceType === "image" ||
          resourceType === "media" ||
          resourceType === "font"
        ) {
          await route.abort();
          return;
        }

        await route.continue();
      }
    );

    const page =
      await context.newPage();

    await loadPage(
      page,
      config.pageUrl
    );

    const {
      dates,
      selectedDate
    } = await discoverDates(page);

    const configuredMaxDates =
      Number.parseInt(
        config.maxDatesToScan,
        10
      );

    const maxDatesToScan =
      Number.isInteger(
        configuredMaxDates
      ) &&
      configuredMaxDates > 0
        ? configuredMaxDates
        : 14;

    const orderedDates =
      dates.length === 0
        ? [null]
        : selectedDate &&
            dates.includes(
              selectedDate
            )
          ? [
              selectedDate,
              ...dates.filter(
                (date) =>
                  date !==
                  selectedDate
              )
            ]
          : [null, ...dates];

    const datesToScan =
      orderedDates.slice(
        0,
        maxDatesToScan
      );

    console.log(
      `Discovered ${datesToScan.length} AMC date page(s).`
    );

    const scanResults = [];
    const allShowtimes = [];

    for (
      let index = 0;
      index < datesToScan.length;
      index += 1
    ) {
      const date =
        datesToScan[index];

      console.log(
        `Scanning AMC date ${date ?? "current page"}...`
      );

      const useCurrentPage =
        index === 0 &&
        (
          date === selectedDate ||
          date === null
        );

      const result =
        useCurrentPage
          ? await extractShowtimes(
              page,
              config,
              date
            )
          : await scanDate(
              page,
              config,
              date
            );

      console.log(
        `Found ${result.showtimes.length} matching showtime(s) for ${date ?? "the current page"}.`
      );

      scanResults.push(result);

      allShowtimes.push(
        ...result.showtimes
      );

      if (
        index <
        datesToScan.length - 1
      ) {
        await page.waitForTimeout(
          500
        );
      }
    }

    const showtimes =
      deduplicateShowtimes(
        allShowtimes
      );

    if (showtimes.length === 0) {
      const movieWasFound =
        scanResults.some(
          (result) =>
            result.movieFound
        );

      const formatWasFound =
        scanResults.some(
          (result) =>
            result.formatFound
        );

      if (!movieWasFound) {
        throw new NoShowtimesError(
          `${config.movie} was not found on any of the ${datesToScan.length} AMC date page(s) scanned.`
        );
      }

      if (!formatWasFound) {
        throw new NoShowtimesError(
          `${config.movie} was found, but "${config.format}" had no showtimes across the ${datesToScan.length} AMC date page(s) scanned.`
        );
      }

      throw new NoShowtimesError(
        `${config.movie} has no matching showtimes across the ${datesToScan.length} AMC date page(s) scanned.`
      );
    }

    const formatHeading =
      scanResults.find(
        (result) =>
          result.formatHeading
      )?.formatHeading ??
      config.format;

    return {
      theater: config.theater,
      movie: config.movie,
      format: config.format,
      formatHeading,
      checkedAt:
        new Date().toISOString(),
      showtimeCount:
        showtimes.length,
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
