import Phaser from "phaser";
import {
  coast,
  contains,
  regions,
  worldWidth as W,
  worldHeight as H,
  type Point,
} from "./geography";
import {
  banners,
  building,
  flag,
  mountain,
  noise,
  palettes,
  path,
  settlement,
  tree,
  unit,
} from "./map-art";
import { echo, heritage, heritageEras } from "./rules";
import { neighbors, type Entry, type State } from "./world";

const river: Point[] = [
  [119, 578],
  [226, 582],
  [332, 562],
  [441, 576],
  [521, 564],
  [608, 542],
  [675, 535],
  [746, 523],
  [843, 489],
  [949, 443],
  [1040, 443],
  [1110, 445],
  [1256, 488],
  [1351, 490],
  [1450, 505],
  [1548, 506],
  [1666, 480],
];
const markers = ["◆", "▲", "●", "◇"];

export const orderDuration = 550;

interface MapView {
  scale: (z: number) => void;
  state: State;
  era: number;
  selected: number;
  name: (i: number) => string;
  select: (i: number) => void;
}
export class Atlas extends Phaser.Scene {
  private graph!: Phaser.GameObjects.Graphics;
  private motion!: Phaser.GameObjects.Graphics;
  private animation?: { entry: Entry; started: number };
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  private ambient: { x: number; y: number; tint?: number; water?: boolean }[] =
    [];
  private labels: Phaser.GameObjects.Text[] = [];
  private drag = new Map<number, { x: number; y: number }>();
  private start = { x: 0, y: 0 };
  private shifted = false;
  private size = { w: 0, h: 0 };
  constructor(private view: MapView) {
    super("atlas");
  }
  create() {
    this.graph = this.add.graphics();
    this.motion = this.add.graphics().setDepth(1);
    this.refresh();
    this.fit(true);
    this.scale.on("resize", () => this.fit(false));
    const el = this.game.canvas;
    el.style.touchAction = "none";
    const pos = (ev: PointerEvent | WheelEvent) => {
      const b = el.getBoundingClientRect();
      return { x: ev.clientX - b.left, y: ev.clientY - b.top };
    };
    el.onwheel = (ev) => {
      ev.preventDefault();
      const p = pos(ev);
      this.zoom(Math.exp(-ev.deltaY * 0.0016), p.x, p.y);
    };
    el.onpointerdown = (ev) => {
      el.setPointerCapture(ev.pointerId);
      const p = pos(ev);
      this.drag.set(ev.pointerId, p);
      if (this.drag.size === 1) {
        this.start = p;
        this.shifted = false;
      } else this.shifted = true;
    };
    el.onpointermove = (ev) => {
      const old = this.drag.get(ev.pointerId);
      if (!old) return;
      const p = pos(ev),
        cam = this.cameras.main,
        other = [...this.drag].find(([id]) => id !== ev.pointerId)?.[1];
      if (other) {
        const d = Math.hypot(old.x - other.x, old.y - other.y);
        if (d > 1)
          this.zoom(
            Math.hypot(p.x - other.x, p.y - other.y) / d,
            (old.x + other.x) / 2,
            (old.y + other.y) / 2,
          );
        cam.scrollX -= (p.x - old.x) / (2 * cam.zoom);
        cam.scrollY -= (p.y - old.y) / (2 * cam.zoom);
      } else {
        if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 8)
          this.shifted = true;
        if (this.shifted) {
          cam.scrollX -= (p.x - old.x) / cam.zoom;
          cam.scrollY -= (p.y - old.y) / cam.zoom;
        }
      }
      this.drag.set(ev.pointerId, p);
    };
    el.onpointercancel = (ev) => {
      this.shifted = true;
      this.drag.delete(ev.pointerId);
    };
    el.onpointerup = (ev) => {
      this.drag.delete(ev.pointerId);
      if (this.shifted) return;
      const p = pos(ev),
        w = this.cameras.main.getWorldPoint(p.x, p.y);
      const i = regions.findIndex((region) =>
        contains(region.boundary, w.x, w.y),
      );
      if (i >= 0) this.view.select(i);
    };
  }
  private fit(first: boolean) {
    const cam = this.cameras.main;
    const atOverview = cam.zoom <= this.min() + 0.01;
    this.size = { w: cam.width, h: cam.height };
    if (first || atOverview) {
      this.overview();
      return;
    }
    this.zoom(1);
    if (this.view.selected >= 0) this.focus(this.view.selected);
  }
  focus(i: number) {
    this.cameras.main.centerOn(...regions[i].center);
  }
  overview() {
    if (!this.graph) return;
    const cam = this.cameras.main;
    cam.setZoom(this.min());
    this.zoom(1);
    cam.centerOn(W / 2, H / 2);
  }
  home() {
    if (!this.graph) return;
    this.zoom(
      Math.max(this.min(), Math.min(1.35, this.size.w / 510)) /
        this.cameras.main.zoom,
    );
    this.focus(0);
  }
  cameraPosition() {
    const cam = this.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
  }
  restoreCamera(position: ReturnType<Atlas["cameraPosition"]>) {
    const cam = this.cameras.main;
    this.zoom(position.zoom / cam.zoom);
    cam.setScroll(position.x, position.y);
  }
  showOrder(entry?: Entry) {
    this.animation = entry ? { entry, started: performance.now() } : undefined;
    this.refresh();
    if (entry) {
      const { i, to } = entry.action;
      if (to === undefined) this.focus(i);
      else {
        const start = regions[i].center;
        const end = regions[to].center;
        this.cameras.main.centerOn(
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
        );
      }
    }
  }
  private min() {
    return Math.min(this.size.w / W, this.size.h / (H + 125));
  }
  zoom(
    factor: number,
    x = this.cameras.main.width / 2,
    y = this.cameras.main.height / 2,
  ) {
    if (!this.graph) return;
    const cam = this.cameras.main,
      old = cam.zoom,
      z = Phaser.Math.Clamp(
        old * factor,
        this.min(),
        Math.max(2.4, this.min() * 3),
      );
    cam.scrollX += (x - cam.width / 2) * (1 / old - 1 / z);
    cam.scrollY += (y - cam.height / 2) * (1 / old - 1 / z);
    cam.setZoom(z);
    const extraW = Math.max(0, cam.width / z - W),
      extraH = Math.max(0, cam.height / z - H);
    cam.setBounds(-extraW / 2, -extraH / 2, W + extraW, H + extraH);
    this.view.scale(z);
    this.resizeLabels();
  }
  refresh() {
    if (!this.graph) return;
    const { state, era, selected } = this.view;
    const g = this.graph.clear();
    const p = palettes[era];
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
    this.ambient = [];

    g.fillStyle(p.sea).fillRect(-W, -H, W * 3, H * 3);
    path(g.lineStyle(56, p.shallow, 0.65), coast, true).strokePath();
    path(g.lineStyle(30, p.foam, 0.22), coast, true).strokePath();
    path(g.lineStyle(15, p.shore), coast, true).strokePath();

    for (const [i, region] of regions.entries()) {
      const {
        boundary,
        terrain,
        center: [cx, cy],
      } = region;
      const owner = state.layers[era][i].owner;
      const tint = banners[owner < 0 ? 3 : owner];
      const ground = terrain === "farmland" ? p.fields : p.land;
      path(g.fillStyle(ground), boundary, true).fillPath();
      if (owner >= 0) path(g.fillStyle(tint, 0.22), boundary, true).fillPath();
      for (let k = 0; k < 140; k++) {
        const x = cx + (noise(i * 211 + k) - 0.5) * 510;
        const y = cy + (noise(i * 311 + k * 3) - 0.5) * 440;
        if (!contains(boundary, x, y) || !contains(boundary, x + 8, y + 2))
          continue;
        g.lineStyle(1, k % 2 ? p.ridge : p.forest, 0.29).lineBetween(
          x,
          y,
          x + 4 + noise(k) * 8,
          y + 2,
        );
      }
    }

    path(g.lineStyle(37, p.shore, 0.65), river).strokePath();
    path(g.lineStyle(26, p.shallow), river).strokePath();
    path(g.lineStyle(2, p.foam, 0.54), river).strokePath();

    for (const [
      i,
      {
        center: [x, y],
      },
    ] of regions.entries()) {
      for (const j of neighbors[i].filter((j) => j > i)) {
        const [tx, ty] = regions[j].center;
        const bend: Point = [
          (x + tx) / 2 + 22 * Math.sin(i + j),
          (y + ty) / 2 - 17,
        ];
        const route: Point[] = [[x, y], bend, [tx, ty]];
        if (era > 0)
          path(
            g.lineStyle(era === 1 ? 8 : 9, p.stone, 0.68),
            route,
          ).strokePath();
        path(
          g.lineStyle(era === 0 ? 3 : 2.5, p.road, 0.84),
          route,
        ).strokePath();
        if (era === 2) g.fillStyle(p.light, 0.85).fillCircle(...bend, 3);
      }
    }

    const [fordX, fordY] = regions[5].center;
    g.fillStyle(p.shore).fillRect(fordX - 9, fordY - 21, 18, 42);
    for (let dy = -18; dy <= 18; dy += 6)
      g.lineStyle(1.5, p.stone).lineBetween(
        fordX - 9,
        fordY + dy,
        fordX + 9,
        fordY + dy,
      );
    for (const [x, y] of river) this.ambient.push({ x, y, water: true });
    for (let i = 0; i < 66; i++) {
      const x = 38 + noise(i * 83) * (W - 76);
      const y = 38 + noise(i * 137) * (H - 76);
      if (!contains(coast, x, y)) this.ambient.push({ x, y, water: true });
    }

    for (const [i, region] of regions.entries()) {
      const {
        boundary,
        terrain,
        center: [x, y],
      } = region;
      const area = state.layers[era][i];
      const owner = area.owner < 0 ? 3 : area.owner;
      const tint = banners[owner];
      path(g.lineStyle(2.7, p.forest, 0.72), boundary, true).strokePath();
      if (owner !== 3)
        path(g.lineStyle(3.3, tint, 0.72), boundary, true).strokePath();
      if (i === selected)
        path(g.lineStyle(5, 0xfde9ae, 0.9), boundary, true).strokePath();

      const wooded = terrain === "forest";
      const rocky = terrain === "pass" || terrain === "mine";
      for (let k = 0; k < (wooded ? 93 : 22); k++) {
        const tx = x + (noise(i * 257 + k) - 0.5) * (wooded ? 290 : 240);
        const ty = y + (noise(i * 503 + k) - 0.5) * 215;
        if (Math.hypot(tx - x, ty - y) < 79 || !contains(boundary, tx, ty - 22))
          continue;
        tree(g, tx, ty, 12 + 18 * noise(k * 7), era);
      }
      if (rocky)
        for (let k = 0; k < 8; k++) {
          const dx = x - 94 + k * 25;
          const dy = y - 47 + 17 * Math.sin(k * 1.9);
          mountain(g, dx, dy, 33 + noise(i * 17 + k) * 37, era);
        }
      if (terrain === "farmland") {
        g.fillStyle(p.shore, 0.42).fillEllipse(x - 52, y - 24, 108, 56);
        for (let n = 0; n < 11; n++)
          g.lineStyle(2.5, p.roof, 0.6).lineBetween(
            x - 94 + n * 8,
            y - 33,
            x - 79 + n * 8,
            y - 12,
          );
      }
      if (terrain === "ruins")
        for (let k = 0; k < 5; k++)
          g.fillStyle(p.stone, 0.64).fillRect(
            x - 42 + k * 17,
            y - 29 + noise(k) * 12,
            11,
            9,
          );
      if (area.city) settlement(g, x, y, era, area.city);
      else g.fillStyle(p.forest, 0.62).fillEllipse(x, y + 2, 22, 11);
      if (owner !== 3)
        this.ambient.push({ x, y: y - (area.city ? 46 : 16), tint });

      const slots = [...area.build, ...area.pending];
      for (const [n, kind] of slots.entries()) {
        const direction = n === 0 ? -1 : 1;
        const bx = x + direction * (kind === "fortifiedBridge" ? 35 : 75);
        const by = y + (terrain === "farmland" || rocky ? -28 : 41);
        const pending = n >= area.build.length;
        building(
          g,
          bx,
          by,
          era,
          kind,
          pending,
          !heritage[kind] || heritageEras(state, era, i, kind).length > 0,
        );
        if (!pending && ["plant", "mill", "refinery"].includes(kind))
          this.ambient.push({ x: bx + 12, y: by - 23 });
      }

      const legacy = Object.keys(heritage).some(
        (kind) => heritageEras(state, era, i, kind).length,
      );
      if (echo(state, era, i) || legacy) {
        const hx = x + 39;
        const hy = y - 34;
        g.lineStyle(2, p.light, 0.95)
          .strokeCircle(hx, hy, 9)
          .strokeCircle(hx + 9, hy - 4, 6);
        g.fillStyle(p.light, 0.65).fillCircle(hx, hy, 3);
      }

      const action = this.animation?.entry.action;
      const moving =
        !this.reducedMotion.matches &&
        action?.to === i &&
        ["moved", "captured"].includes(this.animation?.entry.outcome ?? "");
      if (area.army && !moving)
        unit(g, x + 30, y - 7, era, banners[area.army.owner]);
      this.label(
        x,
        y + 22,
        markers[owner] + "  " + this.view.name(i),
        "#ffefd3",
      );
      if (area.siege)
        this.label(x, y - 75, "⚑ " + area.siege.progress + "/2", "#ffbd95");
    }
    this.resizeLabels();
    this.update();
  }

  private resizeLabels() {
    const zoom = this.cameras.main.zoom;
    const scale = Math.max(1, 9.5 / (zoom * 23));
    for (const label of this.labels) label.setScale(scale);
  }

  private label(x: number, y: number, value: string, color: string) {
    this.labels.push(
      this.add
        .text(x, y, value, {
          fontFamily: "Georgia, serif",
          fontSize: "23px",
          color,
          padding: { x: 7, y: 3 },
          backgroundColor: "#182f38",
        })
        .setOrigin(0.5)
        .setDepth(2),
    );
  }

  update() {
    if (!this.motion) return;
    const g = this.motion.clear();
    const { era } = this.view;
    const p = palettes[era];
    const reduced = this.reducedMotion.matches;
    const now = performance.now();
    const time = reduced ? 0 : now / 1000;
    for (const [i, point] of this.ambient.entries()) {
      const { x, y, water, tint } = point;
      const wave = Math.sin(time * 1.6 + i * 2);
      if (water) {
        const dx = wave * 5;
        g.lineStyle(1.4, p.foam, 0.27 + 0.13 * wave).lineBetween(
          x + dx - 9,
          y,
          x + dx + 9,
          y + 1,
        );
      } else if (tint !== undefined) {
        flag(g, x, y, tint, wave * 2.8);
      } else {
        const rise = (time * 12 + i * 7) % 22;
        g.fillStyle(p.light, 0.6 - rise / 42).fillCircle(
          x + wave * 3,
          y - rise,
          2 + rise / 15,
        );
      }
    }
    if (!this.animation) return;
    const {
      entry: {
        action: { i, to },
        f,
        outcome,
      },
      started,
    } = this.animation;
    const [x, y] = regions[i].center;
    const [tx, ty] = regions[to ?? i].center;
    const tint = banners[f];
    const progress = Math.min(1, (now - started) / orderDuration);
    const pulse = reduced ? 0 : Math.sin(progress * Math.PI);
    g.lineStyle(4, tint, 0.95).strokeCircle(tx, ty, 36 + pulse * 14);
    g.lineStyle(2, 0xfff1bf, 0.9).strokeCircle(tx, ty, 29 + pulse * 9);
    if (to === undefined) return;
    g.lineStyle(4, tint, 0.82).lineBetween(x, y, tx, ty);
    if (reduced) return;
    const arrived = outcome === "captured" || outcome === "moved";
    const fraction = arrived
      ? Math.min(1, progress * 1.3)
      : Math.sin(progress * Math.PI) * 0.86;
    unit(
      g,
      x + (tx - x) * fraction + 30,
      y + (ty - y) * fraction - 7,
      era,
      tint,
      Math.sin(progress * 26) * 2,
    );
  }
}
