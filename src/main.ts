import { route } from "./rules";
import Phaser from "phaser";
import { Atlas } from "./map";
import {
  actionsPerTurn,
  buildingCapacity,
  defaultOpponents,
  isCapital,
  type OpponentCount,
  type Region,
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
  actionPoints,
  buildingLevel,
  candidates,
  demolitionRefund,
  finishConstruction,
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
import {
  getRecord,
  listRecords,
  writeRecord,
  deleteRecord,
  libraryLimit,
  LibraryFull,
  type MatchSummary,
  type ReplaySummary,
} from "./library";
import {
  maxReplayBytes,
  newReplay,
  parseReplay,
  recordFrame,
  restoreState,
  type Replay,
} from "./replay";
import {
  orderSpeeds,
  readPreferences,
  replayRates,
  saveIntervals,
  writePreferences,
  type OrderSpeed,
  type ReplayRate,
} from "./preferences";
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
  flags = ["you", "red", "violet", "green"];
let lang: Lang = "ru",
  state: State = fresh(defaultOpponents),
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
function fresh(opponents: OpponentCount) {
  return newGame(crypto.getRandomValues(new Uint32Array(1))[0], opponents);
}
let preferences = readPreferences();
let opponentChoice: OpponentCount = defaultOpponents;
let matchId = "";
let replay = newReplay(state);
let hasSlot = false;
let creatingMatch = false;
let manualSavePending = false;
let autosaveSuspended = false;
let matchList: MatchSummary[] = [];
let replayList: ReplaySummary[] = [];
let libraryRead = 0;
let confirmRequest:
  | { text: string; previous: string; action: () => void }
  | undefined;
let viewer:
  | {
      replay: Replay;
      index: number;
      speed: ReplayRate;
      playing: boolean;
      previous: string;
      archived: boolean;
    }
  | undefined;
let viewerTimer = 0;
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
    return displayState ?? state;
  },
  get era() {
    return displayState ? displayEra : era;
  },
  get selected() {
    return playback || viewer ? -1 : selected;
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
  tickAutosave();
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
  tickAutosave();
  screen = id;
  draw();
  if (libraryVisible()) void refreshLibrary();
}
async function start() {
  if (creatingMatch) return;
  creatingMatch = true;
  draw();
  try {
    try {
      if ((await listRecords("matches")).length >= libraryLimit) {
        toast(t("matchesFull"));
        open("matches");
        return;
      }
    } catch {
      if (preferences.savesEnabled) throw new Error("Saves unavailable");
    }

    const nextState = fresh(opponentChoice);
    const nextReplay = newReplay(nextState);
    const id = crypto.randomUUID();
    if (preferences.savesEnabled)
      await persistMatch(id, nextReplay, 0, 0, 0, 0, 0, true);
    state = nextState;
    replay = nextReplay;
    matchId = id;
    hasSlot = preferences.savesEnabled;
    autosaveSuspended = false;
    started = true;
    playedMs = aiMs = crashes = 0;
    activeSince = performance.now();
    resetAutosave();
    selected = 0;
    era = 0;
    panel = "";
    guide = 0;
    atlas.overview();
    returnTo = "game";
    open("help");
  } catch (error) {
    toast(t(error instanceof LibraryFull ? "matchesFull" : "saveError"));
  } finally {
    creatingMatch = false;
    draw();
  }
}
function changeEra(e: number) {
  era = e;
  sheet.scrollTop = 0;
  draw();
}
function finishPlayback() {
  if (!playback) return;
  window.clearTimeout(playbackTimer);
  for (const { entry, state: afterOrder } of playback.orders)
    recordFrame(replay, afterOrder, entry);
  state = playback.result;
  recordFrame(replay, state, null);
  playback = undefined;
  displayState = undefined;
  playbackPanel.hidden = true;
  playbackStatus.replaceChildren();
  atlas.showOrder();
  atlas.restoreCamera(returnCamera);
  if (state.winner !== null) finishMatch();
  else {
    open("game");
    tickAutosave();
  }
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
  const duration = orderSpeeds[preferences.orderSpeed];
  atlas.showOrder(entry, duration);
  playbackStatus.replaceChildren(
    el("strong", t(flags[f]) + " · " + t(eraKeys[action.e])),
    el(
      "div",
      name(action.i) + (action.to === undefined ? "" : " → " + name(action.to)),
    ),
    el(
      "div",
      orderTitle(action, afterOrder) +
        " · " +
        t(outcome || (isImmediate(action.kind) ? "ready" : "pending")),
    ),
  );
  playbackTimer = window.setTimeout(() => nextOrder(index + 1), duration);
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
const playbackSpeed = document.createElement("select");
playbackSpeed.onchange = () =>
  changePreferences({ orderSpeed: playbackSpeed.value as OrderSpeed });
const playbackControls = el("div", "", "playback-controls");
playbackControls.append(playbackSpeed, skipPlayback);
playbackPanel.append(playbackControls);
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
function orderTitle(a: Action, current = state) {
  if (a.kind === "city")
    return t(isCapital(current, a.i) ? "city" : "developSettlement");
  if (a.kind === "upgrade" || a.kind === "demolish")
    return t(a.kind) + " · " + t(a.building ?? "");
  return t(a.kind);
}
function actionText(a: Action) {
  return a.kind === "march"
    ? t(hostile(state, a) ? "attack" : "march") + " → " + name(a.to!)
    : orderTitle(a);
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
    city:
      "→ " +
      t("level") +
      " " +
      (state.layers[a.e][a.i].city + 1) +
      " · +1 " +
      t("food") +
      " / " +
      t("round") +
      " · +2 " +
      t("defense"),
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
  finishConstruction(source);
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
function runOrder(a: Action) {
  const err = execute(state, a);
  if (err) {
    toast(t(err));
    return;
  }
  checkpoint();
  const entry = state.log.at(-1)!;
  recordFrame(replay, state);
  toast(t(entry.outcome || (isImmediate(a.kind) ? "ready" : "pending")));
  if (state.winner !== null) finishMatch();
  else draw();
}

function amountText(amount: ReturnType<typeof cost>) {
  return goods
    .filter((good) => amount[good])
    .map((good) => amount[good] + " " + t(good))
    .join(" · ");
}

function upgradeHint(kind: string) {
  if (product[kind] || kind === "outpost")
    return "+1 " + t(product[kind] ?? "wood") + " / " + t("round");
  if (kind === "academy") return t("academyUpgrade");
  if (kind === "barracks") return t("barracksUpgrade");
  return "+1 " + t("defense");
}

function actionButton(a: Action) {
  const reason = invalid(state, a);
  const price = amountText(cost(state, a));
  const parts = [actionPoints(a.kind) + " " + t("ap"), price].filter(Boolean);
  const b = btn("", () => runOrder(a), "order", actionText(a));
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
function askConfirm(text: string, action: () => void) {
  confirmRequest = { text, previous: screen, action };
  open("confirm");
}

function buildingManager(region: Region) {
  const group = el("div", "", "building-manager");
  const occupied = region.structures.filter(Boolean).length;
  group.append(
    el("strong", t("buildingSlots") + " " + occupied + "/" + buildingCapacity),
  );
  for (const [slot, item] of region.structures.entries()) {
    if (!item) continue;
    const row = el("div", "", "structure-row");
    const level = ["", "I", "II", "III"][item.level];
    const status =
      item.pending === "build"
        ? t("pending")
        : item.pending === "upgrade"
          ? t("upgradeQueued") + " " + ["", "I", "II", "III"][item.level + 1]
          : "";
    const title = t(item.kind) + " · " + t("level") + " " + level;
    row.append(el("strong", title));
    if (status) row.append(el("small", status));
    if (region.owner === state.active) {
      const fields = { e: era, i: selected, slot, building: item.kind };
      const upgrade = { kind: "upgrade", ...fields };
      const demolish = { kind: "demolish", ...fields };
      const controls = el("div", "", "structure-controls");
      if (item.level < 3 && !item.pending) {
        const price = amountText(cost(state, upgrade));
        const reason = invalid(state, upgrade);
        const button = btn(
          t("upgrade") + " → " + ["", "I", "II", "III"][item.level + 1],
          () => runOrder(upgrade),
          "",
          orderTitle(upgrade),
        );
        button.disabled = !!reason;
        controls.append(button);
        row.append(
          el(
            "small",
            "1 " +
              t("ap") +
              " · " +
              price +
              " · " +
              upgradeHint(item.kind) +
              " · " +
              t("atRoundEnd"),
          ),
        );
        if (reason)
          row.append(
            el("small", blockedReason(reason, upgrade), "order-reason"),
          );
      }
      const refund = amountText(demolitionRefund(item.kind));
      const removeLabel = t(
        item.pending === "build" ? "cancelConstruction" : "demolish",
      );
      const remove = btn(
        removeLabel,
        () => {
          const prompt =
            removeLabel +
            " · " +
            title +
            "? " +
            (refund ? t("refund") + " " + refund : t("noRefund"));
          askConfirm(prompt, () => runOrder(demolish));
        },
        "",
        removeLabel + " · " + t(item.kind),
      );
      const reason = invalid(state, demolish);
      remove.disabled = !!reason;
      controls.append(remove);
      row.append(controls);
      if (reason) row.append(el("small", t(reason), "order-reason"));
    }
    group.append(row);
  }
  return group;
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
    if (buildingLevel(state.layers[era][selected], kind) > 0 && !sources.length)
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
          t(
            isCapital(state, selected)
              ? "capital"
              : r.city
                ? "settlement"
                : terrain[selected],
          ) +
          (r.city ? " · " + t("level") + " " + r.city : ""),
      ),
    );
    if (panel === "build") sheet.append(buildingManager(r));
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
      if (a.kind === "upgrade") continue;
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
      for (const area of layer) finishConstruction(area);
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
    for (const f of state.factions.keys())
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
            orderTitle(l.action) +
            (l.action.to !== undefined ? " → " + name(l.action.to) : "") +
            (l.outcome ? " · " + t(l.outcome) : ""),
        ),
      );
  }
}
function choice<T extends string | number | boolean>(
  label: string,
  values: readonly T[],
  current: T,
  caption: (value: T) => string,
  change: (value: T) => void,
) {
  const field = el("label", label, "setting-field");
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  for (const value of values)
    select.add(
      new Option(caption(value), String(value), false, current === value),
    );
  select.onchange = () => {
    const value = values.find((item) => String(item) === select.value);
    if (value !== undefined) change(value);
  };
  field.append(select);
  return field;
}

