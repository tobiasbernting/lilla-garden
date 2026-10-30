// Scenery for the courses beyond the farm: pines and birches in the forest, snowy pines and snowmen
// by the frozen lake, palms, beach huts and a lighthouse by the sea, and the city's blocks with lit
// windows, street lamps and neon signs. Also the extra fence kinds, the city tunnel, rain and snow.
// Same style as models.ts: low-poly vertex-coloured geometry, instanced in tiles.
import * as THREE from 'three';
import type { CourseDef, ScenerySet } from './courses.ts';
import { Geo, blobTex, canvasTex, mat } from './geo.ts';
import { forest, lakeDist, streamDist } from './layout.ts';
import * as M from './models.ts';
import type { Scenery } from './scenery.ts';
import type { Terrain } from './terrain.ts';
import { FenceX, type Track } from './track.ts';
import { clamp, rng } from './util.ts';

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

/** The extra fence kinds (5..9), each `len` long along x, standing on y = 0. `lenOnly` skips the geometry. */
export function themeFencePiece(kind: number, lenOnly = false): { geo: THREE.BufferGeometry; len: number } {
  const lens: Record<number, number> = { [FenceX.Snow]: 2.6, [FenceX.Tyres]: 1.9, [FenceX.Rope]: 3.0, [FenceX.Logs]: 3.2, [FenceX.Barrier]: 3.0 };
  const len = lens[kind] ?? 3;
  if (lenOnly) return { geo: null as unknown as THREE.BufferGeometry, len };
  const g = new Geo();
  const r = rng(kind * 17 + 3);
  if (kind === FenceX.Snow) {
    // a ploughed snow bank with a red-white marker pole
    for (let k = 0; k < 3; k++) g.ball(0.75 + r() * 0.2, k % 2 ? '#f4f8fc' : '#e6eef7', -0.9 + k * 0.9, 0.25, 0, 1.0, 0.6, 0.9);
    g.cyl(0.04, 0.04, 1.6, 4, '#e8412c', 0.2, 0.8, 0.3);
    g.cyl(0.045, 0.045, 0.3, 4, '#ffffff', 0.2, 1.2, 0.3);
  } else if (kind === FenceX.Tyres) {
    // a stack of old tyres, a painted band on every other one
    for (const x of [-0.48, 0.48])
      for (let k = 0; k < 3; k++) g.cyl(0.45, 0.45, 0.3, 10, k === 1 ? (x < 0 ? '#e8412c' : '#f2f2f2') : '#1c1c20', x, 0.15 + k * 0.3, 0);
  } else if (kind === FenceX.Rope) {
    // a weathered post and a sagging rope
    g.cyl(0.08, 0.1, 1.1, 5, '#9a7a56', -len / 2, 0.55, 0);
    for (let k = 0; k < 4; k++) {
      const x0 = -len / 2 + (k * len) / 4;
      const sag = Math.sin(((k + 0.5) / 4) * Math.PI) * 0.22;
      g.box(len / 4 + 0.05, 0.05, 0.05, '#e6d8b0', x0 + len / 8, 0.95 - sag, 0);
    }
  } else if (kind === FenceX.Logs) {
    // a pile of logs at the forest edge
    for (let k = 0; k < 3; k++) g.cyl(0.24, 0.24, len, 7, k === 1 ? '#7a5a3a' : '#6a4c30', 0, 0.24, -0.25 + k * 0.25, 0, 0, Math.PI / 2);
    for (let k = 0; k < 2; k++) g.cyl(0.23, 0.23, len - 0.2, 7, '#80603e', 0, 0.62, -0.13 + k * 0.25, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) g.cyl(0.2, 0.2, 0.04, 7, '#d8b88a', (sx * len) / 2, 0.24, 0, 0, 0, Math.PI / 2);
  } else {
    // a concrete barrier with red and white blocks on top
    g.prism(
      [
        [-0.32, 0, len / 2],
        [0.32, 0, len / 2],
        [0.12, 0.3, len / 2],
        [0.1, 0.85, len / 2],
        [-0.1, 0.85, len / 2],
        [-0.12, 0.3, len / 2],
      ],
      '#b8b6b0',
      mat(0, 0, 0, 0, Math.PI / 2, 0),
    );
    g.box(len / 2, 0.14, 0.22, '#e8412c', -len / 4, 0.9, 0);
    g.box(len / 2, 0.14, 0.22, '#f4f4f0', len / 4, 0.9, 0);
  }
  return { geo: g.build(), len };
}

// ---------------------------------------------------------------------------
// The city tunnel
// ---------------------------------------------------------------------------

/** Walls, a roof and two portals over the tunnel samples, or null when the course has none. */
export function tunnelGeo(t: Track): THREE.BufferGeometry | null {
  const n = t.n;
  if (!t.tunnel.some((v) => v)) return null;
  const g = new Geo();
  const H = 6.4;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!t.tunnel[i] || !t.tunnel[j]) continue;
    for (const sgn of [1, -1]) {
      const a = t.point(i * t.ds, sgn * (t.hw[i]! + 1.6));
      const b = t.point(j * t.ds, sgn * (t.hw[j]! + 1.6));
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.06;
      const hd = Math.atan2(b.x - a.x, b.z - a.z);
      g.box(0.8, H, len, '#6c6a70', (a.x + b.x) / 2, (a.y + b.y) / 2 + H / 2 - 0.3, (a.z + b.z) / 2, 0, hd, 0);
      // a warm light strip along the wall
      if (i % 3 === 0) g.box(0.1, 0.18, len * 2.2, '#ffd27a', (a.x + b.x) / 2 - sgn * 0.45 * Math.cos(hd), (a.y + b.y) / 2 + 4.6, (a.z + b.z) / 2 + sgn * 0.45 * Math.sin(hd), 0, hd, 0);
    }
    const c = t.point((i + 0.5) * t.ds, 0);
    g.box((t.hw[i]! + 2.4) * 2, 0.7, t.ds + 0.06, '#57555c', c.x, c.y + H + 0.05, c.z, 0, t.heading(i * t.ds), 0);
    // grass on top
    g.box((t.hw[i]! + 2.4) * 2, 0.3, t.ds + 0.06, '#4c6a3a', c.x, c.y + H + 0.55, c.z, 0, t.heading(i * t.ds), 0);
  }
  // portals: a frame with yellow-black chevrons over each end
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const start = t.tunnel[i] && !t.tunnel[prev];
    const end = !t.tunnel[i] && t.tunnel[prev];
    if (!start && !end) continue;
    const c = t.point(i * t.ds, 0);
    const hd = t.heading(i * t.ds);
    const w = (t.hw[i]! + 2.4) * 2;
    g.box(w + 1.2, 1.6, 1.0, '#7a7880', c.x, c.y + H + 0.3, c.z, 0, hd, 0);
    for (let k = 0; k < 8; k++) g.box(w / 8 - 0.1, 0.5, 1.05, k % 2 ? '#1c1c20' : '#f4c20d', c.x + Math.cos(hd) * (-w / 2 + (k + 0.5) * (w / 8)), c.y + H - 0.25, c.z - Math.sin(hd) * (-w / 2 + (k + 0.5) * (w / 8)), 0, hd, 0);
  }
  return g.build();
}

