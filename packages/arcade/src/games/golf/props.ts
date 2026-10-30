// The farm's little toys: hay bales, hens, sheep, pigs, cows, ducks, trees, flowers and friends.
// Every builder returns an object standing on y = 0 (facing +x), and maybe a function that animates it.
import * as THREE from 'three';
import { mesh, type Kit } from './kit3d.ts';
import { rng, signTexture } from './tex.ts';

export interface Prop {
  obj: THREE.Object3D;
  /** Animate (t = seconds of play). */
  anim?: (t: number, dt: number) => void;
  /** Never moves: may be merged with its neighbours. */
  still?: boolean;
}

const PAL = {
  white: '#fbfaf5',
  cream: '#f4ead2',
  red: '#e8463c',
  barn: '#cf3a3a',
  pink: '#f6a7b8',
  pinkDark: '#e5849a',
  yellow: '#ffd23a',
  orange: '#ff8f2a',
  black: '#2a2a2e',
  grey: '#a9adb8',
  trunk: '#8a5a33',
  leaf: '#4fb84a',
  leaf2: '#6fcf55',
  leaf3: '#3f9f44',
  birch: '#a6dc63',
  hay: '#f2c64a',
  wood: '#c98a4b',
  woodDark: '#9a6230',
};
export { PAL };

// ---------------------------------------------------------------- hay

export function bale(kit: Kit): Prop {
  const g = new THREE.Group();
  const hay = kit.std(PAL.hay, { map: kit.tex.hay, rough: 0.95 });
  g.add(mesh(kit.rbox, hay, [0, 0.38, 0], [1.1, 0.76, 0.76]));
  const twine = kit.std('#b86f2a', { rough: 0.9 });
  for (const x of [-0.28, 0.28]) g.add(mesh(kit.box, twine, [x, 0.38, 0], [0.05, 0.78, 0.78]));
  return { obj: g, still: true };
}

export function roundBale(kit: Kit, stand = false): Prop {
  const g = new THREE.Group();
  const side = kit.std(PAL.hay, { map: kit.tex.hay, rough: 0.95 });
  const end = kit.std('#ffffff', { map: kit.tex.spiral, rough: 0.95 });
  const geo = kit.geo('bale-cyl', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1));
  const m = new THREE.Mesh(geo, [side, end, end]);
  if (stand) {
    m.scale.set(0.62, 1.0, 0.62);
    m.position.y = 0.5;
  } else {
    m.scale.set(0.58, 0.84 + 0.16, 0.58);
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.58;
  }
  g.add(m);
  const twine = kit.std('#b86f2a', { rough: 0.9 });
  const ring = kit.geo('bale-ring', () => new THREE.TorusGeometry(1, 0.035, 5, 24));
  for (const o of [-0.22, 0.22]) {
    const r = mesh(ring, twine, stand ? [0, 0.5 + o, 0] : [o, 0.58, 0], stand ? [0.63, 0.63, 1] : [0.59, 0.59, 1], stand ? [Math.PI / 2, 0, 0] : [0, Math.PI / 2, 0]);
    g.add(r);
  }
  return { obj: g, still: true };
}

// ---------------------------------------------------------------- animals

