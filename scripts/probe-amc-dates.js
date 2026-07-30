
const fs = require("fs");
const { chromium } = require("playwright");

function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

(async () => {
  const watches = JSON.parse(
    fs.readFileSync("config/watches.json", "utf8")
  );

  const watch = watches[0];

  console.log("Opening:");
  console.log(watch.pageUrl);
  console.log("");

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();

    await page.goto(watch.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(8000);

    console.log("Final loaded URL:");
    console.log(page.url());
    console.log("");

    const selects = await page.locator("select").evaluateAll(
      (elements) =>
        elements.map((select, index) => ({
          index,
          name: select.getAttribute("name"),
          id: select.id || null,
          ariaLabel: select.getAttribute("aria-label"),
          options: Array.from(select.options).map((option) => ({
            text: option.textContent?.replace(/\s+/g, " ").trim(),
            value: option.value,
            selected: option.selected
          }))
        }))
    );

    console.log("Native dropdowns:");
    console.log(JSON.stringify(selects, null, 2));
    console.log("");

    const candidates = await page.locator(
      "a, button, [role='button'], [role='option'], [role='menuitem']"
    ).evaluateAll((elements) => {
      const datePattern =
        /\b(today|tomorrow|sun|mon|tue|wed|thu|fri|sat|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

      return elements
        .map((element) => {
          const text =
            element.textContent
              ?.replace(/\s+/g, " ")
              .trim() || "";

          return {
            tag: element.tagName,
            text,
            href: element.href || null,
            role: element.getAttribute("role"),
            ariaLabel: element.getAttribute("aria-label"),
            dataValue:
              element.getAttribute("data-value") ||
              element.getAttribute("data-date") ||
              null
          };
        })
        .filter((item) => {
          return (
            datePattern.test(item.text) ||
            datePattern.test(item.ariaLabel || "") ||
            /date|showtime/i.test(item.href || "") ||
            item.dataValue
          );
        })
        .slice(0, 200);
    });

    console.log("Possible date controls and URLs:");
    console.log(JSON.stringify(candidates, null, 2));
    console.log("");

    const bodyText = normalizeText(
      await page.locator("body").innerText().catch(() => "")
    );

    console.log("Page contains movie:");
    console.log(bodyText.includes(watch.movie));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("");
  console.error("Probe failed:");
  console.error(error);
  process.exitCode = 1;
});