// ---------------------------------------------------------------------------
// Low-poly props
// ---------------------------------------------------------------------------

/** A pine with snow on its branches. */
function snowPine(big: boolean): THREE.BufferGeometry {
  const g = new Geo();
  const k = big ? 1 : 0.8;
  g.cyl(0.16 * k, 0.28 * k, 2.4 * k, 6, '#5a3f2b', 0, 1.2 * k, 0);
  for (const [r, h, y, c] of [
    [2.4, 3.4, 3.3, '#2c4f38'],
    [1.9, 3.0, 5.1, '#32583f'],
    [1.2, 2.6, 6.9, '#3a6446'],
  ] as const) {
    g.cone(r * k, h * k, 7, c, 0, y * k, 0);
    g.cone(r * k * 0.86, h * k * 0.42, 7, '#f2f6fb', 0, (y + h * 0.33) * k, 0, 0.3);
  }
  g.cone(0.5 * k, 0.8 * k, 6, '#f6f9fc', 0, 8.3 * k, 0);
  return g.build();
}

/** A palm: a leaning, segmented trunk and drooping fronds. */
function palm(seed: number): THREE.BufferGeometry {
  const g = new Geo();
  const r = rng(seed);
  const lean = 0.18 + r() * 0.12;
  let x = 0;
  let y = 0;
  const segs = 7;
  for (let k = 0; k < segs; k++) {
    const h = 1.15;
    const a = lean * (k / segs) * 1.6;
    g.cyl(0.2 - k * 0.012, 0.26 - k * 0.012, h, 6, k % 2 ? '#8a6a44' : '#9a7a50', x + Math.sin(a) * h * 0.5, y + h * 0.5, 0, 0, 0, -a);
    x += Math.sin(a) * h;
    y += Math.cos(a) * h * 0.98;
  }
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2 + r() * 0.3;
    const len = 3.2 + r() * 0.8;
    const fx = x + Math.cos(ang) * len * 0.45;
    const fz = Math.sin(ang) * len * 0.45;
    g.add(new THREE.BoxGeometry(len, 0.06, 0.7), k % 2 ? '#3f8a3a' : '#4f9a40', mat(fx, y - 0.35, fz, 0, -ang, -0.42));
  }
  g.ball(0.35, '#6a4a2a', x, y - 0.1, 0);
  return g.build();
}

/** A striped beach hut with a pitched roof; door facing +z. */
function beachHut(color: string): THREE.BufferGeometry {
  const g = new Geo();
  g.box(3.2, 0.3, 3.2, '#a88a62', 0, 0.15, 0);
  for (let k = 0; k < 6; k++) g.box(0.53, 2.6, 2.8, k % 2 ? '#f4f4f0' : color, -1.33 + k * 0.53, 1.6, 0);
  g.prism(
    [
      [-1.7, 2.9, 1.75],
      [1.7, 2.9, 1.75],
      [0, 4.0, 1.75],
    ],
    '#f4f4f0',
  );
  g.box(3.6, 0.12, 2.0, color, 0, 3.47, -0.82, 0.58, 0, 0);
  g.box(3.6, 0.12, 2.0, color, 0, 3.47, 0.82, -0.58, 0, 0);
  g.box(1.0, 1.8, 0.1, '#7a5a3a', 0, 1.2, 1.42);
  return g.build();
}

/** The lighthouse: a white tower with red bands and a lantern room on top. */
function lighthouse(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(3.4, 3.8, 1.2, 10, '#8a8780', 0, 0.6, 0);
  const H = 18;
  for (let k = 0; k < 6; k++) {
    const r0 = 2.6 - (k / 6) * 1.0;
    const r1 = 2.6 - ((k + 1) / 6) * 1.0;
    g.cyl(r1, r0, H / 6, 10, k % 2 ? '#d6352b' : '#f4f2ec', 0, 1.2 + (k + 0.5) * (H / 6), 0);
  }
  g.cyl(2.2, 2.2, 0.3, 10, '#2e3036', 0, 1.2 + H + 0.15, 0);
  g.cyl(1.25, 1.25, 1.8, 8, '#fff2b0', 0, 1.2 + H + 1.2, 0);
  g.cone(1.6, 1.4, 8, '#d6352b', 0, 1.2 + H + 2.8, 0);
  return g.build();
}

/** A beach umbrella in two colours. */
function umbrella(a: string, b: string): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.04, 0.04, 2.3, 4, '#f4f4f0', 0, 1.15, 0, 0.12, 0, 0);
  for (let k = 0; k < 8; k++) g.add(new THREE.ConeGeometry(1.4, 0.55, 3, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? a : b, mat(0.16, 2.35, 0, 0.12, 0, 0));
  return g.build();
}

