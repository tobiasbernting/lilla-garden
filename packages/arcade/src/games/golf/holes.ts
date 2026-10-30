// The nine holes of Minigolfen, from an easy straight to the merry-go-round. Each hole runs from the
// tee (high z) towards the cup (low z); see spec.ts for what the fields mean.
import type { DecoSpec, HoleSpec, Pt } from './spec.ts';

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z1],
  [x1, z1],
  [x1, z0],
  [x0, z0],
];

/** Points on a circle: angle 0 points to +z, 90 to +x (degrees). */
function arc(cx: number, cz: number, r: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}

const flowers = (pts: Pt[]): DecoSpec[] => pts.map(([x, z]) => ({ type: 'flowers', x, z }));

// 1 ------------------------------------------------------------ a warm-up straight
const straight: Pt[] = [[-1.8, 7.2], [1.8, 7.2], ...arc(0, -5.4, 1.8, 90, 270, 10)];
const h1: HoleSpec = {
  name: 'Raka spåret',
  sub: 'Ett lätt slag att börja med',
  par: 2,
  tee: [-0.5, 5.7],
  cup: [0.45, -5.5],
  path: [
    [-0.5, 5.7],
    [0.45, -5.5],
  ],
  greens: [
    { kind: 'poly', pts: straight },
    { kind: 'disc', c: [0.45, -5.5], r: 1.3, h: 0, prof: 'bowl', depth: 0.1 },
  ],
  rails: [{ pts: straight, closed: true }],
  island: { margin: 2.6 },
  decos: [
    { type: 'sign', x: -2.7, z: 6.4, s: 1 },
    { type: 'hen', x: 2.8, z: 5.2, yaw: 2.2 },
    { type: 'hen', x: 3.3, z: 3.9, yaw: 1.4 },
    { type: 'hen', x: -3.0, z: -2.0, yaw: -0.8 },
    { type: 'sunflower', x: -3.2, z: 2.6 },
    { type: 'sunflower', x: -3.4, z: 1.6 },
    { type: 'sunflower', x: -3.0, z: 0.6 },
    { type: 'apple', x: 3.3, z: -4.6 },
    { type: 'bush', x: -3.1, z: -6.8 },
    { type: 'mushroom', x: 2.9, z: -1.4 },
    { type: 'rock', x: -3.4, z: 4.4 },
    ...flowers([
      [2.7, 0.8],
      [-2.6, -4.2],
      [2.6, 7.6],
      [-1.0, 8.6],
      [1.2, -8.2],
    ]),
  ],
};

// 2 ------------------------------------------------------------ round the corner past the hay bales
const ell: Pt[] = [
  [-5.6, 7.0],
  [-2.0, 7.0],
  [-2.0, -1.6],
  [6.0, -1.6],
  [6.0, -5.2],
  [-4.4, -5.2],
  [-5.6, -4.0],
];
const h2: HoleSpec = {
  name: 'Höbalarna',
  sub: 'Runt hörnet, förbi höbalarna',
  par: 3,
  tee: [-3.8, 5.6],
  cup: [4.3, -3.9],
  path: [
    [-3.8, 5.6],
    [-3.8, -2.9],
    [4.3, -3.9],
  ],
  greens: [
    { kind: 'poly', pts: ell },
    { kind: 'disc', c: [4.3, -3.9], r: 1.2, h: 0, prof: 'bowl', depth: 0.09 },
  ],
  rails: [{ pts: ell, closed: true }],
  obstacles: [
    { type: 'roundbale', x: -2.75, z: -2.35, stand: true },
    { type: 'bale', x: 1.4, z: -2.55 },
  ],
  island: { margin: 2.4 },
  decos: [
    { type: 'sign', x: -6.5, z: 6.2, s: 2 },
    { type: 'roundbale', x: 0.4, z: 2.2, yaw: 0.4 },
    { type: 'roundbale', x: 1.8, z: 1.4, yaw: 1.2 },
    { type: 'bale', x: 0.6, z: 0.6, yaw: 0.2 },
    { type: 'bale', x: 3.4, z: 0.4, yaw: -0.3 },
    { type: 'bale', x: 4.6, z: 2.0, yaw: 0.9 },
    { type: 'cart', x: 2.4, z: 3.6, yaw: 0.6 },
    { type: 'scarecrow', x: -0.6, z: 4.6 },
    { type: 'hen', x: 4.6, z: 0.9, yaw: 2 },
    { type: 'hen', x: -7.0, z: -2.0, yaw: 0.4 },
    { type: 'tree', x: -7.0, z: 2.6 },
    { type: 'tree', x: 7.4, z: -6.4, s: 0.9 },
    { type: 'bush', x: 5.6, z: 1.4 },
    { type: 'rock', x: -6.2, z: -6.4 },
    ...flowers([
      [-1.0, 6.6],
      [-6.8, 0.2],
      [-2.2, -6.6],
      [2.6, -6.6],
      [7.2, -2.4],
    ]),
  ],
};

