import {
  buildings,
  capitals,
  costs,
  goods,
  neighbors,
  prerequisites,
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
  irrigationHub: "food",
  refinery: "ore",
};
export const heritage: Record<
  string,
  { grounds: string[]; sources: string[] }
> = {
  irrigationHub: { grounds: ["farmland"], sources: ["farm"] },
  refinery: { grounds: ["mine", "pass"], sources: ["mine"] },
  fortifiedBridge: { grounds: ["crossing"], sources: ["tower", "wall"] },
};

export function isImmediate(kind: string) {
  return (
    !buildings.includes(kind) || ["tower", "barracks", "outpost"].includes(kind)
  );
}

export function cost(s: State, a: Action): Cost {
  const r = s.layers[a.e][a.i];
  const player = s.factions[s.active];
  if (a.kind === "city") {
    const price = [
      {},
      { wood: 5, ore: 2 },
      { wood: 8, ore: 5 },
      { wood: 12, ore: 10 },
    ][r.city];
    return {
      ...price,
      ore: Math.max(
        0,
        (price?.ore ?? 0) - Number(player.tech.includes("urbanism")),
      ),
    };
  }
  if (techs.includes(a.kind)) {
    const advanced = !!prerequisites[a.kind];
    return {
      wood: advanced ? 4 : 3,
      ore: (advanced ? 5 : 3) - Number(r.build.includes("academy")),
      energy: a.kind === "resonance" ? 2 : 0,
    };
  }
  const price = costs[a.kind] ?? {};
  if (
    a.kind === "plant" &&
    s.layers[2].some(
      (area) =>
        area.owner === s.active &&
        [...area.build, ...area.pending].includes("plant"),
    )
  )
    return { ...price, energy: 2 };
  if (["tower", "wall"].includes(a.kind) && player.tech.includes("masonry"))
    return { ...price, wood: (price.wood ?? 0) - 1 };
  return price;
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
    const legacy = heritage[k];
    if (types[k] && !types[k].includes(terrain[i])) return "ground";
    if (legacy) {
      if (e === 0) return "wrongEra";
      if (!legacy.grounds.includes(terrain[i])) return "ground";
      if (!heritageEras(s, e, i, k).length) return "needEcho";
    }
  }
  if (k === "city" && (!r.city || r.city >= (capitals.includes(i) ? 4 : 3)))
    return "maximum";
  if (["infantry", "ranged"].includes(k)) {
    if (!capitals.includes(i) && !r.build.includes("barracks"))
      return "needBarracks";
    if (army) return "occupied";
    if (
      s.layers.flat().filter((x) => x.army?.owner === f).length >=
      armyLimit(s, f)
    )
      return "armyCap";
  }
  if (techs.includes(k)) {
    if (p.tech.includes(k)) return "duplicate";
    if (["resonance", "grids"].includes(k) && e !== 2) return "wrongEra";
    if (prerequisites[k] && !p.tech.includes(prerequisites[k]))
      return "needTech";
  }
  return goods.some((g) => p.stock[g] < (cost(s, a)[g] ?? 0)) ? "shortage" : "";
}
function earlierOwnedEras(s: State, e: number, i: number) {
  const owner = s.layers[e][i].owner;
  return owner < 0
    ? []
    : Array.from({ length: e }, (_, era) => era).filter(
        (era) => s.layers[era][i].owner === owner,
      );
}

export function echoSources(s: State, e: number, i: number) {
  return earlierOwnedEras(s, e, i).flatMap((era) => {
    const area = s.layers[era][i];
    const buildings =
      era === 0
        ? area.build.filter((kind) => kind === "outpost" || kind in product)
        : area.build;
    const sources =
      era === 0 && area.city ? ["settlement", ...buildings] : buildings;
    return sources.length ? [{ era, sources }] : [];
  });
}

export function heritageEras(s: State, e: number, i: number, kind: string) {
  const legacy = heritage[kind];
  if (!legacy?.grounds.includes(terrain[i])) return [];
  return earlierOwnedEras(s, e, i).filter((era) =>
    s.layers[era][i].build.some((building) =>
      legacy.sources.includes(building),
    ),
  );
}

export function echo(s: State, e: number, i: number) {
  return echoSources(s, e, i).length;
}

export function echoIncome(s: State, e: number, i: number) {
  const links = echo(s, e, i);
  const faction = s.layers[e][i].owner;
  if (!links || e !== 2 || !s.factions[faction].tech.includes("resonance"))
    return links;
  const prior = s.layers[e]
    .slice(0, i)
    .filter((area, j) => area.owner === faction && echo(s, e, j)).length;
  return links + Number(prior < 2);
}

export function armyLimit(s: State, faction: number) {
  return s.factions[faction].tech.includes("reserves") ? 9 : 8;
}

export function yieldPerBuilding(s: State, faction: number, kind: string) {
  if (!product[kind]) return 0;
  const tech = s.factions[faction].tech;
  if (kind === "farm")
    return (
      2 +
      Number(tech.includes("agriculture")) +
      Number(tech.includes("irrigation"))
    );
  const upgrade: Record<string, string> = {
    mill: "forestry",
    mine: "metallurgy",
    plant: "grids",
  };
  return 2 + Number(tech.includes(upgrade[kind]));
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
  const total = { food: 0, wood: 0, ore: 0, energy: 0 };
  let armies = 0;
  s.layers.forEach((layer, e) =>
    layer.forEach((r, i) => {
      if (r.army?.owner === f) armies++;
      if (r.owner !== f) return;
      if (r.city) {
        total.food += 1 + r.city;
        total.wood++;
      }
      for (const kind of r.build) {
        const resource = product[kind];
        if (resource && (!heritage[kind] || heritageEras(s, e, i, kind).length))
          total[resource] += yieldPerBuilding(s, f, kind);
      }
      total[primary(i, e)] += echoIncome(s, e, i);
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
    (isImmediate(k) ? r.build : r.pending).push(k);
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
