import type Phaser from "phaser";
import type { Point } from "./geography";

type Brush = Phaser.GameObjects.Graphics;

export const palettes = [
  {
    sea: 0x254b54,
    shallow: 0x47726d,
    foam: 0xa3c8ae,
    shore: 0xd6bd82,
    land: 0x8da476,
    fields: 0xcab776,
    forest: 0x436e53,
    stone: 0x7e8a76,
    ridge: 0xc0c3a1,
    road: 0xd0b682,
    roof: 0x9c5839,
    wall: 0xe2b684,
    light: 0xffdc86,
  },
  {
    sea: 0x203e53,
    shallow: 0x3c6c79,
    foam: 0xb4d6d0,
    shore: 0xbdb597,
    land: 0x849d8c,
    fields: 0xb6a37b,
    forest: 0x375b54,
    stone: 0x647c7d,
    ridge: 0xb5c1b8,
    road: 0xc5c8b6,
    roof: 0x8b5348,
    wall: 0xd0c4ae,
    light: 0xffd28e,
  },
  {
    sea: 0x0e2743,
    shallow: 0x1d536b,
    foam: 0x71ddd9,
    shore: 0x658c99,
    land: 0x527f80,
    fields: 0x779b84,
    forest: 0x2f626d,
    stone: 0x48647d,
    ridge: 0x9bbac2,
    road: 0x78c9c5,
    roof: 0x284761,
    wall: 0x8abbc8,
    light: 0x8cffee,
  },
];
export const banners = [0xf3cc70, 0xe36d62, 0xce9df3, 0xaab6a4];
const shadow = 0x182c35;

export function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function path(g: Brush, points: Point[], close = false) {
  g.beginPath();
  g.moveTo(...points[0]);
  for (const point of points.slice(1)) g.lineTo(...point);
  if (close) g.closePath();
  return g;
}

export function tree(
  g: Brush,
  x: number,
  y: number,
  size: number,
  era: number,
) {
  const p = palettes[era];
  g.fillStyle(shadow, 0.17).fillEllipse(
    x + size * 0.15,
    y,
    size * 1.22,
    size * 0.38,
  );
  g.fillStyle(0x695b45).fillRect(x - 1, y - size * 0.65, 2.5, size * 0.65);
  g.fillStyle(p.forest).fillTriangle(
    x - size * 0.44,
    y - 2,
    x,
    y - size,
    x + size * 0.46,
    y - 2,
  );
  g.fillStyle(p.ridge, 0.28).fillTriangle(
    x - size * 0.44,
    y - 2,
    x,
    y - size,
    x - size * 0.05,
    y - 4,
  );
}

export function mountain(
  g: Brush,
  x: number,
  y: number,
  size: number,
  era: number,
) {
  const p = palettes[era];
  g.fillStyle(shadow, 0.19).fillEllipse(
    x + size * 0.15,
    y + 2,
    size * 1.68,
    size * 0.46,
  );
  g.fillStyle(p.stone).fillTriangle(
    x - size * 0.78,
    y,
    x,
    y - size,
    x + size * 0.88,
    y,
  );
  g.fillStyle(p.ridge).fillTriangle(
    x - size * 0.78,
    y,
    x,
    y - size,
    x + size * 0.12,
    y - size * 0.19,
  );
  g.fillStyle(0xf1f0d6, 0.64).fillTriangle(
    x - size * 0.19,
    y - size * 0.76,
    x,
    y - size,
    x + size * 0.2,
    y - size * 0.77,
  );
}