// 3 ------------------------------------------------------------ the red windmill
const mill: Pt[] = rect(-2.0, -9.2, 2.0, 8.0);
const h3: HoleSpec = {
  name: 'Väderkvarnen',
  sub: 'Vänta tills vingarna är ur vägen',
  par: 3,
  tee: [0, 6.6],
  cup: [0, -6.6],
  path: [
    [0, 6.6],
    [0, -6.6],
  ],
  greens: [
    { kind: 'poly', pts: mill },
    { kind: 'disc', c: [0, -6.6], r: 1.4, h: 0, prof: 'bowl', depth: 0.12 },
  ],
  rails: [
    { pts: mill, closed: true },
    {
      pts: [
        [-2.0, 1.15],
        [-0.92, 0.14],
      ],
    },
    {
      pts: [
        [2.0, 1.15],
        [0.92, 0.14],
      ],
    },
  ],
  obstacles: [
    { type: 'wall', x0: -2.3, z0: -1.8, x1: -0.62, z1: -1.8, t: 2.8, h: 1.6, look: 'mill' },
    { type: 'wall', x0: 0.62, z0: -1.8, x1: 2.3, z1: -1.8, t: 2.8, h: 1.6, look: 'mill' },
  ],
  movers: [{ type: 'windmill', x: 0, z: -0.12, hubY: 2.62, len: 2.44, w: 1.1, speed: 1.0 }],
  builds: [{ type: 'mill', x: 0, z: -1.8 }],
  island: { margin: 2.6 },
  decos: [
    { type: 'sign', x: -2.9, z: 7.0, s: 3 },
    { type: 'sheep', x: 3.0, z: 4.6, yaw: 2.6 },
    { type: 'sheep', x: 3.4, z: 3.2, yaw: 1.8 },
    { type: 'sheep', x: -3.2, z: -5.6, yaw: -0.6 },
    { type: 'birch', x: -3.4, z: 2.6 },
    { type: 'birch', x: 3.6, z: -7.8, s: 0.85 },
    { type: 'fence', x: 2.7, z: 6.4, x1: 2.7, z1: 1.8 },
    { type: 'bale', x: -3.2, z: -2.6, yaw: 0.3 },
    { type: 'rock', x: 3.3, z: -3.6 },
    { type: 'mushroom', x: -3.0, z: 5.2 },
    ...flowers([
      [-2.8, 0.2],
      [2.9, -5.6],
      [-1.2, 9.0],
      [1.6, -10.2],
      [-3.0, -8.6],
    ]),
  ],
};

