// The winter village at blue hour: snowy hills, the arena with snow forts, pines, red cottages with
// warm windows and string lights, a frozen pond and snow lanterns. Also the collision shapes the
// snowballs, the player and the snowmen use, and the cover spots the snowmen hide behind.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fluffy, snowGround } from './materials.ts';
import { MOON_DIR } from './sky.ts';
import { boardsTexture, glowTexture } from './textures.ts';
import { clamp, fbm, rng, smoothstep } from './util.ts';

// ---------------------------------------------------------------- layout

/** Where the player may walk (behind their own rampart). */
export const PLAYER_ZONE = { x0: -12.4, x1: 12.4, z0: 8.7, z1: 19.6 };
/** Where the snowmen roam. */
export const ENEMY_ZONE = { x0: -14.5, x1: 14.5, z0: -23, z1: 1.2 };
export const PLAYER_START = new THREE.Vector3(0, 0, 13.5);

const POND = { x: -8.6, z: 1.8, rx: 5.6, rz: 3.3 };

interface WallDef {
  x: number;
  z: number;
  len: number;
  h: number;
  thick?: number;
  rot?: number;
  crenel?: boolean;
  enemy?: boolean;
}
const WALLS: WallDef[] = [
  // the player's own low rampart
  { x: -8.6, z: 7.9, len: 7.4, h: 0.62, thick: 0.9 },
  { x: 0, z: 7.6, len: 4.6, h: 0.62, thick: 0.9 },
  { x: 8.6, z: 7.9, len: 7.4, h: 0.62, thick: 0.9 },
  // the snowmen's cover, near to far
  { x: 5.2, z: -0.4, len: 4.8, h: 1.65, rot: -0.12, enemy: true },
  { x: -3.6, z: -4.4, len: 4.6, h: 1.65, rot: 0.1, enemy: true },
  { x: 7.6, z: -8.6, len: 4.4, h: 1.65, rot: -0.05, enemy: true },
  { x: -10.2, z: -9.6, len: 4.4, h: 1.65, rot: 0.18, enemy: true },
  { x: 0.6, z: -12.6, len: 6.4, h: 1.75, crenel: true, enemy: true },
  { x: -6.6, z: -18.6, len: 5, h: 1.65, rot: 0.08, enemy: true },
  { x: 9.4, z: -19.2, len: 5, h: 1.65, rot: -0.1, enemy: true },
  // the Snow King's castle wall
  { x: 0, z: -29.5, len: 15, h: 2.5, thick: 1.3, crenel: true },
];
const TOWERS: { x: number; z: number; r: number; h: number; flag?: number }[] = [
  { x: -6.6, z: 13.2, r: 0.95, h: 2.3 },
  { x: 6.6, z: 13.2, r: 0.95, h: 2.3 },
  { x: -8.9, z: -29.5, r: 1.7, h: 4.1, flag: 0xe8412c },
  { x: 8.9, z: -29.5, r: 1.7, h: 4.1, flag: 0x5fb7ff },
];

// ---------------------------------------------------------------- terrain

const AX0 = -19;
const AX1 = 19;
const AZ0 = -36;
const AZ1 = 24;

export function heightAt(x: number, z: number): number {
  const dx = Math.max(AX0 - x, 0, x - AX1);
  const dz = Math.max(AZ0 - z, 0, z - AZ1);
  const d = Math.sqrt(dx * dx + dz * dz);
  let h = 0.14 * Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.19 + 0.4) + 0.07 * Math.sin(x * 0.61 - z * 0.37);
  if (d > 0) {
    const rise = smoothstep(0, 60, d);
    h += rise * (fbm(x * 0.012 + 3.7, z * 0.012 - 1.2) * 38 - 9) + d * 0.09 * rise;
    // the village sits on a gentle slope behind the castle
    if (z < AZ0) h += (AZ0 - z) * 0.09 * smoothstep(0, 30, AZ0 - z);
  }
  // the player's yard is a low rise, so the whole battlefield is in view
  h += 1.15 * smoothstep(3.6, 8.4, z) * (1 - smoothstep(17, 26, Math.abs(x)));
  // the frozen pond: a flat hollow with a little snowbank round it
  const q = ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;
  if (q < 2.2) {
    const pondY = -0.14;
    h = h + (pondY - h) * (1 - smoothstep(0.92, 1.12, q));
    h += 0.22 * Math.exp(-((q - 1.32) ** 2) / 0.03);
  }
  return h;
}

export function pondContains(x: number, z: number): boolean {
  return ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2 < 0.95;
}

export function groundNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.3;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

// ---------------------------------------------------------------- collision shapes

export interface Box {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  c: number;
  s: number;
  kind: 'wall' | 'house';
  enemy: boolean;
}
export interface Cyl {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}
export interface Tree {
  x: number;
  z: number;
  y0: number;
  trunkR: number;
  r: number;
  fy0: number;
  fy1: number;
  /** For the snow puff when hit. */
  index: number;
}

export interface Cover {
  x: number;
  z: number;
  len: number;
  h: number;
  c: number;
  s: number;
  /** Spots behind the wall (away from the player). */
  hide: THREE.Vector2[];
  /** Spots just past each end of the wall, to step out and throw from. */
  peek: THREE.Vector2[];
  taken: number[];
}

export type HitKind = 'ground' | 'wall' | 'tree' | 'house' | 'ice';
export interface WorldHit {
  kind: HitKind;
  normal: THREE.Vector3;
  tree?: Tree;
}

// ---------------------------------------------------------------- building helpers

type Parts = Map<string, THREE.BufferGeometry[]>;
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

function addPart(parts: Parts, key: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation = 0xffffff): void {
  const g = geo.clone();
  if (!g.index) {
    const n = g.attributes.position!.count;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
  }
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  let list = parts.get(key);
  if (!list) parts.set(key, (list = []));
  list.push(g);
}

/** A triangle prism face pair for a gable end (in the y-z plane, facing ±x). */
function gableGeometry(d: number, ridge: number): THREE.BufferGeometry {
  const hd = d / 2;
  const pos = new Float32Array([
    // facing +x
    0, 0, hd, 0, 0, -hd, 0, ridge, 0,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 0.6]), 2));
  g.setIndex([0, 1, 2]);
  return g;
}