function house(
  g: Brush,
  x: number,
  y: number,
  w: number,
  h: number,
  era: number,
) {
  const p = palettes[era];
  g.fillStyle(shadow, 0.25).fillEllipse(x + 4, y, w * 1.55, w * 0.55);
  g.fillStyle(p.wall).fillRect(x - w / 2, y - h, w, h);
  g.fillStyle(shadow, 0.23).fillRect(x + w / 5, y - h, w * 0.3, h);
  if (era === 0) {
    g.fillStyle(p.roof).fillTriangle(
      x - w * 0.68,
      y - h,
      x,
      y - h - w * 0.55,
      x + w * 0.68,
      y - h,
    );
    g.lineStyle(1.4, shadow, 0.25);
    for (let k = 5; k < h; k += 5)
      g.lineBetween(x - w / 2, y - k, x + w / 2, y - k);
  } else if (era === 1) {
    g.fillStyle(p.roof).fillRect(x - w * 0.57, y - h - 5, w * 1.14, 6);
    g.fillStyle(p.stone).fillRect(x + w * 0.18, y - h - 12, w * 0.22, 8);
    g.lineStyle(1.2, p.roof, 0.56);
    for (let k = 8; k < h; k += 8)
      g.lineBetween(x - w / 2, y - k, x + w / 2, y - k);
  } else {
    g.fillStyle(p.roof).fillEllipse(x, y - h, w * 1.14, w * 0.66);
    g.lineStyle(2, p.light).lineBetween(
      x - w * 0.43,
      y - h + 3,
      x + w * 0.43,
      y - h + 3,
    );
    g.lineStyle(1.2, p.light, 0.7).lineBetween(
      x + w * 0.24,
      y - h + 7,
      x + w * 0.24,
      y - 2,
    );
  }
  g.fillStyle(shadow).fillRect(x - 3, y - 8, 6, 8);
  g.fillStyle(p.light).fillRect(x - w * 0.28, y - h + 7, 4, 4);
}

export function flag(
  g: Brush,
  x: number,
  y: number,
  tint: number,
  flutter = 0,
) {
  g.lineStyle(2, 0x34403c).lineBetween(x, y + 18, x, y - 2);
  path(
    g.fillStyle(tint),
    [
      [x + 1, y],
      [x + 16 + flutter, y + 3],
      [x + 13 + flutter, y + 6],
      [x + 1, y + 8],
    ],
    true,
  ).fillPath();
}

export function settlement(
  g: Brush,
  x: number,
  y: number,
  era: number,
  level: number,
) {
  const p = palettes[era];
  if (era === 0) {
    g.fillStyle(p.fields, 0.66).fillEllipse(x, y + 2, 82, 30);
  } else if (era === 1) {
    g.fillStyle(p.road, 0.78).fillRect(x - 39, y - 15, 78, 24);
    g.lineStyle(1.6, p.stone, 0.7).lineBetween(x - 38, y + 6, x + 38, y + 6);
  } else {
    g.fillStyle(p.roof, 0.85).fillEllipse(x, y + 1, 97, 40);
    g.lineStyle(2.2, p.light, 0.7).strokeEllipse(x, y + 1, 88, 32);
  }
  for (let n = 0; n < level + 2; n++) {
    const height = 19 + ((n * 7) % 15) + (n === 1 ? [9, 16, 25][era] : 0);
    house(g, x + (n - (level + 1) / 2) * 18, y + (n % 2) * 7, 20, height, era);
  }
  if (level >= 3) {
    const p = palettes[era];
    g.lineStyle(4, p.stone).lineBetween(x - 36, y + 10, x + 36, y + 10);
    g.fillStyle(p.wall)
      .fillRect(x - 38, y + 2, 7, 12)
      .fillRect(x + 31, y + 2, 7, 12);
  }
}

