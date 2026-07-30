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

    const movieSection = odysseyTitle.locator(
      "xpath=ancestor::section[1]"
    );

    const items = await movieSection.evaluate((section) => {
      const formatList = section.querySelector("ul");

      if (!formatList) {
        return [];
      }

      return Array.from(formatList.children).map((item, index) => {
        const links = Array.from(
          item.querySelectorAll("a[href*='/showtimes/']")
        ).map((link) => ({
          text: link.innerText.replace(/\s+/g, " ").trim(),
          href: link.href
        }));

        return {
          index,
          tag: item.tagName,
          className:
            typeof item.className === "string"
              ? item.className
              : "",
          text: (item.innerText || "")
            .replace(/\s+/g, " ")
            .trim(),
          links
        };
      });
    });

    console.log(JSON.stringify(items, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Format item inspection failed:");
  console.error(error);
  process.exit(1);
});
