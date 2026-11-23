import {
  buildings,
  capitals,
  costs,
  goods,
  neighbors,
  techs,
  terrain,
  type State,
  type Action,
  type Cost,
  type Good,
} from "./world";
export const product: Record<string, Good> = {
  farm: "food",
  mill: "wood",
  mine: "ore",
  plant: "energy",
  academy: "knowledge",
  outpost: "influence",
};
export function cost(s: State, a: Action): Cost {
  if (a.kind === "city") {
    const level = s.layers[a.e][a.i].city;
    return (
      [
        {},
        { wood: 5, ore: 2 },
        { wood: 8, ore: 5 },
        { wood: 12, ore: 8, knowledge: 5 },
      ][level] ?? {}
    );
  }
  return techs.includes(a.kind) ? { knowledge: 5 } : (costs[a.kind] ?? {});
}
export function candidates(s: State, e: number, i: number): Action[] {
  const r = s.layers[e][i],
    kinds =
      r.owner === s.active
        ? [...buildings, "city", "infantry", "ranged", ...techs]
        : ["outpost"];
  const actions: Action[] = kinds.map((kind) => ({ kind, e, i }));
  if (r.army?.owner === s.active)
    actions.push(
      { kind: "train", e, i },
      ...neighbors[i].map((to) => ({ kind: "march", e, i, to })),
    );
  return actions;
}
export function invalid(s: State, a: Action): string {
  const { kind: k, e, i, to } = a,
    f = s.active,
    r = s.layers[e]?.[i];
  if (!r || s.winner !== null) return "ended";
  if (!s.ap) return "noAP";
  if (
    ![
      ...buildings,
      ...techs,
      "city",
      "infantry",
      "ranged",
      "train",
      "march",
    ].includes(k)
  )
    return "unknown";
  const own = r.owner === f,
    p = s.factions[f],
    army = r.army;
  if (k === "march" || k === "train") {
    if (army?.owner !== f) return "noArmy";
    if (k === "train" && army.level >= 4) return "maximum";
    if (k === "march") {
      if (to === undefined || !neighbors[i].includes(to)) return "adjacent";
      if (s.layers[e][to].army?.owner === f) return "occupied";
      if (!army.moves && !(p.tech.includes("logistics") && p.extraMarch))
        return "spent";
    }
  } else if (k === "outpost" && !own) {
    if (r.owner !== -1 || (r.army && r.army.owner !== f)) return "enemy";
    if (!neighbors[i].some((n) => s.layers[e][n].owner === f))
      return "adjacent";
  } else if (!own) return "ownership";
  if (buildings.includes(k)) {
    const slots = [...r.build, ...r.pending];
    if (slots.includes(k)) return "duplicate";
    if (slots.length >= 2) return "slots";
    if ((k === "academy" && e === 0) || (k === "plant" && e !== 2))
      return "wrongEra";
    const types: Record<string, string[]> = {
      farm: ["plain", "farmland", "city", "village"],
      mill: ["forest", "city", "village"],
      mine: ["mine", "pass"],
    };
    if (types[k] && !types[k].includes(terrain[i])) return "ground";
  }
  if (k === "city" && (!r.city || r.city >= (capitals.includes(i) ? 4 : 3)))
    return "maximum";
  if (["infantry", "ranged"].includes(k)) {
    if (!capitals.includes(i) && !r.build.includes("barracks"))
      return "needBarracks";
    if (army) return "occupied";
    if (s.layers.flat().filter((x) => x.army?.owner === f).length >= 8)
      return "armyCap";
  }
  if (techs.includes(k) && p.tech.includes(k)) return "duplicate";
  return goods.some((g) => p.stock[g] < (cost(s, a)[g] ?? 0)) ? "shortage" : "";
}
export function echo(s: State, e: number, i: number) {
  const f = s.layers[e][i].owner;
  if (f < 0 || !e) return 0;
  const past = s.layers[0][i],
    present = s.layers[1][i];
  return (
    Number(
      past.owner === f &&
        (past.city > 0 || past.build.some((b) => b in product)),
    ) + Number(e === 2 && present.owner === f && present.build.length > 0)
  );
}
export function primary(i: number, e: number): Good {
  return terrain[i] === "forest"
    ? "wood"
    : ["mine", "pass"].includes(terrain[i])
      ? "ore"
      : e === 2
        ? "energy"
        : "food";
}
export function income(s: State, f: number) {
  const total = {
      food: 0,
      wood: 0,
      ore: 0,
      energy: 0,
      knowledge: 0,
      influence: 0,
    },
    p = s.factions[f];
  let resonance = 0,
    armies = 0;
  s.layers.forEach((layer, e) =>
    layer.forEach((r, i) => {
      if (r.army?.owner === f) armies++;
      if (r.owner !== f) return;
      if (r.city) {
        total.food += 1 + r.city;
        total.wood++;
        total.knowledge += r.city;
      }
      for (const b of r.build) {
        const g = product[b];
        if (g)
          total[g] +=
            b === "outpost"
              ? 1
              : b === "farm" && p.tech.includes("agriculture")
                ? 3
                : 2;
      }
      const bonus = echo(s, e, i);
      total[primary(i, e)] += bonus;
      if (e === 2 && bonus && resonance < 2 && p.tech.includes("resonance")) {
        total[primary(i, e)]++;
        resonance++;
      }
    }),
  );
  total.food -= Math.ceil(armies / 2);
  return total;
}
export function economy(s: State) {
  for (const r of s.layers.flat()) {
    r.build.push(...r.pending);
    r.pending = [];
  }
  s.factions.forEach((p, f) => {
    const gains = income(s, f);
    p.hungry = p.stock.food + gains.food < 0;
    for (const g of goods) p.stock[g] = Math.max(0, p.stock[g] + gains[g]);
    p.extraMarch = true;
  });
}
export function develop(s: State, a: Action) {
  const r = s.layers[a.e][a.i],
    k = a.kind,
    p = s.factions[s.active];
  if (buildings.includes(k)) {
    r.owner = s.active;
    (["tower", "barracks", "outpost"].includes(k) ? r.build : r.pending).push(
      k,
    );
  } else if (k === "city") r.city++;
  else if (techs.includes(k)) p.tech.push(k);
}

// Dijkstra on the fixed graph. Hostile territory is a destination, never a shortcut.
export function route(
  s: State,
  e: number,
  start: number,
  goal: number,
): number[] {
  const layer = s.layers[e],
    dist = terrain.map(() => Infinity),
    prev = terrain.map(() => -1),
    visited = new Set<number>();
  dist[start] = 0;
  while (visited.size < layer.length) {
    let i = -1;
    for (let n = 0; n < dist.length; n++)
      if (
        !visited.has(n) &&
        Number.isFinite(dist[n]) &&
        (i < 0 || dist[n] < dist[i])
      )
        i = n;
    if (i < 0) break;
    if (i === goal) {
      const path = [];
      for (let n = i; n !== -1; n = prev[n]) path.unshift(n);
      return path;
    }
    visited.add(i);
    for (const j of neighbors[i]) {
      const r = layer[j];
      if (
        r.army?.owner === s.active ||
        (j !== goal && (r.army || (r.owner >= 0 && r.owner !== s.active)))
      )
        continue;
      const price =
        dist[i] + (["pass", "forest"].includes(terrain[j]) ? 1.5 : 1);
      if (price < dist[j]) {
        dist[j] = price;
        prev[j] = i;
      }
    }
  }
  return [];
}
