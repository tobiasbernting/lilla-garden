// Builds one hole as a little floating diorama: the island, felt greens with wooden rails, the cup
// and its flag, water, the windmill/barn/bridge, the moving things and lots of farm decoration.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, shade, type Kit } from './kit3d.ts';
import { Carousel, Cow, DiscPiece, LanePiece, PolyPiece, R_CUP, Spinner, Windmill, islandOutline, pointInPoly, type Piece, type World } from './physics.ts';
import * as P from './props.ts';
import type { HoleSpec, Pt } from './spec.ts';
import { flagTexture, rng } from './tex.ts';

export const THEME = ['#ff4f7b', '#ffb020', '#3fb6ff', '#9b7bff', '#ff7a45', '#2fcf78', '#ff5ca8', '#ffcf2a', '#00bfb3'];
const FELT = '#38a84f';
const FELT_SIDE = '#277b38';
const GRASS = '#86cf5e';
const ISLAND_Y = -0.12;

export interface HoleView {
  root: THREE.Group;
  /** Animate everything (t = world time). */
  update(t: number, dt: number, w: World, ballX: number, ballY: number, ballZ: number, cam: THREE.Vector3): void;
  /** Lift the flag out of the cup (0..1) and wiggle it. */
  flag: { lift: number; wiggle: number };
  /** Big buildings that should fade when they hide the ball. */
  occluders: { box: THREE.Box3; mats: THREE.Material[]; fade: number }[];
  /** Where the hole is, for the camera. */
  center: THREE.Vector3;
  radius: number;
  /** The cow rigs (for hit wiggles). */
  cows: { mover: Cow; rig: P.CowRig; bump: number }[];
  /** Ducks and anyone else who reacts to a splash. */
  scare(x: number, z: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------- small geometry helpers

/** A flat (or tilted) polygon with holes, lying in the world's x-z plane. */
function flatGeo(pts: Pt[], holes: Pt[][], height: (x: number, z: number) => number, uv = 0.3): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uvs = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, height(x, z));
    uvs.setXY(i, x * uv, z * uv);
  }
  g.computeVertexNormals();
  return g;
}

function circlePts(cx: number, cz: number, r: number, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** A grid along a lane (ramp, bridge). */
function laneGeo(p: LanePiece, uv = 0.3): THREE.BufferGeometry {
  const ns = Math.max(2, Math.ceil(p.len / 0.2));
  const nw = 4;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= ns; i++) {
    const s = (i / ns) * p.len;
    const [h] = p.profile(s / p.len);
    for (let j = 0; j <= nw; j++) {
      const w = -p.hw + (j / nw) * 2 * p.hw;
      const x = p.a[0] + p.ux * s - p.uz * w;
      const z = p.a[1] + p.uz * s + p.ux * w;
      pos.push(x, h, z);
      uvs.push(x * uv, z * uv);
    }
  }
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nw; j++) {
      const a = i * (nw + 1) + j;
      const b = a + nw + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixUp(g);
  return g;
}

/** A radial grid (bowls, the crater). */
function discGeo(p: DiscPiece, rin: number, uv = 0.3): THREE.BufferGeometry {
  const nr = Math.max(3, Math.ceil((p.r - rin) / 0.12));
  const na = 64;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nr; i++) {
    const rho = rin + ((p.r - rin) * i) / nr;
    const [h] = p.radial(rho);
    for (let j = 0; j < na; j++) {
      const a = (j / na) * Math.PI * 2;
      const x = p.cx + Math.cos(a) * rho;
      const z = p.cz + Math.sin(a) * rho;
      pos.push(x, h, z);
      uvs.push(x * uv, z * uv);
    }
  }
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < na; j++) {
      const a = i * na + j;
      const b = i * na + ((j + 1) % na);
      const c = a + na;
      const d = b + na;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixUp(g);
  return g;
}

/** Make sure a ground mesh faces up (flip its triangles if its normals point down). */
function fixUp(g: THREE.BufferGeometry): void {
  const n = g.attributes.normal as THREE.BufferAttribute;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (sum >= 0) return;
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  g.computeVertexNormals();
}