// 4 ------------------------------------------------------------ a jump over the duck pond
const h4: HoleSpec = {
  name: 'Ankdammen',
  sub: 'Ta sats och hoppa över dammen!',
  par: 3,
  tee: [0, 7.8],
  cup: [-1.9, -8.0],
  path: [
    [0, 7.8],
    [0, -5.2],
    [-1.9, -8.0],
  ],
  greens: [
    { kind: 'poly', pts: rect(-4.4, 2.0, 2.0, 9.4) },
    { kind: 'poly', pts: rect(-4.4, -3.2, -2.6, 2.0) },
    { kind: 'poly', pts: rect(-4.4, -10.6, 2.0, -3.2) },
    { kind: 'lane', a: [0, 2.0], b: [0, 0.0], hw: 1.0, h0: 0, h1: 0.9, prof: 'ramp' },
    { kind: 'disc', c: [-1.9, -8.0], r: 1.3, h: 0, prof: 'bowl', depth: 0.1 },
  ],
  obstacles: [
    { type: 'roundbale', x: -3.25, z: -9.95, yaw: 0 },
    { type: 'roundbale', x: -1.2, z: -9.95, yaw: 0 },
    { type: 'roundbale', x: 0.85, z: -9.95, yaw: 0 },
  ],
  rails: [
    {
      pts: [
        [2.0, 2.0],
        [2.0, 9.4],
        [-4.4, 9.4],
        [-4.4, -10.6],
        [2.0, -10.6],
        [2.0, -3.2],
      ],
    },
    {
      pts: [
        [1.0, 2.0],
        [2.0, 2.0],
      ],
    },
    {
      pts: [
        [-1.0, 2.0],
        [-2.6, 2.0],
        [-2.6, -3.2],
      ],
    },
    {
      pts: [
        [1.0, 2.0],
        [1.0, 0.0],
      ],
    },
    {
      pts: [
        [-1.0, 2.0],
        [-1.0, 0.0],
      ],
    },
    {
      pts: [
        [-2.6, -3.2],
        [2.0, -3.2],
      ],
      h: 0.1,
      look: 'lip',
    },
  ],
  waters: [{ pts: arc(0, -0.6, 3.05, 0, 360, 28).slice(0, -1), level: -0.42, ducks: 3 }],
  island: { margin: 2.4 },
  decos: [
    { type: 'sign', x: -5.3, z: 8.6, s: 4 },
    { type: 'reeds', x: 2.6, z: 1.6 },
    { type: 'reeds', x: 2.9, z: -2.2 },
    { type: 'reeds', x: -2.2, z: -2.6 },
    { type: 'lily', x: 2.4, z: -0.8 },
    { type: 'lily', x: -1.6, z: -1.6 },
    { type: 'lily', x: 0.9, z: -2.4 },
    { type: 'lily', x: -2.0, z: 0.6 },
    { type: 'roundbale', x: 3.2, z: -10.2, yaw: 1.2 },
    { type: 'birch', x: 3.6, z: 6.8 },
    { type: 'tree', x: -5.6, z: -6.6 },
    { type: 'hen', x: 3.2, z: -5.6, yaw: 2.8 },
    { type: 'bush', x: 3.5, z: 3.6 },
    { type: 'mushroom', x: -5.4, z: 0.4 },
    ...flowers([
      [3.3, -8.6],
      [-5.6, 4.4],
      [-5.4, -2.6],
      [3.2, 8.8],
    ]),
  ],
};