// shared unit shapes
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RBOX = new RoundedBoxGeometry(1, 1, 1, 1, 0.1);
const SPHERE = new THREE.SphereGeometry(1, 10, 7);
const LUMPY = new THREE.IcosahedronGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);

// ---------------------------------------------------------------- the world

export interface World {
  group: THREE.Group;
  boxes: Box[];
  cyls: Cyl[];
  trees: Tree[];
  covers: Cover[];
  /** Chimney tops, for smoke. */
  chimneys: THREE.Vector3[];
  /** Where the snow lanterns' flames are. */
  lanterns: THREE.Vector3[];
  /** The castle's centre, for the Snow King. */
  castle: THREE.Vector3;
  hitTest(p: THREE.Vector3, r: number, enemyBall: boolean): WorldHit | null;
  /** Distance to the first thing along the ray (terrain, walls, houses). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): number;
  /** Keep a walker of radius r out of walls, towers, trunks and houses. */
  push(p: THREE.Vector3, r: number, feetY: number): void;
  /** Is the straight line between two points blocked by a wall (for the snowmen deciding to peek)? */
  blocked(a: THREE.Vector3, b: THREE.Vector3): boolean;
  update(t: number): void;
  /** The camera position (for the ice reflections) and the pixel scale of a metre at 1 m (for the glows). */
  setView(cam: THREE.Vector3, scale: number): void;
  /** The top of a tree's foliage (where the snow puffs off when it is hit). */
  treeTop(tr: Tree): THREE.Vector3;
}