/** Vertical strips hanging from a line of points down to `bottom` (the felt's thickness, island sides). */
function wallGeo(pts: { x: number; y: number; z: number }[], closed: boolean, bottom: (i: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let along = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ya = bottom(i);
    const yb = bottom((i + 1) % n);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const quad = [
      [a.x, a.y, a.z, along, a.y],
      [a.x, ya, a.z, along, ya],
      [b.x, b.y, b.z, along + len, b.y],
      [b.x, b.y, b.z, along + len, b.y],
      [a.x, ya, a.z, along, ya],
      [b.x, yb, b.z, along + len, yb],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x!, y!, z!);
      uvs.push(u! * 0.5, v! * 0.5);
    }
    along += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Keep the part of a polygon where nx·x + nz·z ≥ d. */
function clipPoly(pts: Pt[], nx: number, nz: number, d: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const da = a[0] * nx + a[1] * nz - d;
    const db = b[0] * nx + b[1] * nz - d;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

// ---------------------------------------------------------------- the hole

export function buildHole(kit: Kit, spec: HoleSpec, w: World, index: number): HoleView {
  const root = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const anims: ((t: number, dt: number) => void)[] = [];
  const theme = THEME[index % THEME.length]!;
  const r = rng(index * 101 + 7);
  const keepOut: [number, number, number][] = [];
  const add = (o: THREE.Object3D): THREE.Object3D => {
    root.add(o);
    return o;
  };
  const own = <G extends THREE.BufferGeometry>(g: G): G => {
    owned.push(g);
    return g;
  };
  const faders: { c: THREE.Vector3; r: number; mats: THREE.Material[]; fade: number }[] = [];
  const fadeable = (o: THREE.Object3D, x: number, z: number, y: number, rad: number): void => {
    const mats: THREE.Material[] = [];
    const seen = new Map<THREE.Material, THREE.Material>();
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const swap = (mt: THREE.Material): THREE.Material => {
        let n = seen.get(mt);
        if (!n) {
          n = mt.clone();
          n.transparent = true;
          seen.set(mt, n);
          mats.push(n);
          ownedMats.push(n);
        }
        return n;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    faders.push({ c: new THREE.Vector3(x, y, z), r: rad, mats, fade: 0 });
  };

  const felt = kit.std(FELT, { map: kit.tex.felt, rough: 0.95 });
  const feltSide = kit.std(FELT_SIDE, { rough: 0.95, side: THREE.DoubleSide });

  // ---- island
  const outline = islandOutline(spec);
  const waters = spec.waters ?? [];
  const tops: Pt[][] = spec.island?.split ? spec.island.split.map(([nx, nz, d]) => clipPoly(outline, nx, nz, d)) : [outline];
  const ponds = waters.filter((wt) => wt.pts.every((p) => pointInPoly(outline, p[0], p[1])));
  const grassMat = kit.std(GRASS, { map: kit.tex.grass, rough: 1 });
  const bandMat = kit.std('#5aa83f', { rough: 1, side: THREE.DoubleSide, tag: 'band' });
  const earthMat = kit.std('#ffffff', { map: kit.tex.earth, rough: 1, side: THREE.DoubleSide, tag: 'earth' });
  const cEarth2 = new THREE.Color('#8a5a32');
  const cRock = new THREE.Color('#8c8f9c');
  const sides = (ring: { x: number; y: number; z: number }[], top: number, bottom: number): void => {
    add(new THREE.Mesh(own(wallGeo(ring, true, () => top - 0.2)), bandMat));
    const lower = ring.map((p) => ({ x: p.x, y: top - 0.2, z: p.z }));
    add(new THREE.Mesh(own(wallGeo(lower, true, () => bottom)), earthMat));
  };
  for (const top of tops) {
    const holes = ponds.filter((p) => p.pts.every((q) => pointInPoly(top, q[0], q[1]))).map((p) => p.pts);
    if (!w.cupOn && w.cup.h - 0.45 < ISLAND_Y && pointInPoly(top, w.cup.x, w.cup.z)) holes.push(circlePts(w.cup.x, w.cup.z, R_CUP + 0.02, 24));
    const g = own(flatGeo(top, holes, () => ISLAND_Y, 0.22));
    const m = add(new THREE.Mesh(g, grassMat));
    m.receiveShadow = kit.shadows;
    sides(
      top.map(([x, z]) => ({ x, y: ISLAND_Y, z })),
      ISLAND_Y,
      -0.8,
    );
    for (const h of holes)
      sides(
        h.map(([x, z]) => ({ x, y: ISLAND_Y, z })),
        ISLAND_Y,
        -0.8,
      );
  }
  // the island's body below the grass: a bed under the water, earthy sides, a rocky bottom
  add(new THREE.Mesh(own(flatGeo(outline, [], () => -0.8, 0.3)), kit.std('#6f6a3f', { rough: 1 })));
  {
    const ring = outline.map(([x, z]) => ({ x, y: -0.8, z }));
    add(new THREE.Mesh(own(wallGeo(ring, true, () => -1.45)), earthMat));
    const [cx, cz] = centroid(outline);
    const rings = [outline.map(([x, z]) => [x, -1.45, z] as [number, number, number])];
    const steps = 3;
    for (let k = 1; k <= steps; k++) {
      const f = 1 - k * 0.26;
      rings.push(outline.map(([x, z]) => [cx + (x - cx) * f * (0.92 + r() * 0.16), -1.45 - k * 0.95 - r() * 0.5, cz + (z - cz) * f * (0.92 + r() * 0.16)] as [number, number, number]));
    }
    const pos: number[] = [];
    const col: number[] = [];
    const push = (p: [number, number, number], c: THREE.Color): void => {
      pos.push(p[0], p[1], p[2]);
      col.push(c.r, c.g, c.b);
    };
    const n = outline.length;
    for (let k = 0; k < steps; k++) {
      const A = rings[k]!;
      const B = rings[k + 1]!;
      const ca = k === 0 ? cEarth2 : cRock;
      void ca;
      const cb = cRock;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        push(A[i]!, ca);
        push(B[i]!, cb);
        push(A[j]!, ca);
        push(A[j]!, ca);
        push(B[i]!, cb);
        push(B[j]!, cb);
      }
    }
    const last = rings[steps]!;
    const tip: [number, number, number] = [cx, -1.45 - steps * 0.95 - 1.6, cz];
    for (let i = 0; i < n; i++) {
      push(last[i]!, cRock);
      push(tip, cRock);
      push(last[(i + 1) % n]!, cRock);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // the winding above faces inwards on some outlines: draw both sides
    add(new THREE.Mesh(own(g), kit.std('#ffffff', { vertexColors: true, rough: 1, flat: true, side: THREE.DoubleSide, tag: 'rock' })));
  }

  // ---- greens
  const pieces = w.pieces.filter((p) => p.surf !== 'out');
  const cup = w.cup;
  const cupOnCarousel = !!w.cupOn;
  const exposed = (x: number, z: number, self: Piece): boolean => {
    for (const p of pieces) {
      if (p === self) continue;
      if (p.inside(x, z)) return false;
    }
    return true;
  };
  for (const p of pieces) {
    if (p.surf === 'wood') continue; // the bridge draws its own planks
    if (p instanceof PolyPiece) {
      const holes: Pt[][] = [];
      // later round pieces lying inside cut a hole; so does the cup
      for (const q of pieces) {
        if (q === p || !(q instanceof DiscPiece) || q.spin) continue;
        if (pieces.indexOf(q) < pieces.indexOf(p)) continue;
        if (pointInPoly(p.pts, q.cx - q.r, q.cz) && pointInPoly(p.pts, q.cx + q.r, q.cz) && pointInPoly(p.pts, q.cx, q.cz - q.r) && pointInPoly(p.pts, q.cx, q.cz + q.r)) holes.push(circlePts(q.cx, q.cz, q.r, 48));
      }
      if (!cupOnCarousel && p.inside(cup.x, cup.z) && !pieces.some((q) => q !== p && pieces.indexOf(q) > pieces.indexOf(p) && q.inside(cup.x, cup.z))) holes.push(circlePts(cup.x, cup.z, R_CUP, 32));
      const g = own(flatGeo(p.pts, holes, (x, z) => p.h + p.sx * (x - p.ox) + p.sz * (z - p.oz)));
      const m = add(new THREE.Mesh(g, felt));
      m.receiveShadow = kit.shadows;
      // the felt's edge where nothing covers it
      const n = p.pts.length;
      for (let i = 0; i < n; i++) {
        const a = p.pts[i]!;
        const b = p.pts[(i + 1) % n]!;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l = Math.hypot(dx, dz);
        const ox = (dz / l) * 0.06;
        const oz = (-dx / l) * 0.06;
        const outside = !p.inside(mx + ox, mz + oz) ? [ox, oz] : [-ox, -oz];
        if (!exposed(mx + outside[0]!, mz + outside[1]!, p)) continue;
        const pts = [a, b].map(([x, z]) => ({ x, y: p.h + p.sx * (x - p.ox) + p.sz * (z - p.oz), z }));
        add(new THREE.Mesh(own(wallGeo(pts, false, () => ISLAND_Y - 0.02)), feltSide));
      }
    } else if (p instanceof LanePiece) {
      const m = add(new THREE.Mesh(own(laneGeo(p)), felt));
      m.receiveShadow = kit.shadows;
      // the ramp's sides
      for (const side of [-1, 1]) {
        const pts: { x: number; y: number; z: number }[] = [];
        const ns = Math.max(2, Math.ceil(p.len / 0.25));
        for (let i = 0; i <= ns; i++) {
          const s = (i / ns) * p.len;
          const [h] = p.profile(s / p.len);
          pts.push({ x: p.a[0] + p.ux * s - p.uz * p.hw * side, y: h, z: p.a[1] + p.uz * s + p.ux * p.hw * side });
        }
        if (side < 0) pts.reverse();
        add(new THREE.Mesh(own(wallGeo(pts, false, () => ISLAND_Y - 0.02)), feltSide));
      }
      // the front face at the top of a ramp (the jump's lip)
      const [hEnd] = p.profile(1);
      if (hEnd > 0.05) {
        const ex = p.b[0];
        const ez = p.b[1];
        const pts = [
          { x: ex + p.uz * p.hw, y: hEnd, z: ez - p.ux * p.hw },
          { x: ex - p.uz * p.hw, y: hEnd, z: ez + p.ux * p.hw },
        ];
        add(new THREE.Mesh(own(wallGeo(pts, false, () => -0.8)), kit.std('#c98a4b', { map: kit.tex.wood, rough: 0.8, side: THREE.DoubleSide })));
      }
    } else if (p instanceof DiscPiece) {
      if (p.spin) continue; // the carousel draws its own floor
      const centerCup = !cupOnCarousel && Math.hypot(cup.x - p.cx, cup.z - p.cz) < 0.01;
      const rin = Math.max(p.rin, centerCup ? R_CUP : 0.0001);
      const m = add(new THREE.Mesh(own(discGeo(p, rin)), felt));
      m.receiveShadow = kit.shadows;
      if (p.rin > 0 || p.prof === 'crater') {
        const ring: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          const x = p.cx + Math.cos(a) * p.r;
          const z = p.cz + Math.sin(a) * p.r;
          if (!exposed(x + Math.cos(a) * 0.08, z + Math.sin(a) * 0.08, p)) continue;
          ring.push({ x, y: p.radial(p.r)[0], z });
        }
        if (ring.length > 1) add(new THREE.Mesh(own(wallGeo(ring.reverse(), false, () => ISLAND_Y - 0.02)), feltSide));
      }
      if (p.prof === 'crater') {
        // a stony band round the crater's rim and grass tufts on its slope come from the scatter below
        const rim = own(new THREE.TorusGeometry(p.rim, 0.05, 6, 48));
        rim.rotateX(Math.PI / 2);
        const rm = add(mesh(rim, kit.std('#ffffff', { rough: 0.6 }), [p.cx, p.radial(p.rim)[0] + 0.02, p.cz]));
        rm.renderOrder = 1;
      }
    }
  }

  // ---- the cup and its flag
  const cupGroup = new THREE.Group();
  const cupInner = kit.geo('cup-inner', () => new THREE.CylinderGeometry(R_CUP, R_CUP, 0.42, 28, 1, true));
  cupGroup.add(mesh(cupInner, kit.std('#2b2d33', { rough: 0.8, side: THREE.BackSide }), [0, -0.21, 0]));
  cupGroup.add(mesh(kit.geo('cup-bottom', () => new THREE.CircleGeometry(R_CUP, 28).rotateX(-Math.PI / 2)), kit.std('#1d1e22', { rough: 0.9 }), [0, -0.42, 0]));
  cupGroup.add(mesh(kit.geo('cup-rim', () => new THREE.RingGeometry(R_CUP - 0.03, R_CUP + 0.025, 32).rotateX(-Math.PI / 2)), kit.std('#ffffff', { rough: 0.4 }), [0, 0.006, 0]));
  const flagGroup = new THREE.Group();
  cupGroup.add(flagGroup);
  const pole = kit.std('#ffffff', { rough: 0.4 });
  flagGroup.add(mesh(kit.cyl8, pole, [0, 0.75, 0], [0.032, 2.0, 0.032]));
  const band = kit.std(theme, { rough: 0.4 });
  for (const y of [0.2, 0.7, 1.2]) flagGroup.add(mesh(kit.cyl8, band, [0, y, 0], [0.036, 0.18, 0.036]));
  flagGroup.add(mesh(kit.sphere, kit.std('#ffd23f', { rough: 0.3, metal: 0.4 }), [0, 1.78, 0], 0.06));
  const flagTex = kit.keep(flagTexture(index + 1, theme));
  const clothGeo = own(new THREE.PlaneGeometry(0.66, 0.44, 10, 4));
  clothGeo.translate(0.33, 0, 0);
  const cloth = mesh(clothGeo, kit.std('#ffffff', { map: flagTex, rough: 0.7, side: THREE.DoubleSide, tag: `flag${index}` }), [0.02, 1.5, 0]);
  flagGroup.add(cloth);
  const clothBase = Float32Array.from((clothGeo.attributes.position as THREE.BufferAttribute).array as Float32Array);
  shade(kit, flagGroup);
  const flag = { lift: 0, wiggle: 0 };
  let flagY = 0;

  // ---- the carousel (its floor carries the cup)
  let carouselGroup: THREE.Group | null = null;
  let carousel: Carousel | null = null;
  const horses: THREE.Object3D[] = [];
  for (const m of w.movers) if (m instanceof Carousel) carousel = m;
  if (carousel) {
    const s = carousel.s;
    carouselGroup = new THREE.Group();
    carouselGroup.position.set(s.x, s.h, s.z);
    add(carouselGroup);
    const local: Pt = [w.cupBase[0] - s.x, w.cupBase[1] - s.z];
    const floor = own(flatGeo(circlePts(0, 0, s.r, 72), [circlePts(local[0], local[1], R_CUP, 32)], () => 0, 1));
    const uv = floor.attributes.uv as THREE.BufferAttribute;
    const pos = floor.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * s.r) + 0.5, -pos.getZ(i) / (2 * s.r) + 0.5);
    const fm = mesh(floor, kit.std('#ffffff', { map: kit.tex.carousel, rough: 0.85 }));
    fm.receiveShadow = kit.shadows;
    carouselGroup.add(fm);
    // the edge: a gold band and little lights
    const edge = own(new THREE.CylinderGeometry(s.r, s.r, 0.3, 64, 1, true));
    carouselGroup.add(mesh(edge, kit.std('#ffcf3f', { rough: 0.35, metal: 0.3 }), [0, -0.15, 0]));
    const bulb = kit.std('#fff6c8', { emissive: '#ffe680', emissiveIntensity: 1.2, rough: 0.3 });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      carouselGroup.add(mesh(kit.lowSphere, bulb, [Math.cos(a) * (s.r + 0.01), -0.12, Math.sin(a) * (s.r + 0.01)], 0.045));
    }
    // poles with horses
    const gold = kit.std('#ffd54a', { rough: 0.25, metal: 0.6 });
    const horseCols = ['#ffffff', '#ffb3d1', '#b8e2ff', '#fff0a8'];
    for (let i = 0; i < s.poles; i++) {
      const a = (i / s.poles) * Math.PI * 2 + 0.6;
      const px = Math.cos(a) * s.ring;
      const pz = -Math.sin(a) * s.ring;
      carouselGroup.add(mesh(kit.cyl8, gold, [px, 0.95, pz], [0.07, 1.9, 0.07]));
      carouselGroup.add(mesh(kit.sphere, gold, [px, 1.92, pz], 0.1));
      const horse = new THREE.Group();
      horse.position.set(px, 0.95, pz);
      horse.rotation.y = a + Math.PI; // facing along the turn
      const hc = kit.std(horseCols[i % horseCols.length]!, { rough: 0.4 });
      const mane = kit.std(THEME[(i * 3) % THEME.length]!, { rough: 0.5 });
      horse.add(mesh(kit.rbox, hc, [0, 0, 0], [0.62, 0.3, 0.26]));
      horse.add(mesh(kit.rbox, hc, [0.34, 0.24, 0], [0.18, 0.4, 0.2], [0, 0, -0.5]));
      horse.add(mesh(kit.rbox, hc, [0.48, 0.38, 0], [0.26, 0.16, 0.18]));
      horse.add(mesh(kit.rbox, mane, [0.28, 0.36, 0], [0.24, 0.12, 0.06], [0, 0, -0.5]));
      horse.add(mesh(kit.box, mane, [-0.36, 0.02, 0], [0.12, 0.24, 0.05], [0, 0, 0.7]));
      for (const [x, z] of [
        [0.22, 0.08],
        [0.22, -0.08],
        [-0.22, 0.08],
        [-0.22, -0.08],
      ] as const)
        horse.add(mesh(kit.cyl8, hc, [x, -0.25, z], [0.04, 0.3, 0.04], [0, 0, x > 0 ? 0.5 : -0.5]));
      horse.add(mesh(kit.rbox, kit.std('#e8463c', { rough: 0.5 }), [0, 0.17, 0], [0.2, 0.06, 0.28]));
      carouselGroup.add(horse);
      horses.push(horse);
    }
    shade(kit, carouselGroup);
    fm.castShadow = false;
    // the hub stands still in the middle
    const hub = new THREE.Group();
    hub.position.set(s.x, s.h, s.z);
    const stripeGeo = kit.geo('hub-cyl', () => new THREE.CylinderGeometry(0.62, 0.62, 1.2, 24, 1));
    hub.add(mesh(stripeGeo, kit.std('#ff7eb6', { rough: 0.4 }), [0, 0.6, 0]));
    for (const y of [0.25, 0.65, 1.05]) hub.add(mesh(kit.geo('hub-band', () => new THREE.TorusGeometry(0.63, 0.05, 6, 24).rotateX(Math.PI / 2)), kit.std('#ffffff', { rough: 0.4 }), [0, y, 0]));
    hub.add(mesh(kit.cyl, kit.std('#ffd54a', { rough: 0.3, metal: 0.4 }), [0, 1.26, 0], [0.66, 0.12, 0.66]));
    const roof = own(new THREE.ConeGeometry(1.25, 0.8, 12, 1));
    const roofM = mesh(roof, kit.std('#7fd8ff', { rough: 0.5, flat: true }), [0, 1.72, 0]);
    hub.add(roofM);
    hub.add(mesh(kit.cyl8, gold, [0, 1.4, 0], [0.08, 0.5, 0.08]));
    hub.add(mesh(kit.sphere, kit.std('#ff4f7b', { rough: 0.3 }), [0, 2.18, 0], 0.13));
    shade(kit, hub);
    add(hub);
    anims.push((t) => {
      roofM.rotation.y = t * 0.3;
    });
    // the cup rides the floor
    cupGroup.position.set(local[0], 0, local[1]);
    carouselGroup.add(cupGroup);
  } else {
    cupGroup.position.set(cup.x, cup.h, cup.z);
    add(cupGroup);
  }
  void cupGroup;

  // ---- tee mat
  {
    const [tx, tz] = spec.tee;
    const th = w.heightAt(tx, tz);
    add(mesh(kit.rbox, kit.std('#e8463c', { rough: 0.6 }), [tx, th + 0.005, tz], [0.9, 0.03, 0.9]));
    add(mesh(kit.cyl, kit.std('#ffffff', { rough: 0.6 }), [tx, th + 0.02, tz], [0.16, 0.012, 0.16]));
    keepOut.push([tx, tz, 0.8]);
  }

  // ---- rails
  {
    const wood = kit.std('#d08a45', { map: kit.tex.wood, rough: 0.75 });
    const cap = kit.std('#f0b56c', { rough: 0.6 });
    const white = kit.std('#fbf6ea', { rough: 0.65 });
    const stoneA = kit.std('#c3bdb3', { rough: 0.95, flat: true });
    const stoneB = kit.std('#a9a398', { rough: 0.95, flat: true });
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry): void => {
      const l = byMat.get(m) ?? [];
      l.push(g);
      byMat.set(m, l);
    };
    const mtx = new THREE.Matrix4();
    const basis = new THREE.Matrix4();
    for (const rb of w.rails) {
      const m = rb.body.m;
      basis.set(m[0]!, m[1]!, m[2]!, 0, m[3]!, m[4]!, m[5]!, 0, m[6]!, m[7]!, m[8]!, 0, 0, 0, 0, 1);
      const len = Math.hypot(rb.b[0] - rb.a[0], rb.b[1] - rb.a[1], rb.b[2] - rb.a[2]);
      const at = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, mat: THREE.Material): void => {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        mtx.makeTranslation(lx, ly, lz);
        g.applyMatrix4(mtx);
        g.applyMatrix4(basis);
        g.translate(rb.body.x, rb.body.y, rb.body.z);
        put(mat, g);
      };
      const h = rb.h;
      const wd = rb.w;
      switch (rb.look) {
        case 'fence': {
          at(0, -h * 0.15, 0, len, 0.07, wd * 0.5, white);
          at(0, h * 0.3, 0, len, 0.07, wd * 0.5, white);
          const n = Math.max(1, Math.round(len / 0.26));
          for (let i = 0; i <= n; i++) at(-len / 2 + (i / n) * len, 0.04, wd * 0.15, 0.07, h + 0.14, 0.05, white);
          break;
        }
        case 'stone': {
          const n = Math.max(1, Math.round(len / 0.42));
          for (let i = 0; i < n; i++) {
            const sl = len / n;
            at(-len / 2 + (i + 0.5) * sl, (r() - 0.5) * 0.03, 0, sl * 0.94, h * (0.92 + r() * 0.12), wd * (0.95 + r() * 0.1), i % 2 ? stoneA : stoneB);
          }
          break;
        }
        case 'lip':
          at(0, 0, 0, len, h, wd, wood);
          break;
        default:
          at(0, -0.02, 0, len, h - 0.04, wd, wood);
          at(0, h / 2 - 0.02, 0, len + 0.01, 0.05, wd + 0.04, cap);
      }
    }
    for (const [m, gs] of byMat) {
      const merged = mergeGeometries(gs, false);
      for (const g of gs) g.dispose();
      if (!merged) continue;
      own(merged);
      const me = add(new THREE.Mesh(merged, m));
      me.castShadow = kit.shadows;
      me.receiveShadow = kit.shadows;
    }
    // posts with candy caps
    const posts = w.posts.filter((p) => p.look !== 'lip');
    if (posts.length) {
      const postGeo = kit.geo('rail-post', () => new THREE.CylinderGeometry(0.15, 0.16, 1, 10));
      const capGeo = kit.geo('rail-cap', () => new THREE.SphereGeometry(0.13, 12, 8));
      const pm = new THREE.InstancedMesh(postGeo, kit.std('#b8713a', { rough: 0.8 }), posts.length);
      const cm = new THREE.InstancedMesh(capGeo, kit.std(theme, { rough: 0.35 }), posts.length);
      const o = new THREE.Object3D();
      posts.forEach((p, i) => {
        const hh = p.h + 0.08;
        o.position.set(p.x, p.y + hh / 2, p.z);
        o.scale.set(p.look === 'fence' ? 0.6 : 1, hh, p.look === 'fence' ? 0.6 : 1);
        o.updateMatrix();
        pm.setMatrixAt(i, o.matrix);
        o.position.set(p.x, p.y + hh + 0.04, p.z);
        o.scale.setScalar(p.look === 'fence' ? 0.7 : 1);
        o.updateMatrix();
        cm.setMatrixAt(i, o.matrix);
      });
      if (posts[0]!.look === 'fence') pm.material = kit.std('#fbf6ea', { rough: 0.65 });
      if (posts[0]!.look === 'stone') {
        pm.material = kit.std('#b2ab9f', { rough: 0.95, flat: true });
      }
      pm.castShadow = cm.castShadow = kit.shadows;
      add(pm);
      add(cm);
    }
  }

  // ---- water
  const waterMats: { mat: THREE.MeshStandardMaterial; tex: THREE.Texture; flow: Pt | null }[] = [];
  const ducks: { obj: THREE.Object3D; cx: number; cz: number; rad: number; speed: number; phase: number; scared: number }[] = [];
  for (const wt of waters) {
    let pts = wt.pts;
    // a stream is clipped to the island and falls off its edge
    if (!wt.pts.every((p) => pointInPoly(outline, p[0], p[1]))) {
      const xs = wt.pts.map((p) => p[0]);
      const zs = wt.pts.map((p) => p[1]);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      let clipped = outline;
      clipped = clipPoly(clipped, 0, 1, z0);
      clipped = clipPoly(clipped, 0, -1, -z1);
      pts = clipped;
      void xs;
    }
    const tex = kit.keep(kit.tex.water.clone());
    tex.needsUpdate = true;
    tex.repeat.set(0.25, 0.25);
    const mat = kit.own(`water-${index}-${waterMats.length}`, () => new THREE.MeshStandardMaterial({ color: '#43bdf0', map: tex, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86 }));
    waterMats.push({ mat, tex, flow: wt.flow ?? null });
    const g = own(flatGeo(pts, [], () => wt.level, 1));
    const wm = add(new THREE.Mesh(g, mat));
    wm.receiveShadow = kit.shadows;
    if (wt.flow) {
      // the waterfall where the stream leaves the island
      const zs = wt.pts.map((p) => p[1]);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      const edgeX = Math.max(...pts.map((p) => p[0]));
      const fallTex = kit.keep(kit.tex.water.clone());
      fallTex.needsUpdate = true;
      fallTex.repeat.set(0.6, 0.4);
      const fallMat = kit.own(`fall-${index}`, () => new THREE.MeshStandardMaterial({ color: '#7fd6f7', map: fallTex, roughness: 0.2, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      waterMats.push({ mat: fallMat, tex: fallTex, flow: [0, -2.2] });
      const fall = own(new THREE.PlaneGeometry(z1 - z0, 3.2, 1, 6));
      const fp = fall.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fp.count; i++) {
        const y = fp.getY(i);
        // curl outwards as it falls
        const k = (1.6 - y) / 3.2;
        fp.setZ(i, k * k * 1.2);
      }
      fall.computeVertexNormals();
      const fm = mesh(fall, fallMat, [edgeX + 0.02, wt.level - 1.6, (z0 + z1) / 2], 1, [0, Math.PI / 2, 0]);
      add(fm);
      // foam where it tips over
      const foam = kit.std('#ffffff', { rough: 0.6 });
      for (let i = 0; i < 7; i++) add(mesh(kit.lowSphere, foam, [edgeX, wt.level + 0.02, z0 + ((i + 0.5) / 7) * (z1 - z0)], [0.18, 0.08, 0.3]));
    }
    // ducks paddling round
    for (let i = 0; i < (wt.ducks ?? 0); i++) {
      const d = P.duck(kit, i + index * 3);
      const c = centroid(wt.pts);
      const spots: [number, number, number][] = [
        [c[0] + 2.3, c[1] + 0.2, 0.45],
        [c[0] + 0.2, c[1] - 1.4, 0.7],
        [c[0] - 1.6, c[1] - 1.0, 0.4],
      ];
      const [cx, cz, rad] = spots[i % spots.length]!;
      d.obj.scale.setScalar(1.15);
      add(d.obj);
      ducks.push({ obj: d.obj, cx, cz, rad, speed: 0.35 + i * 0.1, phase: i * 2.1, scared: 0 });
    }
  }

  // ---- static obstacles
  for (const st of w.statics) {
    const o = st.spec;
    switch (o.type) {
      case 'bale': {
        const p = P.bale(kit);
        p.obj.position.set(o.x, w.heightAt(o.x, o.z) - 0.005, o.z);
        p.obj.rotation.y = o.yaw ?? 0;
        shade(kit, p.obj, true, true);
        add(p.obj);
        break;
      }
      case 'roundbale': {
        const p = P.roundBale(kit, o.stand);
        p.obj.position.set(o.x, w.heightAt(o.x, o.z) - 0.005, o.z);
        p.obj.rotation.y = o.yaw ?? 0;
        shade(kit, p.obj, true, true);
        add(p.obj);
        break;
      }
      case 'post': {
        const rr = o.r ?? 0.3;
        const y0 = w.heightAt(o.x, o.z);
        if (o.look === 'tree') {
          const t = P.tree(kit, 'apple', index * 7 + 3);
          t.obj.scale.setScalar(1.25);
          t.obj.position.set(o.x, y0, o.z);
          t.obj.add(mesh(kit.cyl8, kit.std(P.PAL.trunk, { rough: 0.9 }), [0, 0.35, 0], [rr / 1.25, 0.7, rr / 1.25]));
          shade(kit, t.obj);
          add(t.obj);
          fadeable(t.obj, o.x, o.z, 1.9, 1.5);
        } else {
          const g = new THREE.Group();
          g.position.set(o.x, y0, o.z);
          g.add(mesh(kit.dodeca, kit.std('#b9bcc7', { rough: 0.9, flat: true }), [0, rr * 0.55, 0], [rr * 1.1, rr * 1.0, rr * 1.1], [0.3, index, 0.2]));
          g.add(mesh(kit.dodeca, kit.std('#cdbdb6', { rough: 0.9, flat: true }), [rr * 0.5, rr * 0.25, rr * 0.4], rr * 0.45, [0.1, 1, 0.5]));
          // a bit of moss on top
          g.add(mesh(kit.sphere, kit.std('#7bc24f', { rough: 1 }), [0, rr * 1.1, 0], [rr * 0.6, rr * 0.18, rr * 0.6]));
          shade(kit, g, true, true);
          add(g);
        }
        break;
      }
      case 'trough': {
        const p = P.trough(kit);
        p.obj.position.set(o.x, w.heightAt(o.x, o.z), o.z);
        p.obj.rotation.y = o.yaw ?? 0;
        shade(kit, p.obj);
        add(p.obj);
        break;
      }
      case 'wall':
        break; // drawn by the windmill and the barn
    }
  }

  // ---- big set pieces
  const occluders: HoleView['occluders'] = [];
  for (const b of spec.builds ?? []) {
    if (b.type === 'mill') occluders.push(buildMill(kit, root, b.x, b.z, owned));
    else if (b.type === 'barn') occluders.push(buildBarn(kit, root, b.x, b.z, b.w ?? 7, b.d ?? 4, owned));
    else if (b.type === 'bridge') buildBridge(kit, root, w);
  }

  // ---- movers
  const cows: HoleView['cows'] = [];
  let sails: THREE.Group | null = null;
  let windmill: Windmill | null = null;
  let spinnerObj: THREE.Group | null = null;
  let spinner: Spinner | null = null;
  for (const m of w.movers) {
    if (m instanceof Windmill) {
      windmill = m;
      sails = buildSails(kit, m);
      add(sails);
    } else if (m instanceof Cow) {
      const rig = P.cow(kit, m.s.calf ?? false);
      shade(kit, rig.obj);
      add(rig.obj);
      cows.push({ mover: m, rig, bump: 0 });
    } else if (m instanceof Spinner) {
      spinner = m;
      const g = new THREE.Group();
      g.position.set(m.s.x, 0, m.s.z);
      const bar = new THREE.Group();
      g.add(bar);
      bar.add(mesh(kit.rbox, kit.std('#ff5c8a', { rough: 0.4 }), [0, 0.22, 0], [m.s.len, 0.36, 0.22]));
      for (const sx of [-1, 1]) bar.add(mesh(kit.sphere, kit.std('#ffd23f', { rough: 0.3 }), [(sx * m.s.len) / 2, 0.22, 0], 0.17));
      bar.add(mesh(kit.box, kit.std('#ffffff', { rough: 0.4 }), [0, 0.22, 0], [m.s.len * 0.7, 0.08, 0.23]));
      g.add(mesh(kit.cyl, kit.std('#ffffff', { rough: 0.4 }), [0, 0.45, 0], [0.16, 0.9, 0.16]));
      g.add(mesh(kit.sphere, kit.std('#4fc3ff', { rough: 0.3 }), [0, 0.95, 0], 0.2));
      shade(kit, g);
      add(g);
      spinnerObj = bar;
    }
  }

  // ---- decorations
  const flowerSpots: [number, number, number][] = [];
  for (const d of spec.decos ?? []) {
    const y = ISLAND_Y;
    let p: P.Prop | null = null;
    const seed = Math.round(d.x * 13 + d.z * 7) + index * 31;
    switch (d.type) {
      case 'tree':
      case 'apple':
      case 'birch':
        p = P.tree(kit, d.type, seed);
        keepOut.push([d.x, d.z, 0.9]);
        break;
      case 'hen':
        p = P.hen(kit, seed);
        break;
      case 'sheep':
        p = P.sheep(kit, seed);
        break;
      case 'pig':
        p = P.pig(kit, seed);
        break;
      case 'sunflower':
        p = P.sunflower(kit, seed);
        break;
      case 'bale':
        p = P.bale(kit);
        break;
      case 'roundbale':
        p = P.roundBale(kit);
        break;
      case 'rock':
        p = P.rock(kit, seed);
        break;
      case 'mushroom':
        p = P.mushroom(kit, seed);
        break;
      case 'scarecrow':
        p = P.scarecrow(kit);
        break;
      case 'sign':
        p = P.sign(kit, d.s ?? index + 1);
        break;
      case 'reeds':
        p = P.reeds(kit, seed);
        break;
      case 'lily':
        p = P.lily(kit, seed);
        break;
      case 'bush':
        p = P.bush(kit, seed);
        break;
      case 'balloons':
        p = P.balloons(kit, seed);
        break;
      case 'cart':
        p = P.cart(kit);
        break;
      case 'well':
        p = P.well(kit);
        break;
      case 'trough':
        p = P.trough(kit);
        break;
      case 'fence':
        p = P.fence(kit, d.x, d.z, d.x1 ?? d.x + 2, d.z1 ?? d.z);
        p.obj.position.y = y;
        shade(kit, p.obj);
        add(p.obj);
        keepOut.push([(d.x + (d.x1 ?? d.x)) / 2, (d.z + (d.z1 ?? d.z)) / 2, 0.4]);
        continue;
      case 'bunting':
        p = P.bunting(kit, d.x, d.z, d.x1 ?? d.x, d.z1 ?? d.z, seed);
        p.obj.position.y = y;
        add(p.obj);
        if (p.anim) anims.push(p.anim);
        p.obj.traverse((c) => {
          const g = (c as THREE.Mesh).geometry;
          if (g && g.type === 'TubeGeometry') owned.push(g);
        });
        continue;
      case 'flowers':
        flowerSpots.push([d.x, d.z, 0.55]);
        continue;
    }
    if (!p) continue;
    if (d.type === 'lily') p.obj.position.set(d.x, (waters[0]?.level ?? -0.4) + 0.01, d.z);
    else if (d.type === 'reeds') p.obj.position.set(d.x, y, d.z);
    else p.obj.position.set(d.x, y, d.z);
    p.obj.rotation.y = d.yaw ?? (d.type === 'sign' ? 0 : r() * Math.PI * 2);
    if (d.s && d.type !== 'sign') p.obj.scale.multiplyScalar(d.s);
    if (d.type === 'sign') p.obj.rotation.y = 0;
    shade(kit, p.obj, d.type !== 'lily', false);
    add(p.obj);
    if (p.anim) anims.push(p.anim);
    if (d.type !== 'lily') keepOut.push([d.x, d.z, d.type === 'tree' || d.type === 'apple' || d.type === 'birch' ? 0.9 : 0.6]);
    if (d.type === 'tree' || d.type === 'apple' || d.type === 'birch') fadeable(p.obj, d.x, d.z, 1.6, 1.4);
    else if (d.type === 'scarecrow' || d.type === 'sunflower' || d.type === 'balloons' || d.type === 'well') fadeable(p.obj, d.x, d.z, 1.0, 0.9);
  }

  // ---- scattered grass tufts and flowers on the island
  {
    const many = kit.quality === 'high';
    const ox = Math.min(...outline.map((p) => p[0]));
    const ox1 = Math.max(...outline.map((p) => p[0]));
    const oz = Math.min(...outline.map((p) => p[1]));
    const oz1 = Math.max(...outline.map((p) => p[1]));
    const okSpot = (x: number, z: number, pad: number): boolean => {
      if (!tops.some((t) => pointInPoly(t, x, z))) return false;
      for (const [dx, dz] of [
        [0, 0],
        [pad, 0],
        [-pad, 0],
        [0, pad],
        [0, -pad],
      ] as const) {
        if (!tops.some((t) => pointInPoly(t, x + dx, z + dz))) return false;
        if (w.onGreen(x + dx, z + dz)) return false;
        if (w.waterAt(x + dx, z + dz)) return false;
      }
      for (const [kx, kz, kr] of keepOut) if ((x - kx) ** 2 + (z - kz) ** 2 < kr * kr) return false;
      return true;
    };
    // grass tufts
    const tuftGeo = kit.geo('tuft', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const c = new THREE.ConeGeometry(0.035, 0.26, 4, 1);
        c.translate(0, 0.13, 0);
        c.rotateZ((i - 1.5) * 0.28);
        c.rotateY(i * 1.3);
        c.translate((i - 1.5) * 0.03, 0, (i % 2) * 0.03);
        parts.push(c);
      }
      const m = mergeGeometries(parts, false)!;
      for (const p of parts) p.dispose();
      return m;
    });
    const nT = many ? 420 : 170;
    const tufts = new THREE.InstancedMesh(tuftGeo, kit.std('#ffffff', { rough: 0.9, tag: 'tuft' }), nT);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const greens = ['#5cae3e', '#74c24c', '#4d9e38', '#8ccf5a'];
    let k = 0;
    for (let tries = 0; tries < nT * 8 && k < nT; tries++) {
      const x = ox + r() * (ox1 - ox);
      const z = oz + r() * (oz1 - oz);
      if (!okSpot(x, z, 0.3)) continue;
      o.position.set(x, ISLAND_Y, z);
      o.rotation.set(0, r() * 6.28, 0);
      o.scale.setScalar(0.7 + r() * 0.9);
      o.updateMatrix();
      tufts.setMatrixAt(k, o.matrix);
      tufts.setColorAt(k, col.set(greens[k % greens.length]!));
      k++;
    }
    tufts.count = k;
    add(tufts);
    // flowers: scattered ones plus the decorated clusters
    const spots: [number, number][] = [];
    for (const [fx, fz, rad] of flowerSpots) for (let i = 0; i < 9; i++) spots.push([fx + (r() - 0.5) * rad * 2, fz + (r() - 0.5) * rad * 2]);
    const nF = many ? 90 : 40;
    for (let tries = 0; tries < nF * 8 && spots.length < nF + flowerSpots.length * 9; tries++) {
      const x = ox + r() * (ox1 - ox);
      const z = oz + r() * (oz1 - oz);
      if (okSpot(x, z, 0.3)) spots.push([x, z]);
    }
    const headGeo = kit.geo('flower-head', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const s = new THREE.SphereGeometry(0.045, 6, 4);
        s.scale(1, 0.4, 0.6);
        s.translate(0.05, 0, 0);
        s.rotateY((i / 5) * Math.PI * 2);
        parts.push(s);
      }
      const c = new THREE.SphereGeometry(0.03, 6, 4);
      c.translate(0, 0.015, 0);
      parts.push(c);
      // the middle stays yellow whatever colour the petals get
      const cols: number[] = [];
      parts.forEach((p, i) => {
        const n = p.attributes.position!.count;
        const cc = i === 5 ? new THREE.Color('#ffd23f') : new THREE.Color('#ffffff');
        for (let j = 0; j < n; j++) cols.push(cc.r, cc.g, cc.b);
      });
      const m = mergeGeometries(parts, false)!;
      m.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      for (const p of parts) p.dispose();
      return m;
    });
    const stemGeo = kit.geo('flower-stem', () => new THREE.CylinderGeometry(0.012, 0.012, 1, 4).translate(0, 0.5, 0));
    const heads = new THREE.InstancedMesh(headGeo, kit.std('#ffffff', { rough: 0.6, vertexColors: true, tag: 'flower' }), spots.length);
    const stems = new THREE.InstancedMesh(stemGeo, kit.std('#4f9a3a', { rough: 0.8 }), spots.length);
    const petals = ['#ff5c8a', '#ffffff', '#ffd23f', '#b388ff', '#ff8a3d', '#ff9fd0', '#7fd8ff'];
    let fk = 0;
    for (const [x, z] of spots) {
      const h = 0.14 + r() * 0.16;
      o.position.set(x, ISLAND_Y, z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      stems.setMatrixAt(fk, o.matrix);
      o.position.set(x, ISLAND_Y + h, z);
      o.rotation.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4);
      o.scale.setScalar(0.9 + r() * 0.5);
      o.updateMatrix();
      heads.setMatrixAt(fk, o.matrix);
      heads.setColorAt(fk, col.set(petals[Math.floor(r() * petals.length)]!));
      fk++;
    }
    heads.count = stems.count = fk;
    add(stems);
    add(heads);
  }


  // ---- bounds for the camera
  const box = new THREE.Box3();
  for (const p of pieces) {
    box.expandByPoint(new THREE.Vector3(p.x0, 0, p.z0));
    box.expandByPoint(new THREE.Vector3(p.x1, 0, p.z1));
  }
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;

  // ---- animation
  const tmpV = new THREE.Vector3();
  const ray = new THREE.Ray();
  const update = (t: number, dt: number, wd: World, bx: number, by: number, bz: number, cam: THREE.Vector3): void => {
    for (const a of anims) a(t, dt);
    for (const wm of waterMats) {
      if (wm.flow) {
        wm.tex.offset.x -= wm.flow[0] * dt * 0.12;
        wm.tex.offset.y += wm.flow[1] * dt * 0.12;
      } else {
        wm.tex.offset.x += dt * 0.01;
        wm.tex.offset.y += dt * 0.006;
      }
    }
    for (const d of ducks) {
      d.scared = Math.max(0, d.scared - dt);
      const sp = d.speed * (d.scared > 0 ? 3.5 : 1);
      d.phase += dt * sp;
      const x = d.cx + Math.cos(d.phase) * d.rad;
      const z = d.cz + Math.sin(d.phase) * d.rad;
      d.obj.position.x = x;
      d.obj.position.z = z;
      d.obj.position.y = (waters[0]?.level ?? -0.42) - 0.02 + Math.sin(t * 2.2 + d.cx * 3) * 0.015 + (d.scared > 0 ? Math.abs(Math.sin(t * 14)) * 0.06 : 0);
      d.obj.rotation.y = -d.phase - Math.PI / 2 + Math.PI;
    }
    if (sails && windmill) sails.rotation.z = windmill.angle;
    if (spinnerObj && spinner) spinnerObj.rotation.y = spinner.angle;
    if (carouselGroup && carousel) {
      carouselGroup.rotation.y = carousel.angle;
      horses.forEach((h, i) => {
        h.position.y = 0.95 + Math.sin(t * 2.2 + i * 2.1) * 0.22;
      });
    }
    for (const c of cows) {
      const m = c.mover;
      const rig = c.rig;
      c.bump = Math.max(0, c.bump - dt * 3);
      rig.obj.position.set(m.x, wd.heightAt(m.x, m.z) + Math.sin(c.bump * Math.PI) * 0.15, m.z);
      rig.obj.rotation.y = m.yaw;
      const moving = m.mode === 'walk' || m.mode === 'turn';
      const sw = moving ? Math.sin(m.walk) * 0.45 : 0;
      rig.legs.forEach((l, i) => {
        l.rotation.z = (i === 0 || i === 3 ? sw : -sw) * 1;
      });
      rig.head.rotation.z = -m.head * 0.85 + Math.sin(t * 2 + m.s.phase * 9) * 0.04;
      rig.head.position.y = 0.92 - m.head * 0.22;
      rig.tail.rotation.x = Math.sin(t * 3 + m.s.phase * 5) * 0.5;
      rig.body.rotation.x = Math.sin(c.bump * Math.PI * 2) * 0.05;
    }
    // the flag: lifted out when the ball comes close, waving in the breeze
    flag.wiggle = Math.max(0, flag.wiggle - dt * 1.5);
    flagY += (flag.lift * 1.6 - flagY) * Math.min(1, dt * 6);
    flagGroup.position.y = flagY;
    flagGroup.rotation.z = Math.sin(t * 18) * flag.wiggle * 0.25;
    const cp = clothGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const x = clothBase[i * 3]!;
      const y = clothBase[i * 3 + 1]!;
      const k = x / 0.66;
      cp.setZ(i, Math.sin(t * 5 - x * 7 + y * 2) * 0.06 * k);
    }
    cp.needsUpdate = true;
    // trees and friends turn see-through when they stand between the camera and the ball
    for (const f of faders) {
      tmpV.set(bx, by, bz).sub(cam);
      const len2 = tmpV.lengthSq() || 1;
      const t2 = clamp01(((f.c.x - cam.x) * tmpV.x + (f.c.y - cam.y) * tmpV.y + (f.c.z - cam.z) * tmpV.z) / len2);
      const dx = cam.x + tmpV.x * t2 - f.c.x;
      const dy = cam.y + tmpV.y * t2 - f.c.y;
      const dz = cam.z + tmpV.z * t2 - f.c.z;
      const hide = t2 < 0.98 && dx * dx + dy * dy + dz * dz < f.r * f.r;
      f.fade += ((hide ? 1 : 0) - f.fade) * Math.min(1, dt * 6);
      for (const m of f.mats) {
        m.opacity = 1 - f.fade * 0.75;
        m.depthWrite = f.fade < 0.3;
      }
    }
    // big buildings fade when they would hide the ball
    for (const oc of occluders) {
      tmpV.set(bx, by, bz);
      let hide = oc.box.containsPoint(tmpV);
      if (!hide) {
        ray.origin.copy(cam);
        ray.direction.copy(tmpV).sub(cam);
        const len = ray.direction.length();
        ray.direction.divideScalar(len || 1);
        const hit = ray.intersectBox(oc.box, new THREE.Vector3());
        hide = !!hit && hit.distanceTo(cam) < len - 0.3;
      }
      oc.fade += ((hide ? 1 : 0) - oc.fade) * Math.min(1, dt * 5);
      for (const m of oc.mats) {
        m.opacity = 1 - oc.fade * 0.7;
        m.depthWrite = oc.fade < 0.5;
      }
    }
  };

  const scare = (x: number, z: number): void => {
    for (const d of ducks) if (Math.hypot(d.obj.position.x - x, d.obj.position.z - z) < 4) d.scared = 1.6;
  };

  return {
    root,
    update,
    flag,
    occluders,
    center,
    radius,
    cows,
    scare,
    dispose: () => {
      root.removeFromParent();
      for (const g of owned) g.dispose();
      for (const m of ownedMats) m.dispose();
      root.traverse((c) => {
        const im = c as THREE.InstancedMesh;
        if (im.isInstancedMesh) im.dispose();
      });
    },
  };
}