export function hen(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const white = kit.std(PAL.white, { rough: 0.7 });
  const red = kit.std(PAL.red, { rough: 0.6 });
  const yel = kit.std(PAL.yellow, { rough: 0.6 });
  const blk = kit.std(PAL.black, { rough: 0.4 });
  const body = new THREE.Group();
  g.add(body);
  body.add(mesh(kit.sphere, white, [0, 0.27, 0], [0.24, 0.2, 0.19]));
  body.add(mesh(kit.cone, white, [-0.22, 0.38, 0], [0.11, 0.24, 0.11], [0, 0, 0.9]));
  body.add(mesh(kit.sphere, kit.std(PAL.cream, { rough: 0.7 }), [0, 0.29, 0.15], [0.15, 0.1, 0.05]));
  body.add(mesh(kit.sphere, kit.std(PAL.cream, { rough: 0.7 }), [0, 0.29, -0.15], [0.15, 0.1, 0.05]));
  const head = new THREE.Group();
  head.position.set(0.18, 0.38, 0);
  body.add(head);
  head.add(mesh(kit.sphere, white, [0.04, 0.08, 0], 0.11));
  head.add(mesh(kit.sphere, red, [0.03, 0.2, 0], [0.07, 0.05, 0.025]));
  head.add(mesh(kit.sphere, red, [0.12, 0.01, 0], [0.03, 0.045, 0.02]));
  head.add(mesh(kit.cone, yel, [0.16, 0.07, 0], [0.035, 0.08, 0.035], [0, 0, -Math.PI / 2]));
  head.add(mesh(kit.sphere, blk, [0.1, 0.11, 0.06], 0.018));
  head.add(mesh(kit.sphere, blk, [0.1, 0.11, -0.06], 0.018));
  for (const z of [-0.06, 0.06]) g.add(mesh(kit.cyl8, yel, [0.02, 0.06, z], [0.018, 0.13, 0.018]));
  const r = rng(seed * 31 + 7);
  const off = r() * 10;
  const speed = 0.7 + r() * 0.6;
  return {
    obj: g,
    anim: (t) => {
      // peck, peck, look around
      const k = (t * speed + off) % 3.2;
      const peck = k < 0.9 ? Math.max(0, Math.sin(k * Math.PI * 3.3)) : 0;
      head.rotation.z = -peck * 0.9;
      head.position.y = 0.38 - peck * 0.08;
      body.rotation.z = -peck * 0.18;
      body.rotation.y = k > 2.2 ? Math.sin((k - 2.2) * 3) * 0.4 : 0;
    },
  };
}

export function sheep(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const wool = kit.std('#f6f3ec', { rough: 1 });
  const face = kit.std('#3a3236', { rough: 0.7 });
  const r = rng(seed * 13 + 3);
  const body = new THREE.Group();
  g.add(body);
  const puffs: V[] = [
    [0, 0.5, 0, 0.3],
    [0.22, 0.52, 0.08, 0.22],
    [-0.24, 0.5, 0.06, 0.24],
    [0.05, 0.62, -0.1, 0.22],
    [-0.12, 0.6, 0.14, 0.2],
    [0.18, 0.46, -0.16, 0.2],
    [-0.2, 0.45, -0.15, 0.2],
  ];
  for (const [x, y, z, s] of puffs) body.add(mesh(kit.lowSphere, wool, [x, y, z], s));
  const head = new THREE.Group();
  head.position.set(0.36, 0.56, 0);
  body.add(head);
  head.add(mesh(kit.sphere, face, [0.06, 0, 0], [0.15, 0.13, 0.12]));
  head.add(mesh(kit.lowSphere, wool, [0.0, 0.11, 0], 0.09));
  head.add(mesh(kit.sphere, face, [0.0, 0.03, 0.13], [0.07, 0.03, 0.05], [0.4, 0, 0]));
  head.add(mesh(kit.sphere, face, [0.0, 0.03, -0.13], [0.07, 0.03, 0.05], [-0.4, 0, 0]));
  head.add(mesh(kit.sphere, kit.std('#ffffff', { rough: 0.3 }), [0.17, 0.04, 0.06], 0.025));
  head.add(mesh(kit.sphere, kit.std('#ffffff', { rough: 0.3 }), [0.17, 0.04, -0.06], 0.025));
  for (const [x, z] of [
    [0.2, 0.1],
    [0.2, -0.1],
    [-0.2, 0.1],
    [-0.2, -0.1],
  ] as const)
    g.add(mesh(kit.cyl8, face, [x, 0.15, z], [0.045, 0.3, 0.045]));
  const off = r() * 10;
  return {
    obj: g,
    anim: (t) => {
      const k = (t * 0.5 + off) % 4;
      const down = k < 2.4 ? Math.min(1, k * 3, (2.4 - k) * 3) : 0;
      head.rotation.z = -down * 0.7;
      head.position.y = 0.56 - down * 0.12;
      body.position.y = Math.abs(Math.sin(t * 1.3 + off)) * 0.01;
    },
  };
}
type V = [number, number, number, number];