function changePreferences(change: Partial<typeof preferences>) {
  const previous = preferences;
  preferences = { ...preferences, ...change };
  if (change.autosave === true || change.savesEnabled === true)
    autosaveSuspended = false;
  try {
    writePreferences(preferences);
  } catch {
    toast(t("preferencesError"));
  }
  if (
    previous.savesEnabled !== preferences.savesEnabled ||
    previous.autosave !== preferences.autosave ||
    previous.interval !== preferences.interval
  )
    resetAutosave();
  if (!playback) {
    draw();
    if (screen === "settings") {
      const label =
        change.savesEnabled !== undefined
          ? "savesEnabled"
          : change.autosave !== undefined
            ? "autosave"
            : "saveInterval";
      [...over.querySelectorAll("select")]
        .find((field) => field.getAttribute("aria-label") === t(label))
        ?.focus();
    }
  }
}

async function refreshLibrary() {
  const request = ++libraryRead;
  try {
    const [matches, replays] = await Promise.all([
      listRecords("matches"),
      listRecords("replays"),
    ]);
    if (request !== libraryRead) return;
    matchList = matches;
    replayList = replays;
    if (libraryVisible()) draw();
  } catch {
    if (screen === "matches" || screen === "replays") toast(t("libraryError"));
  }
}

