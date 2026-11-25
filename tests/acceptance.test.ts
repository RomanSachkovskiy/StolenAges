import { describe, it, expect } from "vitest";
import { dominationTarget, newGame } from "../src/world";
import { execute } from "../src/combat";
import { endTurn, resolveTurn, score } from "../src/round";

describe("match rules", () => {
  it("requires adjacency for a claim and charges exact cost only on success", () => {
    const s = newGame(2);
    expect(execute(s, { kind: "outpost", i: 11, e: 2 })).toBe("adjacent");
    expect(execute(s, { kind: "outpost", i: 4, e: 2 })).toBe("");
    expect(s.factions[0].stock).toMatchObject({ wood: 10, food: 10 });
    expect(s.layers[2][4]).toMatchObject({ owner: 0, build: ["outpost"] });
    expect(s.layers[0][4].owner).toBe(-1);
  });
  it("caps the capital at level four", () => {
    const s = newGame(2);
    Object.assign(s.factions[0].stock, { wood: 50, ore: 30 });
    for (let level = 2; level <= 4; level++) {
      expect(execute(s, { kind: "city", e: 0, i: 0 })).toBe("");
      expect(s.layers[0][0].city).toBe(level);
    }
    endTurn(s);
    expect(execute(s, { kind: "city", e: 0, i: 0 })).toBe("maximum");
  });
  it("can play or skip each opponent order without changing the round result", () => {
    const initial = newGame(42);
    const direct = structuredClone(initial);
    const { orders, result } = resolveTurn(initial);
    endTurn(direct);
    expect(result).toEqual(direct);
    expect(initial).toEqual(newGame(42));
    expect(new Set(orders.map(({ entry }) => entry.f))).toEqual(
      new Set([1, 2]),
    );
    for (const [i, { state }] of orders.entries())
      expect(state.log).toEqual(
        orders.slice(0, i + 1).map((order) => order.entry),
      );
  });
  it("recruits, marches, upgrades and restricts movement by era", () => {
    const s = newGame(2);
    expect(execute(s, { kind: "ranged", i: 0, e: 2 })).toBe("");
    expect(execute(s, { kind: "march", i: 0, to: 4, e: 2 })).toBe("");
    expect(s.layers[2][4].owner).toBe(-1);
    expect(execute(s, { kind: "train", i: 4, e: 2 })).toBe("");
    expect(s.layers[2][4].army?.level).toBe(2);
    expect(s.layers[0][0].army?.level).toBe(1);
  });
  it("captures an enemy region and destroys a depleted attacker", () => {
    const s = newGame(99);
    s.layers[0][1].owner = 1;
    expect(execute(s, { kind: "march", e: 0, i: 0, to: 1 })).toBe("");
    expect(s.layers[0][1].owner).toBe(0);
    const army = s.layers[0][1].army!;
    army.hp = 1;
    army.moves = 1;
    s.layers[0][4].owner = 2;
    s.layers[0][4].city = 4;
    execute(s, { kind: "march", e: 0, i: 1, to: 2 });
    expect(s.layers[0][1].army).toBe(null);
  });
  it("ends immediately on elimination and checks territorial victory after income", () => {
    const s = newGame(0);
    for (const r of s.layers.flat())
      if (r.owner === 0) {
        r.owner = 1;
        r.army = null;
      }
    s.active = 1;
    execute(s, { kind: "tower", e: 0, i: 0 });
    expect(s.reason).toBe("eliminated");
    const d = newGame(1);
    for (const layer of d.layers) for (const r of layer) r.owner = 0;
    endTurn(d);
    expect(d.reason).toBe("domination");
    expect(d.winner).toBe(0);
    expect(score(d, 0).land).toBeGreaterThanOrEqual(dominationTarget);
  });
});
