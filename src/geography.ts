export type Point = readonly [number, number];

export const worldWidth = 1800;
export const worldHeight = 1200;

const junctions: Point[][] = [
  [
    [270, 245],
    [570, 130],
    [900, 120],
    [1240, 165],
    [1500, 260],
  ],
  [
    [122, 495],
    [470, 430],
    [855, 350],
    [1110, 445],
    [1650, 430],
  ],
  [
    [160, 795],
    [550, 725],
    [935, 675],
    [1260, 755],
    [1610, 815],
  ],
  [
    [395, 995],
    [650, 1060],
    [1020, 1100],
    [1320, 1040],
    [1470, 970],
  ],
];

const horizontal: Point[][][] = [
  [
    [
      [350, 188],
      [470, 161],
    ],
    [
      [663, 91],
      [779, 111],
    ],
    [
      [1010, 95],
      [1128, 114],
    ],
    [
      [1352, 165],
      [1430, 223],
    ],
  ],
  [
    [
      [253, 449],
      [359, 495],
    ],
    [
      [601, 400],
      [746, 395],
    ],
    [
      [955, 377],
      [1010, 430],
    ],
    [
      [1293, 411],
      [1450, 505],
    ],
  ],
  [
    [
      [270, 767],
      [420, 782],
    ],
    [
      [707, 729],
      [834, 630],
    ],
    [
      [1064, 710],
      [1160, 681],
    ],
    [
      [1397, 738],
      [1480, 800],
    ],
  ],
  [
    [
      [479, 1038],
      [574, 1020],
    ],
    [
      [750, 1125],
      [897, 1110],
    ],
    [
      [1135, 1107],
      [1248, 1070],
    ],
    [
      [1379, 1023],
      [1433, 989],
    ],
  ],
];

const vertical: Point[][][] = [
  [
    [
      [196, 302],
      [165, 413],
    ],
    [
      [527, 249],
      [507, 338],
    ],
    [
      [935, 216],
      [881, 275],
    ],
    [
      [1195, 276],
      [1160, 345],
    ],
    [
      [1564, 306],
      [1589, 361],
    ],
  ],
  [
    [
      [100, 590],
      [127, 722],
    ],
    [
      [403, 541],
      [520, 628],
    ],
    [
      [840, 502],
      [922, 559],
    ],
    [
      [1190, 554],
      [1159, 625],
    ],
    [
      [1691, 557],
      [1644, 681],
    ],
  ],
  [
    [
      [239, 871],
      [281, 935],
    ],
    [
      [581, 840],
      [659, 954],
    ],
    [
      [891, 788],
      [1003, 930],
    ],
    [
      [1289, 882],
      [1243, 969],
    ],
    [
      [1561, 899],
      [1517, 945],
    ],
  ],
];

const areas = [
  { name: "Златоград|Aurelia", terrain: "city", center: [333, 328], start: 0 },
  {
    name: "Ясенев бор|Ashwood",
    terrain: "forest",
    center: [674, 275],
    start: 0,
  },
  {
    name: "Медная гряда|Copper Ridge",
    terrain: "mine",
    center: [1046, 266],
    start: 1,
  },
  {
    name: "Алый бастион|Red Bastion",
    terrain: "city",
    center: [1381, 324],
    start: 1,
  },
  {
    name: "Солнечная нива|Sunfield",
    terrain: "farmland",
    center: [303, 639],
    start: -1,
  },
  {
    name: "Янтарный брод|Amber Ford",
    terrain: "crossing",
    center: [674, 535],
    start: -1,
  },
  {
    name: "Серый перевал|Grey Pass",
    terrain: "pass",
    center: [1001, 545],
    start: -1,
  },
  {
    name: "Тёмная роща|Dark Grove",
    terrain: "forest",
    center: [1406, 605],
    start: -1,
  },
  {
    name: "Белая пристань|Whitehaven",
    terrain: "village",
    center: [400, 878],
    start: -1,
  },
  { name: "Аметист|Amethyst", terrain: "city", center: [756, 888], start: 2 },
  {
    name: "Золотые поля|Golden Fields",
    terrain: "farmland",
    center: [1110, 906],
    start: 2,
  },
  {
    name: "Старый архив|Old Archive",
    terrain: "ruins",
    center: [1396, 873],
    start: -1,
  },
] satisfies { name: string; terrain: string; center: Point; start: number }[];

export const regions = areas.map((area, i) => {
  const x = i % 4;
  const y = Math.floor(i / 4);
  return {
    ...area,
    boundary: [
      junctions[y][x],
      ...horizontal[y][x],
      junctions[y][x + 1],
      ...vertical[y][x + 1],
      junctions[y + 1][x + 1],
      ...horizontal[y + 1][x].slice().reverse(),
      junctions[y + 1][x],
      ...vertical[y][x].slice().reverse(),
    ],
  };
});

export const coast = [
  ...junctions[0]
    .slice(0, 4)
    .flatMap((point, i) => [point, ...horizontal[0][i]]),
  ...vertical.flatMap((row, i) => [junctions[i][4], ...row[4]]),
  ...junctions[3]
    .slice(1)
    .reverse()
    .flatMap((point, i) => [point, ...horizontal[3][3 - i].slice().reverse()]),
  ...vertical
    .slice()
    .reverse()
    .flatMap((row, i) => [junctions[3 - i][0], ...row[0].slice().reverse()]),
];

function sharesBorder(a: Point[], b: Point[]) {
  return a.some((point, i) => {
    const next = a[(i + 1) % a.length];
    return b.some(
      (other, j) => other === next && b[(j + 1) % b.length] === point,
    );
  });
}

export const adjacency = regions.map(({ boundary }, i) =>
  regions.flatMap((region, j) =>
    i !== j && sharesBorder(boundary, region.boundary) ? [j] : [],
  ),
);

export function contains(boundary: Point[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [ax, ay] = boundary[i];
    const [bx, by] = boundary[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside;
}