function libraryVisible() {
  return ["menu", "pause", "setup", "matches", "replays", "result"].includes(
    screen,
  );
}

function persistMatch(
  id: string,
  recording: Replay,
  areaEra: number,
  areaIndex: number,
  playTime: number,
  opponentTime: number,
  crashCount: number,
  mayCreate: boolean,
) {
  const { opponents, round, winner } = recording.frames.at(-1)!.state;
  const summary = { id, savedAt: Date.now(), opponents, round, winner };
  // Freeze the frame list now. Individual frames are immutable after recording.
  const snapshot = { ...recording, frames: recording.frames.slice() };
  return writeRecord(
    "matches",
    summary,
    {
      ...summary,
      replay: snapshot,
      era: areaEra,
      selected: areaIndex,
      playedMs: playTime,
      aiMs: opponentTime,
      crashes: crashCount,
    },
    mayCreate,
  );
}

let saveQueue = Promise.resolve();
function storeMatch(manual = false, finish = false) {
  if (!started || playback || (!finish && !preferences.savesEnabled))
    return Promise.resolve(false);
  const id = matchId;
  const recording = { ...replay, frames: replay.frames.slice() };
  const areaEra = era,
    areaIndex = selected,
    playTime = playedMs,
    opponentTime = aiMs,
    crashCount = crashes;
  const operation = saveQueue.then(async () => {
    try {
      const exists = id === matchId && hasSlot;
      if (finish && !exists && !(await getRecord("matches", id))) return false;
      await persistMatch(
        id,
        recording,
        areaEra,
        areaIndex,
        playTime,
        opponentTime,
        crashCount,
        !finish && !exists,
      );
      if (id === matchId) {
        hasSlot = true;
        if (manual) autosaveSuspended = false;
        if (recording.frames.at(-1)?.state === replay.frames.at(-1)?.state)
          resetAutosave();
      }
      if (manual) toast(t("savedMatch"));
      if (libraryVisible()) void refreshLibrary();
      return true;
    } catch (error) {
      toast(t(error instanceof LibraryFull ? "matchesFull" : "saveError"));
      return false;
    }
  });
  saveQueue = operation.then(() => {});
  return operation;
}

