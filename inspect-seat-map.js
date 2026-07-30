const { chromium } = require("playwright");

const SHOWTIME_URL =
  "https://www.amctheatres.com/showtimes/144073418";

async function main() {
  const browser = await chromium.launch({
    headless: false
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1400,
        height: 900
      }
    });

    console.log("Opening showtime:", SHOWTIME_URL);

    await page.goto(SHOWTIME_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("Loaded page:", await page.title());
    console.log("Current URL:", page.url());

    await page.pause();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Could not open seat map:");
  console.error(error);
  process.exit(1);
});