export function pig(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const pink = kit.std(PAL.pink, { rough: 0.6 });
  const dark = kit.std(PAL.pinkDark, { rough: 0.6 });
  const blk = kit.std(PAL.black, { rough: 0.4 });
  g.add(mesh(kit.sphere, pink, [0, 0.36, 0], [0.42, 0.3, 0.3]));
  const head = new THREE.Group();
  head.position.set(0.38, 0.42, 0);
  g.add(head);
  head.add(mesh(kit.sphere, pink, [0.06, 0, 0], 0.21));
  head.add(mesh(kit.cyl, dark, [0.25, -0.03, 0], [0.09, 0.08, 0.09], [0, 0, Math.PI / 2]));
  head.add(mesh(kit.sphere, blk, [0.3, -0.01, 0.035], 0.018));
  head.add(mesh(kit.sphere, blk, [0.3, -0.01, -0.035], 0.018));
  head.add(mesh(kit.sphere, blk, [0.2, 0.08, 0.1], 0.025));
  head.add(mesh(kit.sphere, blk, [0.2, 0.08, -0.1], 0.025));
  head.add(mesh(kit.cone, dark, [0.02, 0.2, 0.11], [0.07, 0.12, 0.04], [0.5, 0, -0.3]));
  head.add(mesh(kit.cone, dark, [0.02, 0.2, -0.11], [0.07, 0.12, 0.04], [-0.5, 0, -0.3]));
  for (const [x, z] of [
    [0.22, 0.14],
    [0.22, -0.14],
    [-0.22, 0.14],
    [-0.22, -0.14],
  ] as const)
    g.add(mesh(kit.cyl8, pink, [x, 0.1, z], [0.07, 0.2, 0.07]));
  const tail = mesh(kit.geo('pig-tail', () => new THREE.TorusGeometry(0.06, 0.018, 5, 10, Math.PI * 1.6)), dark, [-0.42, 0.42, 0], 1, [0, Math.PI / 2, 0]);
  g.add(tail);
  const off = rng(seed * 7 + 1)() * 10;
  return {
    obj: g,
    anim: (t) => {
      head.rotation.z = Math.sin(t * 1.7 + off) * 0.12 - 0.08;
      head.rotation.y = Math.sin(t * 0.6 + off) * 0.25;
      tail.rotation.x = Math.sin(t * 8 + off) * 0.4;
    },
  };
}

/** The cow's parts that move. */
export interface CowRig {
  obj: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  tail: THREE.Object3D;
  body: THREE.Object3D;
}

export function cow(kit: Kit, calf: boolean): CowRig {
  const g = new THREE.Group();
  const hide = kit.std(calf ? '#f1cfa6' : '#ffffff', { map: kit.tex.cow, rough: 0.7 });
  const white = kit.std(PAL.white, { rough: 0.7 });
  const pink = kit.std(PAL.pink, { rough: 0.55 });
  const blk = kit.std(PAL.black, { rough: 0.5 });
  const horn = kit.std(PAL.cream, { rough: 0.5 });
  const body = new THREE.Group();
  g.add(body);
  body.add(mesh(kit.rbox, hide, [0, 0.72, 0], [1.3, 0.62, 0.68]));
  body.add(mesh(kit.sphere, pink, [-0.3, 0.42, 0], [0.13, 0.1, 0.13]));
  const head = new THREE.Group();
  head.position.set(0.66, 0.92, 0);
  body.add(head);
  head.add(mesh(kit.rbox, hide, [0.14, 0, 0], [0.44, 0.42, 0.4]));
  head.add(mesh(kit.rbox, pink, [0.36, -0.1, 0], [0.16, 0.22, 0.36]));
  head.add(mesh(kit.sphere, blk, [0.45, -0.06, 0.08], 0.025));
  head.add(mesh(kit.sphere, blk, [0.45, -0.06, -0.08], 0.025));
  head.add(mesh(kit.sphere, blk, [0.3, 0.1, 0.16], 0.04));
  head.add(mesh(kit.sphere, blk, [0.3, 0.1, -0.16], 0.04));
  head.add(mesh(kit.sphere, white, [0.32, 0.115, 0.172], 0.015));
  head.add(mesh(kit.sphere, white, [0.32, 0.115, -0.172], 0.015));
  if (!calf) {
    head.add(mesh(kit.cone, horn, [0.1, 0.27, 0.15], [0.05, 0.16, 0.05], [0.5, 0, 0]));
    head.add(mesh(kit.cone, horn, [0.1, 0.27, -0.15], [0.05, 0.16, 0.05], [-0.5, 0, 0]));
  }
  head.add(mesh(kit.sphere, white, [0.06, 0.12, 0.26], [0.1, 0.05, 0.08], [0.3, 0, 0]));
  head.add(mesh(kit.sphere, white, [0.06, 0.12, -0.26], [0.1, 0.05, 0.08], [-0.3, 0, 0]));
  // a little golden bell
  head.add(mesh(kit.sphere, kit.std('#ffcc33', { rough: 0.25, metal: 0.6 }), [0.0, -0.28, 0], 0.07));
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0.45, 0.22],
    [0.45, -0.22],
    [-0.45, 0.22],
    [-0.45, -0.22],
  ] as const) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.48, z);
    leg.add(mesh(kit.cyl8, white, [0, -0.22, 0], [0.085, 0.44, 0.085]));
    leg.add(mesh(kit.cyl8, blk, [0, -0.44, 0], [0.095, 0.08, 0.095]));
    body.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.66, 0.92, 0);
  tail.add(mesh(kit.cyl8, white, [0, -0.25, 0], [0.03, 0.5, 0.03]));
  tail.add(mesh(kit.sphere, blk, [0, -0.52, 0], [0.06, 0.1, 0.06]));
  tail.rotation.z = -0.25;
  body.add(tail);
  if (calf) g.scale.setScalar(0.68);
  return { obj: g, legs, head, tail, body };
}