/** A snowman with a carrot nose, a hat and a scarf. */
function snowman(): THREE.BufferGeometry {
  const g = new Geo();
  g.sphere(0.8, '#f6f9fc', 0, 0.7, 0, 1, 0.9, 1);
  g.sphere(0.58, '#f2f6fb', 0, 1.75, 0);
  g.sphere(0.42, '#f6f9fc', 0, 2.55, 0);
  g.cone(0.08, 0.45, 5, '#ff7a1a', 0, 2.55, 0.55);
  g.add(new THREE.ConeGeometry(0.08, 0.45, 5), '#ff7a1a', mat(0, 2.55, 0.6, Math.PI / 2, 0, 0));
  g.cyl(0.3, 0.32, 0.45, 8, '#1c1c20', 0, 3.05, 0);
  g.cyl(0.45, 0.45, 0.05, 8, '#1c1c20', 0, 2.84, 0);
  g.cyl(0.45, 0.45, 0.18, 8, '#e8412c', 0, 2.2, 0);
  for (const sx of [-1, 1]) g.box(0.07, 0.07, 0.05, '#1c1c20', sx * 0.15, 2.68, 0.38);
  return g.build();
}

/** A little red ice-fishing tent. */
function fishTent(): THREE.BufferGeometry {
  const g = new Geo();
  g.cone(1.3, 2.2, 4, '#c8402c', 0, 1.1, 0, Math.PI / 4);
  g.box(0.6, 0.9, 0.05, '#2a1c14', 0, 0.45, 0.62);
  return g.build();
}

/** A hunting tower on stilts (jakttorn). */
function huntTower(): THREE.BufferGeometry {
  const g = new Geo();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.18, 6, 0.18, '#6a5440', sx * 0.9, 3, sz * 0.9);
  g.box(2.4, 1.4, 2.4, '#7a6048', 0, 6.7, 0);
  g.box(2.0, 0.5, 0.1, '#2a2420', 0, 6.9, 1.22);
  g.cone(2.0, 1.0, 4, '#4a3c30', 0, 7.9, 0, Math.PI / 4);
  for (let k = 0; k < 7; k++) g.box(0.9, 0.08, 0.12, '#6a5440', 0, 0.6 + k * 0.85, 1.3);
  return g.build();
}

/** A charcoal stack (kolmila): a smoking turf cone. */
function charcoalStack(): THREE.BufferGeometry {
  const g = new Geo();
  g.cone(4.2, 3.4, 9, '#4a4030', 0, 1.7, 0);
  g.cone(3.6, 2.6, 9, '#3a3326', 0, 2.1, 0, 0.3);
  return g.build();
}

/** A fly agaric (flugsvamp). */
function mushroom(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.08, 0.1, 0.35, 5, '#f4f0e6', 0, 0.17, 0);
  g.sphere(0.24, '#d6352b', 0, 0.38, 0, 1, 0.55, 1, 7, 4);
  for (let k = 0; k < 4; k++) g.box(0.05, 0.03, 0.05, '#ffffff', Math.cos(k * 1.7) * 0.12, 0.49, Math.sin(k * 1.7) * 0.12);
  return g.build();
}

/** A street lamp: a dark post and an arm over the road (+z), the lamp at (0, 6.3, 1.5). */
function streetLamp(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.1, 0.14, 6.4, 6, '#2e3036', 0, 3.2, 0);
  g.box(0.1, 0.1, 1.7, '#2e3036', 0, 6.35, 0.8);
  g.box(0.45, 0.16, 0.6, '#3a3c42', 0, 6.3, 1.5);
  g.box(0.36, 0.05, 0.5, '#fff1c4', 0, 6.2, 1.5);
  return g.build();
}

/** A park bench. */
function bench(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(1.8, 0.08, 0.5, '#8a5a32', 0, 0.48, 0);
  g.box(1.8, 0.4, 0.06, '#8a5a32', 0, 0.75, -0.24, -0.15, 0, 0);
  for (const sx of [-1, 1]) g.box(0.08, 0.48, 0.5, '#2e3036', sx * 0.8, 0.24, 0);
  return g.build();
}

// ---------------------------------------------------------------------------
// City blocks with window textures
// ---------------------------------------------------------------------------

function windowTex(lit: boolean): THREE.CanvasTexture {
  return canvasTex(
    128,
    128,
    (g, w, h) => {
      const r = rng(lit ? 41 : 43);
      g.fillStyle = lit ? '#000000' : '#ffffff';
      g.fillRect(0, 0, w, h);
      // 4 × 4 windows per tile (one tile = 12 m × 12 m)
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const on = r() < 0.55;
          if (lit) {
            if (!on) continue;
            const warm = r();
            g.fillStyle = warm < 0.6 ? '#ffd890' : warm < 0.85 ? '#fff4d8' : '#9ad8ff';
          } else g.fillStyle = '#3a4258';
          g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20);
        }
    },
    true,
  );
}

const NEON = ['BIO', 'PIZZA', 'GODIS', 'DISCO', 'KAFÉ', 'HOTELL', 'GLASS', 'SPEL', 'SUSHI', 'TACO', 'BAR', 'RALLY'];
const NEON_COLS = ['#ff3fa4', '#3ff0ff', '#ffe23f', '#7dff5a', '#ff7a2a', '#b46bff'];

function neonTex(text: string, color: string): THREE.CanvasTexture {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = 'rgba(10,8,20,0.85)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.font = '900 58px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 3);
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

// ---------------------------------------------------------------------------
// The scenery builder
// ---------------------------------------------------------------------------

const WIND_PATCH = `#include <begin_vertex>
  float hh = max(position.y - 1.8, 0.0);
  #ifdef USE_INSTANCING
  vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  #else
  vec2 wp = vec2(0.0);
  #endif
  float sw = sin(uTime * 1.3 + wp.x * 0.07 + wp.y * 0.05) * 0.6 + sin(uTime * 2.1 + wp.x * 0.13) * 0.25;
  transformed.x += sw * hh * hh * 0.005;
  transformed.z += sw * hh * hh * 0.0035;`;

