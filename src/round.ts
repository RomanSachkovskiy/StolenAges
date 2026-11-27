import {
  actionsPerTurn,
  dominationTarget,
  goods,
  maxRounds,
  neighbors,
  roll,
  techs,
  terrain,
  type State,
  type Action,
  type Entry,
} from "./world";
import { candidates, echo, economy, invalid, product } from "./rules";
import { execute, hostile, powers } from "./combat";
function utility(s: State, a: Action) {
  const f = s.active,
    k = a.kind === "upgrade" ? a.building! : a.kind,
    r = s.layers[a.e][a.i],
    aggressive = f === 1 || f === 0;
  const threats = (i: number) =>
    neighbors[i].filter((n) => {
      const x = s.layers[a.e][n];
      return x.owner >= 0 && x.owner !== f;
    }).length;
  if (k === "outpost" && r.owner < 0)
    return (
      (aggressive ? 12 : 8) +
      r.city * 2 +
      Number(["pass", "crossing"].includes(terrain[a.i])) +
      echo(s, a.e, a.i)
    );
  if (k === "march") {
    if (hostile(s, a)) {
      const p = powers(s, a);
      return 10 + (p.attack - p.defense) * 2 + (aggressive ? 2 : 0);
    }
    return 3 + threats(a.to!) * 3;
  }
  if (k === "city") return aggressive ? 6 : 10;
  if (a.kind === "upgrade") {
    if (product[k]) return 5 + (f === 3 ? 3 : 0);
    if (["tower", "wall", "fortifiedBridge"].includes(k))
      return 3 + threats(a.i) * (f === 2 ? 3 : 2);
    return k === "outpost" ? 5 : 4;
  }
  if (k === "train") return 7 + threats(a.i);
  if (k === "infantry" || k === "ranged")
    return (aggressive ? 6 : 4) + threats(a.i);
  if (techs.includes(k)) return f === 3 ? 9 : aggressive ? 4 : 7;
  if (["tower", "wall", "fortifiedBridge"].includes(k))
    return threats(a.i) * 2 + (aggressive ? 1 : 3);
  if (product[k]) return 3 + 8 / (1 + s.factions[f].stock[product[k]] / 5);
  return 2;
}
type RecordOrder = (entry: Entry, state: State) => void;

export function ai(s: State, record?: RecordOrder) {
  while (s.ap > 0 && s.winner === null) {
    let best: Action | undefined,
      high = -Infinity;
    for (let e = 0; e < s.layers.length; e++)
      for (let i = 0; i < terrain.length; i++)
        for (const a of candidates(s, e, i)) {
          if (invalid(s, a)) continue;
          const score = utility(s, a) + roll(s) * 0.2;
          if (score > high) {
            high = score;
            best = a;
          }
        }
    if (!best) break;
    execute(s, best);
    record?.(s.log[s.log.length - 1], s);
  }
}
export function score(s: State, f: number) {
  let land = 0,
    cities = 0,
    links = 0,
    passes = 0,
    urban = 0;
  s.layers.forEach((layer, e) =>
    layer.forEach((r, i) => {
      if (r.owner === f) {
        land++;
        cities += Number(r.city > 0);
        urban += [0, 0, 3, 6, 10][r.city];
        links += echo(s, e, i);
        passes += Number(["pass", "crossing"].includes(terrain[i]));
      }
    }),
  );
  const p = s.factions[f],
    stock = goods.reduce((n, g) => n + Math.floor(p.stock[g] / 3), 0);
  return {
    land,
    cities,
    passes,
    total:
      2 * land +
      urban +
      2 * p.tech.length +
      Math.min(12, links) +
      Math.min(10, stock),
  };
}
export function endTurn(s: State, record?: RecordOrder) {
  if (s.winner !== null || s.active !== 0) return;
  for (let f = 1; f < s.factions.length; f++) {
    s.active = f;
    s.ap = actionsPerTurn(s.opponents);
    ai(s, record);
    if (s.winner !== null) return;
  }
  economy(s);
  for (const r of s.layers.flat()) {
    if (r.army) r.army.moves = 1;
    if (r.siege) r.siege.progress = Math.min(2, r.siege.progress + 1);
  }
  const ranking = s.factions
    .map((_, f) => ({ f, ...score(s, f), tie: roll(s) }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.passes - a.passes ||
        b.cities - a.cities ||
        b.tie - a.tie,
    );
  const dominant = ranking.find((x) => x.land >= dominationTarget);
  if (dominant || s.round === maxRounds) {
    s.winner = (dominant ?? ranking[0]).f;
    s.reason = dominant ? "domination" : "points";
  } else {
    for (const x of ranking) {
      const faction = s.factions[x.f];
      if (
        !faction.stand &&
        s.round >= 6 &&
        x.land * 4 < Math.max(...ranking.map((t) => t.land))
      )
        faction.stand = s.round + 2;
    }
    s.round++;
  }
  s.active = 0;
  s.ap = actionsPerTurn(s.opponents);
}

export function resolveTurn(s: State) {
  const result = structuredClone(s);
  const orders: { entry: Entry; state: State }[] = [];
  endTurn(result, (entry, state) =>
    orders.push({ entry, state: structuredClone(state) }),
  );
  return { orders, result };
}
