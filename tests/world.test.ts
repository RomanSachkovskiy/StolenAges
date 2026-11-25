import { expect, it } from "vitest";
import { maxRounds, neighbors, newGame } from "../src/world";
it("creates independent layers with symmetric routes and equal starts", () => {
  const s = newGame(12345);
  expect(s.layers.flat()).toHaveLength(36);
  for (const layer of s.layers)
    for (const f of [0, 1, 2])
      expect(layer.filter((r) => r.owner === f)).toHaveLength(2);
  neighbors.forEach((ns, i) =>
    ns.forEach((j) => expect(neighbors[j]).toContain(i)),
  );
  expect(s.layers[0][0]).not.toBe(s.layers[1][0]);
});
import { develop, economy, echo, invalid } from "../src/rules";
it("resolves construction and conditional historical income", () => {
  const s = newGame(3),
    a = { kind: "mill", e: 0, i: 1 };
  expect(invalid(s, a)).toBe("");
  develop(s, a);
  expect(echo(s, 1, 1)).toBe(0);
  economy(s);
  expect(echo(s, 1, 1)).toBe(1);
  s.layers[0][1].owner = 1;
  expect(echo(s, 1, 1)).toBe(0);
});
import { execute } from "../src/combat";
it("charges shared AP and rejects a fourth action atomically", () => {
  const s = newGame(9);
  for (const e of [0, 1, 2])
    expect(execute(s, { kind: "outpost", e, i: 1 })).toBe("");
  const before = structuredClone(s);
  expect(execute(s, { kind: "train", e: 0, i: 0 })).toBe("noAP");
  expect(s).toEqual(before);
});
it("resolves a reproducible attack and retreat", () => {
  const run = () => {
    const s = newGame(6);
    s.layers[0][1].owner = 1;
    s.layers[0][1].city = 3;
    execute(s, { kind: "march", e: 0, i: 0, to: 1 });
    return s;
  };
  expect(run()).toEqual(run());
  expect(run().layers[0][1].siege?.progress).toBe(1);
});
import { ai, endTurn } from "../src/round";
it("finishes 100 seeded simulations within the round limit", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = newGame(seed);
    for (let turn = 0; turn < maxRounds && s.winner === null; turn++) {
      ai(s);
      endTurn(s);
    }
    expect(s.winner).not.toBeNull();
    expect(s.round).toBeLessThanOrEqual(maxRounds);
  }
}, 120000);