async function saveMatchManually() {
  if (manualSavePending) return;
  manualSavePending = true;
  checkpoint();
  try {
    await storeMatch(true);
  } finally {
    manualSavePending = false;
  }
}

function finishMatch() {
  open("result");
  if (hasSlot || manualSavePending || autosaveInFlight)
    void storeMatch(false, true);
}

let autosaveClock = performance.now();
let autosaveElapsed = 0;
let autosaveInFlight = false;
function resetAutosave() {
  autosaveClock = performance.now();
  autosaveElapsed = 0;
}

function tickAutosave() {
  const now = performance.now();
  if (
    started &&
    state.winner === null &&
    screen === "game" &&
    wasVisible &&
    preferences.savesEnabled &&
    preferences.autosave &&
    !autosaveSuspended
  )
    autosaveElapsed += now - autosaveClock;
  autosaveClock = now;
  if (
    started &&
    state.winner === null &&
    screen === "game" &&
    !document.hidden &&
    !playback &&
    preferences.savesEnabled &&
    preferences.autosave &&
    !autosaveSuspended &&
    autosaveElapsed >= preferences.interval * 1000 &&
    !autosaveInFlight
  ) {
    autosaveInFlight = true;
    resetAutosave();
    void storeMatch().finally(() => {
      autosaveInFlight = false;
    });
  }
}
window.setInterval(tickAutosave, 250);

function matchDescription(record: MatchSummary | ReplaySummary) {
  const status =
    record.winner === null
      ? t("inProgress")
      : t(record.winner === 0 ? "win" : "lose");
  const when = new Intl.DateTimeFormat(lang, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(record.savedAt);
  return (
    t("round") +
    " " +
    record.round +
    " · " +
    t("opponents") +
    " " +
    record.opponents +
    " · " +
    status +
    " · " +
    when
  );
}

async function loadMatch(id: string) {
  try {
    const match = await getRecord("matches", id);
    if (!match) throw new Error("Match unavailable");
    replay = match.replay;
    state = restoreState(replay);
    matchId = id;
    hasSlot = true;
    autosaveSuspended = false;
    started = true;
    era = match.era;
    selected = match.selected;
    playedMs = match.playedMs;
    aiMs = match.aiMs;
    crashes = match.crashes;
    panel = "";
    activeSince = performance.now();
    resetAutosave();
    atlas.overview();
    open(state.winner === null ? "game" : "result");
  } catch {
    toast(t("libraryError"));
  }
}

function drawLibrary(box: HTMLElement, collection: "matches" | "replays") {
  const matches = collection === "matches";
  const records = matches ? matchList : replayList;
  box.classList.add("library-box");
  box.append(
    el("h1", t(collection)),
    el("p", records.length + "/" + libraryLimit, "library-note"),
  );
  for (const [index, item] of records.entries()) {
    const row = el("div", "", "library-entry");
    const label =
      ("label" in item && typeof item.label === "string" && item.label) ||
      t(matches ? "match" : "replayItem") + " " + (index + 1);
    row.append(el("strong", label), el("p", matchDescription(item)));
    const actions = el("div", "", "library-actions");
    if (matches) {
      actions.append(
        btn(t(item.winner === null ? "resume" : "results"), () => {
          const load = () => {
            void loadMatch(item.id);
          };
          if (started && state.winner === null)
            askConfirm(t("leaveMatch"), load);
          else load();
        }),
      );
    } else {
      actions.append(
        btn(t("watchReplay"), () => void useArchivedReplay(item.id, false)),
        btn(t("downloadReplay"), () => void useArchivedReplay(item.id, true)),
      );
    }
    actions.append(
      btn(t("delete"), () =>
        askConfirm(t(matches ? "deleteMatchAsk" : "deleteReplayAsk"), () => {
          void removeRecord(collection, item.id);
        }),
      ),
    );
    row.append(actions);
    box.append(row);
  }
  if (!records.length)
    box.append(el("p", t(matches ? "noMatches" : "noReplays")));
  if (!matches) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void importReplay(file);
    };
    const upload = btn(t("importReplay"), () => input.click());
    upload.disabled = records.length >= libraryLimit;
    box.append(input, upload);
    if (upload.disabled) box.append(el("p", t("replaysFull"), "library-note"));
  }
  box.append(btn(t("back"), () => open("menu")));
}