export function duck(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const yel = kit.std(PAL.yellow, { rough: 0.5 });
  const org = kit.std(PAL.orange, { rough: 0.5 });
  const blk = kit.std(PAL.black, { rough: 0.3 });
  g.add(mesh(kit.sphere, yel, [0, 0.08, 0], [0.24, 0.15, 0.17]));
  g.add(mesh(kit.cone, yel, [-0.22, 0.14, 0], [0.07, 0.14, 0.07], [0, 0, 1.2]));
  g.add(mesh(kit.sphere, yel, [0.16, 0.27, 0], 0.11));
  g.add(mesh(kit.sphere, org, [0.29, 0.25, 0], [0.08, 0.025, 0.06]));
  g.add(mesh(kit.sphere, blk, [0.23, 0.3, 0.07], 0.018));
  g.add(mesh(kit.sphere, blk, [0.23, 0.3, -0.07], 0.018));
  const off = rng(seed * 5 + 2)() * 10;
  return {
    obj: g,
    anim: (t) => {
      g.position.y = Math.sin(t * 2.2 + off) * 0.02;
      g.rotation.z = Math.sin(t * 1.7 + off) * 0.06;
    },
  };
}

// ---------------------------------------------------------------- plants

export function tree(kit: Kit, kind: 'tree' | 'apple' | 'birch', seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed * 17 + 5);
  if (kind === 'birch') {
    const bark = kit.std('#f3f0e8', { rough: 0.7 });
    g.add(mesh(kit.cyl8, bark, [0, 1.0, 0], [0.11, 2.0, 0.11]));
    const blk = kit.std('#3a3a3a', { rough: 0.8 });
    for (let i = 0; i < 5; i++) g.add(mesh(kit.box, blk, [0, 0.3 + i * 0.35 + r() * 0.1, 0.09], [0.08, 0.025, 0.05], [0, r() * 6, 0]));
    const leaf = kit.std(PAL.birch, { rough: 0.85, flat: true });
    g.add(mesh(kit.ico, leaf, [0, 2.3, 0], [0.75, 1.05, 0.75], [0, r(), 0]));
    g.add(mesh(kit.ico, leaf, [0.25, 1.85, 0.15], [0.5, 0.6, 0.5], [r(), r(), 0]));
  } else {
    const bark = kit.std(PAL.trunk, { rough: 0.9 });
    g.add(mesh(kit.cyl8, bark, [0, 0.6, 0], [0.17, 1.2, 0.17]));
    const leaves = [kit.std(PAL.leaf, { rough: 0.85, flat: true }), kit.std(PAL.leaf2, { rough: 0.85, flat: true }), kit.std(PAL.leaf3, { rough: 0.85, flat: true })];
    const blobs: [number, number, number, number][] = [
      [0, 1.75, 0, 0.85],
      [0.45, 1.5, 0.2, 0.6],
      [-0.4, 1.55, -0.25, 0.62],
      [0.1, 2.2, -0.15, 0.55],
    ];
    blobs.forEach(([x, y, z, s], i) => g.add(mesh(kit.ico, leaves[i % 3]!, [x, y, z], s, [r(), r(), r()])));
    if (kind === 'apple') {
      const apple = kit.std('#e53935', { rough: 0.35 });
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const y = 1.4 + r() * 0.9;
        const rad = 0.75 + r() * 0.15;
        g.add(mesh(kit.sphere, apple, [Math.cos(a) * rad * 0.9, y, Math.sin(a) * rad * 0.9], 0.08));
      }
    }
  }
  g.scale.setScalar(0.9 + r() * 0.25);
  return { obj: g, still: true };
}