/** Tree kinds per scenery set: near (4), mid (3), far (2). */
function treeKinds(set: ScenerySet): THREE.BufferGeometry[] {
  const midPine = new Geo().cone(2.3, 7.6, 5, '#2f5b33', 0, 4.4, 0).cyl(0.15, 0.25, 1.6, 4, '#4a3526', 0, 0.8, 0).build();
  const midBirch = new Geo().ball(1.9, '#80ad48', 0, 5.6, 0, 1, 1.2, 1).cyl(0.1, 0.15, 4.6, 4, '#e6e2d8', 0, 2.3, 0).build();
  const midOak = new Geo().ball(2.8, '#507f33', 0, 5.0, 0, 1.15, 0.9, 1.1).cyl(0.25, 0.38, 3.2, 4, '#4a3526', 0, 1.6, 0).build();
  const farPine = new Geo().cone(2.6, 9, 5, '#2f5b33', 0, 4.5, 0).build();
  const farRound = new Geo().ball(3.0, '#5a8a3c', 0, 4.6, 0, 1, 1.1, 1).build();
  if (set === 'ice') {
    const midSnow = new Geo().cone(2.3, 7.6, 5, '#34583f', 0, 4.4, 0).cone(1.9, 3.0, 5, '#eef3f8', 0, 6.0, 0, 0.3).cyl(0.15, 0.25, 1.6, 4, '#4a3526', 0, 0.8, 0).build();
    const farSnow = new Geo().cone(2.6, 9, 5, '#9fb2c0', 0, 4.5, 0).build();
    const snowBush = new Geo().ball(1.0, '#f2f6fb', 0, 0.5, 0, 1.3, 0.7, 1.1).build();
    midBirch.dispose();
    midOak.dispose();
    farRound.dispose();
    farPine.dispose();
    midPine.dispose();
    return [snowPine(true), snowPine(false), snowPine(true), snowBush, midSnow, midSnow.clone(), midSnow.clone(), farSnow, farSnow.clone()];
  }
  if (set === 'beach') {
    const midPalm = palm(7);
    const roseBush = new Geo().ball(0.9, '#4f8a3a', 0, 0.55, 0, 1.3, 0.8, 1.1).ball(0.15, '#ff6aa8', 0.5, 0.95, 0.3).ball(0.15, '#ff6aa8', -0.4, 0.9, -0.3).build();
    const grass = new Geo();
    for (let k = 0; k < 4; k++) grass.add(new THREE.ConeGeometry(0.2, 0.9, 3, 1, true), '#9aa85a', mat(0.15 * Math.cos(k * 1.6), 0.45, 0.15 * Math.sin(k * 1.6), 0.25, k * 1.6, 0.2));
    midPine.dispose();
    midBirch.dispose();
    farPine.dispose();
    return [palm(1), palm(2), roseBush, grass.build(), midPalm, palm(9), midOak, farRound, farRound.clone()];
  }
  return [M.pine(), M.birch(), M.oak(), M.bush(), midPine, midBirch, midOak, farPine, farRound];
}