// 5 ------------------------------------------------------------ the barn with two doors
const h5: HoleSpec = {
  name: 'Ladan',
  sub: 'Två dörrar – en är en genväg',
  par: 3,
  tee: [0, 7.6],
  cup: [-1.75, -8.6],
  path: [
    [0, 7.6],
    [-1.0, 1.4],
    [-1.75, -5.0],
    [-1.75, -8.6],
  ],
  greens: [
    { kind: 'poly', pts: rect(-3.0, -1.4, 3.0, 9.0) },
    { kind: 'poly', pts: rect(-4.4, -11.0, 4.4, -4.0) },
    { kind: 'disc', c: [-1.75, -8.6], r: 1.3, h: 0, prof: 'bowl', depth: 0.1 },
  ],
  rails: [
    {
      pts: [
        [-3.0, 0.0],
        [-3.0, 9.0],
        [3.0, 9.0],
        [3.0, 0.0],
      ],
    },
    {
      pts: [
        [-4.4, -4.0],
        [-4.4, -11.0],
        [4.4, -11.0],
        [4.4, -4.0],
        [-4.4, -4.0],
      ],
    },
    {
      pts: [
        [0.4, -4.0],
        [0.4, -7.3],
      ],
      look: 'fence',
    },
  ],
  obstacles: [
    { type: 'wall', x0: -3.6, z0: -0.15, x1: -2.2, z1: -0.15, h: 2.0, look: 'barn' },
    { type: 'wall', x0: -1.3, z0: -0.15, x1: 0.5, z1: -0.15, h: 2.0, look: 'barn' },
    { type: 'wall', x0: 2.1, z0: -0.15, x1: 3.6, z1: -0.15, h: 2.0, look: 'barn' },
  ],
  portals: [
    { rect: [-2.2, -1.4, -1.3, -0.33], exit: [-1.75, -4.5], dir: [0, -1], delay: 0.9 },
    { rect: [0.5, -1.4, 2.1, -0.33], exit: [3.3, -4.5], dir: [0, -1], delay: 1.2 },
  ],
  builds: [{ type: 'barn', x: 0, z: -2.1, w: 7.2, d: 3.9 }],
  island: { margin: 2.4 },
  decos: [
    { type: 'sign', x: -3.9, z: 8.2, s: 5 },
    { type: 'pig', x: 3.9, z: 5.4, yaw: 2.4 },
    { type: 'pig', x: 4.2, z: 3.8, yaw: 1.2, s: 0.7 },
    { type: 'hen', x: -4.0, z: 3.4, yaw: -0.6 },
    { type: 'hen', x: -4.3, z: 4.6, yaw: 0.6 },
    { type: 'well', x: -4.2, z: 1.0 },
    { type: 'cart', x: 5.0, z: -1.6, yaw: -1.2 },
    { type: 'tree', x: 5.8, z: -9.6 },
    { type: 'apple', x: -5.6, z: -9.4, s: 0.9 },
    { type: 'bush', x: -5.6, z: -5.0 },
    { type: 'fence', x: 3.8, z: 7.6, x1: 3.8, z1: 2.4 },
    ...flowers([
      [-4.0, 7.2],
      [5.4, -6.0],
      [-5.4, -7.0],
      [0.2, -12.0],
      [4.0, 9.8],
    ]),
  ],
};

// 6 ------------------------------------------------------------ cows wandering across the pasture
const pasture: Pt[] = [
  [-2.6, 9.0],
  [2.6, 9.0],
  [4.0, 7.6],
  [4.0, -8.0],
  [2.6, -9.4],
  [-2.6, -9.4],
  [-4.0, -8.0],
  [-4.0, 7.6],
];
const h6: HoleSpec = {
  name: 'Kohagen',
  sub: 'Korna går dit de vill',
  par: 3,
  tee: [-1.6, 7.4],
  cup: [2.0, -7.2],
  path: [
    [-1.6, 7.4],
    [2.0, -7.2],
  ],
  greens: [
    { kind: 'poly', pts: pasture },
    { kind: 'disc', c: [2.0, -7.2], r: 1.2, h: 0, prof: 'bowl', depth: 0.1 },
  ],
  rails: [{ pts: pasture, closed: true, look: 'fence' }],
  movers: [
    { type: 'cow', a: [-2.9, 3.2], b: [2.9, 3.2], speed: 0.55, phase: 0.3 },
    { type: 'cow', a: [2.9, -2.0], b: [-2.9, -2.0], speed: 0.5, phase: 0.65 },
    { type: 'cow', a: [-3.0, -5.4], b: [0.6, -5.4], speed: 0.42, phase: 0.1, calf: true },
  ],
  mud: [
    [-2.3, 0.6, 0.85],
    [2.5, -4.4, 0.8],
  ],
  island: { margin: 2.4 },
  decos: [
    { type: 'sign', x: -4.8, z: 8.2, s: 6 },
    { type: 'trough', x: 5.0, z: 1.2, yaw: 1.57 },
    { type: 'roundbale', x: -5.2, z: -2.4, yaw: 0.3 },
    { type: 'roundbale', x: -5.0, z: -4.0, yaw: 1.1 },
    { type: 'tree', x: 5.3, z: 6.4 },
    { type: 'tree', x: -5.4, z: 5.0, s: 0.85 },
    { type: 'birch', x: 5.4, z: -6.0 },
    { type: 'bush', x: -5.2, z: -8.4 },
    { type: 'rock', x: 5.2, z: -2.4 },
    { type: 'mushroom', x: -4.8, z: 0.8 },
    ...flowers([
      [5.0, 3.6],
      [-5.0, 2.4],
      [0.0, 10.2],
      [-1.4, -10.6],
      [4.6, -9.4],
    ]),
  ],
};