export function bush(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed * 3 + 9);
  const m = [kit.std(PAL.leaf, { rough: 0.85, flat: true }), kit.std(PAL.leaf2, { rough: 0.85, flat: true })];
  for (let i = 0; i < 4; i++) g.add(mesh(kit.ico, m[i % 2]!, [(r() - 0.5) * 0.6, 0.25 + r() * 0.15, (r() - 0.5) * 0.6], 0.3 + r() * 0.15, [r(), r(), r()]));
  // a few berries
  const b = kit.std('#ff4f7b', { rough: 0.4 });
  for (let i = 0; i < 5; i++) g.add(mesh(kit.sphere, b, [(r() - 0.5) * 0.7, 0.3 + r() * 0.3, (r() - 0.5) * 0.7], 0.05));
  return { obj: g, still: true };
}

export function sunflower(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed + 41);
  const h = 1.1 + r() * 0.4;
  g.add(mesh(kit.cyl8, kit.std('#4f9a3a', { rough: 0.8 }), [0, h / 2, 0], [0.035, h, 0.035]));
  g.add(mesh(kit.sphere, kit.std('#4f9a3a', { rough: 0.8 }), [0.1, h * 0.5, 0], [0.14, 0.03, 0.08], [0, 0, 0.4]));
  const headG = new THREE.Group();
  headG.position.set(0, h, 0);
  headG.rotation.z = -0.35;
  g.add(headG);
  const petal = kit.std('#ffcf1f', { rough: 0.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    headG.add(mesh(kit.sphere, petal, [0.06, Math.sin(a) * 0.2, Math.cos(a) * 0.2], [0.02, 0.1, 0.05], [a, 0, 0]));
  }
  headG.add(mesh(kit.cyl, kit.std('#6b3d1d', { rough: 0.9 }), [0.07, 0, 0], [0.13, 0.05, 0.13], [0, 0, Math.PI / 2]));
  return { obj: g, still: true };
}

export function mushroom(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed + 3);
  const n = 2 + Math.floor(r() * 2);
  const stem = kit.std('#fff7e8', { rough: 0.8 });
  const cap = kit.std('#e53935', { rough: 0.5 });
  const dot = kit.std('#ffffff', { rough: 0.5 });
  const half = kit.geo('half-sphere', () => new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let i = 0; i < n; i++) {
    const s = 0.6 + r() * 0.6;
    const x = (r() - 0.5) * 0.5;
    const z = (r() - 0.5) * 0.5;
    g.add(mesh(kit.cyl8, stem, [x, 0.1 * s, z], [0.05 * s, 0.2 * s, 0.05 * s]));
    g.add(mesh(half, cap, [x, 0.19 * s, z], [0.16 * s, 0.12 * s, 0.16 * s]));
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2;
      g.add(mesh(kit.sphere, dot, [x + Math.cos(a) * 0.09 * s, 0.27 * s, z + Math.sin(a) * 0.09 * s], 0.025 * s));
    }
  }
  return { obj: g, still: true };
}

export function rock(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed * 11 + 1);
  const m = [kit.std('#b3b6c2', { rough: 0.9, flat: true }), kit.std('#c9b7b0', { rough: 0.9, flat: true })];
  g.add(mesh(kit.dodeca, m[0]!, [0, 0.2, 0], [0.45, 0.32, 0.38], [r(), r(), r()]));
  g.add(mesh(kit.dodeca, m[1]!, [0.35, 0.1, 0.2], [0.22, 0.16, 0.2], [r(), r(), r()]));
  return { obj: g, still: true };
}

