import {
  capitals,
  goods,
  roll,
  terrain,
  type State,
  type Action,
} from "./world";
import { cost, develop, invalid } from "./rules";
export function powers(s: State, a: Action) {
  const army = s.layers[a.e][a.i].army!,
    j = a.to!,
    t = s.layers[a.e][j],
    d = t.army,
    f = t.owner;
  const attack =
    (8 +
      2 * (army.level - 1) +
      (army.kind === "ranged" && ["plain", "farmland"].includes(terrain[j])
        ? 2
        : 0)) *
    (s.factions[army.owner].hungry ? 0.85 : 1);
  const fort = s.factions[f]?.tech.includes("fortification") ? 1 : 0;
  const siege = t.siege?.owner === army.owner && t.siege.progress >= 2;
  const defense =
    6 +
    2 * ((d?.level ?? 1) - 1) +
    (d?.kind === "infantry" && ["forest", "pass"].includes(terrain[j])
      ? 2
      : 0) +
    (terrain[j] === "pass" ? 1 : 0) +
    2 * t.city +
    (t.city ? 2 : 0) +
    (t.build.includes("tower") ? 2 + fort : 0) +
    (t.build.includes("wall") && !siege ? 4 + fort : 0) +
    (capitals[f] === j && s.factions[f]?.stand >= s.round ? 3 : 0) -
    (siege && t.city >= 3 ? 4 : 0);
  return { attack, defense };
}
export function hostile(s: State, a: Action) {
  const t = s.layers[a.e][a.to!];
  return (
    (t.owner >= 0 && t.owner !== s.active) ||
    (!!t.army && t.army.owner !== s.active)
  );
}
function march(s: State, a: Action) {
  const layer = s.layers[a.e],
    r = layer[a.i],
    t = layer[a.to!],
    army = r.army!;
  if (army.moves) army.moves--;
  else s.factions[s.active].extraMarch = false;
  let outcome = "moved";
  if (hostile(s, a)) {
    const { attack, defense } = powers(s, a),
      hit = Math.round(attack * (0.9 + roll(s) * 0.2));
    army.hp -=
      hit >= defense
        ? Math.max(1, Math.ceil(defense / 4))
        : Math.ceil((defense - hit) / 2) + 2;
    if (army.hp <= 0) {
      r.army = null;
      return "destroyed";
    }
    if (hit < defense) {
      if (t.build.includes("wall") || t.city >= 3) {
        if (t.siege?.owner !== s.active || t.siege.from !== a.i)
          t.siege = { owner: s.active, from: a.i, progress: 1 };
        return "besieged";
      }
      return "retreated";
    }
    if (t.siege && t.siege.progress >= 2)
      t.build = t.build.filter((b) => b !== "wall");
    t.owner = s.active;
    t.siege = null;
    outcome = "captured";
  }
  t.army = army;
  r.army = null;
  return outcome;
}
export function execute(s: State, a: Action) {
  const error = invalid(s, a);
  if (error) return error;
  const f = s.active,
    p = s.factions[f],
    r = s.layers[a.e][a.i],
    price = cost(s, a);
  for (const g of goods) p.stock[g] -= price[g] ?? 0;
  s.ap--;
  let outcome = "";
  if (a.kind === "march") outcome = march(s, a);
  else if (a.kind === "train") r.army!.level++;
  else if (["infantry", "ranged"].includes(a.kind))
    r.army = {
      owner: f,
      kind: a.kind,
      level: p.tech.includes("training") ? 2 : 1,
      hp: 10,
      moves: 1,
    };
  else develop(s, a);
  for (const layer of s.layers)
    for (const t of layer)
      if (t.siege && layer[t.siege.from].army?.owner !== t.siege.owner)
        t.siege = null;
  s.log.push({ round: s.round, f, action: { ...a }, outcome });
  if (
    !s.layers.some((layer) =>
      layer.some(
        (t, i) =>
          t.army?.owner === 0 ||
          (t.owner === 0 &&
            (capitals.includes(i) || t.build.includes("outpost"))),
      ),
    )
  ) {
    s.reason = "eliminated";
    s.winner = s.active || 1;
  }
  return "";
}