async function removeRecord(collection: "matches" | "replays", id: string) {
  try {
    if (collection === "matches" && id === matchId) {
      await saveQueue;
      await deleteRecord(collection, id);
      hasSlot = false;
      autosaveSuspended = true;
      matchId = crypto.randomUUID();
      resetAutosave();
    } else await deleteRecord(collection, id);
    void refreshLibrary();
  } catch {
    toast(t("libraryError"));
  }
}

let archiving = false;
async function archiveReplay(recording: Replay, label?: string) {
  if (archiving) return;
  archiving = true;
  try {
    const { opponents, round, winner } = recording.frames.at(-1)!.state;
    if (winner === null) throw new Error("The match is unfinished");
    const summary = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      opponents,
      round,
      winner,
      label,
    };
    await writeRecord("replays", summary, { ...summary, replay: recording });
    toast(t("replaySaved"));
    void refreshLibrary().then(() => {
      if (viewer && screen === "replay") updateReplayControls();
    });
  } catch (error) {
    toast(t(error instanceof LibraryFull ? "replaysFull" : "saveError"));
  } finally {
    archiving = false;
  }
}

async function importReplay(file: File) {
  let recording: Replay;
  try {
    if (file.size > maxReplayBytes) throw new Error("The file is too large");
    recording = parseReplay(await file.text());
  } catch {
    toast(t("invalidReplay"));
    return;
  }
  void archiveReplay(recording, file.name.replace(/\.json$/i, "").slice(0, 96));
}

function downloadReplay(recording: Replay) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(recording)], { type: "application/json" }),
  );
  link.href = url;
  link.download = "stolen-ages-replay.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function useArchivedReplay(id: string, download: boolean) {
  try {
    const record = await getRecord("replays", id);
    if (!record) throw new Error("Replay unavailable");
    if (download) downloadReplay(record.replay);
    else openReplay(record.replay, "replays", true);
  } catch {
    toast(t("libraryError"));
  }
}

function openReplay(recording: Replay, previous: string, archived = false) {
  viewer = {
    replay: recording,
    index: 0,
    speed: 1,
    playing: false,
    previous,
    archived,
  };
  displayState = { ...recording.frames[0].state, log: [] };
  displayEra = 0;
  atlas.overview();
  open("replay");
  void refreshLibrary().then(() => {
    if (viewer && screen === "replay") updateReplayControls();
  });
}

function closeReplay() {
  if (!viewer) return;
  const { previous } = viewer;
  window.clearTimeout(viewerTimer);
  viewer = undefined;
  displayState = undefined;
  atlas.showOrder();
  open(previous);
}

let replayStatus: HTMLElement;
let replayToggle: HTMLButtonElement;
let replayBack: HTMLButtonElement;
let replayNext: HTMLButtonElement;
let replayRound: HTMLSelectElement;
let replayArchive: HTMLButtonElement | undefined;
let replayLimitNote: HTMLElement | undefined;

function updateReplayControls() {
  if (!viewer) return;
  const { index, replay: recording, playing } = viewer;
  const { state: snapshot, order } = recording.frames[index];
  const subject = order
    ? t(flags[order.f]) +
      " · " +
      t(eraKeys[order.action.e]) +
      " · " +
      name(order.action.i) +
      (order.action.to === undefined ? "" : " → " + name(order.action.to)) +
      " · " +
      orderTitle(order.action, displayState) +
      (order.outcome ? " · " + t(order.outcome) : "")
    : snapshot.winner !== null
      ? t("results")
      : index
        ? t("roundStart")
        : t("replayStart");
  replayStatus.textContent =
    t("round") + " " + snapshot.round + " · " + subject;
  replayBack.disabled = index === 0;
  replayNext.disabled = index === recording.frames.length - 1;
  replayToggle.textContent = t(playing ? "pauseReplay" : "playReplay");
  replayToggle.setAttribute("aria-label", replayToggle.textContent);
  replayRound.value = String(snapshot.round);
  if (replayArchive && replayLimitNote) {
    replayArchive.disabled = replayList.length >= libraryLimit;
    replayLimitNote.hidden = !replayArchive.disabled;
  }
}

