import { expect, it } from "vitest";
import { execute, powers } from "../src/combat";
import {
  buildingLevel,
  candidates,
  cost,
  economy,
  echo,
  heritageEras,
  income,
} from "../src/rules";
import { newGame } from "../src/world";

const place = { e: 1, i: 0 };
const target = (kind: string, slot: number, building: string) => ({
  ...place,
  kind,
  slot,
  building,
});

it("fills five stable places, refunds pending work at zero AP, and reuses the freed place", () => {
  const s = newGame(11);
  Object.assign(s.factions[0].stock, { wood: 50, ore: 50 });
  for (const kind of ["tower", "farm", "academy", "wall", "barracks"])
    expect(execute(s, { ...place, kind })).toBe("");
  const r = s.layers[1][0];
  expect(r.structures.map((row) => row?.kind)).toEqual([
    "tower",
    "farm",
    "academy",
    "wall",
    "barracks",
  ]);
  expect(r.structures[1]?.pending).toBe("build");
  const wood = s.factions[0].stock.wood;
  expect(execute(s, target("demolish", 1, "farm"))).toBe("");
  expect(s.ap).toBe(0);
  expect(s.factions[0].stock.wood).toBe(wood + 1);
  expect(r.structures[1]).toBeNull();
  expect(r.structures[2]?.kind).toBe("academy");
  s.ap++;
  expect(execute(s, { ...place, kind: "mill" })).toBe("");
  expect(r.structures[1]?.kind).toBe("mill");
  s.ap++;
  const before = structuredClone(s);
  expect(execute(s, { ...place, kind: "outpost" })).toBe("slots");
  expect(execute(s, target("demolish", 1, "farm"))).toBe("missingBuilding");
  expect(s).toEqual(before);
});

it("upgrades through both levels and preserves output until construction completes", () => {
  const s = newGame(23);
  Object.assign(s.factions[0].stock, { wood: 50, ore: 50 });
  execute(s, { ...place, kind: "farm" });
  const upgrade = target("upgrade", 0, "farm");
  expect(execute(s, upgrade)).toBe("workQueued");
  economy(s);
  const base = income(s, 0).food;
  expect(cost(s, upgrade)).toEqual({ wood: 3, ore: 2 });
  expect(execute(s, upgrade)).toBe("");
  expect(execute(s, upgrade)).toBe("workQueued");
  expect(income(s, 0).food).toBe(base);
  economy(s);
  expect(income(s, 0).food).toBe(base + 1);
  expect(cost(s, upgrade)).toEqual({ wood: 5, ore: 4 });
  expect(execute(s, upgrade)).toBe("");
  economy(s);
  expect(income(s, 0).food).toBe(base + 2);
  expect(execute(s, upgrade)).toBe("maximum");
  const wood = s.factions[0].stock.wood;
  expect(execute(s, target("demolish", 0, "farm"))).toBe("");
  expect(s.factions[0].stock.wood).toBe(wood + 1);
});

it("protects only the last outpost and leaves control unchanged when another holding remains", () => {
  const s = newGame(4);
  for (const layer of s.layers)
    for (const r of layer) {
      if (r.owner === 0) r.owner = -1;
      if (r.army?.owner === 0) r.army = null;
    }
  const area = s.layers[0][4];
  area.owner = 0;
  area.structures[0] = { kind: "outpost", level: 2, pending: null };
  const order = { kind: "demolish", e: 0, i: 4, slot: 0, building: "outpost" };
  s.ap = 0;
  expect(execute(s, order)).toBe("lastOutpost");
  expect(s.winner).toBeNull();
  s.layers[2][0].owner = 0;
  expect(execute(s, order)).toBe("");
  expect(area.owner).toBe(0);
});

it("loses ancestry when an active source is removed and keeps the suspended building", () => {
  const s = newGame(5);
  s.layers[0][4].owner = s.layers[1][4].owner = 0;
  s.layers[0][4].structures[0] = { kind: "farm", level: 3, pending: null };
  s.layers[1][4].structures[0] = {
    kind: "irrigationHub",
    level: 2,
    pending: null,
  };
  expect(heritageEras(s, 1, 4, "irrigationHub")).toEqual([0]);
  const fed = income(s, 0).food;
  expect(
    execute(s, { kind: "demolish", e: 0, i: 4, slot: 0, building: "farm" }),
  ).toBe("");
  expect(echo(s, 1, 4)).toBe(0);
  expect(buildingLevel(s.layers[1][4], "irrigationHub")).toBe(2);
  expect(income(s, 0).food).toBe(fed - 8);
});

it("uses upgraded specialist buildings and never offers city growth on empty land", () => {
  const s = newGame(6);
  const city = s.layers[1][0];
  city.structures[0] = { kind: "academy", level: 3, pending: null };
  city.structures[1] = { kind: "barracks", level: 3, pending: null };
  city.structures[2] = { kind: "tower", level: 3, pending: null };
  s.factions[0].tech.push("training");
  expect(cost(s, { ...place, kind: "agriculture" }).ore).toBe(0);
  expect(execute(s, { ...place, kind: "infantry" })).toBe("");
  expect(city.army?.level).toBe(4);
  const enemy = s.layers[1][4];
  enemy.army = { owner: 1, kind: "infantry", level: 1, hp: 10, moves: 1 };
  const strike = { kind: "march", e: 1, i: 4, to: 0 };
  const defended = powers(s, strike).defense;
  city.structures[2]!.level = 1;
  expect(powers(s, strike).defense).toBe(defended - 2);
  expect(candidates(s, 1, 1).some(({ kind }) => kind === "city")).toBe(false);
  expect(execute(s, { kind: "city", e: 1, i: 1 })).toBe("noSettlement");
  expect(candidates(s, 1, 0).some(({ kind }) => kind === "city")).toBe(true);
});
