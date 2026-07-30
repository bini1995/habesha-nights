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

    const children = await movieSection.evaluate((section) => {
      return Array.from(section.children).map((child, index) => {
        const showtimeLinks = Array.from(
          child.querySelectorAll("a[href*='/showtimes/']")
        ).map((link) => ({
          text: link.textContent?.replace(/\s+/g, " ").trim() || "",
          href: link.href
        }));

        return {
          index,
          tag: child.tagName,
          className:
            typeof child.className === "string"
              ? child.className
              : "",
          text: (child.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1200),
          showtimeLinks
        };
      });
    });

    console.log(JSON.stringify(children, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Format inspection failed:");
  console.error(error);
  process.exit(1);
});
