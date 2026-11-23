import { expect, it } from "vitest";
import config from "../vite.config";
it("loads assets from the project Pages path", () =>
  expect(config.base).toBe("/StolenAges/"));
