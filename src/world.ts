import { adjacency, regions } from "./geography";

export const terrain = regions.map((region) => region.terrain);
export const capitals = regions.flatMap((region, i) =>
  region.terrain === "city" ? [i] : [],
);
export const neighbors = adjacency;
export const eraCount = 3;
export const maxRounds = 18;
export const actionsPerTurn = 3;
export const dominationTarget = Math.ceil(regions.length * eraCount * 0.7);
export const goods = ["food", "wood", "ore", "energy"] as const;
export type Good = (typeof goods)[number];
export type Stock = Record<Good, number>;
export type Cost = Partial<Stock>;
export const initialStock = {
  food: 12,
  wood: 12,
  ore: 8,
  energy: 0,
};
export const costs: Record<string, Cost> = {
  farm: { wood: 3 },
  mill: { food: 3 },
  mine: { wood: 3, food: 2 },
  academy: { wood: 4, ore: 3 },
  plant: { ore: 4, wood: 3 },
  tower: { wood: 3, ore: 1 },
  wall: { wood: 5, ore: 3 },
  barracks: { wood: 4, ore: 2 },
  outpost: { wood: 2, food: 2 },
  infantry: { food: 3, wood: 2 },
  ranged: { food: 3, ore: 3 },
  train: { ore: 2, food: 2 },
  irrigationHub: { wood: 4, ore: 3 },
  refinery: { wood: 4, ore: 3 },
  fortifiedBridge: { wood: 4, ore: 3 },
  march: {},
};
export const buildings = [
  "farm",
  "mill",
  "mine",
  "academy",
  "plant",
  "tower",
  "wall",
  "barracks",
  "outpost",
  "irrigationHub",
  "refinery",
  "fortifiedBridge",
];
export const prerequisites: Record<string, string> = {
  irrigation: "agriculture",
  forestry: "agriculture",
  masonry: "fortification",
  metallurgy: "logistics",
  urbanism: "logistics",
  reserves: "training",
  grids: "resonance",
};
export const techs = [
  "agriculture",
  "fortification",
  "logistics",
  "training",
  "resonance",
  ...Object.keys(prerequisites),
];
export interface Army {
  owner: number;
  kind: string;
  level: number;
  hp: number;
  moves: number;
}
export interface Region {
  owner: number;
  city: number;
  build: string[];
  pending: string[];
  army: Army | null;
  siege: { from: number; owner: number; progress: number } | null;
}
export interface Faction {
  stock: Stock;
  tech: string[];
  stand: number;
  hungry: boolean;
  extraMarch: boolean;
}
export interface Action {
  kind: string;
  e: number;
  i: number;
  to?: number;
}
export interface Entry {
  round: number;
  f: number;
  action: Action;
  outcome: string;
}
export interface State {
  version: 2;
  seed: number;
  rng: number;
  round: number;
  active: number;
  ap: number;
  layers: Region[][];
  factions: Faction[];
  log: Entry[];
  winner: number | null;
  reason: string;
}
export function newGame(seed: number): State {
  return {
    version: 2,
    seed,
    rng: seed >>> 0,
    round: 1,
    active: 0,
    ap: actionsPerTurn,
    winner: null,
    reason: "",
    log: [],
    factions: capitals.map(() => ({
      stock: { ...initialStock },
      tech: [],
      stand: 0,
      hungry: false,
      extraMarch: true,
    })),
    layers: Array.from({ length: eraCount }, (_, e) =>
      regions.map(({ terrain: t, start: owner }, i) => {
        return {
          owner,
          city: Number(t === "city" || t === "village"),
          build: [],
          pending: [],
          siege: null,
          army:
            e === 0 && capitals.includes(i)
              ? { owner, kind: "infantry", level: 1, hp: 10, moves: 1 }
              : null,
        };
      }),
    ),
  };
}
export function roll(s: State) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