// 7 ------------------------------------------------------------ the bridge over the stream
const teeGreen7: Pt[] = [
  [-2.2, 10.0],
  [2.2, 10.0],
  [2.2, 4.8],
  [0.85, 3.6],
  [-0.85, 3.6],
  [-2.2, 4.8],
];
const h7: HoleSpec = {
  name: 'Bäcken',
  sub: 'Akta så du inte trillar i bäcken',
  par: 3,
  tee: [0, 8.6],
  cup: [3.0, -7.4],
  path: [
    [0, 8.6],
    [0, -1.8],
    [3.0, -7.4],
  ],
  greens: [
    { kind: 'poly', pts: teeGreen7 },
    { kind: 'lane', a: [0, 3.6], b: [0, -0.6], hw: 0.85, h0: 0, h1: 0.45, prof: 'arch', surf: 'wood' },
    { kind: 'poly', pts: rect(-2.4, -9.6, 4.8, -0.6) },
    { kind: 'disc', c: [3.0, -7.4], r: 1.2, h: 0, prof: 'bowl', depth: 0.1 },
  ],
  rails: [
    {
      pts: [
        [-0.85, 3.6],
        [-2.2, 4.8],
        [-2.2, 10.0],
        [2.2, 10.0],
        [2.2, 4.8],
        [0.85, 3.6],
      ],
    },
    {
      pts: [
        [-0.85, -0.6],
        [-2.4, -0.6],
        [-2.4, -9.6],
        [4.8, -9.6],
        [4.8, -0.6],
        [0.85, -0.6],
      ],
    },
  ],
  waters: [
    {
      pts: rect(-12, -0.6, 12, 3.6),
      level: -0.45,
      flow: [1.3, 0],
    },
  ],
  obstacles: [
    { type: 'post', x: 1.2, z: -4.6, r: 0.36, look: 'tree' },
    { type: 'post', x: 3.6, z: -3.0, r: 0.42, look: 'stone' },
  ],
  builds: [{ type: 'bridge', x: 0, z: 1.5 }],
  island: { margin: 2.4, split: [
    [0, 1, 3.6],
    [0, -1, 0.6],
  ] },
  decos: [
    { type: 'sign', x: -3.1, z: 9.2, s: 7 },
    { type: 'reeds', x: -2.6, z: 3.3 },
    { type: 'reeds', x: 2.9, z: -0.3 },
    { type: 'reeds', x: 5.6, z: 3.2 },
    { type: 'birch', x: 3.6, z: 7.8 },
    { type: 'birch', x: -3.6, z: 5.6, s: 0.8 },
    { type: 'sheep', x: 3.4, z: 5.4, yaw: 2.4 },
    { type: 'tree', x: -4.0, z: -7.8 },
    { type: 'bush', x: 6.0, z: -6.2 },
    { type: 'rock', x: -3.6, z: -2.0 },
    { type: 'rock', x: 6.2, z: -1.6 },
    ...flowers([
      [-3.4, -4.6],
      [6.0, -8.6],
      [3.4, 10.6],
      [-2.0, 11.0],
    ]),
  ],
};

