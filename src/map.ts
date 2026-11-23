import Phaser from "phaser";
import { terrain, type State } from "./world";

const W = 2800,
  H = 1900;
function hash(i: number) {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function settlement(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  level: number,
  era: number,
  ink: number,
) {
  const walls = [0xd4b68c, 0xd6cbb0, 0xb8cdcc],
    roofs = [0x9b613e, 0x885044, 0x507b83];
  g.fillStyle(0x544e37, 0.22).fillEllipse(x + 5, y + 7, 90 + 15 * level, 26);
  for (let n = 0; n < level + 2; n++) {
    const dx = x + (n - (level + 1) / 2) * 22,
      dy = y + (n % 2) * 8,
      h = 24 + (n % 3) * 6 + (level === 4 && n === 2 ? 35 : 0);
    g.fillStyle(walls[era]).fillRect(dx - 12, dy - h, 24, h);
    g.fillStyle(0x3d413a, 0.3).fillTriangle(
      dx + 3,
      dy - h,
      dx + 12,
      dy - h,
      dx + 12,
      dy,
    );
    g.fillStyle(roofs[era]).fillTriangle(
      dx - 17,
      dy - h,
      dx + 2,
      dy - h - 15 - era * 3,
      dx + 17,
      dy - h,
    );
    g.fillStyle(0x4c4c3e)
      .fillRect(dx - 3, dy - 12, 6, 12)
      .fillRect(dx - 8, dy - h + 4, 4, 5);
  }
  if (level >= 3)
    g.lineStyle(5, 0x716b54).lineBetween(x - 45, y + 6, x + 45, y + 6);
  g.lineStyle(3, 0x514b37).lineBetween(x + 10, y - 36, x + 10, y - 76);
  g.fillStyle(ink).fillTriangle(x + 10, y - 76, x + 33, y - 70, x + 10, y - 62);
}
function pine(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
) {
  g.fillStyle(0x48533b, 0.18).fillEllipse(
    x + 3,
    y + 1,
    size * 1.1,
    size * 0.29,
  );
  g.fillStyle(0x766347).fillRect(x - 2, y - size * 0.4, 4, size * 0.4);
  g.fillStyle(0x617459).fillTriangle(
    x - size * 0.42,
    y - 4,
    x,
    y - size,
    x + size * 0.42,
    y - 4,
  );
  g.fillStyle(0x81916d).fillTriangle(
    x - size * 0.42,
    y - 4,
    x,
    y - size,
    x - 3,
    y - 4,
  );
}
const inks = [0x285d75, 0xa34c3e, 0x705178, 0x65706a];
const washes = [
  [0xbac8ad, 0xdec4a0, 0xc8b9be, 0xd8d2ac],
  [0xb6c6c6, 0xd4b7a3, 0xc5b5c7, 0xcdcbbb],
  [0x93b9b8, 0xc0a59b, 0xad9ebc, 0xaab9ae],
];
function corner(c: number, r: number) {
  return new Phaser.Math.Vector2(
    (c * W) / 6 + (c > 0 && c < 6 ? 65 * Math.sin(c * 13 + r * 7) : 0),
    (r * H) / 3 + (r > 0 && r < 3 ? 85 * Math.cos(c * 6.7 + r * 3) : 0),
  );
}
const polygons = terrain.map((_, i) => {
  const c = i % 6,
    r = Math.floor(i / 6);
  return [
    corner(c, r),
    corner(c + 1, r),
    corner(c + 1, r + 1),
    corner(c, r + 1),
  ];
});
const centers = polygons.map((p) => ({
  x: p.reduce((a, b) => a + b.x, 0) / 4,
  y: p.reduce((a, b) => a + b.y, 0) / 4,
}));
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
      const i = polygons.findIndex((poly) =>
        Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(poly), w.x, w.y),
      );
      if (i >= 0) this.view.select(i);
    };
  }
  private fit(first: boolean) {
    const cam = this.cameras.main;
    this.size = { w: cam.width, h: cam.height };
    if (first) {
      this.home();
      return;
    }
    this.zoom(1);
    this.focus(this.view.selected);
  }
  focus(i: number) {
    const c = centers[i];
    this.cameras.main.centerOn(c.x, c.y);
  }
  home() {
    if (!this.graph) return;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setZoom(
      Math.max(
        this.min(),
        Math.max(0.65, Math.min(cam.width / 1250, cam.height / 850)),
      ),
    );
    this.zoom(1);
    this.focus(0);
  }
  private min() {
    return Math.min(this.size.w / W, this.size.h / H);
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
  }
  refresh() {
    if (!this.graph) return;
    const g = this.graph;
    g.clear();
    this.labels.forEach((t) => t.destroy());
    this.labels = [];
    const { state, era, selected } = this.view;
    polygons.forEach((p, i) => {
      const r = state.layers[era][i],
        owner = r.owner < 0 ? 3 : r.owner;
      g.fillStyle(washes[era][owner])
        .fillPoints(p, true)
        .lineStyle(5, 0x736d56, 0.65)
        .strokePoints(p, true);
      const { x, y } = centers[i];
      for (let k = 0; k < 100; k++) {
        const dx = x + (hash(i * 101 + k) - 0.5) * 350,
          dy = y + (hash(i * 211 + k + 4) - 0.5) * 440;
        g.lineStyle(1.7, 0x71755b, 0.25).lineBetween(
          dx,
          dy,
          dx + 5 + hash(k) * 9,
          dy - 3,
        );
      }
      for (let k = 0; k < (terrain[i] === "forest" ? 64 : 12); k++) {
        const dx = x + (hash(k + i * 37) - 0.5) * 280,
          dy = y + (hash(k * 3 + i * 73) - 0.5) * 200;
        if (Math.abs(dx - x) > 50 || Math.abs(dy - y) > 55)
          pine(g, dx, dy, 18 + hash(k * 7) * 25);
      }
      if (terrain[i] === "farmland")
        for (let k = 0; k < 16; k++) {
          const dx = x - 90 + k * 10;
          g.lineStyle(5, 0xb39456, 0.75).lineBetween(
            dx,
            y - 90,
            dx + 27,
            y - 40,
          );
        }
      if (["mine", "pass"].includes(terrain[i]))
        for (let k = 0; k < 7; k++) {
          const dx = x - 105 + k * 32,
            dy = y - 40 + 20 * Math.sin(k);
          g.fillStyle(0x8e8979).fillTriangle(
            dx - 38,
            dy,
            dx,
            dy - 68,
            dx + 41,
            dy,
          );
          g.fillStyle(0xc2bca2).fillTriangle(
            dx,
            dy - 68,
            dx + 41,
            dy,
            dx + 7,
            dy - 12,
          );
        }
    });
    const river = Array.from(
      { length: 120 },
      (_, k) =>
        new Phaser.Math.Vector2((k * W) / 119, 850 + 110 * Math.sin(k / 16)),
    );
    g.lineStyle(33, 0xb5c4ac)
      .strokePoints(river, false)
      .lineStyle(24, 0x76a4a4)
      .strokePoints(river, false)
      .lineStyle(3, 0xa5c1b9)
      .strokePoints(river, false);
    for (let i = 0; i < 18; i++) {
      const { x, y } = centers[i];
      for (const j of [i % 6 < 5 ? i + 1 : -1, i + 6])
        if (j >= 0 && j < 18)
          g.lineStyle(6, 0xa49272, 0.8).lineBetween(
            x,
            y,
            centers[j].x,
            centers[j].y,
          );
    }
    for (let i = 0; i < 6; i++) {
      const x = centers[i + 6].x,
        y = 850 + 110 * Math.sin(((x / W) * 119) / 16);
      g.fillStyle(0x90795b).fillRect(x - 13, y - 24, 26, 48);
      for (let n = -21; n <= 21; n += 7)
        g.lineStyle(2, 0xd1bd90).lineBetween(x - 13, y + n, x + 13, y + n);
    }
    polygons.forEach((p, i) => {
      const r = state.layers[era][i],
        c = centers[i],
        { x, y } = c,
        owner = r.owner < 0 ? 3 : r.owner;
      if (i === selected) g.lineStyle(10, 0xc98b30).strokePoints(p, true);
      if (r.city) settlement(g, x, y, r.city, era, inks[owner]);
      else g.fillStyle(inks[owner]).fillCircle(x, y, 11);
      const marker = ["◆", "▲", "●", "◇"][owner];
      const label = (dy: number, str: string, size: number) =>
        this.labels.push(
          this.add
            .text(x, y + dy, str, {
              fontFamily: "Georgia,serif",
              fontSize: size + "px",
              color: "#23332f",
              backgroundColor: "#e5dfc4",
              padding: { x: 5, y: 2 },
            })
            .setOrigin(0.5),
        );
      label(29, marker + " " + this.view.name(i), 25);
      if (r.build.length || r.pending.length)
        label(
          64,
          [...r.build, ...r.pending]
            .map(
              (b) =>
                ({
                  farm: "♧",
                  mill: "⚙",
                  mine: "⛏",
                  academy: "▤",
                  plant: "ϟ",
                  tower: "♜",
                  wall: "▥",
                  barracks: "⚑",
                  outpost: "⚐",
                })[b],
            )
            .join(" "),
          23,
        );
      if (r.siege) label(-86, "⚔ " + r.siege.progress + "/2", 24);
      if (r.army) {
        const a = r.army;
        for (let n = 0; n < 3; n++) {
          const dx = x + 42 + n * 13,
            dy = y - 15 + (n % 2) * 6;
          g.lineStyle(4, inks[a.owner])
            .lineBetween(dx, dy, dx - 4, dy + 11)
            .lineBetween(dx, dy, dx + 5, dy + 11);
          g.fillStyle(inks[a.owner]).fillRect(
            dx - 4,
            dy - 12 - a.level,
            9,
            15 + a.level,
          );
          g.fillStyle(0xc99468).fillCircle(dx, dy - 17 - a.level, 5);
          g.lineStyle(3, [0x705739, 0x454a47, 0x59b7bb][era]).lineBetween(
            dx + 4,
            dy - 6,
            dx + (a.kind === "ranged" ? 19 : 9),
            dy - (a.kind === "ranged" ? 11 : 24) - a.level * 2,
          );
        }
      }
    });
  }
}
