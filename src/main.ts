import { route } from "./rules";
import Phaser from "phaser";
import { Atlas, orderDuration } from "./map";
import {
  actionsPerTurn,
  dominationTarget,
  goods,
  maxRounds,
  newGame,
  prerequisites,
  terrain,
  techs,
  buildings,
  type Action,
  type State,
} from "./world";
import {
  candidates,
  cost,
  echoIncome,
  echoSources,
  heritage,
  heritageEras,
  isImmediate,
  yieldPerBuilding,
  income,
  invalid,
  primary,
  product,
} from "./rules";
import { execute, hostile, powers } from "./combat";
import { resolveTurn, score } from "./round";
import { place, translate, type Lang } from "./locale";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML =
  '<div id="world"></div><header></header><aside></aside><section id="sheet"></section><footer></footer><section id="ai-playback" hidden><div role="status" aria-live="polite"></div></section><div id="overlay"></div><output aria-live="polite"></output>';
function el(tag: string, text = "", cls = "") {
  const x = document.createElement(tag);
  x.textContent = text;
  x.className = cls;
  return x;
}
function btn(text: string, fn: () => void, cls = "", label = text) {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = cls;
  b.setAttribute("aria-label", label);
  b.onclick = fn;
  return b;
}
const header = app.querySelector("header")!,
  foot = app.querySelector("footer")!,
  tools = app.querySelector("aside")!,
  sheet = app.querySelector<HTMLElement>("#sheet")!,
  over = app.querySelector<HTMLElement>("#overlay")!,
  message = app.querySelector("output")!;
const langKey = "stolen-ages.language",
  eraKeys = ["past", "present", "future"],
  flags = ["you", "red", "violet"];
let lang: Lang = "ru",
  state: State = fresh(),
  started = false,
  screen = "menu",
  returnTo = "menu",
  era = 0,
  selected = 0,
  panel = "",
  guide = 0,
  toastTimer = 0;
try {
  lang = localStorage.getItem(langKey) === "en" ? "en" : "ru";
} catch {
  // The default language is available without storage.
}
function fresh() {
  return newGame(crypto.getRandomValues(new Uint32Array(1))[0]);
}
const playbackPanel = app.querySelector<HTMLElement>("#ai-playback")!;
const playbackStatus =
  playbackPanel.querySelector<HTMLElement>("[role=status]")!;
let playback: ReturnType<typeof resolveTurn> | undefined;
let playbackTimer = 0;
let returnCamera: ReturnType<Atlas["cameraPosition"]>;
const t = (k: string) => translate(lang, k),
  name = (i: number) => place(lang, i);
const scaleLabel = el("small", "", "scaleLabel");
let displayState: State | undefined;
let displayEra = 0;
const view = {
  scale: (z: number) => {
    scaleLabel.textContent = Math.round(z * 100) + "%";
  },
  get state() {
    return playback && displayState ? displayState : state;
  },
  get era() {
    return playback && displayState ? displayEra : era;
  },
  get selected() {
    return playback ? -1 : selected;
  },
  name,
  select: (i: number) => {
    if (screen !== "game" || playback) return;
    selected = i;
    panel = "build";
    draw();
  },
};
const atlas = new Atlas(view);
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "world",
  backgroundColor: "#254b54",
  scene: atlas,
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  banner: false,
  audio: { noAudio: true },
});
let activeSince = performance.now(),
  playedMs = 0,
  aiMs = 0,
  crashes = 0;