export function createWorld(low: boolean, shadows: boolean): World {
  const group = new THREE.Group();
  group.name = 'world';
  const r = rng(1234);
  const boxes: Box[] = [];
  const cyls: Cyl[] = [];
  const trees: Tree[] = [];
  const covers: Cover[] = [];
  const chimneys: THREE.Vector3[] = [];
  const lanterns: THREE.Vector3[] = [];
  const parts: Parts = new Map();
  const windowGlows: { p: THREE.Vector3; c: THREE.Color; s: number }[] = [];
  const pools: { x: number; z: number; r: number; c: number; a: number }[] = [];
  const bulbs: { p: THREE.Vector3; c: THREE.Color }[] = [];
  const wires: THREE.Vector3[][] = [];

  // ---- terrain (denser near the arena) ----
  const seg = low ? 120 : 180;
  const tg = new THREE.PlaneGeometry(2, 2, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position as THREE.BufferAttribute;
  const tcol = new Float32Array(tp.count * 3);
  const warp = (s: number): number => Math.sign(s) * (95 * Math.abs(s) + 245 * Math.abs(s) ** 3);
  const cTint = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = warp(tp.getX(i));
    const z = warp(tp.getZ(i)) - 6;
    const y = heightAt(x, z);
    tp.setXYZ(i, x, y, z);
    // soft colour drift: lavender hollows, a blush of pink on open snow
    const n = fbm(x * 0.05, z * 0.05, 3);
    const far = smoothstep(30, 140, Math.hypot(x, z + 6));
    cTint.setRGB(0.93 + n * 0.07, 0.93 + n * 0.04 - far * 0.02, 1.0);
    if (n < 0.42) cTint.lerp(new THREE.Color(0.86, 0.88, 1.0), (0.42 - n) * 1.5);
    tcol.set([cTint.r, cTint.g, cTint.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tg.computeVertexNormals();
  const groundMat = snowGround();
  const terrain = new THREE.Mesh(tg, groundMat);
  terrain.receiveShadow = shadows;
  terrain.name = 'terrain';
  group.add(terrain);

  // ---- the frozen pond ----
  const ice = new THREE.Mesh(
    new THREE.CircleGeometry(1, 56),
    new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uMoon: { value: MOON_DIR.clone() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vL;
        void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCam; uniform vec3 uMoon; uniform float uTime;
        varying vec3 vW; varying vec2 vL;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
        float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec3 V = normalize(uCam - vW);
          vec3 R = reflect(-V, vec3(0.0,1.0,0.0));
          float e = clamp(R.y, 0.0, 1.0);
          vec3 sky = mix(vec3(0.90,0.66,0.82), vec3(0.42,0.48,0.82), smoothstep(0.02, 0.45, e));
          vec3 ice = vec3(0.42, 0.60, 0.86);
          float fres = pow(1.0 - max(V.y, 0.0), 2.0);
          vec3 col = mix(ice, sky, 0.25 + 0.55 * fres);
          float m = max(dot(R, uMoon), 0.0);
          col += vec3(1.0, 0.93, 0.85) * (pow(m, 260.0) * 0.9 + pow(m, 24.0) * 0.12);
          // dusted snow and skate marks
          float n = vnoise(vW.xz * 1.3) * 0.6 + vnoise(vW.xz * 4.1) * 0.4;
          col = mix(col, vec3(0.92, 0.93, 1.0), smoothstep(0.6, 0.9, n) * 0.4);
          vec2 p = vW.xz;
          float sk = smoothstep(0.035, 0.0, abs(length(p - vec2(-9.4, 2.4)) - 2.1)) + smoothstep(0.03, 0.0, abs(length(p - vec2(-7.2, 1.2)) - 1.4));
          sk += smoothstep(0.03, 0.0, abs(length(p - vec2(-10.8, 1.0)) - 2.8)) * step(p.x, -9.5);
          col = mix(col, vec3(0.97, 0.97, 1.0), clamp(sk, 0.0, 1.0) * 0.6);
          float rr = length(vL);
          col = mix(col, vec3(0.93, 0.94, 1.0), smoothstep(0.8, 1.0, rr));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  ice.rotation.x = -Math.PI / 2;
  ice.scale.set(POND.rx * 1.02, POND.rz * 1.02, 1);
  ice.position.set(POND.x, -0.11, POND.z);
  ice.renderOrder = 1;
  group.add(ice);

  // ---- walls and forts: hand-stacked snow blocks ----
  const blockMats: THREE.Matrix4[] = [];
  const lumpMats: THREE.Matrix4[] = [];
  for (const w of WALLS) {
    const thick = w.thick ?? 0.8;
    const rot = w.rot ?? 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const base = heightAt(w.x, w.z) - 0.12;
    const rows = Math.max(1, Math.round(w.h / 0.5));
    const rowH = w.h / rows;
    const nb = Math.max(2, Math.round(w.len / 0.86));
    const bl = w.len / nb;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? bl / 2 : 0;
      for (let i = 0; i < nb + (row % 2 ? 1 : 0); i++) {
        let lx = -w.len / 2 + bl / 2 + i * bl - off;
        let len = bl;
        // trim the staggered row's ends so the wall stays square
        if (lx - len / 2 < -w.len / 2) {
          const cut = -w.len / 2 - (lx - len / 2);
          len -= cut;
          lx += cut / 2;
        }
        if (lx + len / 2 > w.len / 2) {
          const cut = lx + len / 2 - w.len / 2;
          len -= cut;
          lx -= cut / 2;
        }
        if (len < 0.15) continue;
        const y = base + rowH * (row + 0.5);
        const wx = w.x + lx * c;
        const wz = w.z - lx * s;
        blockMats.push(mat(wx, y, wz, (r() - 0.5) * 0.09, rot + (r() - 0.5) * 0.1, (r() - 0.5) * 0.09, len * 0.98, rowH * 0.97, thick * (0.92 + r() * 0.1)));
      }
    }
    // a soft blanket of snow along the top ties the blocks together
    blockMats.push(mat(w.x, base + w.h + 0.02, w.z, (r() - 0.5) * 0.04, rot, (r() - 0.5) * 0.03, w.len + 0.16, 0.24, thick + 0.14));
    if (w.crenel) {
      for (let i = 0; i < nb; i += 2) {
        const lx = -w.len / 2 + bl / 2 + i * bl;
        const wx = w.x + lx * c;
        const wz = w.z - lx * s;
        blockMats.push(mat(wx, base + w.h + 0.3, wz, 0, rot + (r() - 0.5) * 0.12, 0, bl * 0.8, 0.44, thick * 0.86));
      }
    }
    // drifts piled against the foot of the wall
    for (let i = 0; i < Math.ceil(w.len / 0.9); i++) {
      for (const side of [-1, 1]) {
        const lx = -w.len / 2 + (i + r()) * 0.9;
        const lz = side * (thick / 2 + 0.05);
        const wx = w.x + lx * c + lz * s;
        const wz = w.z - lx * s + lz * c;
        lumpMats.push(mat(wx, heightAt(wx, wz) - 0.05, wz, 0, r() * 3, 0, 0.5 + r() * 0.35, 0.28 + r() * 0.16, 0.45 + r() * 0.3));
      }
    }
    boxes.push({ cx: w.x, cz: w.z, hx: w.len / 2 + 0.05, hz: thick / 2 + 0.1, y0: base - 1, y1: base + w.h + (w.crenel ? 0.4 : 0.12), c, s, kind: 'wall', enemy: !!w.enemy });
    if (w.enemy) {
      // behind = away from the player (towards -z in the wall's frame)
      const hide: THREE.Vector2[] = [];
      for (const k of w.len > 5 ? [-0.3, 0.3] : [-0.18, 0.18]) {
        const lx = k * w.len;
        const lz = -(thick / 2 + 0.85);
        hide.push(new THREE.Vector2(w.x + lx * c + lz * s, w.z - lx * s + lz * c));
      }
      const peek: THREE.Vector2[] = [];
      for (const side of [-1, 1]) {
        const lx = side * (w.len / 2 + 0.95);
        const lz = -0.15;
        peek.push(new THREE.Vector2(w.x + lx * c + lz * s, w.z - lx * s + lz * c));
      }
      covers.push({ x: w.x, z: w.z, len: w.len, h: w.h, c, s, hide, peek, taken: hide.map(() => -1) });
    }
  }
  const snowMat = fluffy(0xf6f8ff, 0xd9e0ff, 0.32, { emissive: 0x1a1a2e });
  const blocks = new THREE.InstancedMesh(RBOX, snowMat, blockMats.length);
  blockMats.forEach((m, i) => blocks.setMatrixAt(i, m));
  blocks.castShadow = shadows;
  blocks.receiveShadow = shadows;
  group.add(blocks);

  // ---- towers ----
  const towerParts: Parts = new Map();
  for (const t of TOWERS) {
    const base = heightAt(t.x, t.z) - 0.15;
    addPart(towerParts, 'snow', new THREE.CylinderGeometry(t.r, t.r * 1.1, t.h, 18, 3), mat(t.x, base + t.h / 2, t.z));
    const n = Math.round(t.r * 4.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      addPart(towerParts, 'snow', RBOX, mat(t.x + Math.cos(a) * t.r * 0.8, base + t.h + 0.2, t.z + Math.sin(a) * t.r * 0.8, 0, -a, 0, 0.5, 0.42, t.r * 0.5));
    }
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const x = t.x + Math.cos(a) * t.r * 1.05;
      const z = t.z + Math.sin(a) * t.r * 1.05;
      lumpMats.push(mat(x, heightAt(x, z) - 0.05, z, 0, a, 0, 0.55, 0.3, 0.5));
    }
    cyls.push({ x: t.x, z: t.z, r: t.r + 0.05, y0: base - 1, y1: base + t.h + 0.3 });
    if (t.flag !== undefined) {
      addPart(towerParts, 'pole', CYL, mat(t.x, base + t.h + 1.2, t.z, 0, 0, 0, 0.05, 2.4, 0.05), 0x5a4636);
      const flag = new THREE.BufferGeometry();
      flag.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.7, 0, 1.4, -0.35, 0]), 3));
      flag.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      flag.setIndex([0, 1, 2, 0, 2, 1]);
      addPart(towerParts, 'flag', flag, mat(t.x, base + t.h + 2.35, t.z, 0, 0.4, 0), t.flag);
    }
  }

  // ---- pines (instanced; snow-laden tiers) ----
  const pineGeo = buildPine(r);
  const pinePos: { x: number; z: number; s: number; ry: number }[] = [];
  const edgeTrees: [number, number, number][] = [
    [-16.2, -4, 1.2],
    [16.4, -7.5, 1.35],
    [-15.6, -19, 1.25],
    [15.8, -24.5, 1.4],
    [-17.2, 11, 1.3],
    [17.4, 16, 1.2],
    [-18.6, 19.5, 1.5],
    [18.8, 4, 1.1],
    [-14.2, -28.5, 1.15],
    [13.6, -30.8, 1.3],
  ];
  for (const [x, z, s] of edgeTrees) pinePos.push({ x, z, s, ry: r() * 6 });
  const nPines = low ? 90 : 170;
  let guard = 0;
  while (pinePos.length < nPines && guard++ < 6000) {
    const a = r() * Math.PI * 2;
    const rad = 22 + Math.pow(r(), 1.4) * 150;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad - 6;
    if (x > -19.5 && x < 19.5 && z > -33 && z < 24) continue;
    if (fbm(x * 0.03 + 9, z * 0.03, 2) < 0.43 && r() < 0.75) continue;
    if (HOUSES.some((h) => Math.hypot(h[0] - x, h[1] - z) < 8.5)) continue;
    if (Math.hypot(x - CHURCH[0], z - CHURCH[1]) < 11) continue;
    // keep the view to the moon a little open
    if (z < -36 && Math.abs(x + 10) < 10 && rad < 70) continue;
    pinePos.push({ x, z, s: 0.8 + r() * 1.3, ry: r() * 6 });
  }
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), pinePos.length);
  const pc = new THREE.Color();
  pinePos.forEach((p, i) => {
    const y = heightAt(p.x, p.z) - 0.2;
    pines.setMatrixAt(i, mat(p.x, y, p.z, 0, p.ry, 0, p.s, p.s * (0.9 + r() * 0.25), p.s));
    pc.setHSL(0, 0, 0.88 + r() * 0.12);
    pines.setColorAt(i, pc);
    trees.push({ x: p.x, z: p.z, y0: y, trunkR: 0.22 * p.s, r: 1.55 * p.s, fy0: y + 0.7 * p.s, fy1: y + 4.6 * p.s, index: i });
  });
  pines.castShadow = shadows;
  pines.receiveShadow = false;
  group.add(pines);

  // ---- cottages, the church, poles and lights ----
  for (const [x, z, ry, s, ochre] of HOUSES) {
    const isNear = Math.hypot(x, z + 6) < 48;
    buildCottage(parts, x, z, ry, s, !!ochre, r, chimneys, windowGlows, pools, bulbs, wires, isNear, boxes);
  }
  buildChurch(parts, CHURCH[0], CHURCH[1], CHURCH[2], windowGlows);

  // string lights round the player's yard and along the castle
  const yardPoles: [number, number][] = [
    [-13.4, 8.6],
    [-13.4, 14.2],
    [-13.4, 19.8],
    [13.4, 8.6],
    [13.4, 14.2],
    [13.4, 19.8],
  ];
  const poleTop = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, heightAt(x, z) + 2.7, z);
  for (const [x, z] of yardPoles) {
    const y = heightAt(x, z);
    addPart(parts, 'dark', CYL, mat(x, y + 1.35, z, 0, 0, 0, 0.07, 2.8, 0.07), 0x5b4433);
    addPart(parts, 'snow', SPHERE, mat(x, y + 2.78, z, 0, 0, 0, 0.11, 0.07, 0.11));
  }
  for (const side of [0, 3]) {
    for (let i = 0; i < 2; i++) {
      const a = yardPoles[side + i]!;
      const b = yardPoles[side + i + 1]!;
      garland(poleTop(a[0], a[1]), poleTop(b[0], b[1]), 0.55, 0.42, bulbs, wires, r);
    }
  }
  const castleTop = heightAt(0, -29.5) + 2.5 + 0.9;
  garland(new THREE.Vector3(-8.9, castleTop + 1.3, -29.1), new THREE.Vector3(0, castleTop + 0.6, -28.8), 0.9, 0.5, bulbs, wires, r);
  garland(new THREE.Vector3(0, castleTop + 0.6, -28.8), new THREE.Vector3(8.9, castleTop + 1.3, -29.1), 0.9, 0.5, bulbs, wires, r);
  addPart(parts, 'dark', CYL, mat(0, castleTop - 0.2, -28.9, 0, 0, 0, 0.06, 1.8, 0.06), 0x5b4433);

  // ---- snow lanterns (snölyktor): little cones of snowballs with a candle inside ----
  const lanternSpots: [number, number][] = [
    [-11.6, 9.3],
    [11.6, 9.3],
    [-3.1, 27.4],
    [3.1, 27.4],
    [-15.2, 3.4],
    [-2.6, 4.6],
    [-4.6, -27.6],
    [4.6, -27.6],
  ];
  const ballMats: THREE.Matrix4[] = [];
  for (const [x, z] of lanternSpots) {
    const y = heightAt(x, z) - 0.04;
    const rings: [number, number][] = [
      [8, 0.36],
      [7, 0.29],
      [6, 0.22],
      [4, 0.15],
      [3, 0.08],
    ];
    rings.forEach(([n, rad], li) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + li * 0.4;
        ballMats.push(mat(x + Math.cos(a) * rad, y + 0.11 + li * 0.17, z + Math.sin(a) * rad, 0, 0, 0, 0.12, 0.11, 0.12));
      }
    });
    ballMats.push(mat(x, y + 0.11 + 5 * 0.17, z, 0, 0, 0, 0.1, 0.1, 0.1));
    lanterns.push(new THREE.Vector3(x, y + 0.42, z));
    pools.push({ x, z, r: 2.4, c: 0xffa860, a: 0.5 });
  }
  const lanternBalls = new THREE.InstancedMesh(LUMPY, snowMat, ballMats.length);
  ballMats.forEach((m, i) => lanternBalls.setMatrixAt(i, m));
  group.add(lanternBalls);

  // ---- drifts and lumps ----
  for (let i = 0; i < (low ? 40 : 90); i++) {
    const a = r() * Math.PI * 2;
    const rad = 14 + r() * 40;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad - 4;
    if (x > -15 && x < 15 && z > -27 && z < 21) continue;
    if (pondContains(x, z)) continue;
    lumpMats.push(mat(x, heightAt(x, z) - 0.1, z, 0, r() * 3, 0, 0.7 + r() * 1.4, 0.25 + r() * 0.35, 0.6 + r() * 1.2));
  }
  const lumps = new THREE.InstancedMesh(SPHERE, snowMat, lumpMats.length);
  lumpMats.forEach((m, i) => lumps.setMatrixAt(i, m));
  lumps.receiveShadow = shadows;
  group.add(lumps);

  // ---- merge the static parts into a handful of draw calls ----
  const boards = boardsTexture();
  boards.repeat.set(2, 1);
  const materials: Record<string, THREE.Material> = {
    wall: new THREE.MeshLambertMaterial({ vertexColors: true, map: boards }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true }),
    dark: new THREE.MeshLambertMaterial({ vertexColors: true }),
    snow: fluffy(0xffffff, 0xffd6ea, 0.3, { vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ vertexColors: true }),
    pole: new THREE.MeshLambertMaterial({ vertexColors: true }),
    flag: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  for (const src of [parts, towerParts]) {
    for (const [key, list] of src) {
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, materials[key]);
      mesh.castShadow = shadows && key !== 'glass';
      mesh.receiveShadow = shadows && key !== 'glass';
      group.add(mesh);
    }
  }

  // ---- glows: window halos, string-light bulbs, lantern flames, light pools ----
  const glowTex = glowTexture();
  // pools of warm light on the snow
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const pcol = new THREE.Color();
    for (const p of pools) {
      pcol.set(p.c).multiplyScalar(p.a);
      const n = 4;
      const base = pos.length / 3;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const x = p.x + (i / n - 0.5) * 2 * p.r;
          const z = p.z + (j / n - 0.5) * 2 * p.r;
          pos.push(x, heightAt(x, z) + 0.06, z);
          uv.push(i / n, j / n);
          col.push(pcol.r, pcol.g, pcol.b);
        }
      }
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const a = base + j * (n + 1) + i;
          idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.renderOrder = 2;
    group.add(m);
  }

  // points that glow (windows, bulbs, flames): one draw call
  const glowPts: { p: THREE.Vector3; c: THREE.Color; s: number; tw: number }[] = [];
  for (const w of windowGlows) glowPts.push({ ...w, tw: 0 });
  for (const b of bulbs) glowPts.push({ p: b.p, c: b.c, s: 0.55, tw: 1 });
  for (const l of lanterns) glowPts.push({ p: l, c: new THREE.Color(1.0, 0.62, 0.3), s: 1.5, tw: 2 });
  const gpos = new Float32Array(glowPts.length * 3);
  const gcol = new Float32Array(glowPts.length * 3);
  const gsize = new Float32Array(glowPts.length);
  const gtw = new Float32Array(glowPts.length * 2);
  glowPts.forEach((g, i) => {
    gpos.set([g.p.x, g.p.y, g.p.z], i * 3);
    gcol.set([g.c.r, g.c.g, g.c.b], i * 3);
    gsize[i] = g.s;
    gtw.set([g.tw, r()], i * 2);
  });
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  gg.setAttribute('aColor', new THREE.BufferAttribute(gcol, 3));
  gg.setAttribute('aSize', new THREE.BufferAttribute(gsize, 1));
  gg.setAttribute('aTw', new THREE.BufferAttribute(gtw, 2));
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uMap: { value: glowTex } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute vec2 aTw;
      uniform float uTime; uniform float uScale;
      varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = 1.0;
        if (aTw.x > 1.5) k = 0.82 + 0.18 * sin(uTime * 9.0 + aTw.y * 50.0) * sin(uTime * 5.3 + aTw.y * 20.0);
        else if (aTw.x > 0.5) k = 0.55 + 0.45 * smoothstep(-0.3, 0.6, sin(uTime * 1.7 + aTw.y * 31.0));
        vC = aColor * k;
        float fogF = smoothstep(60.0, 260.0, -mv.z);
        vC *= 1.0 - fogF * 0.6;
        gl_PointSize = min(aSize * uScale / -mv.z, 160.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec3 vC;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vC * a, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glows = new THREE.Points(gg, glowMat);
  glows.frustumCulled = false;
  glows.renderOrder = 5;
  group.add(glows);

  // bulbs themselves: tiny bright spheres
  if (bulbs.length) {
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const bc = new THREE.Color();
    bulbs.forEach((b, i) => {
      bm.setMatrixAt(i, mat(b.p.x, b.p.y, b.p.z));
      bc.copy(b.c).multiplyScalar(1.1);
      bm.setColorAt(i, bc);
    });
    group.add(bm);
  }
  // the wires
  {
    const pts: number[] = [];
    for (const w of wires) for (let i = 0; i < w.length - 1; i++) pts.push(w[i]!.x, w[i]!.y, w[i]!.z, w[i + 1]!.x, w[i + 1]!.y, w[i + 1]!.z);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3550 })));
  }

  // ---------------------------------------------------------------- queries
  const castle = new THREE.Vector3(0, heightAt(0, -29.5), -29.5);
  const tv = new THREE.Vector3();

  function inBox(b: Box, p: THREE.Vector3, rr: number): THREE.Vector3 | null {
    const dx = p.x - b.cx;
    const dz = p.z - b.cz;
    const lx = dx * b.c - dz * b.s;
    const lz = dx * b.s + dz * b.c;
    if (p.y < b.y0 - rr || p.y > b.y1 + rr) return null;
    const ex = Math.abs(lx) - b.hx;
    const ez = Math.abs(lz) - b.hz;
    if (ex > rr || ez > rr) return null;
    // normal: the side we are closest to leaving through
    const top = p.y - b.y1;
    if (top > ex && top > ez && top > -0.15) return tv.set(0, 1, 0);
    if (ex > ez) {
      const sx = Math.sign(lx);
      return tv.set(sx * b.c, 0, -sx * b.s);
    }
    const sz = Math.sign(lz);
    return tv.set(sz * b.s, 0, sz * b.c);
  }

  function hitTest(p: THREE.Vector3, rr: number, enemyBall: boolean): WorldHit | null {
    const gy = heightAt(p.x, p.z);
    if (p.y - rr * 0.5 < gy) return { kind: pondContains(p.x, p.z) ? 'ice' : 'ground', normal: groundNormal(p.x, p.z) };
    for (const b of boxes) {
      // snowmen's balls fly out of their own cover freely
      if (enemyBall && b.enemy) continue;
      const n = inBox(b, p, rr);
      if (n) return { kind: b.kind, normal: n.clone() };
    }
    for (const c of cyls) {
      if (p.y < c.y0 || p.y > c.y1 + rr) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + rr) return { kind: 'wall', normal: p.y > c.y1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1)) };
    }
    for (const t of trees) {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > (t.r + rr) * (t.r + rr)) continue;
      if (p.y > t.fy1 || p.y < t.y0) continue;
      const d = Math.sqrt(d2);
      const rad = p.y < t.fy0 ? t.trunkR : t.r * (1 - (p.y - t.fy0) / (t.fy1 - t.fy0)) * 0.85;
      if (d < rad + rr) return { kind: 'tree', normal: new THREE.Vector3(dx / (d || 1), 0.3, dz / (d || 1)).normalize(), tree: t };
    }
    return null;
  }

  const rp = new THREE.Vector3();
  function raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): number {
    let best = max;
    // boxes (slab test in the box's frame)
    for (const b of boxes) {
      const ox = o.x - b.cx;
      const oz = o.z - b.cz;
      const lox = ox * b.c - oz * b.s;
      const loz = ox * b.s + oz * b.c;
      const ldx = d.x * b.c - d.z * b.s;
      const ldz = d.x * b.s + d.z * b.c;
      let t0 = 0;
      let t1 = best;
      const slab = (oo: number, dd: number, lo: number, hi: number): boolean => {
        if (Math.abs(dd) < 1e-6) return oo >= lo && oo <= hi;
        let a = (lo - oo) / dd;
        let c = (hi - oo) / dd;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (slab(lox, ldx, -b.hx, b.hx) && slab(o.y, d.y, b.y0, b.y1) && slab(loz, ldz, -b.hz, b.hz)) best = Math.min(best, t0);
    }
    for (const c of cyls) {
      const ox = o.x - c.x;
      const oz = o.z - c.z;
      const a = d.x * d.x + d.z * d.z;
      const b2 = 2 * (ox * d.x + oz * d.z);
      const cc = ox * ox + oz * oz - c.r * c.r;
      const disc = b2 * b2 - 4 * a * cc;
      if (disc < 0 || a < 1e-8) continue;
      const t = (-b2 - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && t < best) {
        const y = o.y + d.y * t;
        if (y > c.y0 && y < c.y1) best = t;
      }
    }
    // terrain: march, then refine
    let prev = 0;
    const step = 0.6;
    for (let t = step; t < best; t += step) {
      rp.copy(o).addScaledVector(d, t);
      if (rp.y < heightAt(rp.x, rp.z)) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          rp.copy(o).addScaledVector(d, m);
          if (rp.y < heightAt(rp.x, rp.z)) hi = m;
          else lo = m;
        }
        best = Math.min(best, hi);
        break;
      }
      prev = t;
    }
    return best;
  }

  function push(p: THREE.Vector3, rr: number, feetY: number): void {
    for (const b of boxes) {
      if (feetY > b.y1 - 0.05) continue;
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      const qx = clamp(lx, -b.hx, b.hx);
      const qz = clamp(lz, -b.hz, b.hz);
      let ex = lx - qx;
      let ez = lz - qz;
      let d = Math.hypot(ex, ez);
      if (d >= rr) continue;
      if (d < 1e-5) {
        // inside: push out through the nearest side
        const px = b.hx - Math.abs(lx);
        const pz = b.hz - Math.abs(lz);
        if (px < pz) {
          ex = Math.sign(lx) || 1;
          ez = 0;
        } else {
          ex = 0;
          ez = Math.sign(lz) || 1;
        }
        d = 0;
      } else {
        ex /= d;
        ez /= d;
      }
      const nlx = qx + ex * rr;
      const nlz = qz + ez * rr;
      // back to world
      p.x = b.cx + nlx * b.c + nlz * b.s;
      p.z = b.cz - nlx * b.s + nlz * b.c;
    }
    for (const c of cyls) {
      if (feetY > c.y1 - 0.05) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + rr;
      if (d < min && d > 1e-5) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const t of trees) {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      const min = t.trunkR + rr + 0.25;
      if (d < min && d > 1e-5) {
        p.x = t.x + (dx / d) * min;
        p.z = t.z + (dz / d) * min;
      }
    }
  }

  const bq = new THREE.Vector3();
  function blocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    bq.subVectors(b, a);
    const len = bq.length();
    bq.divideScalar(len || 1);
    return raycast(a, bq, len) < len - 0.3;
  }

  const iceMat = ice.material as THREE.ShaderMaterial;
  return {
    group,
    boxes,
    cyls,
    trees,
    covers,
    chimneys,
    lanterns,
    castle,
    hitTest,
    raycast,
    push,
    blocked,
    treeTop: (t) => new THREE.Vector3(t.x, t.fy1 - (t.fy1 - t.fy0) * 0.35, t.z),
    update(t) {
      groundMat.userData.time.value = t;
      glowMat.uniforms.uTime!.value = t;
      iceMat.uniforms.uTime!.value = t;
    },
    setView(cam, scale) {
      iceMat.uniforms.uCam!.value.copy(cam);
      glowMat.uniforms.uScale!.value = scale;
    },
  };
}

