import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const url = process.env.PAGES_URL;
if (!url) throw Error("PAGES_URL is required");
const expected = (await readFile("dist/index.html", "utf8")).match(
  /<script[^>]+src="([^"]+)"/,
)[1];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await expect(async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.locator('script[src="' + expected + '"]')).toHaveCount(1);
    await page
      .getByRole("button", { name: "Новая партия", exact: true })
      .click({ timeout: 3000 });
    await page
      .getByRole("button", { name: "Начать партию", exact: true })
      .click();
    await page.getByRole("button", { name: "Пропустить", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Завершить ход", exact: true }),
    ).toBeVisible();
  }).toPass({ timeout: 120000, intervals: [2000, 5000] });
} finally {
  await browser.close();
}
