const { chromium } = require("playwright");

const AMC_URL =
  "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes";

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

    console.log("Opening AMC...");

    await page.goto(AMC_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const odysseyTitle = page.getByRole("link", {
      name: "The Odyssey",
      exact: true
    });

    await odysseyTitle.waitFor({
      state: "visible",
      timeout: 30000
    });

    await odysseyTitle.scrollIntoViewIfNeeded();

    const result = await odysseyTitle.evaluate((titleElement) => {
      const timePattern = /^\d{1,2}:\d{2}(am|pm)$/i;

      let currentElement = titleElement.parentElement;

      while (currentElement && currentElement !== document.body) {
        const links = Array.from(
          currentElement.querySelectorAll("a")
        ).map((link) => ({
          text: link.textContent?.trim() || "",
          href: link.href,
          ariaLabel: link.getAttribute("aria-label")
        }));

        const showtimes = links.filter((link) =>
          timePattern.test(link.text.replace(/\s+/g, ""))
        );

        if (showtimes.length > 0) {
          return {
            sectionText: currentElement.innerText,
            showtimes
          };
        }

        currentElement = currentElement.parentElement;
      }

      return {
        sectionText: "",
        showtimes: []
      };
    });

    console.log("\nOdyssey showtimes found:");
    console.log(JSON.stringify(result.showtimes, null, 2));

    if (result.showtimes.length === 0) {
      console.log("\nNo showtime links were found.");
      process.exitCode = 1;
    }

    console.log("\nBrowser will remain open for 15 seconds.");
    await page.waitForTimeout(15000);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Showtime extraction failed:");
  console.error(error);
  process.exit(1);
});
