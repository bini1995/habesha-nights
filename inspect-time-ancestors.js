const { chromium } = require("playwright");

const AMC_URL =
  "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes";

async function main() {
  const browser = await chromium.launch({ headless: false });

  try {
    const page = await browser.newPage();

    await page.goto(AMC_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const time = page.locator("time").first();

    await time.waitFor();

    const ancestors = await time.evaluate((node) => {
      const results = [];
      let current = node;

      for (let i = 0; i < 8 && current; i++) {
        results.push({
          level: i,
          tag: current.tagName,
          className:
            typeof current.className === "string"
              ? current.className
              : "",
          html: current.outerHTML.slice(0, 800)
        });

        current = current.parentElement;
      }

      return results;
    });

    console.log(JSON.stringify(ancestors, null, 2));

    await page.pause();
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
