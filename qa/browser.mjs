import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
const screenshotDirectory =
  process.env.SCREENSHOT_DIRECTORY || "test-results/screenshots";
const capture = async (page, name) => {
  if (!process.env.SCREENSHOTS) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: screenshotDirectory + "/" + name + ".png",
    animations: "disabled",
  });
};

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
      reducedMotion: width === 390 ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = 42;
          return array;
        }
        return random(array);
      };
      localStorage.setItem("stolen-ages.v1", "{bad");
    });
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
    const counter = page.locator(".counter");
    const zoom = async () =>
      parseInt(await page.locator(".scaleLabel").textContent());
    await page.goto("https://atlas.test/StolenAges/");
    await expect(button("Продолжить")).toHaveCount(0);
    await button("Новая партия").click();
    await expect(page.getByLabel("Соперники")).toHaveValue("2");
    if (width === 1920) await capture(page, "opponent-count");
    await button("Начать партию").click();
    await button("Пропустить").click();
    await expect(counter).toContainText("1/18");
    await expect(page.locator(".scaleLabel")).toHaveText(/\d+%/);
    const base = await zoom();
    await button("Приблизить").click();
    expect(await zoom()).toBeGreaterThan(base);
    await button("Отдалить").click();
    expect(await zoom()).toBe(base);

    if (width === 1920) {
      await capture(page, "01-past");
      await button("Настоящее").click();
      await capture(page, "02-present");
      await button("Будущее").click();
      await capture(page, "03-future");
    }
    if (width === 390) await capture(page, "05-mobile");

    await button("Прошлое").click();
    await button("Действия").click();
    const area = page.getByLabel("Регион", { exact: true });
    await expect(area.locator("option")).toHaveCount(12);
    await area.selectOption({ label: "Солнечная нива" });
    await button("Аванпост").click();
    await expect(counter).toContainText("4/5");
    await button("Настоящее").click();
    await button("Аванпост").click();
    await expect(counter).toContainText("3/5");
    await button("Прошлое").click();
    await expect(button("Ферма")).toContainText("Оросительный узел");
    await button("Ферма").click();
    await button("Настоящее").click();
    await expect(counter).toContainText("2/5");
    await button("Завершить ход").click();
    await button("Подтвердить").click();
    const viewing = page.locator("#ai-playback");
    await expect(viewing).toBeVisible();
    await expect(viewing.getByRole("status")).toContainText(/Алый орден/);
    await expect(button("Завершить ход")).toBeDisabled();
    const speed = page.getByLabel("Скорость показа приказов");
    await expect(speed).toHaveValue("medium");
    await expect(speed.locator("option")).toHaveCount(3);
    if (width === 1920) await capture(page, "04-opponent-turn");
    await speed.selectOption("high");
    if (width === 390 || width === 1920) {
      await expect(viewing.getByRole("status")).toContainText(
        /Аметистовый двор/,
      );
      await expect(viewing).toBeHidden({ timeout: 15_000 });
    } else await button("Пропустить показ").click();
    await expect(counter).toContainText("2/18");
    await expect(button("Настоящее")).toHaveClass("on");
    await button("Действия").click();
    await expect(page.locator(".echo-card")).toContainText(
      "Доступно благодаря эху",
    );
    await expect(page.locator(".echo-card")).toContainText("Прошлое");
    await expect(button("Оросительный узел")).toBeEnabled();
    if (width === 1920) await capture(page, "06-temporal-echo");
    await button("Оросительный узел").click();
    await expect(counter).toContainText("4/5");
    await expect(page.locator(".building-manager")).toContainText("2/5");
    await expect(button("Улучшить город")).toHaveCount(0);
    if (width === 1920) await capture(page, "building-management");
    await button("Улучшить · Аванпост").click();
    await expect(page.locator(".building-manager")).toContainText(
      "Улучшение до уровня II",
    );
    await button("Отменить стройку · Оросительный узел").click();
    await expect(page.getByRole("article")).toContainText("Возврат");
    await button("Подтвердить").click();
    await expect(page.locator(".building-manager")).toContainText("1/5");
    await expect(counter).toContainText("3/5");
    await button("Закрыть").click();

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

      for (let round = 2; round <= 18; round++) {
        if (await button("Начать заново").isVisible()) break;
        await button("Завершить ход").click();
        await button("Подтвердить").click();
        await button("Пропустить показ").click();
      }
      await expect(button("Начать заново")).toBeVisible();
      await button("Посмотреть реплей").click();
      await expect(
        page.getByLabel("Скорость реплея").locator("option"),
      ).toHaveCount(5);
      await button("Следующий шаг").click();
      await expect(page.locator(".replay-status")).toContainText("Аванпост");
      await button("Предыдущий шаг").click();
      await expect(page.locator(".replay-status")).toContainText(
        "Начало партии",
      );
      await button("Назад").click();
      await button("Начать заново").click();
      await button("Начать партию").click();
      await button("Пропустить").click();
      await expect(counter).toContainText("1/18");
    }

    await button("Меню").click();
    await button("Настройки").click();
    await button("English").click();
    await button("Back").click();
    await button("Continue").click();
    await expect(button("End turn")).toBeVisible();
    await page.setViewportSize({ width: height, height: width });
    await expect(button("End turn")).toBeInViewport();
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => localStorage.getItem("stolen-ages.v1")),
    ).toBe("{bad");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("stolen-ages.preferences"))
            .orderSpeed,
      ),
    ).toBe("high");
    await page.reload();
    await expect(button("New game")).toBeVisible();
    await expect(button("Continue")).toHaveCount(0);
    await button("New game").click();
    await button("Start match").click();
    await button("Skip").click();
    await expect(counter).toContainText("1/18");
    expect(errors).toEqual([]);
    await context.close();
    console.log(width + "×" + height + " passed");
  }
} finally {
  await browser.close();
}
