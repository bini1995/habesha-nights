const { chromium } = require("playwright");

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

    await page.goto(
      "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    const odysseyTitle = page.getByRole("link", {
      name: "The Odyssey",
      exact: true
    });

    await odysseyTitle.waitFor({
      state: "visible",
      timeout: 30000
    });

    console.log("Found movie:", await odysseyTitle.textContent());
    console.log("Number of exact link matches:", await odysseyTitle.count());

    await odysseyTitle.scrollIntoViewIfNeeded();
    await odysseyTitle.highlight();

    console.log("The browser will stay open for 20 seconds.");
    await page.waitForTimeout(20000);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Could not find The Odyssey:");
  console.error(error);
  process.exit(1);
});