function showFrame(index: number, duration = 0) {
  if (!viewer) return;
  viewer.index = Math.max(0, Math.min(index, viewer.replay.frames.length - 1));
  const { state: snapshot, order } = viewer.replay.frames[viewer.index];
  displayState = { ...snapshot, log: [] };
  let currentOrder = order;
  for (
    let previous = viewer.index - 1;
    !currentOrder && previous >= 0;
    previous--
  )
    currentOrder = viewer.replay.frames[previous].order;
  displayEra = currentOrder?.action.e ?? 0;
  app.dataset.era = eraKeys[displayEra];
  atlas.showOrder(order ?? undefined, duration);
  updateReplayControls();
}

function stopReplay() {
  if (!viewer) return;
  window.clearTimeout(viewerTimer);
  viewer.playing = false;
  showFrame(viewer.index);
}

function replayAdvance() {
  if (!viewer?.playing) return;
  if (viewer.index >= viewer.replay.frames.length - 1) {
    stopReplay();
    return;
  }
  const duration = orderSpeeds.medium / viewer.speed;
  showFrame(viewer.index + 1, duration);
  viewerTimer = window.setTimeout(replayAdvance, duration);
}

function drawViewer() {
  if (!viewer) return;
  over.hidden = true;
  header.hidden = foot.hidden = false;
  const recording = viewer.replay;
  replayStatus = el("div", "", "replay-status");
  replayStatus.setAttribute("role", "status");
  header.append(
    btn(t("back"), closeReplay),
    el("strong", t("replayItem")),
    replayStatus,
  );
  replayToggle = btn(
    t("playReplay"),
    () => {
      if (!viewer) return;
      if (viewer.playing) stopReplay();
      else {
        if (viewer.index >= recording.frames.length - 1) showFrame(0);
        viewer.playing = true;
        replayAdvance();
      }
    },
    "primary",
  );
  replayBack = btn(
    "‹",
    () => {
      stopReplay();
      if (viewer) showFrame(viewer.index - 1);
    },
    "",
    t("previousOrder"),
  );
  replayNext = btn(
    "›",
    () => {
      stopReplay();
      if (viewer) showFrame(viewer.index + 1);
    },
    "",
    t("nextOrder"),
  );
  const rounds = [
    ...new Set(recording.frames.map(({ state: snapshot }) => snapshot.round)),
  ];
  const roundField = choice(
    t("round"),
    rounds,
    recording.frames[viewer.index].state.round,
    String,
    (round) => {
      stopReplay();
      showFrame(
        recording.frames.findIndex(
          ({ state: snapshot }) => snapshot.round === round,
        ),
      );
    },
  );
  replayRound = roundField.querySelector("select")!;
  const speed = choice(
    t("replaySpeed"),
    replayRates,
    viewer.speed,
    (rate) => new Intl.NumberFormat(lang).format(rate) + "×",
    (rate) => {
      if (viewer) viewer.speed = rate;
    },
  );
  replayArchive = viewer.archived
    ? undefined
    : btn(t("archiveReplay"), () => void archiveReplay(recording));
  foot.append(replayBack, replayToggle, replayNext, roundField, speed);
  replayLimitNote = replayArchive ? el("small", t("replaysFull")) : undefined;
  if (replayArchive && replayLimitNote)
    foot.append(replayArchive, replayLimitNote);
  foot.append(btn(t("downloadReplay"), () => downloadReplay(recording)));
  updateReplayControls();
}