// ---------------------------------------------------------------- set pieces

function buildSails(kit: Kit, m: Windmill): THREE.Group {
  const s = m.s;
  const g = new THREE.Group();
  g.position.set(s.x, s.hubY, s.z);
  const frame = kit.std('#fff8ef', { rough: 0.6 });
  const cloth = kit.std('#e94848', { rough: 0.7, side: THREE.DoubleSide });
  const cloth2 = kit.std('#fff3e0', { rough: 0.7, side: THREE.DoubleSide });
  const arm = kit.std('#8a5a33', { rough: 0.8 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = (i * Math.PI) / 2;
    // built pointing down (-y)
    const L = s.len;
    blade.add(mesh(kit.box, arm, [0, -(L / 2 + 0.12), 0], [0.12, L, 0.1]));
    const w = s.w;
    const rows = 6;
    for (let k = 0; k < rows; k++) {
      const y = -(0.55 + ((L - 0.45) * (k + 0.5)) / rows);
      blade.add(mesh(kit.box, (k + i) % 2 ? cloth : cloth2, [0, y, 0.03], [w * 0.94, (L - 0.45) / rows - 0.04, 0.02]));
    }
    for (const x of [-w / 2, w / 2]) blade.add(mesh(kit.box, frame, [x, -(0.55 + (L - 0.45) / 2), 0.04], [0.05, L - 0.45, 0.05]));
    for (let k = 0; k <= rows; k++) blade.add(mesh(kit.box, frame, [0, -(0.55 + ((L - 0.45) * k) / rows), 0.04], [w, 0.04, 0.05]));
    g.add(blade);
  }
  g.add(mesh(kit.cyl, kit.std('#5b4636', { rough: 0.7 }), [0, 0, -0.2], [0.14, 0.5, 0.14], [Math.PI / 2, 0, 0]));
  g.add(mesh(kit.sphere, kit.std('#ffd23f', { rough: 0.35 }), [0, 0, 0.08], 0.2));
  shade(kit, g);
  return g;
}

function buildMill(kit: Kit, root: THREE.Group, x: number, z: number, owned: THREE.BufferGeometry[]): HoleView['occluders'][number] {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const red = kit.own('mill-red', () => new THREE.MeshStandardMaterial({ color: '#d43c3c', roughness: 0.75, transparent: true }));
  const white = kit.own('mill-white', () => new THREE.MeshStandardMaterial({ color: '#fff8ef', roughness: 0.6, transparent: true }));
  const roof = kit.own('mill-roof', () => new THREE.MeshStandardMaterial({ color: '#46526e', roughness: 0.7, flatShading: true, transparent: true }));
  const dark = kit.std('#2a2326', { rough: 0.9 });
  const bh = 1.6;
  // two blocks either side of the tunnel and a lintel above it
  for (const sx of [-1, 1]) {
    g.add(mesh(kit.box, red, [sx * 1.46, bh / 2 - 0.12, 0], [1.68, bh + 0.24, 2.8]));
    g.add(mesh(kit.box, white, [sx * 2.3, bh / 2 - 0.12, 1.38], [0.12, bh + 0.24, 0.12]));
    g.add(mesh(kit.box, white, [sx * 2.3, bh / 2 - 0.12, -1.38], [0.12, bh + 0.24, 0.12]));
  }
  g.add(mesh(kit.box, red, [0, 1.17, 0], [1.24, 0.86, 2.8]));
  g.add(mesh(kit.box, dark, [0, 0.74, 0], [1.24, 0.02, 2.78]));
  for (const zz of [-1.41, 1.41]) {
    g.add(mesh(kit.box, white, [0, 0.79, zz], [1.5, 0.1, 0.06]));
    for (const sx of [-1, 1]) g.add(mesh(kit.box, white, [sx * 0.67, 0.36, zz], [0.1, 0.86, 0.06]));
  }
  g.add(mesh(kit.box, white, [0, bh + 0.1, 0], [4.72, 0.12, 2.92]));
  // the tower
  const tower = own(owned, new THREE.CylinderGeometry(1.15, 1.55, 2.3, 8, 1));
  g.add(mesh(tower, red, [0, bh + 0.16 + 1.15, 0], 1, [0, Math.PI / 8, 0]));
  const trim = own(owned, new THREE.CylinderGeometry(1.2, 1.2, 0.12, 8, 1));
  g.add(mesh(trim, white, [0, bh + 0.16 + 2.3, 0], 1, [0, Math.PI / 8, 0]));
  const cap = own(owned, new THREE.ConeGeometry(1.35, 1.0, 8, 1));
  g.add(mesh(cap, roof, [0, bh + 0.16 + 2.3 + 0.55, 0], 1, [0, Math.PI / 8, 0]));
  g.add(mesh(kit.sphere, kit.std('#ffd23f', { rough: 0.3 }), [0, bh + 0.16 + 2.3 + 1.1, 0], 0.12));
  // windows
  for (const [wx, wy] of [
    [0, 2.95],
    [-0.62, 2.35],
  ] as const) {
    g.add(mesh(kit.box, white, [wx, wy, 1.22], [0.42, 0.42, 0.06]));
    g.add(mesh(kit.box, kit.std('#3b6fa0', { rough: 0.3 }), [wx, wy, 1.25], [0.3, 0.3, 0.04]));
  }
  // the axle out to the sails
  g.add(mesh(kit.cyl, kit.std('#5b4636', { rough: 0.7 }), [0, 2.62, 1.45], [0.11, 0.6, 0.11], [Math.PI / 2, 0, 0]));
  // flower boxes
  for (const sx of [-1, 1]) {
    g.add(mesh(kit.box, kit.std('#8a5a33', { rough: 0.8 }), [sx * 1.6, 1.05, 1.47], [0.7, 0.16, 0.18]));
    for (let i = 0; i < 4; i++) g.add(mesh(kit.sphere, kit.std(THEME[(i + (sx > 0 ? 2 : 0)) % THEME.length]!, { rough: 0.5 }), [sx * 1.6 - 0.24 + i * 0.16, 1.18, 1.48], 0.07));
  }
  shade(kit, g, true, true);
  root.add(g);
  const box = new THREE.Box3(new THREE.Vector3(x - 2.4, -0.2, z - 1.5), new THREE.Vector3(x + 2.4, 5, z + 1.45));
  return { box, mats: [red, white, roof], fade: 0 };
}

function buildBarn(kit: Kit, root: THREE.Group, x: number, z: number, w: number, d: number, owned: THREE.BufferGeometry[]): HoleView['occluders'][number] {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const red = kit.own('barn-red', () => new THREE.MeshStandardMaterial({ color: '#cf3a3a', roughness: 0.8, map: kit.tex.wood, transparent: true }));
  const white = kit.own('barn-white', () => new THREE.MeshStandardMaterial({ color: '#fff8ef', roughness: 0.6, transparent: true }));
  const roofMat = kit.own('barn-roof', () => new THREE.MeshStandardMaterial({ color: '#4d5b7c', roughness: 0.7, transparent: true }));
  const dark = kit.std('#1f1a1c', { rough: 0.95 });
  const H = 2.2;
  const zf = d / 2 - 0.15; // front wall's middle (local)
  const zb = -d / 2 + 0.05;
  // the front wall with two doorways (local x = world x - x)
  const doors: [number, number, number][] = [
    [-2.2 - x, -1.3 - x, 1.15],
    [0.5 - x, 2.1 - x, 1.5],
  ];
  const segs: [number, number][] = [
    [-w / 2, doors[0]![0]],
    [doors[0]![1], doors[1]![0]],
    [doors[1]![1], w / 2],
  ];
  for (const [a, b] of segs) g.add(mesh(kit.box, red, [(a + b) / 2, H / 2 - 0.12, zf], [b - a, H + 0.24, 0.3]));
  for (const [a, b, dh] of doors) {
    g.add(mesh(kit.box, red, [(a + b) / 2, (dh + H) / 2, zf], [b - a, H - dh + 0.01, 0.3]));
    g.add(mesh(kit.box, dark, [(a + b) / 2, dh / 2 - 0.1, zf - 0.6], [b - a, dh + 0.2, 1.0]));
    // white frame and an open door leaf with an X
    g.add(mesh(kit.box, white, [(a + b) / 2, dh, zf + 0.16], [b - a + 0.2, 0.1, 0.05]));
    for (const xx of [a, b]) g.add(mesh(kit.box, white, [xx, dh / 2 - 0.06, zf + 0.16], [0.1, dh + 0.1, 0.05]));
    const leaf = new THREE.Group();
    const lw = (b - a) * 0.5;
    leaf.position.set(a - 0.05, 0, zf + 0.18);
    leaf.rotation.y = 1.9;
    leaf.add(mesh(kit.box, red, [-lw / 2, dh / 2 - 0.06, 0], [lw, dh - 0.1, 0.06]));
    const diag = Math.hypot(lw, dh - 0.1);
    const ang = Math.atan2(dh - 0.1, lw);
    leaf.add(mesh(kit.box, white, [-lw / 2, dh / 2 - 0.06, 0.04], [diag, 0.07, 0.03], [0, 0, ang]));
    leaf.add(mesh(kit.box, white, [-lw / 2, dh / 2 - 0.06, 0.04], [diag, 0.07, 0.03], [0, 0, -ang]));
    g.add(leaf);
  }
  // sides and back
  g.add(mesh(kit.box, red, [-w / 2 + 0.15, H / 2 - 0.12, (zf + zb) / 2], [0.3, H + 0.24, zf - zb]));
  g.add(mesh(kit.box, red, [w / 2 - 0.15, H / 2 - 0.12, (zf + zb) / 2], [0.3, H + 0.24, zf - zb]));
  g.add(mesh(kit.box, red, [0, H / 2 - 0.12, zb], [w, H + 0.24, 0.3]));
  // little dark holes in the back where the ball pops out
  for (const ex of [-1.75 - x, 3.3 - x]) {
    g.add(mesh(kit.box, dark, [ex, 0.25, zb - 0.13], [0.62, 0.5, 0.06]));
    g.add(mesh(kit.box, white, [ex, 0.52, zb - 0.15], [0.74, 0.08, 0.05]));
  }
  // corner trim
  for (const [cx, cz] of [
    [-w / 2, zf + 0.15],
    [w / 2, zf + 0.15],
    [-w / 2, zb - 0.15],
    [w / 2, zb - 0.15],
  ] as const)
    g.add(mesh(kit.box, white, [cx, H / 2 - 0.12, cz], [0.14, H + 0.24, 0.14]));
  // gable ends and the roof
  const gable = new THREE.Shape();
  gable.moveTo(-w / 2, 0);
  gable.lineTo(w / 2, 0);
  gable.lineTo(0, 1.5);
  gable.closePath();
  const gGeo = own(owned, new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }));
  g.add(mesh(gGeo, red, [0, H + 0.1, zf - 0.15]));
  g.add(mesh(gGeo, red, [0, H + 0.1, zb - 0.15]));
  const slope = Math.hypot(w / 2, 1.5);
  const pitch = Math.atan2(1.5, w / 2);
  for (const sx of [-1, 1]) g.add(mesh(kit.box, roofMat, [(sx * w) / 4, H + 0.1 + 0.75 + 0.06, (zf + zb) / 2], [slope + 0.25, 0.12, zf - zb + 0.7], [0, 0, sx * pitch]));
  // hay loft door with hay
  g.add(mesh(kit.box, white, [0, H + 0.62, zf + 0.17], [0.9, 0.8, 0.05]));
  g.add(mesh(kit.box, dark, [0, H + 0.62, zf + 0.19], [0.74, 0.64, 0.04]));
  g.add(mesh(kit.sphere, kit.std('#f2c64a', { map: kit.tex.hay, rough: 0.95 }), [0, H + 0.4, zf + 0.22], [0.35, 0.14, 0.12]));
  // a weathervane rooster
  const vane = new THREE.Group();
  vane.position.set(0, H + 1.7, (zf + zb) / 2);
  vane.add(mesh(kit.cyl8, kit.std('#3a3a3a', { rough: 0.5 }), [0, 0.3, 0], [0.03, 0.6, 0.03]));
  vane.add(mesh(kit.sphere, kit.std('#ffcc33', { rough: 0.3, metal: 0.6 }), [0, 0.68, 0], [0.22, 0.14, 0.05]));
  vane.add(mesh(kit.cone, kit.std('#e8463c', { rough: 0.5 }), [0.16, 0.82, 0], [0.05, 0.12, 0.03]));
  vane.add(mesh(kit.cone, kit.std('#ffcc33', { rough: 0.3, metal: 0.6 }), [-0.2, 0.8, 0], [0.08, 0.22, 0.04], [0, 0, 0.6]));
  g.add(vane);
  shade(kit, g, true, true);
  root.add(g);
  const box = new THREE.Box3(new THREE.Vector3(x - w / 2, -0.2, z - d / 2 - 0.1), new THREE.Vector3(x + w / 2, 4.2, z + d / 2 + 0.1));
  return { box, mats: [red, white, roofMat], fade: 0 };
}

