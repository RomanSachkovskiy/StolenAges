import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
const captures = process.env.SCREENSHOT_DIRECTORY || "test-results/screenshots";
const url = "https://library.test/StolenAges/";

async function session(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (values) => {
      if (values instanceof Uint32Array && values.length === 1) {
        values[0] = 42;
        return values;
      }
      return random(values);
    };
  });
  await page.route(url + "**", async (route) => {
    const path =
      new URL(route.request().url()).pathname.slice("/StolenAges/".length) ||
      "index.html";
    await route.fulfill({
      body: await readFile(resolve("dist", path)),
      contentType: path.endsWith(".js")
        ? "application/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html",
    });
  });
  await page.goto(url);
  return { context, page, errors };
}

function savedData(page, collection = "matches") {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("stolen-ages.library", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const query = db.transaction(name).objectStore(name).getAll();
          query.onerror = () => {
            db.close();
            reject(query.error);
          };
          query.onsuccess = () => {
            db.close();
            resolve(query.result);
          };
        };
      }),
    collection + "-data",
  );
}

async function screenshot(page, name) {
  if (!process.env.SCREENSHOTS) return;
  await mkdir(captures, { recursive: true });
  await page.screenshot({
    path: resolve(captures, name + ".png"),
    animations: "disabled",
  });
}

