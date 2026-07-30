const { chromium } = require("playwright");

const AMC_URL =
  "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes";

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();

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

    const movieSection = odysseyTitle.locator("xpath=ancestor::section[1]");

    const result = await movieSection.evaluate((section) => {
      const timePattern = /^\d{1,2}:\d{2}(am|pm)$/i;

      const allElements = Array.from(section.querySelectorAll("*"));

      const formatHeading = allElements.find((element) =>
        element.textContent
          ?.replace(/\s+/g, " ")
          .trim()
          .toUpperCase()
          .startsWith("IMAX 70MM")
      );

      if (!formatHeading) {
        return {
          foundFormat: false,
          showtimes: []
        };
      }

      let formatContainer = formatHeading.parentElement;

      while (formatContainer && formatContainer !== section) {
        const links = Array.from(
          formatContainer.querySelectorAll("a[href*='/showtimes/']")
        ).map((link) => ({
          text: link.textContent?.replace(/\s+/g, "").trim() || "",
          href: link.href,
          status:
            link.parentElement?.innerText
              ?.replace(/\s+/g, " ")
              .trim() || ""
        }));

        const showtimes = links.filter((link) =>
          timePattern.test(link.text)
        );

        if (showtimes.length > 0) {
          return {
            foundFormat: true,
            formatText:
              formatHeading.textContent
                ?.replace(/\s+/g, " ")
                .trim() || "",
            showtimes
          };
        }

        formatContainer = formatContainer.parentElement;
      }

      return {
        foundFormat: true,
        formatText:
          formatHeading.textContent
            ?.replace(/\s+/g, " ")
            .trim() || "",
        showtimes: []
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("IMAX 70mm extraction failed:");
  console.error(error);
  process.exit(1);
});
