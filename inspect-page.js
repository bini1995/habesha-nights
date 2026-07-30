const { chromium } = require("playwright");

const WATCH = {
  movie: "The Odyssey",
  pageUrl:
    "https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13/showtimes"
};

async function main() {
  const browser = await chromium.launch({
    headless: false
  });

  try {
    const page = await browser.newPage();

    await page.goto(WATCH.pageUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    const movieLink = page.getByRole("link", {
      name: WATCH.movie,
      exact: true
    });

    await movieLink.waitFor({
      timeout: 30000
    });

    console.log("Movie found.");

    const html = await movieLink.evaluate((node) => {
      return node.outerHTML;
    });

    console.log("\n===== MOVIE LINK =====\n");
    console.log(html);

    const parent = await movieLink.evaluate((node) => {
      return node.parentElement?.outerHTML;
    });

    console.log("\n===== PARENT =====\n");
    console.log(parent);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);