export function buildThemeScenery(track: Track, terrain: Terrain, course: CourseDef, quality: 'high' | 'low', timeU: { value: number }, lit: boolean): Scenery {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const high = quality === 'high';
  const set = course.theme.scenery;
  const L = course.layout;
  const r = rng(20261031 + set.length * 97);
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const sceneryMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const treeMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND_PATCH);
  };
  const cx = (track.minX + track.maxX) / 2;
  const cz = (track.minZ + track.maxZ) / 2;
  const wallAt = (x: number, z: number): number => {
    const p = track.project(x, z, -1, { i: 0, u: 0, s: 0, d: 0 });
    return p.d > 0 ? track.at(track.wallL, p.s) : track.at(track.wallR, p.s);
  };

  // ---- footprints that keep the trees away ----
  const footprints: [number, number, number][] = [];
  const blocked = (x: number, z: number, clear: number): boolean => {
    if (terrain.roadDist(x, z) < clear) return true;
    if (lakeDist(x, z, L) < 1.08) return true;
    if (streamDist(x, z, L).d < 6.5) return true;
    for (const [bx, bz, br] of footprints) if ((x - bx) ** 2 + (z - bz) ** 2 < br * br) return true;
    return false;
  };
  const stat = new Geo();
  const statAt = (geo: THREE.BufferGeometry, x: number, z: number, rot: number, foot: number, sink = 0.2): void => {
    let y = Infinity;
    for (const [dx, dz] of [
      [0, 0],
      [foot * 0.6, 0],
      [-foot * 0.6, 0],
      [0, foot * 0.6],
      [0, -foot * 0.6],
    ] as const)
      y = Math.min(y, terrain.visual(x + dx, z + dz));
    stat.addColored(geo, mat(x, y - sink, z, 0, rot, 0));
    footprints.push([x, z, foot]);
  };
  /** A spot `off` metres outside the fence at arc length s on side sgn, facing the road. */
  const roadside = (s: number, sgn: number, off: number): { x: number; z: number; rot: number } => {
    const wall = track.at(sgn > 0 ? track.wallL : track.wallR, s);
    const p = track.point(s, sgn * (wall + off));
    const c = track.point(s, 0);
    return { x: p.x, z: p.z, rot: Math.atan2(c.x - p.x, c.z - p.z) };
  };
  const startCrowd: THREE.Vector3[] = [new THREE.Vector3(track.px[0]!, track.py[0]!, track.pz[0]!)];

  // ---- the set's own landmarks ----
  const lampSpots: { x: number; y: number; z: number; rot: number }[] = [];
  const neonSpots: { x: number; y: number; z: number; rot: number; w: number }[] = [];
  let beam: THREE.Mesh | null = null;
  let smoke: { x: number; y: number; z: number } | null = null;
  if (set === 'forest') {
    // the charcoal stack in the hairpin and a hunting tower by the jump
    let maxK = 0;
    let hairS = 0;
    for (let i = 0; i < track.n; i++)
      if (Math.abs(track.curv[i]!) > maxK) {
        maxK = Math.abs(track.curv[i]!);
        hairS = i * track.ds;
      }
    const inside = track.curv[track.index(hairS)]! > 0 ? 1 : -1;
    const ks = roadside(hairS, inside, 9);
    if (!blocked(ks.x, ks.z, 10)) {
      statAt(keep(charcoalStack()), ks.x, ks.z, 0, 6, 0.3);
      smoke = { x: ks.x, y: terrain.visual(ks.x, ks.z) + 3.5, z: ks.z };
    }
    let topS = 0;
    let topY = -Infinity;
    for (let i = 0; i < track.n; i++)
      if (track.py[i]! > topY) {
        topY = track.py[i]!;
        topS = i * track.ds;
      }
    const ht = roadside(topS + 12, -1, 7);
    statAt(keep(huntTower()), ht.x, ht.z, ht.rot, 3);
    const shroom = keep(mushroom());
    for (let k = 0; k < 60; k++) {
      const s = r() * track.length;
      const p = roadside(s, r() < 0.5 ? 1 : -1, 1.5 + r() * 6);
      if (terrain.roadDist(p.x, p.z) < track.at(track.hw, s) + 2) continue;
      stat.addColored(shroom.clone(), mat(p.x, terrain.visual(p.x, p.z) - 0.02, p.z, 0, r() * 6, 0, 1.2, 1.2, 1.2));
    }
  } else if (set === 'ice') {
    const sm = keep(snowman());
    for (let k = 0; k < 14; k++) {
      const s = (k / 14) * track.length + r() * 30;
      const p = roadside(s, r() < 0.5 ? 1 : -1, 3 + r() * 5);
      if (blocked(p.x, p.z, track.at(track.hw, s) + 2.5)) continue;
      statAt(sm.clone(), p.x, p.z, p.rot, 1.5, 0.1);
    }
    if (L.lake) {
      const tent = keep(fishTent());
      for (let k = 0; k < 9; k++) {
        const a = r() * Math.PI * 2;
        const rr = 0.3 + r() * 0.55;
        const x = L.lake.cx + Math.cos(a) * L.lake.rx * rr;
        const z = L.lake.cz + Math.sin(a) * L.lake.rz * rr;
        if (terrain.roadDist(x, z) < 24) continue;
        stat.addColored(tent.clone(), mat(x, L.waterY - 0.04, z, 0, r() * 6, 0));
      }
    }
    for (const [s, sgn] of [
      [track.length * 0.32, 1],
      [track.length * 0.72, -1],
    ] as const) {
      const p = roadside(s, sgn, 16);
      if (!blocked(p.x, p.z, 14)) statAt(M.cottage(31 + sgn, 7, 5.5, 3.2, '#f2f6fb'), p.x, p.z, p.rot, 8);
    }
  } else if (set === 'beach') {
    // the lighthouse on the point, beach huts and umbrellas along the sand
    if (L.lake) {
      const lx = track.minX + 30;
      const lz = L.lake.cz + L.lake.rz + 6;
      statAt(keep(lighthouse()), lx, lz, 0, 6, 0.3);
      const beamGeo = keep(new THREE.ConeGeometry(4, 60, 12, 1, true));
      beamGeo.translate(0, -30, 0);
      beamGeo.rotateZ(Math.PI / 2);
      const beamMat = keep(new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(lx, terrain.visual(lx, lz) + 20.4, lz);
      group.add(beam);
    }
    const hutCols = ['#2f6fe0', '#e8412c', '#f4c20d', '#2fa84f', '#f06ba8', '#18b7c9'];
    for (let k = 0; k < 16; k++) {
      const x = track.minX - 20 + ((track.maxX - track.minX + 40) * (k + 0.3 + r() * 0.4)) / 16;
      const z = L.lake ? L.lake.cz + L.lake.rz + 58 + r() * 14 : 0;
      if (blocked(x, z, 16)) continue;
      statAt(beachHut(hutCols[k % hutCols.length]!), x, z, Math.PI + (r() - 0.5) * 0.3, 3);
    }
    for (let k = 0; k < 22; k++) {
      const x = track.minX + (track.maxX - track.minX) * r();
      const z = L.lake ? L.lake.cz + L.lake.rz + 2 + r() * 6 : 0;
      if (terrain.roadDist(x, z) < 12) continue;
      statAt(umbrella(hutCols[k % hutCols.length]!, '#f4f4f0'), x, z, r() * 6, 1.2, 0.1);
    }
  } else if (set === 'city') {
    // blocks along the road with lit windows, a lamp every 34 m on alternate sides, neon on the fronts
    const blocks: { x: number; z: number; w: number; d: number; h: number; rot: number; tint: THREE.Color }[] = [];
    const tints = ['#8a8a94', '#a08a78', '#7a8698', '#9a9088', '#6e7480', '#b0a490'];
    const side = [1, -1];
    for (let s = 0; s < track.length; s += 26 + r() * 8) {
      for (const sgn of side) {
        if (r() < 0.12) continue;
        const i = track.index(s);
        if (track.tunnel[i]) continue;
        const w = 14 + r() * 12;
        const d = 12 + r() * 10;
        const h = 10 + r() * (r() < 0.25 ? 34 : 16);
        const p = roadside(s, sgn, 3 + d / 2 + r() * 4);
        const rad = Math.hypot(w, d) / 2;
        if (terrain.roadDist(p.x, p.z) < rad + track.at(track.hw, s) + 2) continue;
        if (blocks.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < (Math.hypot(b.w, b.d) / 2 + rad) * 0.8)) continue;
        blocks.push({ x: p.x, z: p.z, w, d, h, rot: p.rot, tint: new THREE.Color(tints[Math.floor(r() * tints.length)]!) });
        footprints.push([p.x, p.z, rad]);
        if (r() < 0.45) neonSpots.push({ x: p.x + Math.sin(p.rot) * (d / 2 + 0.15), y: 0, z: p.z + Math.cos(p.rot) * (d / 2 + 0.15), rot: p.rot, w: Math.min(8, w * 0.5) });
      }
    }
    // far towers on the skyline
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2;
      const rr = 420 + r() * 380;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const w = 20 + r() * 25;
      blocks.push({ x, z, w, d: w * (0.7 + r() * 0.6), h: 25 + r() * 70, rot: r() * 3, tint: new THREE.Color(tints[Math.floor(r() * tints.length)]!).multiplyScalar(0.8) });
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const nor: number[] = [];
    const colr: number[] = [];
    const TILE = 12;
    for (const b of blocks) {
      const y0 = Math.min(terrain.visual(b.x, b.z), terrain.visual(b.x + b.w / 2, b.z), terrain.visual(b.x - b.w / 2, b.z)) - 0.5;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const P = (u: number, v: number, y: number): [number, number, number] => [b.x + u * c + v * s, y, b.z - u * s + v * c];
      const corners: [number, number][] = [
        [-b.w / 2, -b.d / 2],
        [b.w / 2, -b.d / 2],
        [b.w / 2, b.d / 2],
        [-b.w / 2, b.d / 2],
      ];
      for (let k = 0; k < 4; k++) {
        const [u0, v0] = corners[k]!;
        const [u1, v1] = corners[(k + 1) % 4]!;
        const a = P(u0, v0, y0);
        const bb = P(u1, v1, y0);
        const ct = P(u1, v1, y0 + b.h);
        const d = P(u0, v0, y0 + b.h);
        const len = Math.hypot(u1 - u0, v1 - v0) / TILE;
        const hh = b.h / TILE;
        const nx = bb[2] - a[2];
        const nz = -(bb[0] - a[0]);
        const nl = Math.hypot(nx, nz) || 1;
        // outward normal: away from the block's middle
        const mx = (a[0] + bb[0]) / 2 - b.x;
        const mz = (a[2] + bb[2]) / 2 - b.z;
        const sg = nx * mx + nz * mz > 0 ? 1 : -1;
        const tri = sg > 0 ? [a, bb, ct, a, ct, d] : [a, ct, bb, a, d, ct];
        const tuv = sg > 0 ? [0, 0, len, 0, len, hh, 0, 0, len, hh, 0, hh] : [0, 0, len, hh, len, 0, 0, 0, 0, hh, len, hh];
        for (const p of tri) pos.push(...p);
        uv.push(...tuv);
        for (let q = 0; q < 6; q++) {
          nor.push((sg * nx) / nl, 0, (sg * nz) / nl);
          colr.push(b.tint.r, b.tint.g, b.tint.b);
        }
      }
      // the flat roof (no windows: uv in the wall band between rows)
      const r0 = corners.map(([u, v]) => P(u, v, y0 + b.h));
      for (const p of [r0[0]!, r0[2]!, r0[1]!, r0[0]!, r0[3]!, r0[2]!]) pos.push(...p);
      for (let q = 0; q < 6; q++) {
        uv.push(0.01, 0.01);
        nor.push(0, 1, 0);
        colr.push(b.tint.r * 0.6, b.tint.g * 0.6, b.tint.b * 0.6);
      }
    }
    if (pos.length) {
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      geo.computeBoundingSphere();
      const wt = keep(windowTex(false));
      const lt = keep(windowTex(true));
      const bm = keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: wt, emissiveMap: lt, emissive: new THREE.Color(lit ? '#ffffff' : '#000000'), emissiveIntensity: lit ? 0.9 : 0 }));
      const mesh = new THREE.Mesh(geo, bm);
      mesh.receiveShadow = high;
      mesh.castShadow = high;
      group.add(mesh);
    }
    for (let s = 6; s < track.length; s += 34) {
      const sgn = Math.floor(s / 34) % 2 ? 1 : -1;
      const p = roadside(s, sgn, 0.6);
      lampSpots.push({ x: p.x, y: terrain.visual(p.x, p.z) - 0.05, z: p.z, rot: p.rot });
    }
    const benchGeo = keep(bench());
    for (let k = 0; k < 24; k++) {
      const s = r() * track.length;
      const p = roadside(s, r() < 0.5 ? 1 : -1, 1.6);
      if (blocked(p.x, p.z, track.at(track.hw, s) + 1)) continue;
      stat.addColored(benchGeo.clone(), mat(p.x, terrain.visual(p.x, p.z), p.z, 0, p.rot, 0));
    }
  }

  // ---- trees, in tiles so the far ones can be skipped (the farm's scheme, the set's kinds) ----
  const kinds = treeKinds(set).map(keep);
  const tiles = new Map<string, { kind: number; m: THREE.Matrix4; c: THREE.Color }[]>();
  const addTree = (kind: number, x: number, z: number, s: number): void => {
    const y = terrain.visual(x, z) - 0.1;
    const lod = kind < 4 ? 0 : kind < 7 ? 1 : 2;
    const tile = [200, 420, 800][lod]!;
    const key = `${lod}:${Math.floor(x / tile)},${Math.floor(z / tile)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    const v = 0.82 + r() * 0.3;
    list.push({ kind, m: mat(x, y, z, 0, r() * Math.PI * 2, 0, s, s * (0.9 + r() * 0.25), s), c: new THREE.Color(v, v * (0.95 + r() * 0.1), v * (0.9 + r() * 0.1)) });
  };
  const roadFar = (x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < track.n; i += 4) {
      const d = (track.px[i]! - x) ** 2 + (track.pz[i]! - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const clearance = set === 'forest' ? 3.2 : set === 'city' ? 6 : 5;
  const nearD = high ? 115 : 85;
  const nearR = 560;
  const cell = high ? 6.4 : 9.5;
  for (let x = cx - nearR; x < cx + nearR; x += cell)
    for (let z = cz - nearR; z < cz + nearR; z += cell) {
      const px = x + r() * cell;
      const pz = z + r() * cell;
      if (Math.hypot(px - cx, pz - cz) > nearR) continue;
      const fo = forest(px, pz, L);
      const lone = set === 'city' ? 0.002 : 0.006;
      if (r() > fo.d * 0.8 + lone) continue;
      const rd = terrain.roadDist(px, pz);
      if (rd < 60 && rd < wallAt(px, pz) + clearance) continue;
      if (blocked(px, pz, 8)) continue;
      let kind: number;
      if (fo.d < 0.08) kind = r() < 0.45 ? 2 : r() < 0.7 ? 1 : 0;
      else if (fo.d < 0.45 && r() < 0.22) kind = 3;
      else kind = r() < fo.birch ? 1 : 0;
      const s = kind === 3 ? 0.8 + r() * 0.6 : 0.85 + r() * 0.5;
      if (roadFar(px, pz) > nearD) {
        if (kind === 3) continue;
        kind += 4;
      }
      addTree(kind, px, pz, s);
    }
  const farCell = high ? 25 : 40;
  for (let x = cx - 1500; x < cx + 1500; x += farCell)
    for (let z = cz - 1500; z < cz + 1500; z += farCell) {
      const px = x + r() * farCell;
      const pz = z + r() * farCell;
      const rr = Math.hypot(px - cx, pz - cz);
      if (rr < nearR || rr > 1500) continue;
      const fo = forest(px, pz, L);
      if (r() > fo.d * 0.9) continue;
      if (lakeDist(px, pz, L) < 1.05) continue;
      addTree(r() < 0.6 ? 7 : 8, px, pz, 1.1 + r() * 0.8);
    }
  for (const list of tiles.values()) {
    for (let kind = 0; kind < kinds.length; kind++) {
      const items = list.filter((t) => t.kind === kind);
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(kinds[kind]!, treeMat, items.length);
      items.forEach((t, i) => {
        im.setMatrixAt(i, t.m);
        im.setColorAt(i, t.c);
      });
      im.computeBoundingSphere();
      im.castShadow = high && kind < 4;
      group.add(im);
    }
  }

  // ---- rocks ----
  const rockGeo = keep(M.rock());
  if (set === 'ice') {
    const c = rockGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < c.count; i++) if (i % 3 === 0 || r() < 0.4) c.setXYZ(i, 0.93, 0.95, 0.98);
  }
  const rocks: THREE.Matrix4[] = [];
  for (let k = 0; k < 160 && rocks.length < (high ? 60 : 30); k++) {
    const x = cx + (r() - 0.5) * 900;
    const z = cz + (r() - 0.5) * 760;
    if (blocked(x, z, 24) || set === 'city') continue;
    const s = 0.6 + r() * 1.6;
    rocks.push(mat(x, terrain.visual(x, z) - 0.2 * s, z, 0, r() * 6, 0, s, s * (0.7 + r() * 0.5), s));
  }
  if (rocks.length) {
    const im = new THREE.InstancedMesh(rockGeo, sceneryMat, rocks.length);
    rocks.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.castShadow = high;
    group.add(im);
  }

  // ---- street lamps: posts, glowing heads, pools of light on the road ----
  let lampHeads: THREE.Points | null = null;
  if (lampSpots.length) {
    const lampGeo = keep(streetLamp());
    const im = new THREE.InstancedMesh(lampGeo, sceneryMat, lampSpots.length);
    const heads: number[] = [];
    const pools: THREE.Matrix4[] = [];
    lampSpots.forEach((l, i) => {
      im.setMatrixAt(i, mat(l.x, l.y, l.z, 0, l.rot, 0));
      const hx = l.x + Math.sin(l.rot) * 1.5;
      const hz = l.z + Math.cos(l.rot) * 1.5;
      heads.push(hx, l.y + 6.15, hz);
      const gx = l.x + Math.sin(l.rot) * 3.5;
      const gz = l.z + Math.cos(l.rot) * 3.5;
      const p = track.project(gx, gz, -1, { i: 0, u: 0, s: 0, d: 0 });
      const gy = Math.abs(p.d) < track.at(track.hw, p.s) + 0.3 ? track.roadY(p) : terrain.visual(gx, gz);
      pools.push(mat(gx, gy + 0.06, gz, 0, 0, 0, 13, 1, 13));
    });
    im.computeBoundingSphere();
    group.add(im);
    if (lit) {
      const glowTex = keep(blobTex(64, 0.08));
      const hg = keep(new THREE.BufferGeometry());
      hg.setAttribute('position', new THREE.Float32BufferAttribute(heads, 3));
      const hm = keep(new THREE.PointsMaterial({ map: glowTex, color: '#ffd890', size: 3.2, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      lampHeads = new THREE.Points(hg, hm);
      group.add(lampHeads);
      const poolGeo = keep(new THREE.PlaneGeometry(1, 1));
      poolGeo.rotateX(-Math.PI / 2);
      const poolMat = keep(new THREE.MeshBasicMaterial({ map: glowTex, color: '#7a5a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
      const pm = new THREE.InstancedMesh(poolGeo, poolMat, pools.length);
      pools.forEach((m, i) => pm.setMatrixAt(i, m));
      pm.computeBoundingSphere();
      pm.renderOrder = 1;
      group.add(pm);
    }
  }

  // ---- neon signs ----
  const neons: THREE.MeshBasicMaterial[] = [];
  neonSpots.slice(0, high ? 18 : 10).forEach((n, k) => {
    const tex = keep(neonTex(NEON[k % NEON.length]!, NEON_COLS[k % NEON_COLS.length]!));
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const g = keep(new THREE.PlaneGeometry(n.w, n.w * (96 / 256)));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(n.x, terrain.visual(n.x, n.z) + 5 + (k % 3) * 1.5, n.z);
    mesh.rotation.y = n.rot;
    group.add(mesh);
    neons.push(m);
  });

  // ---- the crowd at the start ----
  const person = M.person();
  keep(person.shirt);
  keep(person.rest);
  const fans: { x: number; y: number; z: number; rot: number; phase: number }[] = [];
  const shirts = ['#e8412c', '#2f6fe0', '#f4c20d', '#2fa84f', '#ff8a1f', '#8a4fd8', '#f06ba8', '#ffffff', '#18b7c9', '#006aa7'];
  const rowN = high ? 40 : 20;
  for (let k = 0; k < rowN; k++) {
    const s = -60 + (120 * k) / rowN + (r() - 0.5) * 1.2;
    if (Math.abs(s) < 4.5) continue;
    const sgn = k % 3 === 0 ? 1 : -1;
    const p = roadside(s, sgn, 1.4 + (k % 2) * 1.5 + r() * 0.4);
    if (terrain.roadDist(p.x, p.z) < track.at(track.hw, s) + 1) continue;
    fans.push({ x: p.x, y: terrain.visual(p.x, p.z), z: p.z, rot: p.rot + (r() - 0.5) * 0.5, phase: r() * 10 });
  }
  const fanShirt = new THREE.InstancedMesh(person.shirt, sceneryMat, Math.max(1, fans.length));
  const fanRest = new THREE.InstancedMesh(person.rest, sceneryMat, Math.max(1, fans.length));
  fanShirt.count = fanRest.count = fans.length;
  const skin = new THREE.Color('#f2cfb0').lerp(new THREE.Color(1, 1, 1), 0.55);
  fans.forEach((_, i) => {
    fanShirt.setColorAt(i, new THREE.Color(shirts[Math.floor(r() * shirts.length)]!));
    fanRest.setColorAt(i, skin);
  });
  fanShirt.frustumCulled = false;
  fanRest.frustumCulled = false;
  group.add(fanShirt, fanRest);

  // the merged landmarks
  if (!stat.empty) {
    const statGeo = keep(stat.build());
    const statMesh = new THREE.Mesh(statGeo, sceneryMat);
    statMesh.castShadow = high;
    statMesh.receiveShadow = high;
    group.add(statMesh);
  }

  // a smoking charcoal stack: a few soft puffs drawn as one Points cloud
  let smokePts: THREE.Points | null = null;
  const smokeN = 18;
  if (smoke) {
    const sg = keep(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(smokeN * 3), 3));
    const st = keep(blobTex(64, 0.2));
    const sm = keep(new THREE.PointsMaterial({ map: st, color: '#8a8478', size: 5, transparent: true, opacity: 0.35, depthWrite: false }));
    smokePts = new THREE.Points(sg, sm);
    smokePts.frustumCulled = false;
    group.add(smokePts);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    group,
    crowds: startCrowd,
    update(time, focus, cheer) {
      const near0 = clamp(1 - (focus.distanceTo(startCrowd[0]!) - 30) / 80, 0, 1);
      fans.forEach((f, i) => {
        const ex = Math.max(cheer, near0);
        const ph = time * (5 + ex * 4) + f.phase;
        const hop = Math.max(0, Math.sin(ph)) * (0.06 + ex * 0.42);
        const sway = Math.sin(ph * 0.5) * (0.05 + ex * 0.18);
        m4.compose(v.set(f.x, f.y + hop, f.z), q.setFromEuler(e.set(0, f.rot, sway)), one);
        fanShirt.setMatrixAt(i, m4);
        fanRest.setMatrixAt(i, m4);
      });
      fanShirt.instanceMatrix.needsUpdate = true;
      fanRest.instanceMatrix.needsUpdate = true;
      if (beam) beam.rotation.y = time * 0.6;
      for (let k = 0; k < neons.length; k++) {
        // one sign in five flickers now and then
        const fl = k % 5 === 2 && Math.sin(time * 13 + k) > 0.92 ? 0.35 : 1;
        neons[k]!.color.setScalar(fl);
      }
      if (smokePts && smoke) {
        const a = smokePts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < smokeN; k++) {
          const t = (time * 0.12 + k / smokeN) % 1;
          a.setXYZ(k, smoke.x + Math.sin(k * 2.3 + time * 0.3) * (0.5 + t * 3), smoke.y + t * 14, smoke.z + Math.cos(k * 1.7) * (0.5 + t * 3));
        }
        a.needsUpdate = true;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const o of group.children) if (o instanceof THREE.InstancedMesh) o.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Weather: rain streaks and snowflakes in a box that follows the camera
// ---------------------------------------------------------------------------

export class Weather {
  readonly object: THREE.LineSegments | THREE.Points;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;
  private readonly n: number;
  private readonly box = 44;
  private readonly mat: THREE.Material;
  private readonly tex: THREE.Texture | null = null;

  constructor(
    private kind: 'rain' | 'snow',
    quality: 'high' | 'low',
  ) {
    const n = (this.n = kind === 'rain' ? (quality === 'high' ? 1400 : 600) : quality === 'high' ? 1600 : 700);
    const geo = new THREE.BufferGeometry();
    const r = rng(kind === 'rain' ? 5 : 6);
    this.seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.seed[i] = r();
    if (kind === 'rain') {
      this.pos = new Float32Array(n * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.mat = new THREE.LineBasicMaterial({ color: '#c8d4e4', transparent: true, opacity: 0.38, depthWrite: false });
      this.object = new THREE.LineSegments(geo, this.mat);
    } else {
      this.pos = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.tex = blobTex(32, 0.3);
      this.mat = new THREE.PointsMaterial({ map: this.tex, color: '#ffffff', size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
      this.object = new THREE.Points(geo, this.mat);
    }
    this.object.frustumCulled = false;
    this.object.renderOrder = 6;
  }

  update(time: number, cam: THREE.Vector3): void {
    const B = this.box;
    const wrap = (v: number, c: number): number => c - B / 2 + ((((v - c + B / 2) % B) + B) % B);
    const P = this.pos;
    for (let i = 0; i < this.n; i++) {
      const sx = this.seed[i * 3]!;
      const sy = this.seed[i * 3 + 1]!;
      const sz = this.seed[i * 3 + 2]!;
      if (this.kind === 'rain') {
        const y = wrap(sy * B - time * 24, cam.y);
        const x = wrap(sx * B + time * 2, cam.x);
        const z = wrap(sz * B, cam.z);
        P[i * 6] = x;
        P[i * 6 + 1] = y;
        P[i * 6 + 2] = z;
        P[i * 6 + 3] = x - 0.08;
        P[i * 6 + 4] = y + 0.9;
        P[i * 6 + 5] = z;
      } else {
        const y = wrap(sy * B - time * 1.6, cam.y);
        P[i * 3] = wrap(sx * B + Math.sin(time * 0.7 + sy * 20) * 1.2 + time * 0.8, cam.x);
        P[i * 3 + 1] = y;
        P[i * 3 + 2] = wrap(sz * B + Math.cos(time * 0.5 + sx * 20) * 1.2, cam.z);
      }
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.mat.dispose();
    this.tex?.dispose();
  }
}