export function building(
  g: Brush,
  x: number,
  y: number,
  era: number,
  kind: string,
  pending: boolean,
  active: boolean,
) {
  const p = palettes[era];
  g.fillStyle(shadow, 0.24).fillEllipse(x, y + 4, 61, 26);
  if (pending) {
    g.fillStyle(p.shore).fillEllipse(x, y, 52, 25);
    g.lineStyle(2, shadow, 0.65).strokeRect(x - 18, y - 9, 36, 19);
    g.lineBetween(x - 18, y - 9, x + 18, y + 10).lineBetween(
      x + 18,
      y - 9,
      x - 18,
      y + 10,
    );
    flag(g, x + 15, y - 26, 0xffcf61);
    return;
  }
  if (kind === "farm" || kind === "irrigationHub") {
    g.fillStyle(p.fields).fillEllipse(x, y, 61, 31);
    g.lineStyle(
      kind === "farm" ? 2 : 4,
      kind === "farm" ? p.roof : p.shallow,
      0.86,
    );
    for (let n = -18; n <= 18; n += 9)
      g.lineBetween(x + n - 6, y + 9, x + n + 6, y - 10);
    house(g, x + 16, y - 5, 17, 14, era);
  } else if (kind === "mine" || kind === "refinery") {
    mountain(g, x - 8, y + 4, 31, era);
    g.fillStyle(shadow).fillRoundedRect(x - 20, y - 8, 23, 12, 3);
    house(g, x + 15, y + 4, 18, 20, era);
  } else if (kind === "tower" || kind === "outpost") {
    house(g, x, y, 23, kind === "tower" ? 42 : 23, era);
    flag(g, x + 5, y - (kind === "tower" ? 58 : 41), p.light);
  } else if (kind === "wall" || kind === "fortifiedBridge") {
    house(g, x - 18, y, 16, 24, era);
    house(g, x + 18, y, 16, 24, era);
    g.lineStyle(5, p.ridge).lineBetween(x - 17, y - 9, x + 17, y - 9);
    if (kind === "fortifiedBridge")
      g.lineStyle(3, p.shallow).lineBetween(x - 5, y + 9, x + 6, y - 20);
  } else {
    house(
      g,
      x,
      y,
      kind === "barracks" ? 39 : 28,
      kind === "academy" ? 33 : 22,
      era,
    );
    if (kind === "mill" || kind === "plant") {
      g.lineStyle(2, p.light).strokeCircle(x + 14, y - 16, 9);
      for (let n = 0; n < 4; n++) {
        const angle = (n * Math.PI) / 2;
        g.lineBetween(
          x + 14,
          y - 16,
          x + 14 + Math.cos(angle) * 8,
          y - 16 + Math.sin(angle) * 8,
        );
      }
    }
  }
  if (["irrigationHub", "refinery", "fortifiedBridge"].includes(kind)) {
    g.lineStyle(2, p.light, active ? 1 : 0.35).strokeEllipse(x, y + 5, 66, 31);
  }
}

export function unit(
  g: Brush,
  x: number,
  y: number,
  era: number,
  tint: number,
  stride = 0,
) {
  const p = palettes[era];
  g.fillStyle(shadow, 0.19).fillEllipse(x, y + 5, 49, 18);
  for (let n = 0; n < 3; n++) {
    const px = x + (n - 1) * 12;
    const py = y + (n % 2) * 4;
    if (era === 0) {
      g.lineStyle(2, shadow)
        .lineBetween(px, py - 3, px - 2 - stride, py + 4)
        .lineBetween(px, py - 3, px + 2 + stride, py + 4);
      g.fillStyle(tint).fillRect(px - 4, py - 11, 8, 10);
      g.fillStyle(0xe0ba8d).fillCircle(px, py - 14, 3);
      g.lineStyle(1.3, shadow).lineBetween(px + 5, py - 1, px + 8, py - 18);
    } else if (era === 1) {
      g.fillStyle(shadow).fillRoundedRect(px - 5, py - 7, 11, 11, 3);
      g.fillStyle(tint).fillRect(px - 5, py - 7, 10, 5);
      g.fillStyle(p.ridge).fillCircle(px, py - 7, 3);
      g.lineStyle(2, shadow).lineBetween(px, py - 7, px + 7, py - 10);
    } else {
      path(
        g.fillStyle(tint),
        [
          [px - 6, py],
          [px, py - 13],
          [px + 6, py],
        ],
        true,
      ).fillPath();
      g.fillStyle(p.light, 0.75).fillEllipse(px, py + 3, 8, 3);
      g.fillStyle(shadow).fillCircle(px, py - 6, 2.5);
    }
  }
}