export function reeds(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed + 77);
  const stalk = kit.std('#5fa83a', { rough: 0.8 });
  const top = kit.std('#7a4a26', { rough: 0.9 });
  for (let i = 0; i < 7; i++) {
    const h = 0.6 + r() * 0.6;
    const x = (r() - 0.5) * 0.5;
    const z = (r() - 0.5) * 0.5;
    const tilt = (r() - 0.5) * 0.25;
    const s = new THREE.Group();
    s.position.set(x, -0.3, z);
    s.rotation.z = tilt;
    s.add(mesh(kit.cyl8, stalk, [0, h / 2, 0], [0.02, h, 0.02]));
    if (i % 2 === 0) s.add(mesh(kit.cyl8, top, [0, h - 0.05, 0], [0.045, 0.18, 0.045]));
    g.add(s);
  }
  return { obj: g, still: true };
}

export function lily(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed + 13);
  const pad = kit.geo('lily-pad', () => new THREE.CircleGeometry(1, 16, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2));
  g.add(mesh(pad, kit.std('#4caf50', { rough: 0.6, side: THREE.DoubleSide }), [0, 0, 0], 0.3, [0, r() * 6, 0]));
  if (r() < 0.6) {
    const f = kit.std('#ff8fb8', { rough: 0.5 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(kit.sphere, f, [Math.cos(a) * 0.05, 0.04, Math.sin(a) * 0.05], [0.05, 0.03, 0.025], [0, -a, 0.5]));
    }
    g.add(mesh(kit.sphere, kit.std(PAL.yellow, { rough: 0.5 }), [0, 0.05, 0], 0.025));
  }
  return { obj: g, still: true };
}

// ---------------------------------------------------------------- farm things

export function scarecrow(kit: Kit): Prop {
  const g = new THREE.Group();
  const stick = kit.std(PAL.woodDark, { rough: 0.9 });
  const straw = kit.std('#f0c75a', { rough: 0.9 });
  g.add(mesh(kit.cyl8, stick, [0, 0.8, 0], [0.05, 1.6, 0.05]));
  g.add(mesh(kit.cyl8, stick, [0, 1.15, 0], [0.04, 1.1, 0.04], [Math.PI / 2, 0, 0]));
  g.add(mesh(kit.rbox, kit.std('#3f7fd6', { rough: 0.8 }), [0, 1.0, 0], [0.3, 0.5, 0.42]));
  g.add(mesh(kit.box, kit.std('#e8463c', { rough: 0.8 }), [0.16, 1.05, 0], [0.02, 0.12, 0.3]));
  g.add(mesh(kit.sphere, kit.std('#e9d3a5', { rough: 0.9 }), [0, 1.42, 0], 0.18));
  g.add(mesh(kit.cyl, straw, [0, 1.56, 0], [0.32, 0.03, 0.32]));
  g.add(mesh(kit.cone, straw, [0, 1.68, 0], [0.18, 0.24, 0.18]));
  g.add(mesh(kit.sphere, kit.std(PAL.black, { rough: 0.5 }), [0.16, 1.45, 0.06], 0.025));
  g.add(mesh(kit.sphere, kit.std(PAL.black, { rough: 0.5 }), [0.16, 1.45, -0.06], 0.025));
  for (const z of [-0.6, 0.6]) g.add(mesh(kit.cone, straw, [0, 1.15, z], [0.07, 0.16, 0.07], [z > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]));
  return { obj: g, still: true };
}

export function sign(kit: Kit, n: number): Prop {
  const g = new THREE.Group();
  const post = kit.std(PAL.woodDark, { rough: 0.9 });
  g.add(mesh(kit.box, post, [0, 0.45, 0], [0.1, 0.9, 0.1]));
  const tex = kit.keep(signTexture(n));
  const face = kit.std('#ffffff', { map: tex, rough: 0.8, tag: `sign${n}` });
  const board = kit.std('#d79a52', { rough: 0.8 });
  g.add(mesh(kit.box, [board, board, board, board, face, board], [0, 0.95, 0.06], [0.75, 0.56, 0.06]));
  return { obj: g, still: true };
}

