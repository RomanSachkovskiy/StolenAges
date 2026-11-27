import { expect, it } from "vitest";
import { execute } from "../src/combat";
import {
  newReplay,
  parseReplay,
  recordFrame,
  restoreState,
} from "../src/replay";
import { resolveTurn } from "../src/round";
import { maxRounds, newGame } from "../src/world";

it("restores game state and the full journal before and after the opponent display", () => {
  const match = newGame(12, 3);
  const replay = newReplay(match);
  execute(match, { kind: "tower", e: 0, i: 0 });
  recordFrame(replay, match);
  expect(restoreState(replay)).toEqual(match);
  expect(restoreState(replay, 0)).toEqual(newGame(12, 3));
  const resolution = resolveTurn(match);
  for (const { state, entry } of resolution.orders)
    recordFrame(replay, state, entry);
  recordFrame(replay, resolution.result, null);
  expect(restoreState(replay)).toEqual(resolution.result);
});

it("accepts a finished match and rejects corrupted, unfinished and unsupported replays", () => {
  const initial = newGame(7, 1);
  const replay = newReplay(initial);
  expect(() => parseReplay(JSON.stringify(replay))).toThrow();
  initial.round = maxRounds;
  // A shortened fixture still includes every round transition.
  for (let round = 2; round <= maxRounds; round++) {
    initial.round = round;
    recordFrame(replay, initial, null);
  }
  const { orders, result } = resolveTurn(initial);
  for (const { state, entry } of orders) recordFrame(replay, state, entry);
  recordFrame(replay, result, null);
  const text = JSON.stringify(replay);
  expect(parseReplay(text)).toEqual(replay);
  expect(restoreState(parseReplay(text))).toEqual(result);
  expect(() => parseReplay("{broken")).toThrow();
  expect(() =>
    parseReplay(text.replace('"version":1', '"version":9')),
  ).toThrow();
  const changed = structuredClone(replay);
  changed.frames.at(-1)!.state.layers[0][0].structures[0] = {
    kind: "unknown",
    level: -5,
    pending: null,
  };
  expect(() => parseReplay(JSON.stringify(changed))).toThrow();
});