function buildBridge(kit: Kit, root: THREE.Group, w: World): void {
  const lane = w.pieces.find((p): p is LanePiece => p instanceof LanePiece && p.surf === 'wood');
  if (!lane) return;
  const g = new THREE.Group();
  const plank = kit.std('#d39a5a', { map: kit.tex.wood, rough: 0.75 });
  const plank2 = kit.std('#c48748', { map: kit.tex.wood, rough: 0.75 });
  const beam = kit.std('#8a5a33', { rough: 0.85 });
  const n = Math.round(lane.len / 0.27);
  const yaw = Math.atan2(-lane.uz, lane.ux);
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * lane.len;
    const [h, dh] = lane.profile(s / lane.len);
    const px = lane.a[0] + lane.ux * s;
    const pz = lane.a[1] + lane.uz * s;
    const m = mesh(kit.box, i % 2 ? plank : plank2, [px, h - 0.045, pz], [lane.len / n - 0.025, 0.09, lane.hw * 2 + 0.18]);
    m.rotation.set(0, yaw, Math.atan(dh));
    g.add(m);
  }
  // the two side beams under the planks' ends
  for (const side of [-1, 1]) {
    const k = 12;
    for (let i = 0; i < k; i++) {
      const s0 = (i / k) * lane.len;
      const s1 = ((i + 1) / k) * lane.len;
      const [h0] = lane.profile(s0 / lane.len);
      const [h1] = lane.profile(s1 / lane.len);
      const sm = (s0 + s1) / 2;
      const off = (lane.hw + 0.12) * side;
      const x = lane.a[0] + lane.ux * sm - lane.uz * off;
      const z = lane.a[1] + lane.uz * sm + lane.ux * off;
      const m = mesh(kit.box, beam, [x, (h0 + h1) / 2 - 0.16, z], [Math.hypot(s1 - s0, h1 - h0) + 0.02, 0.16, 0.1]);
      m.rotation.set(0, yaw, Math.atan2(h1 - h0, s1 - s0));
      g.add(m);
    }
    // posts at the ends
    for (const s of [0.05, lane.len - 0.05]) {
      const off = (lane.hw + 0.16) * side;
      const x = lane.a[0] + lane.ux * s - lane.uz * off;
      const z = lane.a[1] + lane.uz * s + lane.ux * off;
      g.add(mesh(kit.cyl8, beam, [x, -0.1, z], [0.08, 0.9, 0.08]));
      g.add(mesh(kit.sphere, kit.std('#ffd23f', { rough: 0.4 }), [x, 0.38, z], 0.09));
    }
  }
  shade(kit, g, true, true);
  root.add(g);
}