function draw() {
  document.documentElement.lang = lang;
  app.dataset.screen = screen;
  app.dataset.era = eraKeys[displayState ? displayEra : era];
  app.dataset.playback = String(!!playback);
  skipPlayback.textContent = t("skipPlayback");
  skipPlayback.setAttribute("aria-label", t("skipPlayback"));
  playbackSpeed.setAttribute("aria-label", t("orderSpeed"));
  playbackSpeed.replaceChildren(
    ...Object.keys(orderSpeeds).map(
      (value) =>
        new Option(
          t("speed-" + value),
          value,
          false,
          value === preferences.orderSpeed,
        ),
    ),
  );
  atlas.refresh();
  for (const x of [header, tools, foot, over]) x.replaceChildren();
  header.hidden = tools.hidden = foot.hidden = screen !== "game";
  sheet.hidden = true;
  over.hidden = screen === "game";
  if (screen === "replay" && viewer) {
    drawViewer();
    return;
  }
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
            : state.ap + "/" + actionsPerTurn(state.opponents) + " " + t("ap")),
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
    const newButton = btn(
      t("new"),
      () => {
        if (started && state.winner === null)
          askConfirm(t("overwrite"), () => open("setup"));
        else open("setup");
      },
      started ? "" : "primary",
    );
    newButton.disabled = matchList.length >= libraryLimit;
    box.append(newButton);
    if (newButton.disabled)
      box.append(el("p", t("matchesFull"), "library-note"));
    button("matches", () => open("matches"));
    button("replays", () => open("replays"));
    if (started && preferences.savesEnabled)
      button("saveMatch", () => void saveMatchManually());
    if (screen === "pause") button("menu", () => open("menu"));
    for (const id of ["help", "settings"])
      button(id, () => {
        returnTo = screen;
        guide = 0;
        open(id);
      });
  } else if (screen === "setup") {
    title(t("new"));
    box.append(
      choice(
        t("opponents"),
        [1, 2, 3] as const,
        opponentChoice,
        (count) => String(count),
        (count) => {
          opponentChoice = count;
          draw();
        },
      ),
    );
    box.append(
      el(
        "p",
        t("apPerFaction") +
          " " +
          actionsPerTurn(opponentChoice) +
          " " +
          t("ap"),
      ),
    );
    const startButton = btn(t("startMatch"), () => void start(), "primary");
    startButton.disabled = creatingMatch || matchList.length >= libraryLimit;
    box.append(startButton);
    if (matchList.length >= libraryLimit) box.append(el("p", t("matchesFull")));
    const back = btn(t("back"), () => open("menu"));
    back.disabled = creatingMatch;
    box.append(back);
  } else if (screen === "matches" || screen === "replays") {
    drawLibrary(box, screen === "matches" ? "matches" : "replays");
  } else if (screen === "confirm" && confirmRequest) {
    title(t("confirmation"));
    box.append(el("p", confirmRequest.text));
    const request = confirmRequest;
    button(
      "confirm",
      () => {
        confirmRequest = undefined;
        open(request.previous);
        request.action();
      },
      "primary",
    );
    button("back", () => {
      confirmRequest = undefined;
      open(request.previous);
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
    const switches = [false, true] as const;
    const yesNo = (value: boolean) => t(value ? "yes" : "no");
    box.append(
      choice(
        t("savesEnabled"),
        switches,
        preferences.savesEnabled,
        yesNo,
        (savesEnabled) => changePreferences({ savesEnabled }),
      ),
    );
    if (preferences.savesEnabled) {
      box.append(
        choice(
          t("autosave"),
          switches,
          preferences.autosave,
          yesNo,
          (autosave) => changePreferences({ autosave }),
        ),
      );
      if (preferences.autosave)
        box.append(
          choice(
            t("saveInterval"),
            saveIntervals,
            preferences.interval,
            (value) => t("interval-" + value),
            (interval) => changePreferences({ interval }),
          ),
        );
      if (started) button("saveMatch", () => void saveMatchManually());
    }
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
  } else if (screen === "turn") {
    title(t("turnAsk"));
    button("confirm", end, "primary");
    button("back", () => open("game"));
  } else {
    title(t(state.winner === 0 ? "win" : "lose"));
    box.append(el("p", t(state.reason)));
    for (const f of state.factions.keys())
      table(box, t(flags[f]), String(score(state, f).total));
    button("watchReplay", () => openReplay(replay, "result"), "primary");
    if (preferences.savesEnabled)
      button("saveMatch", () => void saveMatchManually());
    if (matchList.length < libraryLimit) button("restart", () => open("setup"));
    else box.append(el("p", t("matchesFull"), "library-note"));
    button("matches", () => open("matches"));
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
                .filter((x) => x.f === 0 && actionPoints(x.action.kind) > 0)
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
open("menu");
