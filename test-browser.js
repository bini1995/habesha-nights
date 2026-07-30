const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const page = await browser.newPage();

  await page.goto("https://example.com");

  console.log("Title:", await page.title());

  // Keep the browser open for 10 seconds
  await page.waitForTimeout(10000);

  await browser.close();
}

main();