function own<G extends THREE.BufferGeometry>(list: THREE.BufferGeometry[], g: G): G {
  list.push(g);
  return g;
}

// ---------------------------------------------------------------- the sky around everything

export interface Sky {
  root: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

export function buildSky(kit: Kit): Sky {
  const root = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const dome = own(owned, new THREE.SphereGeometry(320, 32, 16));
  const skyMat = kit.own('sky', () => new THREE.MeshBasicMaterial({ map: kit.tex.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
  const sky = new THREE.Mesh(dome, skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  // the sun: a soft glowing disc
  const sunMat = kit.own('sun', () => new THREE.MeshBasicMaterial({ color: '#fff4c2', fog: false, transparent: true, opacity: 0.95 }));
  const sun = mesh(kit.sphere, sunMat, [-120, 150, -170], 12);
  root.add(sun);
  const glowMat = kit.own('sun-glow', () => new THREE.MeshBasicMaterial({ color: '#fff1b0', fog: false, transparent: true, opacity: 0.25, depthWrite: false }));
  root.add(mesh(kit.sphere, glowMat, [-120, 150, -170], 22));
  // clouds
  const cloudMat = kit.std('#ffffff', { rough: 1, emissive: '#dfefff', emissiveIntensity: 0.35, tag: 'cloud' });
  const clouds = new THREE.Group();
  const r = rng(99);
  const nC = kit.quality === 'high' ? 14 : 8;
  for (let i = 0; i < nC; i++) {
    const c = new THREE.Group();
    const a = (i / nC) * Math.PI * 2 + r() * 0.4;
    const dist = 85 + r() * 60;
    c.position.set(Math.cos(a) * dist, -4 + r() * 24, Math.sin(a) * dist);
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) c.add(mesh(kit.sphere, cloudMat, [(k - n / 2) * 2.2 + r(), r() * 1.2, r() * 1.5], 2 + r() * 1.8));
    c.scale.setScalar(1 + r() * 0.8);
    clouds.add(c);
  }
  root.add(clouds);
  // and clouds drifting below the islands
  const below = new THREE.Group();
  const nB = kit.quality === 'high' ? 12 : 7;
  for (let i = 0; i < nB; i++) {
    const c = new THREE.Group();
    const a = (i / nB) * Math.PI * 2 + r() * 0.5;
    const dist = 22 + r() * 40;
    c.position.set(Math.cos(a) * dist, -16 - r() * 10, Math.sin(a) * dist);
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) c.add(mesh(kit.sphere, cloudMat, [(k - n / 2) * 2.4 + r(), r() * 1.0, r() * 2], 2.2 + r() * 2));
    c.scale.set(1.3 + r() * 0.6, 0.7, 1.3 + r() * 0.6);
    below.add(c);
  }
  root.add(below);
  // far-off little islands
  const isl = new THREE.Group();
  const grass = kit.std('#8fd166', { rough: 1, flat: true });
  const earth = kit.std('#a8733f', { rough: 1, flat: true });
  const nI = kit.quality === 'high' ? 6 : 4;
  for (let i = 0; i < nI; i++) {
    const g = new THREE.Group();
    const a = (i / nI) * Math.PI * 2 + 0.5;
    const dist = 48 + r() * 30;
    g.position.set(Math.cos(a) * dist, -10 + r() * 14, Math.sin(a) * dist);
    const s = 1.5 + r() * 2;
    g.add(mesh(kit.cyl8, grass, [0, 0, 0], [s * 1.6, 0.4, s * 1.6]));
    g.add(mesh(kit.geo('far-cone', () => new THREE.ConeGeometry(1, 1, 8).rotateX(Math.PI)), earth, [0, -s * 1.2, 0], [s * 1.6, s * 2.2, s * 1.6]));
    for (let k = 0; k < 2; k++) {
      g.add(mesh(kit.cyl8, kit.std(P.PAL.trunk, { rough: 0.9 }), [(k - 0.5) * s, 0.6, (r() - 0.5) * s], [0.15, 1, 0.15]));
      g.add(mesh(kit.ico, kit.std(P.PAL.leaf, { rough: 0.85, flat: true }), [(k - 0.5) * s, 1.4, 0], 0.7));
    }
    g.userData.bob = r() * 10;
    isl.add(g);
  }
  root.add(isl);
  return {
    root,
    update: (t) => {
      clouds.rotation.y = t * 0.004;
      below.rotation.y = -t * 0.006;
      isl.children.forEach((c) => {
        c.position.y += Math.sin(t * 0.4 + (c.userData.bob as number)) * 0.004;
      });
    },
    dispose: () => {
      root.removeFromParent();
      for (const g of owned) g.dispose();
    },
  };
}