export function fence(kit: Kit, x0: number, z0: number, x1: number, z1: number): Prop {
  const g = new THREE.Group();
  const white = kit.std('#f7f2e6', { rough: 0.7 });
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  g.rotation.y = yaw;
  g.position.set(x0, 0, z0);
  const n = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * len;
    g.add(mesh(kit.box, white, [x, 0.28, 0], [0.07, 0.56, 0.05]));
    g.add(mesh(kit.cone, white, [x, 0.6, 0], [0.05, 0.08, 0.035], [0, Math.PI / 4, 0]));
  }
  for (const y of [0.18, 0.42]) g.add(mesh(kit.box, white, [len / 2, y, -0.04], [len, 0.06, 0.03]));
  return { obj: g, still: true };
}

export function cart(kit: Kit): Prop {
  const g = new THREE.Group();
  const wood = kit.std(PAL.wood, { map: kit.tex.wood, rough: 0.8 });
  const dark = kit.std(PAL.woodDark, { rough: 0.8 });
  g.add(mesh(kit.box, wood, [0, 0.55, 0], [1.4, 0.12, 0.9]));
  for (const z of [-0.45, 0.45]) g.add(mesh(kit.box, wood, [0, 0.72, z], [1.4, 0.3, 0.06]));
  for (const x of [-0.7, 0.7]) g.add(mesh(kit.box, wood, [x, 0.72, 0], [0.06, 0.3, 0.9]));
  const wheel = kit.geo('wheel', () => new THREE.TorusGeometry(0.3, 0.05, 6, 16));
  for (const z of [-0.5, 0.5]) {
    g.add(mesh(wheel, dark, [0, 0.32, z]));
    g.add(mesh(kit.cyl8, dark, [0, 0.32, z], [0.04, 0.55, 0.04], [Math.PI / 2, 0, 0]));
    g.add(mesh(kit.cyl8, dark, [0, 0.32, z], [0.04, 0.55, 0.04], [Math.PI / 2, 0, Math.PI / 2]));
  }
  g.add(mesh(kit.cyl8, dark, [1.05, 0.5, 0.25], [0.035, 0.8, 0.035], [0, 0, Math.PI / 2 - 0.25]));
  g.add(mesh(kit.cyl8, dark, [1.05, 0.5, -0.25], [0.035, 0.8, 0.035], [0, 0, Math.PI / 2 - 0.25]));
  g.add(mesh(kit.sphere, kit.std(PAL.hay, { map: kit.tex.hay, rough: 0.95 }), [0, 0.8, 0], [0.65, 0.3, 0.42]));
  return { obj: g, still: true };
}

export function well(kit: Kit): Prop {
  const g = new THREE.Group();
  const stone = kit.std('#b8b4ae', { rough: 0.9, flat: true });
  const ring = kit.geo('well-ring', () => new THREE.CylinderGeometry(0.5, 0.55, 0.55, 10, 1, true));
  g.add(mesh(ring, kit.std('#b8b4ae', { rough: 0.9, flat: true, side: THREE.DoubleSide }), [0, 0.28, 0]));
  g.add(mesh(kit.geo('well-top', () => new THREE.TorusGeometry(0.5, 0.08, 6, 12).rotateX(Math.PI / 2)), stone, [0, 0.56, 0]));
  g.add(mesh(kit.cyl, kit.std('#2f6f9a', { rough: 0.2 }), [0, 0.35, 0], [0.46, 0.02, 0.46]));
  const wood = kit.std(PAL.woodDark, { rough: 0.9 });
  for (const x of [-0.5, 0.5]) g.add(mesh(kit.box, wood, [x, 0.85, 0], [0.08, 1.2, 0.08]));
  g.add(mesh(kit.cyl8, wood, [0, 1.15, 0], [0.05, 1.1, 0.05], [0, 0, Math.PI / 2]));
  const roof = kit.std('#c0392b', { rough: 0.7 });
  g.add(mesh(kit.box, roof, [0, 1.52, 0.22], [1.3, 0.06, 0.62], [0.65, 0, 0]));
  g.add(mesh(kit.box, roof, [0, 1.52, -0.22], [1.3, 0.06, 0.62], [-0.65, 0, 0]));
  g.add(mesh(kit.cyl, kit.std('#8d6e63', { rough: 0.7 }), [0.12, 0.85, 0], [0.09, 0.16, 0.09]));
  return { obj: g, still: true };
}