// 8 ------------------------------------------------------------ the hill with the crater
const hill: Pt[] = [[-2.0, 9.2], [2.0, 9.2], ...arc(0, -4.0, 5.0, 23.6, 336.4, 26)];
const h8: HoleSpec = {
  name: 'Kullen',
  sub: 'Upp på kullen och ner i gropen',
  par: 3,
  tee: [0, 7.8],
  cup: [0, -4.0],
  path: [
    [0, 7.8],
    [0, -4.0],
  ],
  greens: [
    { kind: 'poly', pts: hill },
    { kind: 'disc', c: [0, -4.0], r: 4.3, h: 0, prof: 'crater', rim: 1.25, height: 1.0, depth: 0.26 },
  ],
  rails: [{ pts: hill, closed: true, look: 'stone' }],
  obstacles: [{ type: 'post', x: 0, z: 0.9, r: 0.45, look: 'stone' }],
  island: { margin: 2.2 },
  decos: [
    { type: 'sign', x: -2.9, z: 8.4, s: 8 },
    { type: 'sheep', x: 5.4, z: -1.0, yaw: 2.2 },
    { type: 'sheep', x: 5.8, z: -2.6, yaw: 1.4, s: 0.75 },
    { type: 'sheep', x: -5.6, z: -6.2, yaw: -0.6 },
    { type: 'scarecrow', x: -5.4, z: -0.4 },
    { type: 'tree', x: 4.6, z: 4.6 },
    { type: 'apple', x: -4.4, z: 4.0, s: 0.85 },
    { type: 'birch', x: 4.8, z: -8.6 },
    { type: 'rock', x: -5.0, z: -9.2 },
    { type: 'mushroom', x: 3.2, z: 7.6 },
    ...flowers([
      [-3.4, 6.2],
      [6.0, -5.4],
      [-6.2, -3.2],
      [0, -10.4],
    ]),
  ],
};

// 9 ------------------------------------------------------------ the merry-go-round, cup and all
const ring = arc(0, -3.6, 5.1, 13.6, 346.4, 30);
const h9: HoleSpec = {
  name: 'Karusellen',
  sub: 'Karusellen snurrar – och hålet med!',
  par: 4,
  tee: [0, 11.0],
  cup: [0, -5.9],
  cupOn: 1,
  path: [
    [0, 11.0],
    [0, 1.2],
    [0, -3.6],
  ],
  greens: [
    { kind: 'poly', pts: rect(-2.1, 3.0, 2.1, 12.4) },
    { kind: 'lane', a: [0, 3.0], b: [0, 1.0], hw: 1.2, h0: 0, h1: 0.5, prof: 'smooth' },
    { kind: 'disc', c: [0, -3.6], r: 5.1, rin: 4.5, h: 0.5 },
    { kind: 'disc', c: [0, -3.6], r: 4.5, h: 0.5, spin: 0.3, look: 'carousel' },
  ],
  rails: [
    {
      pts: [
        [-1.2, 3.0],
        [-2.1, 3.0],
        [-2.1, 12.4],
        [2.1, 12.4],
        [2.1, 3.0],
        [1.2, 3.0],
      ],
    },
    {
      pts: [
        [-1.2, 3.0],
        [-1.2, 1.36],
      ],
    },
    {
      pts: [
        [1.2, 3.0],
        [1.2, 1.36],
      ],
    },
    { pts: ring },
  ],
  movers: [
    { type: 'spinner', x: 0, z: 7.4, len: 2.4, speed: 1.2 },
    { type: 'carousel', x: 0, z: -3.6, r: 4.5, speed: 0.3, poles: 3, ring: 3.1, h: 0.5 },
  ],
  island: { margin: 2.6 },
  decos: [
    { type: 'sign', x: -3.0, z: 11.6, s: 9 },
    { type: 'balloons', x: 3.2, z: 9.8 },
    { type: 'balloons', x: -6.4, z: -1.0 },
    { type: 'balloons', x: 6.6, z: -7.2 },
    { type: 'bunting', x: -2.9, z: 12.8, x1: -2.9, z1: 3.4 },
    { type: 'bunting', x: 2.9, z: 12.8, x1: 2.9, z1: 3.4 },
    { type: 'tree', x: -6.2, z: 4.6 },
    { type: 'tree', x: 6.4, z: 3.6, s: 0.9 },
    { type: 'pig', x: 3.4, z: 5.4, yaw: 2.0 },
    { type: 'hen', x: -3.3, z: 6.6, yaw: -1.0 },
    { type: 'sheep', x: -6.4, z: -7.6, yaw: 0.6 },
    ...flowers([
      [3.2, 7.6],
      [-3.2, 9.0],
      [6.0, -1.0],
      [-6.0, -4.2],
      [0, -10.8],
    ]),
  ],
};

export const HOLES: HoleSpec[] = [h1, h2, h3, h4, h5, h6, h7, h8, h9];
export const PAR_TOTAL = HOLES.reduce((s, h) => s + h.par, 0);
