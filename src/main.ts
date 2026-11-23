import { route } from "./rules";
import Phaser from "phaser";
import { Atlas } from "./map";
import {
  goods,
  terrain,
  techs,
  buildings,
  type Action,
  type State,
} from "./world";
import {
  candidates,
  cost,
  echo,
  income,
  invalid,
  primary,
  product,
} from "./rules";
import { execute, hostile, powers } from "./combat";
import { endTurn, score } from "./round";
import { place, translate, type Lang } from "./locale";
import { fresh, parseSave } from "./save";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML =
  '<div id="world"></div><header></header><aside></aside><section id="sheet"></section><footer></footer><div id="overlay"></div><output aria-live="polite"></output>';
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
const saveKey = "stolen-ages.v1",
  langKey = "stolen-ages.language",
  eraKeys = ["past", "present", "future"],
  flags = ["you", "red", "violet"];
let lang: Lang = "ru",
  state: State = fresh(),
  saved = false,
  screen = "menu",
  returnTo = "menu",
  era = 0,
  selected = 0,
  panel = "",
  guide = 0,
  notice = "",
  toastTimer = 0;
try {
  lang = localStorage.getItem(langKey) === "en" ? "en" : "ru";
  const raw = localStorage.getItem(saveKey);
  if (raw) {
    state = parseSave(raw);
    saved = true;
    const ui = JSON.parse(localStorage.getItem(saveKey + ".view") ?? "{}");
    era = [0, 1, 2].includes(ui.era) ? ui.era : 0;
    selected =
      Number.isInteger(ui.selected) && ui.selected >= 0 && ui.selected < 18
        ? ui.selected
        : 0;
    screen = state.winner === null ? "game" : "result";
  }
} catch {
  notice = "loadingError";
}
const t = (k: string) => translate(lang, k),
  name = (i: number) => place(lang, i);
const scaleLabel = el("small", "", "scaleLabel");
const view = {
  scale: (z: number) => {
    scaleLabel.textContent = Math.round(z * 100) + "%";
  },
  get state() {
    return state;
  },
  get era() {
    return era;
  },
  get selected() {
    return selected;
  },
  name,
  select: (i: number) => {
    if (screen !== "game") return;
    selected = i;
    panel = "build";
    save();
    draw();
  },
};
const atlas = new Atlas(view);
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "world",
  backgroundColor: "#b6b7a0",
  scene: atlas,
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  banner: false,
  audio: { noAudio: true },
});
let activeSince = performance.now(),
  playedMs = 0,
  aiMs = 0,
  crashes = 0;
try {
  const stored = JSON.parse(localStorage.getItem(saveKey + ".stats") ?? "null");
  if (stored?.seed === state.seed) {
    playedMs = Number(stored.playedMs) || 0;
    aiMs = Number(stored.aiMs) || 0;
    crashes = Number(stored.crashes) || 0;
  }
} catch {
  /* Optional playtest statistics may be unavailable. */
}
function checkpoint() {
  const now = performance.now();
  if (!document.hidden && state.winner === null && saved)
    playedMs += Math.max(0, now - activeSince);
  activeSince = now;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && saved) save();
  else activeSince = performance.now();
});
window.addEventListener("error", () => {
  crashes++;
});
function save() {
  checkpoint();
  try {
    localStorage.setItem(saveKey, JSON.stringify(state));
    localStorage.setItem(saveKey + ".view", JSON.stringify({ era, selected }));
    localStorage.setItem(
      saveKey + ".stats",
      JSON.stringify({ seed: state.seed, playedMs, aiMs, crashes }),
    );
    saved = true;
  } catch {
    toast(t("writeError"));
  }
}
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
  playedMs = aiMs = crashes = 0;
  activeSince = performance.now();
  selected = 0;
  era = 0;
  panel = "";
  guide = 0;
  save();
  atlas.home();
  returnTo = "game";
  open("help");
}
function changeEra(e: number) {
  era = e;
  save();
  draw();
}
function end() {
  checkpoint();
  const before = state.log.length,
    now = performance.now();
  endTurn(state);
  aiMs += performance.now() - now;
  if (state.winner === null)
    toast(
      t("aiOrders") + " " + (state.log.length - before) + " · " + t("journal"),
    );
  save();
  panel = "";
  open(state.winner === null ? "game" : "result");
}
function showPanel(id: string) {
  panel = panel === id ? "" : id;
  draw();
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
  if (k === "march" && hostile(state, a)) {
    const p = powers(state, a);
    return t(
      p.attack * 0.9 >= p.defense
        ? "high"
        : p.attack * 1.1 < p.defense
          ? "low"
          : "medium",
    );
  }
  if (product[k])
    return (
      "+" + (k === "outpost" ? 1 : 2) + " " + t(product[k]) + " / " + t("round")
    );
  const notes: Record<string, string> = {
    tower: "+2 " + t("defense"),
    wall: "+4 " + t("defense"),
    city: "+1 " + t("food") + " · +1 " + t("knowledge"),
    train: "+1 " + t("level"),
    infantry: "10 " + t("hp"),
    ranged: "10 " + t("hp"),
    barracks: t("infantry") + " / " + t("ranged"),
    agriculture: "+1 " + t("food") + " / " + t("farm"),
    fortification: "+1 " + t("defense"),
    logistics: "+1 " + t("march"),
    training: "+1 " + t("level"),
    resonance: "+1 " + t("echo"),
  };
  return notes[k] ?? "";
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
      save();
      toast(t(state.log.at(-1)?.outcome || "ready"));
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
    el("small", reason ? t(reason) : hint(a)),
  );
  return b;
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
    for (let i = 0; i < 18; i++)
      selector.add(new Option(name(i), String(i), false, i === selected));
    selector.onchange = () => {
      selected = Number(selector.value);
      atlas.focus(selected);
      save();
      draw();
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
    if (echo(state, era, selected))
      sheet.append(
        el(
          "p",
          t("echo") +
            " +" +
            echo(state, era, selected) +
            " " +
            t(primary(selected, era)),
        ),
      );
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
    for (const a of candidates(state, era, selected)) {
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
      for (let i = 0; i < 18; i++)
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
    const rates = income(state, 0);
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
        t("round") + " " + state.round + "/20 · " + state.ap + " " + t("ap"),
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
    drawPanel();
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
    if (saved)
      button(
        "resume",
        () => open(state.winner === null ? "game" : "result"),
        "primary",
      );
    button(
      "new",
      () => (saved ? open("overwrite") : start()),
      saved ? "" : "primary",
    );
    for (const id of ["help", "settings"])
      button(id, () => {
        returnTo = screen;
        guide = 0;
        open(id);
      });
    if (notice) box.append(el("p", t(notice)));
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
    box.append(el("small", guide + 1 + " / 5"), el("p", t("guide" + guide)));
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
  if (screen !== "game") return;
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