// ---------------------------------------------------------------- village data

/** x, z, rotation (front faces local +z), scale, ochre instead of red. */
const HOUSES: [number, number, number, number, boolean?][] = [
  // on the slope behind the castle
  [-16, -44, 0.05, 1],
  [8.5, -47, -0.08, 1.1, true],
  [26, -41, -0.35, 0.95],
  [-33, -49, 0.3, 1],
  [-4, -63, 0, 0.9],
  [19, -68, -0.15, 1],
  [-22, -72, 0.2, 0.9, true],
  [40, -58, -0.5, 0.9],
  [-48, -62, 0.45, 0.95],
  [6, -86, 0.05, 0.9],
  // the sides of the arena
  [-28, -15, Math.PI / 2, 1],
  [-29, 9, Math.PI / 2 - 0.2, 0.95, true],
  [28.5, -19, -Math.PI / 2, 1],
  [27.5, 3, -Math.PI / 2 + 0.15, 1],
  // home, behind the player
  [0, 32.5, Math.PI, 1.15],
  [-16, 34.5, Math.PI - 0.35, 0.95, true],
  [16, 33.5, Math.PI + 0.3, 1],
  // far away on the hills
  [-70, -20, 1.1, 0.9],
  [72, -34, -1.0, 0.9],
  [-60, 45, 2.3, 0.9],
  [58, 52, -2.4, 0.9, true],
];
const CHURCH: [number, number, number] = [-34, -84, 0.18];

