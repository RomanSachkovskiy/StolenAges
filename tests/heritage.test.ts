import { describe, expect, it } from "vitest";
import { execute, powers } from "../src/combat";
import { coast, contains, regions } from "../src/geography";
import {
  cost,
  economy,
  echoIncome,
  echoSources,
  heritageEras,
  income,
  invalid,
} from "../src/rules";
import { ai } from "../src/round";
import { capitals, neighbors, newGame, techs } from "../src/world";

it("uses connected shared boundaries for all twelve selectable areas", () => {
  expect(regions).toHaveLength(12);
  expect(contains(coast, 0, 0)).toBe(false);
  expect(contains(coast, 899, 597)).toBe(true);
  for (const [i, { center }] of regions.entries()) {
    expect(
      regions.findIndex(({ boundary }) => contains(boundary, ...center)),
    ).toBe(i);
    expect(contains(coast, ...center)).toBe(true);
  }
  const reachable = new Set([0]);
  for (const i of reachable) for (const j of neighbors[i]) reachable.add(j);
  expect(reachable.size).toBe(regions.length);
  expect(neighbors[0]).not.toContain(5);
  expect(capitals).toHaveLength(3);
});

describe("heritage", () => {
  it.each([
    { i: 4, source: "farm", kind: "irrigationHub", stock: "food" as const },
    { i: 6, source: "mine", kind: "refinery", stock: "ore" as const },
  ])(
    "unlocks and operates $kind while its completed source exists",
    ({ i, source, kind, stock }) => {
      const s = newGame(12);
      for (const e of [0, 1, 2]) s.layers[e][i].owner = 0;
      const build = { e: 2, i, kind };
      expect(execute(s, { e: 0, i, kind: source })).toBe("");
      expect(echoIncome(s, 2, i)).toBe(0);
      expect(invalid(s, build)).toBe("needEcho");
      economy(s);
      expect(echoSources(s, 2, i)).toEqual([{ era: 0, sources: [source] }]);
      expect(execute(s, build)).toBe("");
      economy(s);
      const withHeritage = income(s, 0)[stock];
      s.layers[2][i].build = [];
      expect(withHeritage - income(s, 0)[stock]).toBe(2);
      s.layers[2][i].build = [kind];
      s.layers[0][i].owner = 1;
      expect(heritageEras(s, 2, i, kind)).toEqual([]);
      expect(s.layers[2][i]).toMatchObject({ owner: 0, build: [kind] });
      expect(income(s, 0)[stock]).toBeLessThan(withHeritage);
      s.layers[0][i].owner = 0;
      expect(income(s, 0)[stock]).toBe(withHeritage);
    },
  );

  it("lets either earlier era sustain a fortified bridge without stacking its effect", () => {
    const s = newGame(47);
    const i = 5;
    s.layers.forEach((layer) => {
      layer[i].owner = 0;
    });
    s.layers[0][i].build = ["tower"];
    s.layers[1][i].build = ["wall"];
    expect(execute(s, { e: 2, i, kind: "fortifiedBridge" })).toBe("");
    economy(s);
    s.layers[2][1].army = {
      owner: 1,
      kind: "infantry",
      level: 1,
      hp: 10,
      moves: 1,
    };
    const action = { e: 2, i: 1, to: i, kind: "march" };
    const reinforced = powers(s, action).defense;
    s.layers[0][i].owner = 1;
    expect(powers(s, action).defense).toBe(reinforced);
    s.layers[1][i].owner = 1;
    expect(powers(s, action).defense).toBe(reinforced - 2);
    expect(s.layers[2][i].build).toEqual(["fortifiedBridge"]);
  });

  it.each([1, 2])(
    "makes heritage accessible to opponent %i through normal orders",
    (faction) => {
      const s = newGame(7);
      s.active = faction;
      s.ap = 1;
      for (const layer of s.layers)
        for (const region of layer) {
          region.owner = faction;
          region.army = null;
          region.build = ["outpost", "tower"];
        }
      s.layers[0][0].owner = 0;
      s.layers[0][4].build = ["farm", "outpost"];
      s.layers[1][4].build = ["outpost"];
      s.factions[faction].stock = { food: 0, wood: 4, ore: 3, energy: 0 };
      s.factions[faction].tech = [...techs];
      ai(s);
      expect(s.log.at(-1)?.action.kind).toBe("irrigationHub");
    },
  );
});

it("enforces research prerequisites, local discounts, era and energy", () => {
  const s = newGame(42);
  expect(techs).toHaveLength(12);
  const forestry = { e: 1, i: 0, kind: "forestry" };
  expect(invalid(s, forestry)).toBe("needTech");
  s.layers[1][0].build = ["academy"];
  expect(execute(s, { e: 1, i: 0, kind: "agriculture" })).toBe("");
  expect(cost(s, forestry)).toMatchObject({ wood: 4, ore: 4 });
  expect(execute(s, forestry)).toBe("");
  expect(invalid(s, { ...forestry, kind: "resonance" })).toBe("wrongEra");
  expect(invalid(s, { e: 2, i: 0, kind: "resonance" })).toBe("shortage");
});
