import { buildings, goods, techs, newGame, type State } from "./world";
const integer = (n: unknown, lo: number, hi: number) =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const choices = (xs: unknown, keys: string[]) =>
  Array.isArray(xs) &&
  xs.every((x) => typeof x === "string" && keys.includes(x));
export function parseSave(raw: string): State {
  const s = JSON.parse(raw) as State;
  if (
    !s ||
    s.version !== 1 ||
    !integer(s.seed, 0, 0xffffffff) ||
    !integer(s.rng, 0, 0xffffffff) ||
    !integer(s.round, 1, 20) ||
    !integer(s.ap, 0, 3) ||
    !integer(s.active, 0, 2) ||
    !(s.winner === null || integer(s.winner, 0, 2)) ||
    !["", "points", "domination", "eliminated"].includes(s.reason) ||
    !Array.isArray(s.layers) ||
    s.layers.length !== 3 ||
    !Array.isArray(s.factions) ||
    s.factions.length !== 3 ||
    !Array.isArray(s.log)
  )
    throw Error("invalid save");
  for (const layer of s.layers) {
    if (!Array.isArray(layer) || layer.length !== 18)
      throw Error("invalid layer");
    for (const r of layer) {
      if (
        !integer(r.owner, -1, 2) ||
        !integer(r.city, 0, 4) ||
        !choices(r.build, buildings) ||
        !choices(r.pending, buildings) ||
        r.build.length + r.pending.length > 2
      )
        throw Error("invalid region");
      const a = r.army;
      if (
        a !== null &&
        (!a ||
          !integer(a.owner, 0, 2) ||
          !["infantry", "ranged"].includes(a.kind) ||
          !integer(a.level, 1, 4) ||
          !integer(a.hp, 1, 10) ||
          !integer(a.moves, 0, 1))
      )
        throw Error("invalid army");
      const siege = r.siege;
      if (
        siege !== null &&
        (!siege ||
          !integer(siege.from, 0, 17) ||
          !integer(siege.owner, 0, 2) ||
          !integer(siege.progress, 1, 2))
      )
        throw Error("invalid siege");
    }
  }
  for (const p of s.factions)
    if (
      !choices(p.tech, techs) ||
      !integer(p.stand, 0, 22) ||
      typeof p.hungry !== "boolean" ||
      typeof p.extraMarch !== "boolean" ||
      goods.some((g) => !integer(p.stock[g], 0, Number.MAX_SAFE_INTEGER))
    )
      throw Error("invalid faction");
  for (const item of s.log) {
    if (
      !item ||
      !integer(item.round, 1, 20) ||
      !integer(item.f, 0, 2) ||
      !integer(item.action.e, 0, 2) ||
      !integer(item.action.i, 0, 17) ||
      typeof item.action.kind !== "string" ||
      typeof item.outcome !== "string" ||
      (item.action.to !== undefined && !integer(item.action.to, 0, 17))
    )
      throw Error("invalid journal");
  }
  return s;
}
export const fresh = () =>
  newGame(crypto.getRandomValues(new Uint32Array(1))[0]);
