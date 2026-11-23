export const terrain = [
  "city",
  "forest",
  "farmland",
  "village",
  "mine",
  "city",
  "plain",
  "crossing",
  "village",
  "pass",
  "forest",
  "plain",
  "village",
  "mine",
  "city",
  "farmland",
  "ruins",
  "plain",
];
export const capitals = [0, 5, 14];
export const neighbors = terrain.map((_, i) =>
  [
    i - 6,
    i + 6,
    ...(i % 6 ? [i - 1] : []),
    ...(i % 6 < 5 ? [i + 1] : []),
  ].filter((j) => j >= 0 && j < 18),
);
export const goods = [
  "food",
  "wood",
  "ore",
  "energy",
  "knowledge",
  "influence",
] as const;
export type Good = (typeof goods)[number];
export type Stock = Record<Good, number>;
export type Cost = Partial<Stock>;
export const initialStock = {
  food: 12,
  wood: 12,
  ore: 8,
  energy: 0,
  knowledge: 3,
  influence: 5,
};
export const costs: Record<string, Cost> = {
  farm: { wood: 3 },
  mill: { food: 3 },
  mine: { wood: 3, food: 2 },
  academy: { wood: 4, ore: 3 },
  plant: { ore: 4, knowledge: 2 },
  tower: { wood: 3, ore: 1 },
  wall: { wood: 5, ore: 3 },
  barracks: { wood: 4, ore: 2 },
  outpost: { wood: 2, influence: 2 },
  infantry: { food: 3, wood: 2 },
  ranged: { food: 3, ore: 3 },
  train: { ore: 2, knowledge: 2 },
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
];
export const techs = [
  "agriculture",
  "fortification",
  "logistics",
  "training",
  "resonance",
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
  version: 1;
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
    version: 1,
    seed,
    rng: seed >>> 0,
    round: 1,
    active: 0,
    ap: 3,
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
    layers: [0, 1, 2].map((e) =>
      terrain.map((t, i) => {
        const owner = capitals.includes(i)
          ? capitals.indexOf(i)
          : [1, 4, 15].indexOf(i);
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
