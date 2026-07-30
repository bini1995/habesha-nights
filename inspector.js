const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: false
  });

  const page = await browser.newPage({
    viewport: {
      width: 1400,
      height: 900
    }
  });

  console.log("Opening AMC Lincoln Square...");

  await page.goto(
    "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes",
    {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }
  );

  console.log("Loaded:", await page.title());

  await page.pause();

  await browser.close();
})();