function checkpoint() {
  const now = performance.now();
  if (wasVisible && state.winner === null && started)
    playedMs += Math.max(0, now - activeSince);
  activeSince = now;
}
let wasVisible = !document.hidden;
document.addEventListener("visibilitychange", () => {
  if (wasVisible) checkpoint();
  activeSince = performance.now();
  wasVisible = !document.hidden;
});
window.addEventListener("error", () => {
  crashes++;
});
function toast(text: string) {
  message.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (message.textContent = ""), 3500);
}
function open(id: string) {
  screen = id;
  draw();
}
function start() {
  state = fresh();
  started = true;
  playedMs = aiMs = crashes = 0;
  activeSince = performance.now();
  selected = 0;
  era = 0;
  panel = "";
  guide = 0;
  atlas.overview();
  returnTo = "game";
  open("help");
}
function changeEra(e: number) {
  era = e;
  sheet.scrollTop = 0;
  draw();
}
function finishPlayback() {
  if (!playback) return;
  window.clearTimeout(playbackTimer);
  state = playback.result;
  playback = undefined;
  displayState = undefined;
  playbackPanel.hidden = true;
  playbackStatus.replaceChildren();
  atlas.showOrder();
  atlas.restoreCamera(returnCamera);
  open(state.winner === null ? "game" : "result");
  if (state.winner === null)
    foot
      .querySelector<HTMLButtonElement>(".primary")
      ?.focus({ preventScroll: true });
}
function nextOrder(index: number) {
  const order = playback?.orders[index];
  if (!order) {
    finishPlayback();
    return;
  }
  const { entry, state: afterOrder } = order;
  const { action, f, outcome } = entry;
  displayState = afterOrder;
  displayEra = action.e;
  app.dataset.era = eraKeys[action.e];
  atlas.showOrder(entry);
  playbackStatus.replaceChildren(
    el("strong", t(flags[f]) + " · " + t(eraKeys[action.e])),
    el(
      "div",
      name(action.i) + (action.to === undefined ? "" : " → " + name(action.to)),
    ),
    el(
      "div",
      t(action.kind) +
        " · " +
        t(outcome || (isImmediate(action.kind) ? "ready" : "pending")),
    ),
  );
  playbackTimer = window.setTimeout(() => nextOrder(index + 1), orderDuration);
}
function end() {
  if (playback) return;
  checkpoint();
  const now = performance.now();
  playback = resolveTurn(state);
  aiMs += performance.now() - now;
  returnCamera = atlas.cameraPosition();
  panel = "";
  open("game");
  playbackPanel.hidden = false;
  skipPlayback.focus({ preventScroll: true });
  nextOrder(0);
}
const skipPlayback = btn(t("skipPlayback"), finishPlayback);
playbackPanel.append(skipPlayback);
function showPanel(id: string) {
  panel = panel === id ? "" : id;
  draw();
  sheet.scrollTop = 0;
}
function table(parent: HTMLElement, k: string, v: string) {
  const row = el("div", "", "row");
  row.append(el("span", k), el("b", v));
  parent.append(row);
}
function actionText(a: Action) {
  return a.kind === "march"
    ? t(hostile(state, a) ? "attack" : "march") + " → " + name(a.to!)
    : t(a.kind);
}
function hint(a: Action) {
  const k = a.kind;
  const tech = state.factions[state.active].tech;
  if (k === "march") {
    if (!hostile(state, a)) return t("marchEffect");
    const p = powers(state, a);
    const outlook =
      p.attack * 0.9 >= p.defense
        ? "high"
        : p.attack * 1.1 < p.defense
          ? "low"
          : "medium";
    return (
      t(outlook) +
      " · " +
      t("attackPower") +
      " " +
      p.attack.toFixed(1) +
      " / " +
      t("defense") +
      " " +
      p.defense
    );
  }
  if (product[k])
    return (
      "+" +
      yieldPerBuilding(state, state.active, k) +
      " " +
      t(product[k]) +
      " / " +
      t("round")
    );
  const notes: Record<string, string> = {
    tower: "+" + (tech.includes("fortification") ? 3 : 2) + " " + t("defense"),
    wall: "+" + (tech.includes("fortification") ? 5 : 4) + " " + t("defense"),
    fortifiedBridge: "+2 " + t("defense"),
    academy: t("academyEffect"),
    city: "+1 " + t("food") + " / " + t("round"),
    train: "+1 " + t("level"),
    infantry: t("recruitEffect") + " · 10 " + t("hp"),
    ranged: t("recruitEffect") + " · 10 " + t("hp"),
    barracks: t("barracksEffect"),
    outpost: t("outpostEffect"),
    agriculture: "+1 " + t("food") + " / " + t("farm"),
    fortification: t("fortificationEffect"),
    logistics: t("logisticsEffect"),
    training: t("trainingEffect"),
    resonance: t("resonanceEffect"),
    irrigation: "+1 " + t("food") + " / " + t("farm"),
    forestry: "+1 " + t("wood") + " / " + t("mill"),
    metallurgy: "+1 " + t("ore") + " / " + t("mine"),
    grids: "+1 " + t("energy") + " / " + t("plant"),
    masonry: "−1 " + t("wood") + " · " + t("tower") + " / " + t("wall"),
    urbanism: "−1 " + t("ore") + " · " + t("city"),
    reserves: t("reservesEffect"),
  };
  return notes[k] ?? "";
}
function blockedReason(reason: string, a: Action) {
  if (reason === "needTech")
    return t(reason) + " · " + t(prerequisites[a.kind]);
  if (reason === "needEcho")
    return t(reason) + " · " + heritage[a.kind].sources.map(t).join(" / ");
  if (reason === "shortage") {
    const price = cost(state, a);
    const stock = state.factions[state.active].stock;
    const missing = goods
      .filter((g) => (price[g] ?? 0) > stock[g])
      .map((g) => price[g]! - stock[g] + " " + t(g));
    return t(reason) + " · " + missing.join(", ");
  }
  return t(reason);
}
function echoPreview(a: Action) {
  if (a.e >= 2 || !["city", "outpost", ...buildings].includes(a.kind))
    return "";
  const after = structuredClone(state);
  if (execute(after, a)) return "";
  const source = after.layers[a.e][a.i];
  source.build.push(...source.pending);
  const effects: string[] = [];
  for (let e = a.e + 1; e < eraKeys.length; e++) {
    const resource = primary(a.i, e);
    const gain = echoIncome(after, e, a.i) - echoIncome(state, e, a.i);
    const unlocked = Object.keys(heritage).filter(
      (kind) =>
        heritageEras(after, e, a.i, kind).length &&
        !heritageEras(state, e, a.i, kind).length,
    );
    const changes = [
      ...(gain > 0
        ? ["+" + gain + " " + t(resource) + " / " + t("round")]
        : []),
      ...unlocked.map(t),
    ];
    if (changes.length)
      effects.push(t(eraKeys[e]) + " · " + changes.join(", "));
  }
  return effects.join(" / ");
}
function actionButton(a: Action) {
  const reason = invalid(state, a),
    price = cost(state, a),
    parts = [
      "1 " + t("ap"),
      ...goods.filter((g) => price[g]).map((g) => price[g] + " " + t(g)),
    ];
  const b = btn(
    "",
    () => {
      const err = execute(state, a);
      if (err) {
        toast(t(err));
        return;
      }
      checkpoint();
      toast(
        t(
          state.log.at(-1)?.outcome ||
            (isImmediate(a.kind) ? "ready" : "pending"),
        ),
      );
      if (state.winner !== null) screen = "result";
      draw();
    },
    "order",
    actionText(a),
  );
  b.disabled = !!reason;
  b.append(
    el("strong", actionText(a)),
    el("small", parts.join(" · ")),
    el(
      "small",
      hint(a) + " · " + t(isImmediate(a.kind) ? "immediately" : "atRoundEnd"),
    ),
  );
  if (reason) b.append(el("small", blockedReason(reason, a), "order-reason"));
  else {
    const preview = echoPreview(a);
    if (preview)
      b.append(el("small", t("echo") + " · " + preview, "order-echo"));
  }
  return b;
}
function drawEcho() {
  const details = document.createElement("details");
  details.className = "echo-card";
  const bonus = echoIncome(state, era, selected);
  details.open = true;
  details.append(
    el(
      "summary",
      t("echo") +
        (bonus
          ? "  +" + bonus + " " + t(primary(selected, era)) + " / " + t("round")
          : ""),
    ),
  );
  details.append(el("p", t("echoDefinition")));
  for (const { era: sourceEra, sources } of echoSources(state, era, selected))
    details.append(
      el("p", t(eraKeys[sourceEra]) + " · " + sources.map(t).join(", ")),
    );
  for (const [kind, legacy] of Object.entries(heritage)) {
    if (!legacy.grounds.includes(terrain[selected])) continue;
    const sources = heritageEras(state, era, selected, kind);
    const status =
      era === 0
        ? t("echoLater")
        : sources.length
          ? t("echoAvailable") +
            " · " +
            sources.map((e) => t(eraKeys[e])).join(", ")
          : t("needEcho");
    details.append(
      el(
        "p",
        t(kind) + " · " + status + " · " + legacy.sources.map(t).join(" / "),
      ),
    );
    if (state.layers[era][selected].build.includes(kind) && !sources.length)
      details.append(el("p", t("echoSuspended")));
  }
  if (era > 0 && !bonus) details.append(el("p", t("echoNoIncome")));
  return details;
}
function drawPanel() {
  sheet.replaceChildren();
  sheet.hidden = !panel;
  if (!panel) return;
  const r = state.layers[era][selected],
    region = ["build", "army", "research"].includes(panel);
  const top = el("div", "", "sheetTitle");
  top.append(
    el("h2", region ? name(selected) : t(panel)),
    btn(
      "×",
      () => {
        panel = "";
        draw();
      },
      "icon",
      t("close"),
    ),
  );
  sheet.append(top);
  if (region) {
    const selector = document.createElement("select");
    selector.setAttribute("aria-label", t("territory"));
    for (let i = 0; i < terrain.length; i++)
      selector.add(new Option(name(i), String(i), false, i === selected));
    selector.onchange = () => {
      selected = Number(selector.value);
      atlas.focus(selected);
      draw();
      sheet.scrollTop = 0;
    };
    sheet.append(selector);
    sheet.append(
      el(
        "p",
        t(eraKeys[era]) +
          " · " +
          t(flags[r.owner] ?? "neutral") +
          " · " +
          t(terrain[selected] === "city" ? "capital" : terrain[selected]) +
          (r.city ? " · " + t("level") + " " + r.city : ""),
      ),
    );
    if (r.build.length || r.pending.length)
      sheet.append(
        el(
          "p",
          [
            ...r.build.map(t),
            ...r.pending.map((b) => t(b) + " (" + t("pending") + ")"),
          ].join(" · "),
        ),
      );
    if (r.army)
      sheet.append(
        el(
          "p",
          t(r.army.kind) +
            " · " +
            t("level") +
            " " +
            r.army.level +
            " · " +
            r.army.hp +
            " " +
            t("hp"),
        ),
      );
    sheet.append(drawEcho());
    const tabs = el("div", "", "tabs");
    for (const id of ["build", "army", "research"])
      tabs.append(
        btn(
          t(id),
          () => {
            panel = id;
            draw();
          },
          id === panel ? "on" : "",
        ),
      );
    sheet.append(tabs);
    const list = el("div", "", "orders");
    const orders = candidates(state, era, selected).sort(
      (a, b) =>
        Number(
          !!heritage[b.kind]?.grounds.includes(terrain[selected]) && era > 0,
        ) -
        Number(
          !!heritage[a.kind]?.grounds.includes(terrain[selected]) && era > 0,
        ),
    );
    for (const a of orders) {
      if (
        heritage[a.kind] &&
        (era === 0 || !heritage[a.kind].grounds.includes(terrain[selected]))
      )
        continue;
      if (
        (techs.includes(a.kind)
          ? "research"
          : buildings.includes(a.kind) || a.kind === "city"
            ? "build"
            : "army") === panel
      )
        list.append(actionButton(a));
    }
    if (!list.childElementCount)
      list.append(el("p", t(panel === "army" ? "noArmy" : "ownership")));
    if (panel === "army" && r.army?.owner === 0) {
      const label = el("label", t("route"));
      const destination = document.createElement("select");
      destination.add(new Option("—", ""));
      for (let i = 0; i < terrain.length; i++)
        if (i !== selected) destination.add(new Option(name(i), String(i)));
      const preview = el("div");
      destination.onchange = () => {
        preview.replaceChildren();
        if (!destination.value) return;
        const path = route(state, era, selected, Number(destination.value));
        if (!path.length) {
          preview.append(el("p", t("noRoute")));
          return;
        }
        preview.append(
          el("p", path.map(name).join(" → ")),
          actionButton({ kind: "march", e: era, i: selected, to: path[1] }),
        );
      };
      label.append(destination);
      list.append(label, preview);
    }
    sheet.append(list);
  } else if (panel === "resources") {
    const projected = structuredClone(state);
    for (const layer of projected.layers)
      for (const area of layer) area.build.push(...area.pending);
    const rates = income(projected, 0);
    for (const g of goods)
      table(
        sheet,
        t(g),
        state.factions[0].stock[g] +
          " (" +
          (rates[g] >= 0 ? "+" : "") +
          rates[g] +
          ")",
      );
    for (const f of [0, 1, 2])
      table(sheet, t(flags[f]), score(state, f).total + " " + t("score"));
    if (state.factions[0].stand >= state.round)
      sheet.append(el("p", t("stand")));
  } else {
    if (!state.log.length) sheet.append(el("p", t("empty")));
    for (const l of state.log.slice(-50).reverse())
      sheet.append(
        el(
          "p",
          l.round +
            " · " +
            t(flags[l.f]) +
            " · " +
            t(eraKeys[l.action.e]) +
            " · " +
            name(l.action.i) +
            " · " +
            t(l.action.kind) +
            (l.action.to !== undefined ? " → " + name(l.action.to) : "") +
            (l.outcome ? " · " + t(l.outcome) : ""),
        ),
      );
  }
}
function draw() {
  document.documentElement.lang = lang;
  app.dataset.screen = screen;
  app.dataset.era = eraKeys[era];
  app.dataset.playback = String(!!playback);
  skipPlayback.textContent = t("skipPlayback");
  skipPlayback.setAttribute("aria-label", t("skipPlayback"));
  atlas.refresh();
  for (const x of [header, tools, foot, over]) x.replaceChildren();
  header.hidden = tools.hidden = foot.hidden = screen !== "game";
  sheet.hidden = true;
  over.hidden = screen === "game";
  if (screen === "game") {
    header.append(el("strong", "Stolen Ages", "brand"));
    const tabs = el("nav");
    for (const [i, k] of eraKeys.entries())
      tabs.append(btn(t(k), () => changeEra(i), i === era ? "on" : ""));
    header.append(tabs);
    header.append(
      el(
        "span",
        t("round") +
          " " +
          state.round +
          "/" +
          maxRounds +
          " · " +
          (playback
            ? t("opponentTurn")
            : state.ap + "/" + actionsPerTurn + " " + t("ap")),
        "counter",
      ),
      btn("☰", () => open("pause"), "icon", t("menu")),
    );
    tools.append(
      btn("+", () => atlas.zoom(1.3), "icon", t("zoomIn")),
      scaleLabel,
      btn("−", () => atlas.zoom(1 / 1.3), "icon", t("zoomOut")),
      btn("⌂", () => atlas.home(), "icon", t("home")),
    );
    foot.append(
      btn(t("resources"), () => showPanel("resources")),
      btn(t("actions"), () => showPanel("build")),
      btn(t("journal"), () => showPanel("journal")),
      btn(t("end"), () => open("turn"), "primary"),
    );
    if (playback) {
      for (const container of [header, tools, foot])
        for (const button of container.querySelectorAll("button"))
          button.disabled = true;
    } else drawPanel();
    return;
  }
  const box = el("article");
  over.append(box);
  const title = (str: string) => box.append(el("h1", str)),
    button = (label: string, fn: () => void, cls = "") =>
      box.append(btn(t(label), fn, cls));
  if (screen === "menu" || screen === "pause") {
    box.append(el("div", "✥", "seal"));
    title("Stolen Ages");
    box.append(
      el(
        "p",
        lang === "ru" ? "Три эпохи. Одна земля." : "Three ages. One land.",
        "subtitle",
      ),
    );
    if (started)
      button(
        "resume",
        () => open(state.winner === null ? "game" : "result"),
        "primary",
      );
    button(
      "new",
      () => (started ? open("overwrite") : start()),
      started ? "" : "primary",
    );
    for (const id of ["help", "settings"])
      button(id, () => {
        returnTo = screen;
        guide = 0;
        open(id);
      });
  } else if (screen === "settings") {
    title(t("settings"));
    box.append(el("p", t("language")));
    for (const [code, str] of [
      ["ru", "Русский"],
      ["en", "English"],
    ] as const)
      box.append(
        btn(
          str,
          () => {
            lang = code;
            try {
              localStorage.setItem(langKey, lang);
            } catch {
              toast(t("writeError"));
            }
            draw();
          },
          lang === code ? "on" : "",
        ),
      );
    button("back", () => open(returnTo));
  } else if (screen === "help") {
    title(t("help"));
    box.append(
      el("small", guide + 1 + " / 5"),
      el("p", t("guide" + guide).replace("{target}", String(dominationTarget))),
    );
    button(
      guide === 4 ? "close" : "next",
      () => {
        if (++guide === 5) open(returnTo);
        else draw();
      },
      "primary",
    );
    button("skip", () => open(returnTo));
  } else if (screen === "turn" || screen === "overwrite") {
    title(t(screen === "turn" ? "turnAsk" : "overwrite"));
    button("confirm", screen === "turn" ? end : start, "primary");
    button("back", () => open(screen === "turn" ? "game" : "menu"));
  } else {
    title(t(state.winner === 0 ? "win" : "lose"));
    box.append(el("p", t(state.reason)));
    for (const f of [0, 1, 2])
      table(box, t(flags[f]), String(score(state, f).total));
    button("restart", start, "primary");
    button("stats", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify({
              seed: state.seed,
              round: state.round,
              winner: state.winner,
              reason: state.reason,
              matchDurationMs: Math.round(playedMs),
              aiTimeMs: Math.round(aiMs),
              crashCount: crashes,
              apSpentByKind: state.log
                .filter((x) => x.f === 0)
                .reduce<Record<string, number>>((counts, x) => {
                  counts[x.action.kind] = (counts[x.action.kind] ?? 0) + 1;
                  return counts;
                }, {}),
              turnsPerEra: eraKeys.map(
                (_, e) =>
                  new Set(
                    state.log
                      .filter((x) => x.f === 0 && x.action.e === e)
                      .map((x) => x.round),
                  ).size,
              ),
              actions: state.log,
            }),
          ],
          { type: "application/json" },
        ),
      );
      a.download = "stolen-ages-match.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    button("menu", () => open("menu"));
  }
}
let sheetTouchY: number | null = null;
sheet.addEventListener(
  "touchstart",
  (ev) => {
    sheetTouchY = sheet.scrollTop === 0 ? ev.touches[0].clientY : null;
  },
  { passive: true },
);
sheet.addEventListener(
  "touchend",
  (ev) => {
    if (
      sheetTouchY !== null &&
      ev.changedTouches[0].clientY - sheetTouchY > 65
    ) {
      panel = "";
      draw();
    }
    sheetTouchY = null;
  },
  { passive: true },
);
window.addEventListener("keydown", (ev) => {
  if (screen !== "game" || playback) return;
  if (["1", "2", "3"].includes(ev.key)) changeEra(Number(ev.key) - 1);
  if (ev.key === "Escape") {
    panel = "";
    draw();
  }
  if (ev.code === "Space" && ev.target === document.body) {
    ev.preventDefault();
    atlas.home();
  }
  if (ev.key.toLowerCase() === "e") open("turn");
});
draw();