export function trough(kit: Kit): Prop {
  const g = new THREE.Group();
  const wood = kit.std(PAL.wood, { map: kit.tex.wood, rough: 0.8 });
  g.add(mesh(kit.box, wood, [0, 0.3, 0], [1.4, 0.5, 0.6]));
  g.add(mesh(kit.box, kit.std('#4fc3f7', { rough: 0.15 }), [0, 0.53, 0], [1.25, 0.04, 0.45]));
  for (const x of [-0.6, 0.6]) g.add(mesh(kit.box, kit.std(PAL.woodDark, { rough: 0.9 }), [x, 0.05, 0], [0.12, 0.1, 0.7]));
  return { obj: g, still: true };
}

export function balloons(kit: Kit, seed: number): Prop {
  const g = new THREE.Group();
  const r = rng(seed + 5);
  const cols = ['#ff4f7b', '#ffd23f', '#4fc3ff', '#9b7bff', '#5fdc6a'];
  const string = kit.std('#ffffff', { rough: 0.6 });
  g.add(mesh(kit.cyl8, kit.std(PAL.woodDark, { rough: 0.9 }), [0, 0.12, 0], [0.04, 0.24, 0.04]));
  const bs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const a = (i / 3) * Math.PI * 2 + r();
    const h = 1.6 + r() * 0.5;
    b.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    b.add(mesh(kit.cyl8, string, [0, h / 2, 0], [0.008, h, 0.008]));
    b.add(mesh(kit.sphere, kit.std(cols[(i + seed) % cols.length]!, { rough: 0.25 }), [0, h + 0.28, 0], [0.24, 0.3, 0.24]));
    b.add(mesh(kit.cone, kit.std(cols[(i + seed) % cols.length]!, { rough: 0.25 }), [0, h - 0.02, 0], [0.04, 0.06, 0.04]));
    g.add(b);
    bs.push(b);
  }
  const off = r() * 10;
  return {
    obj: g,
    anim: (t) => {
      bs.forEach((b, i) => {
        b.rotation.z = Math.sin(t * 1.1 + off + i * 2) * 0.08;
        b.rotation.x = Math.cos(t * 0.9 + off + i) * 0.08;
      });
    },
  };
}

export function bunting(kit: Kit, x0: number, z0: number, x1: number, z1: number, seed: number): Prop {
  const g = new THREE.Group();
  const wood = kit.std('#f7f2e6', { rough: 0.7 });
  const h = 1.9;
  for (const [x, z] of [
    [x0, z0],
    [x1, z1],
  ] as const) {
    g.add(mesh(kit.cyl8, wood, [x, h / 2, z], [0.05, h, 0.05]));
    g.add(mesh(kit.sphere, kit.std('#ff4f7b', { rough: 0.4 }), [x, h + 0.06, z], 0.08));
  }
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(4, Math.round(len / 0.45));
  const cols = ['#ff4f7b', '#ffd23f', '#4fc3ff', '#5fdc6a', '#ff8f2a', '#b388ff'];
  const tri = kit.geo('bunting-flag', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.14, 0);
    s.lineTo(0.14, 0);
    s.lineTo(0, -0.3);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  });
  const flags: THREE.Mesh[] = [];
  const line: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const sag = Math.sin(f * Math.PI) * 0.35;
    line.push(new THREE.Vector3(x0 + (x1 - x0) * f, h - 0.05 - sag, z0 + (z1 - z0) * f));
  }
  const curve = new THREE.CatmullRomCurve3(line);
  const tube = new THREE.TubeGeometry(curve, n * 3, 0.012, 4, false);
  const tubeMesh = new THREE.Mesh(tube, kit.std('#ffffff', { rough: 0.6 }));
  g.add(tubeMesh);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 1; i < n; i++) {
    const p = line[i]!;
    const m = mesh(tri, kit.std(cols[(i + seed) % cols.length]!, { rough: 0.6, side: THREE.DoubleSide }), [p.x, p.y, p.z], 1, [0, yaw, 0]);
    g.add(m);
    flags.push(m);
  }
  return {
    obj: g,
    anim: (t) => {
      flags.forEach((f, i) => {
        f.rotation.x = Math.sin(t * 2.5 + i * 0.7) * 0.25;
      });
    },
  };
}
