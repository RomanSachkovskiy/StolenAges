import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
try {
  for (const [width, height] of [
    [320, 568],
    [360, 800],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width <= 1024,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://atlas.test/StolenAges/**", async (route) => {
      const pathname =
        new URL(route.request().url()).pathname.slice("/StolenAges/".length) ||
        "index.html";
      await route.fulfill({
        body: await readFile(resolve("dist", pathname)),
        contentType: pathname.endsWith(".js")
          ? "application/javascript"
          : pathname.endsWith(".css")
            ? "text/css"
            : "text/html",
      });
    });
    const button = (s) => page.getByRole("button", { name: s, exact: true });
    await page.goto("https://atlas.test/StolenAges/");
    await button("Новая партия").click();
    await button("Пропустить").click();
    const zoom = async () =>
      parseInt(await page.locator(".scaleLabel").textContent());
    const base = await zoom();
    await button("Приблизить").click();
    expect(await zoom()).toBeGreaterThan(base);
    await button("Отдалить").click();
    expect(await zoom()).toBe(base);
    await button("К столице").click();
    await page.mouse.move(width * 0.4, height * 0.45);
    await page.mouse.wheel(0, -120);
    await button("Настоящее").click();
    await button("Действия").click();
    await button("Ферма").click();
    const save = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("stolen-ages.v1")));
    expect((await save()).ap).toBe(2);
    await button("Закрыть").click();
    await button("Меню").click();
    await button("Настройки").click();
    await button("English").click();
    await button("Back").click();
    await button("Continue").click();
    await expect(button("Present")).toHaveClass("on");
    expect((await save()).ap).toBe(2);
    await page.reload();
    await expect(button("End turn")).toBeVisible();
    await page.setViewportSize({ width: height, height: width });
    await expect(button("End turn")).toBeInViewport();
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await button("Menu").click();
    await button("Settings").click();
    await button("Русский").click();
    await button("Назад").click();
    await button("Продолжить").click();
    if (width === 390 || width === 1920) {
      await button("К столице").click();
      await page.waitForTimeout(180);
      if (process.env.SCREENSHOTS)
        await page.screenshot({ path: "docs/screenshots/" + width + ".png" });
    }
    if (width === 390) {
      const client = await context.newCDPSession(page);
      const touch = (type, points) =>
        client.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: points.map(([x, y], id) => ({ x, y, id })),
        });
      const priorZoom = await zoom();
      await touch("touchStart", [
        [120, 340],
        [200, 340],
      ]);
      await touch("touchMove", [
        [80, 340],
        [240, 340],
      ]);
      await touch("touchEnd", []);
      expect(await zoom()).toBeGreaterThan(priorZoom);
      expect((await save()).ap).toBe(2);
      await expect(page.locator("#sheet")).toBeHidden();
      for (let round = 0; round < 20; round++) {
        await button("Завершить ход").click();
        await button("Подтвердить").click();
        if ((await save()).winner !== null) break;
      }
      await expect(button("Начать заново")).toBeVisible();
      await button("Начать заново").click();
      expect((await save()).round).toBe(1);
      await page.addInitScript(() => localStorage.setItem("stolen-ages.v1", "{bad"));
      await page.reload();
      await expect(button("Новая партия")).toBeVisible();
    }
    expect(errors).toEqual([]);
    await context.close();
    console.log(width + "×" + height + " passed");
  }
} finally {
  await browser.close();
}
