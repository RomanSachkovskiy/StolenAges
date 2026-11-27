import {
  actionsPerTurn,
  buildingCapacity,
  buildings,
  eraCount,
  goods,
  maxRounds,
  techs,
  terrain,
  type Entry,
  type State,
} from "./world";

export type Snapshot = Omit<State, "log">;
export interface ReplayFrame {
  state: Snapshot;
  order: Entry | null;
}
export interface Replay {
  format: "stolen-ages-replay";
  version: 1;
  frames: ReplayFrame[];
}

export const maxReplayBytes = 24 * 1024 * 1024;

export function recordFrame(
  replay: Replay,
  state: State,
  order?: Entry | null,
) {
  const { log, ...snapshot } = state;
  const entry = order === undefined ? (log.at(-1) ?? null) : order;
  replay.frames.push(structuredClone({ state: snapshot, order: entry }));
}

export function newReplay(state: State): Replay {
  const replay: Replay = {
    format: "stolen-ages-replay",
    version: 1,
    frames: [],
  };
  recordFrame(replay, state, null);
  return replay;
}

export function restoreState(
  replay: Replay,
  index = replay.frames.length - 1,
): State {
  return {
    ...structuredClone(replay.frames[index].state),
    log: replay.frames
      .slice(0, index + 1)
      .flatMap(({ order }) => (order ? [structuredClone(order)] : [])),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

function oneOf(value: unknown, list: string[]): value is string {
  return typeof value === "string" && list.includes(value);
}

function validRegion(value: unknown, opponents: number) {
  if (
    !record(value) ||
    !numberIn(value.owner, -1, opponents) ||
    !numberIn(value.city, 0, 4)
  )
    return false;
  if (
    !Array.isArray(value.structures) ||
    value.structures.length !== buildingCapacity
  )
    return false;
  const occupied = new Set<string>();
  for (const building of value.structures) {
    if (building === null) continue;
    if (
      !record(building) ||
      !oneOf(building.kind, buildings) ||
      occupied.has(building.kind) ||
      !numberIn(building.level, 1, 3)
    )
      return false;
    const { level, pending } = building;
    if (
      pending !== null &&
      !(pending === "build" && level === 1) &&
      !(pending === "upgrade" && level < 3)
    )
      return false;
    occupied.add(building.kind);
  }
  const { army, siege } = value;
  if (
    army !== null &&
    (!record(army) ||
      !numberIn(army.owner, 0, opponents) ||
      !oneOf(army.kind, ["infantry", "ranged"]) ||
      !numberIn(army.level, 1, 4) ||
      !numberIn(army.hp, 1, 10) ||
      !numberIn(army.moves, 0, 1))
  )
    return false;
  return (
    siege === null ||
    (record(siege) &&
      numberIn(siege.from, 0, terrain.length - 1) &&
      numberIn(siege.owner, 0, opponents) &&
      numberIn(siege.progress, 1, 2))
  );
}

function validFaction(value: unknown) {
  if (!record(value)) return false;
  const { stock, tech, stand, hungry, extraMarch } = value;
  return (
    record(stock) &&
    goods.every((good) => numberIn(stock[good], 0, 100_000)) &&
    Array.isArray(tech) &&
    tech.every((kind) => oneOf(kind, techs)) &&
    new Set(tech).size === tech.length &&
    numberIn(stand, 0, maxRounds + 2) &&
    typeof hungry === "boolean" &&
    typeof extraMarch === "boolean"
  );
}

const orderKinds = [
  ...buildings,
  ...techs,
  "city",
  "infantry",
  "ranged",
  "train",
  "march",
  "upgrade",
  "demolish",
];
const outcomes = [
  "",
  "moved",
  "captured",
  "besieged",
  "retreated",
  "destroyed",
];

function validOrder(value: unknown, state: Snapshot) {
  if (
    !record(value) ||
    value.round !== state.round ||
    value.f !== state.active ||
    !oneOf(value.outcome, outcomes)
  )
    return false;
  const { action } = value;
  if (
    !record(action) ||
    !oneOf(action.kind, orderKinds) ||
    !numberIn(action.e, 0, eraCount - 1) ||
    !numberIn(action.i, 0, terrain.length - 1)
  )
    return false;
  if (action.kind === "march")
    return numberIn(action.to, 0, terrain.length - 1);
  if (action.to !== undefined) return false;
  if (action.kind === "upgrade" || action.kind === "demolish")
    return (
      numberIn(action.slot, 0, buildingCapacity - 1) &&
      oneOf(action.building, buildings)
    );
  return true;
}

function validSnapshot(value: unknown): value is Snapshot {
  if (
    !record(value) ||
    value.version !== 3 ||
    (value.opponents !== 1 && value.opponents !== 2 && value.opponents !== 3)
  )
    return false;
  const {
    opponents,
    seed,
    rng,
    round,
    active,
    ap,
    winner,
    reason,
    layers,
    factions,
  } = value;
  return (
    numberIn(seed, 0, 0xffffffff) &&
    numberIn(rng, 0, 0xffffffff) &&
    numberIn(round, 1, maxRounds) &&
    numberIn(active, 0, opponents) &&
    numberIn(ap, 0, actionsPerTurn(opponents)) &&
    (winner === null
      ? reason === ""
      : numberIn(winner, 0, opponents) &&
        oneOf(reason, ["eliminated", "points", "domination"])) &&
    Array.isArray(factions) &&
    factions.length === opponents + 1 &&
    factions.every(validFaction) &&
    Array.isArray(layers) &&
    layers.length === eraCount &&
    layers.every(
      (layer) =>
        Array.isArray(layer) &&
        layer.length === terrain.length &&
        layer.every((area) => validRegion(area, opponents)),
    )
  );
}

export function parseReplay(raw: string): Replay {
  const value: unknown = JSON.parse(raw);
  if (
    !record(value) ||
    value.format !== "stolen-ages-replay" ||
    value.version !== 1 ||
    !Array.isArray(value.frames) ||
    value.frames.length < 2 ||
    value.frames.length > 2_048
  )
    throw new Error("Invalid replay format");
  let previous: Snapshot | undefined;
  for (const frame of value.frames) {
    if (!record(frame) || !validSnapshot(frame.state))
      throw new Error("Invalid replay frame");
    const { state, order } = frame;
    if (
      !previous &&
      (state.round !== 1 ||
        state.active !== 0 ||
        state.winner !== null ||
        order !== null)
    )
      throw new Error("Invalid initial frame");
    if (
      previous &&
      (state.seed !== previous.seed ||
        state.opponents !== previous.opponents ||
        state.round < previous.round ||
        state.round > previous.round + 1 ||
        (previous.winner !== null &&
          (state.winner !== previous.winner || order !== null)))
    )
      throw new Error("Invalid replay sequence");
    if (order !== null && !validOrder(order, state))
      throw new Error("Invalid replay order");
    previous = state;
  }
  if (previous?.winner === null) throw new Error("The match is unfinished");
  return value as unknown as Replay;
}