try {
  for (const [width, height] of [
    [390, 844],
    [1366, 768],
  ]) {
    const { context, page, errors } = await session(width, height);
    const button = (name) => page.getByRole("button", { name, exact: true });
    const select = (name) => page.getByLabel(name, { exact: true });
    const counter = page.locator(".counter");
    const rows = page.locator(".library-entry");
    const confirm = () => button("Подтвердить").click();
    const settingsFromGame = async () => {
      await button("Меню").click();
      await button("Настройки").click();
    };
    const resumeFromSettings = async () => {
      await button("Назад").click();
      await button("Продолжить").click();
    };
    const start = async (opponents) => {
      await button("Новая партия").click();
      if (await button("Подтвердить").isVisible()) await confirm();
      await select("Соперники").selectOption(String(opponents));
      await button("Начать партию").click();
      await button("Пропустить").click();
    };
    const end = async () => {
      await button("Завершить ход").click();
      await confirm();
      await button("Пропустить показ").click();
    };
    await start(1);
    await expect(counter).toContainText("3/3");
    await settingsFromGame();
    await expect(select("Сохранять партии")).toHaveValue("false");
    await select("Сохранять партии").selectOption("true");
    await expect(button("Сохранить партию")).toBeVisible();
    await expect(select("Автосохранение")).toHaveValue("false");
    await select("Автосохранение").selectOption("true");
    await expect(
      select("Интервал автосохранения").locator("option"),
    ).toHaveCount(3);
    await expect(select("Интервал автосохранения")).toHaveValue("30");
    if (width > 400) await screenshot(page, "save-settings");
    await select("Интервал автосохранения").selectOption("10");
    await resumeFromSettings();
    await page.clock.install();
    await page.clock.fastForward(10_500);
    await expect.poll(async () => (await savedData(page)).length).toBe(1);

    await settingsFromGame();
    await select("Интервал автосохранения").selectOption("30");
    await resumeFromSettings();
    await button("Действия").click();
    await button("Дозорная башня").click();
    await button("Закрыть").click();
    await page.clock.fastForward(10_500);
    expect((await savedData(page))[0].replay.frames.length).toBe(1);
    await page.clock.fastForward(20_000);
    await expect
      .poll(async () => (await savedData(page))[0].replay.frames.length)
      .toBe(2);

    await settingsFromGame();
    await select("Интервал автосохранения").selectOption("60");
    await resumeFromSettings();
    await page.clock.fastForward(54_000);
    await button("Завершить ход").click();
    await confirm();
    await page.clock.fastForward(8_000);
    expect((await savedData(page))[0].round).toBe(1);
    await button("Пропустить показ").click();
    await expect.poll(async () => (await savedData(page))[0].round).toBe(2);

    await settingsFromGame();
    await select("Автосохранение").selectOption("false");
    await button("Сохранить партию").click();
    await expect(page.locator("output")).toContainText("Партия сохранена");
    await select("Сохранять партии").selectOption("false");
    await resumeFromSettings();
    await page.reload();
    await button("Сохранённые партии").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Раунд 2");
    await rows.first().getByRole("button", { name: "Продолжить" }).click();
    await expect(counter).toContainText("2/18");

    for (let round = 2; round <= 18; round++) {
      if (await button("Посмотреть реплей").isVisible()) break;
      await end();
    }
    await expect(button("Посмотреть реплей")).toBeVisible();
    await expect
      .poll(async () => (await savedData(page))[0].winner)
      .not.toBeNull();
    await button("Посмотреть реплей").click();
    const speed = select("Скорость реплея");
    expect(
      await speed
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value)),
    ).toEqual(["0.5", "1", "1.5", "2", "3"]);
    await speed.selectOption("3");
    await button("Следующий шаг").click();
    await expect(page.locator(".replay-status")).toContainText(
      "Дозорная башня",
    );
    await select("Раунд").selectOption("2");
    await expect(page.locator(".replay-status")).toContainText("Раунд 2");
    await button("Воспроизвести").click();
    await button("Пауза").click();
    if (width > 400) await screenshot(page, "replay-viewer");
    else await screenshot(page, "mobile-replay");
    await button("Сохранить в архив").click();
    await expect
      .poll(async () => (await savedData(page, "replays")).length)
      .toBe(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button("Скачать реплей").click(),
    ]);
    const buffer = await readFile(await download.path());
    expect(JSON.parse(buffer.toString()).format).toBe("stolen-ages-replay");
    await button("Назад").click();
    await button("Меню").click();
    await button("Архив реплеев").click();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
    await expect(page.locator("output")).toContainText("Файл повреждён");
    for (let count = 2; count <= 5; count++) {
      await input.setInputFiles({
        name: "Партия.json",
        mimeType: "application/json",
        buffer,
      });
      await expect(rows).toHaveCount(count);
    }
    await expect(button("Загрузить реплей")).toBeDisabled();
    await input.setInputFiles({
      name: "Extra.json",
      mimeType: "application/json",
      buffer,
    });
    await expect(page.locator("output")).toContainText("Все пять мест заняты");
    await expect(rows).toHaveCount(5);
    if (width > 400) await screenshot(page, "replay-archive");

    await button("Назад").click();
    await button("Сохранённые партии").click();
    await rows
      .first()
      .getByRole("button", { name: "Посмотреть итоги" })
      .click();
    await button("Посмотреть реплей").click();
    await expect(button("Сохранить в архив")).toBeDisabled();
    await expect(button("Скачать реплей")).toBeEnabled();
    await button("Назад").click();
    await button("Меню").click();
    await button("Настройки").click();
    await select("Сохранять партии").selectOption("true");
    await button("Назад").click();
    for (const opponents of [2, 3, 1, 2]) {
      await start(opponents);
      await expect(counter).toContainText(
        opponents === 3 ? "8/8" : opponents === 2 ? "5/5" : "3/3",
      );
      await button("Меню").click();
      await button("Меню").click();
    }
    await expect(button("Новая партия")).toBeDisabled();
    await button("Сохранённые партии").click();
    await expect(rows).toHaveCount(5);
    if (width > 400) await screenshot(page, "saved-matches");
    const finished = rows.filter({ has: button("Посмотреть итоги") });
    await finished.getByRole("button", { name: "Удалить" }).click();
    await confirm();
    await expect(rows).toHaveCount(4);
    await button("Назад").click();
    await expect(button("Новая партия")).toBeEnabled();
    await button("Архив реплеев").click();
    await expect(rows).toHaveCount(5);
    await rows
      .first()
      .getByRole("button", { name: "Посмотреть реплей" })
      .click();
    await expect(button("Следующий шаг")).toBeEnabled();
    expect(errors).toEqual([]);
    await context.close();
    console.log("Save and replay libraries passed at " + width + "×" + height);
  }
} finally {
  await browser.close();
}
