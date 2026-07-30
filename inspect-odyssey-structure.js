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

    const ancestors = await odysseyTitle.evaluate((element) => {
      const results = [];
      let current = element;

      for (let level = 0; level <= 8 && current; level += 1) {
        results.push({
          level,
          tag: current.tagName,
          className:
            typeof current.className === "string"
              ? current.className
              : "",
          text: (current.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 700)
        });

        current = current.parentElement;
      }

      return results;
    });

    for (const ancestor of ancestors) {
      console.log(`\n========== LEVEL ${ancestor.level} ==========`);
      console.log("Tag:", ancestor.tag);
      console.log("Class:", ancestor.className || "(none)");
      console.log("Text:", ancestor.text || "(none)");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Structure inspection failed:");
  console.error(error);
  process.exit(1);
});