function garland(a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number, bulbs: { p: THREE.Vector3; c: THREE.Color }[], wires: THREE.Vector3[][], r: () => number): void {
  const COLORS = [0xff5a6a, 0xffd25a, 0x6dff9a, 0x6cc6ff, 0xff8ae0];
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / spacing));
  const wire: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    wire.push(p);
    if (i > 0 && i < n) {
      const c = new THREE.Color(COLORS[Math.floor(r() * COLORS.length)]!);
      bulbs.push({ p: p.clone().add(new THREE.Vector3(0, -0.07, 0)), c });
    }
  }
  wires.push(wire);
}

function buildCottage(
  parts: Parts,
  x: number,
  z: number,
  ry: number,
  s: number,
  ochre: boolean,
  r: () => number,
  chimneys: THREE.Vector3[],
  glows: { p: THREE.Vector3; c: THREE.Color; s: number }[],
  pools: { x: number; z: number; r: number; c: number; a: number }[],
  bulbs: { p: THREE.Vector3; c: THREE.Color }[],
  wires: THREE.Vector3[][],
  near: boolean,
  boxes: Box[],
): void {
  const w = 7 * s;
  const d = 5 * s;
  const wh = 2.7 * s;
  const ridge = 1.9 * s;
  // the lowest corner decides the floor, so no corner floats
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const toW = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  let base = Infinity;
  for (const [lx, lz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [0, 0],
  ] as [number, number][]) {
    const [wx, wz] = toW(lx, lz);
    base = Math.min(base, heightAt(wx, wz));
  }
  base -= 0.1;
  const root = new THREE.Matrix4().compose(new THREE.Vector3(x, base, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const add = (key: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation = 0xffffff): void => addPart(parts, key, geo, root.clone().multiply(m), color);
  const wallCol = ochre ? 0xd9a441 : 0xa9352b;
  const white = 0xf1ece6;

  // stone footing and walls
  add('dark', BOX, mat(0, 0.25, 0, 0, 0, 0, w + 0.2, 0.6, d + 0.2), 0x6d6f88);
  add('wall', BOX, mat(0, 0.55 + (wh - 0.55) / 2, 0, 0, 0, 0, w, wh - 0.55, d), wallCol);
  // gables
  const gab = gableGeometry(d, ridge);
  add('wall', gab, mat(w / 2, wh, 0), wallCol);
  add('wall', gab, mat(-w / 2, wh, 0, 0, Math.PI, 0), wallCol);
  // white corner boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('trim', BOX, mat((sx * w) / 2, wh / 2 + 0.2, (sz * d) / 2, 0, 0, 0, 0.2, wh - 0.3, 0.2), white);
  // roof: two slabs with a thick, soft snow blanket
  const pitch = Math.atan2(ridge, d / 2);
  const slope = Math.hypot(ridge, d / 2);
  for (const side of [-1, 1]) {
    const cz = (side * d) / 4;
    const cy = wh + ridge / 2;
    add('dark', BOX, mat(0, cy + 0.02, cz * 1.04, side * pitch, 0, 0, w + 0.7, 0.14, slope + 0.55), 0x3b3348);
    // snow layer, pushed out along the slab normal
    const nY = Math.cos(pitch) * 0.2;
    const nZ = side * Math.sin(pitch) * 0.2;
    add('snow', RBOX, mat(0, cy + nY + 0.06, cz * 1.04 + nZ, side * pitch, 0, 0, w + 0.85, 0.36, slope + 0.75));
    // a white fascia along the gable edge
    for (const sx of [-1, 1]) add('trim', BOX, mat((sx * (w + 0.62)) / 2, cy - 0.1, cz * 1.04, side * pitch, 0, 0, 0.1, 0.24, slope + 0.5), white);
  }
  // chimney
  const chx = w * 0.22;
  const chz = -d * 0.18;
  const chTop = wh + ridge * (1 - Math.abs(chz) / (d / 2)) + 0.85 * s;
  add('dark', BOX, mat(chx, chTop - 0.7 * s, chz, 0, 0, 0, 0.55 * s, 1.4 * s, 0.55 * s), 0x7a3b33);
  add('snow', RBOX, mat(chx, chTop + 0.05, chz, 0, 0, 0, 0.72 * s, 0.22, 0.72 * s));
  const [cwx, cwz] = toW(chx, chz);
  chimneys.push(new THREE.Vector3(cwx, base + chTop + 0.2, cwz));

  // the door with a lamp, windows with warm light
  add('dark', BOX, mat(0, 0.55 + 0.95 * s, d / 2 + 0.03, 0, 0, 0, 0.95 * s, 1.9 * s, 0.08), 0x4b2a2a);
  add('trim', BOX, mat(0, 0.55 + 0.95 * s, d / 2 + 0.01, 0, 0, 0, 1.2 * s, 2.1 * s, 0.06), white);
  add('glass', BOX, mat(0, 0.55 + 2.25 * s, d / 2 + 0.12, 0, 0, 0, 0.16, 0.22, 0.16), 0xffd59a);
  const lampY = base + 0.55 + 2.25 * s;
  const [lx0, lz0] = toW(0, d / 2 + 0.35);
  glows.push({ p: new THREE.Vector3(lx0, lampY, lz0), c: new THREE.Color(1.0, 0.7, 0.36), s: 1.6 });
  if (near) {
    const [px, pz] = toW(0, d / 2 + 1.6);
    pools.push({ x: px, z: pz, r: 2.2, c: 0xffb066, a: 0.42 });
  }
  const winY = 0.55 + 1.15 * s;
  const lit = (): THREE.Color => {
    const k = r();
    return k < 0.12 ? new THREE.Color(0.26, 0.22, 0.32) : new THREE.Color(1.0, 0.62 + r() * 0.1, 0.26 + r() * 0.1);
  };
  const windowAt = (lx: number, ly: number, lz: number, rot: number, ww: number, hh: number): void => {
    const col = lit();
    const out = Math.abs(rot) > 0.1 ? 1 : 0;
    const nx = out ? Math.sign(Math.sin(rot)) * 0.05 : 0;
    const nz = out ? 0 : Math.sign(lz) * 0.05;
    add('trim', BOX, mat(lx + nx * 0.4, ly, lz + nz * 0.4, 0, rot, 0, ww + 0.22, hh + 0.22, 0.06), white);
    add('glass', BOX, mat(lx + nx, ly, lz + nz, 0, rot, 0, ww, hh, 0.05), col);
    add('trim', BOX, mat(lx + nx * 1.6, ly, lz + nz * 1.6, 0, rot, 0, 0.07, hh, 0.04), white);
    add('trim', BOX, mat(lx + nx * 1.6, ly, lz + nz * 1.6, 0, rot, 0, ww, 0.07, 0.04), white);
    if (col.g > 0.5) {
      const [gx, gz] = toW(lx + nx * 6, lz + nz * 6);
      glows.push({ p: new THREE.Vector3(gx, base + ly, gz), c: new THREE.Color(1.0, 0.6, 0.28).multiplyScalar(0.5), s: 2.4 * s });
      if (near && !out) {
        const [px, pz] = toW(lx, lz + Math.sign(lz) * 1.8);
        pools.push({ x: px, z: pz, r: 2.0 * s, c: 0xffa860, a: 0.32 });
      }
    }
  };
  for (const sx of [-1, 1]) windowAt(sx * w * 0.3, winY, d / 2 + 0.04, 0, 1.0 * s, 1.1 * s);
  windowAt(w * 0.3, winY, -d / 2 - 0.04, Math.PI, 1.0 * s, 1.1 * s);
  for (const sx of [-1, 1]) windowAt((sx * (w / 2 + 0.04)), wh + ridge * 0.35, 0, (sx * Math.PI) / 2, 0.7 * s, 0.8 * s);

  // snow drifts round the foot
  for (let i = 0; i < 7; i++) {
    const lx = (r() - 0.5) * w;
    for (const sz of [-1, 1]) add('snow', SPHERE, mat(lx, 0.05, (sz * (d / 2 + 0.25)), 0, r() * 3, 0, 0.9 + r() * 0.6, 0.35 + r() * 0.2, 0.5 + r() * 0.2));
  }

  // string lights along the front eave of the houses near the arena
  if (near) {
    const ey = wh + 0.05;
    const ez = d / 2 + 0.35;
    const [ax, az] = toW(-w / 2 - 0.2, ez);
    const [bx, bz] = toW(w / 2 + 0.2, ez);
    garland(new THREE.Vector3(ax, base + ey, az), new THREE.Vector3(bx, base + ey, bz), 0.28, 0.42, bulbs, wires, r);
    // houses near the arena stop snowballs
    boxes.push({ cx: x, cz: z, hx: w / 2 + 0.1, hz: d / 2 + 0.1, y0: base - 1, y1: base + wh + ridge, c, s: sn, kind: 'house', enemy: false });
  }
}

function buildChurch(parts: Parts, x: number, z: number, ry: number, glows: { p: THREE.Vector3; c: THREE.Color; s: number }[]): void {
  const base = heightAt(x, z) - 0.2;
  const root = new THREE.Matrix4().compose(new THREE.Vector3(x, base, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const add = (key: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation = 0xffffff): void => addPart(parts, key, geo, root.clone().multiply(m), color);
  const white = 0xf3efe9;
  const w = 7;
  const l = 13;
  const wh = 5;
  const ridge = 3.4;
  add('trim', BOX, mat(0, wh / 2, 0, 0, 0, 0, w, wh, l), white);
  // nave roof (ridge along z)
  const pitch = Math.atan2(ridge, w / 2);
  const slope = Math.hypot(ridge, w / 2);
  for (const side of [-1, 1]) {
    add('dark', BOX, mat((side * w) / 4, wh + ridge / 2, 0, 0, 0, -side * pitch, slope + 0.6, 0.16, l + 0.6), 0x3d3f5a);
    add('snow', RBOX, mat((side * w) / 4 + side * Math.sin(pitch) * 0.2, wh + ridge / 2 + Math.cos(pitch) * 0.2, 0, 0, 0, -side * pitch, slope + 0.7, 0.34, l + 0.8));
  }
  const gab = gableGeometry(w, ridge);
  add('trim', gab, mat(0, wh, l / 2, 0, -Math.PI / 2, 0), white);
  // tower at the front with a tall dark spire
  const tz = l / 2 + 1.6;
  add('trim', BOX, mat(0, 5, tz, 0, 0, 0, 3.4, 10, 3.4), white);
  add('dark', new THREE.ConeGeometry(2.6, 8, 4), mat(0, 14, tz, 0, Math.PI / 4, 0), 0x3d3f5a);
  add('glass', SPHERE, mat(0, 18.2, tz, 0, 0, 0, 0.22, 0.22, 0.22), 0xffd36a);
  // tall glowing windows
  for (const sz of [-3.5, 0, 3.5]) {
    for (const sx of [-1, 1]) {
      add('glass', BOX, mat((sx * (w / 2 + 0.03)), 2.6, sz, 0, 0, 0, 0.05, 2.0, 0.9), 0xffcf8a);
      const p = new THREE.Vector3(sx * (w / 2 + 0.6), 2.6, sz).applyMatrix4(root);
      glows.push({ p, c: new THREE.Color(1.0, 0.68, 0.34).multiplyScalar(0.7), s: 3.2 });
    }
  }
  add('glass', BOX, mat(0, 7.5, tz + 1.73, 0, 0, 0, 0.8, 1.2, 0.05), 0xffd59a);
}

function buildPine(r: () => number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const parts: Parts = new Map();
  addPart(parts, 'p', new THREE.CylinderGeometry(0.12, 0.2, 1.2, 7), mat(0, 0.6, 0), 0x5a3f2c);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const rad = 1.55 - i * 0.33;
    const h = 1.55 - i * 0.12;
    const y = 0.75 + i * 0.85;
    const green = new THREE.Color(0x2c5a57).offsetHSL(0, 0, i * 0.02);
    addPart(parts, 'p', new THREE.ConeGeometry(rad, h, 9, 1), mat(0, y + h / 2, 0, 0, i * 0.7, 0), green);
    // snow sitting on the tier: a flatter, wobbly cone
    const sc = new THREE.ConeGeometry(rad * 0.86, h * 0.62, 9, 1);
    const sp = sc.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < sp.count; k++) {
      if (sp.getY(k) < 0) {
        const f = 0.82 + r() * 0.3;
        sp.setX(k, sp.getX(k) * f);
        sp.setZ(k, sp.getZ(k) * f);
        sp.setY(k, sp.getY(k) + (r() - 0.5) * 0.12);
      }
    }
    sc.computeVertexNormals();
    addPart(parts, 'p', sc, mat(0, y + h * 0.63, 0, 0, i * 0.7 + 0.3, 0), 0xf2f5ff);
  }
  list.push(...parts.get('p')!);
  const g = mergeGeometries(list, false)!;
  for (const x of list) x.dispose();
  return g;
}
