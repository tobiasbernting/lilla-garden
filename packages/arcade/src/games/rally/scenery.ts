// Everything standing round the circuit: forests of birch and pine (instanced in tiles), the farm,
// cottages and the windmill, pastures with grazing animals, the crowd at the start, flags, bales,
// boulders and lupins along the road.
import * as THREE from 'three';
import { Geo, blobTex, canvasTex, mat } from './geo.ts';
import { BUILDINGS, LAKE, PASTURES, WATER_Y, forest, inField, lakeDist, streamDist } from './layout.ts';
import * as M from './models.ts';
import type { Terrain } from './terrain.ts';
import type { Track } from './track.ts';
import { clamp, rng } from './util.ts';

export interface Scenery {
  group: THREE.Group;
  /** Animate: wind, grazing, the crowd (more when the player is near or `cheer` is up). */
  update(time: number, focus: THREE.Vector3, cheer: number): void;
  /** Spots where a crowd stands (for the cheering sound). */
  crowds: THREE.Vector3[];
  dispose(): void;
}

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

function swedishFlag(): THREE.CanvasTexture {
  return canvasTex(160, 100, (g) => {
    g.fillStyle = '#006aa7';
    g.fillRect(0, 0, 160, 100);
    g.fillStyle = '#fecc00';
    g.fillRect(50, 0, 20, 100);
    g.fillRect(0, 40, 160, 20);
  });
}

function grandstand(): THREE.BufferGeometry {
  const g = new Geo();
  const W = 34;
  for (let k = 0; k < 4; k++) g.box(W, 0.5 + k * 0.8, 1.6, k % 2 ? '#cbc4b6' : '#b7b0a2', 0, (0.5 + k * 0.8) / 2, k * 1.6);
  g.box(W + 0.4, 5.6, 0.3, M.FALU, 0, 2.8, 4 * 1.6 - 0.6);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 5) g.box(0.22, 5.4, 0.22, M.WHITE, x, 2.7, -0.7);
  const ang = Math.atan2(1.2, 7.6);
  g.box(W + 1.4, 0.2, 7.9, '#34363b', 0, 5.75, 2.5, -ang, 0, 0);
  g.box(W + 1.4, 0.7, 0.16, M.WHITE, 0, 5.2, -1.3);
  return g.build();
}

export function buildScenery(track: Track, terrain: Terrain, quality: 'high' | 'low', timeU: { value: number }): Scenery {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const high = quality === 'high';
  const r = rng(20261030);
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // ---- where things must not go ----
  const footprints: [number, number, number][] = BUILDINGS.map((b) => [b.x, b.z, b.kind === 'barn' ? 16 : b.kind === 'grandstand' ? 22 : b.kind === 'windmill' ? 10 : 9]);
  const crowdBox = (x: number, z: number): boolean => x > -90 && x < 90 && z > 160 && z < 205;
  const inPasture = (x: number, z: number, m = 2): boolean => PASTURES.some((p) => Math.abs(x - p.x) < p.hw + m && Math.abs(z - p.z) < p.hd + m);
  const blocked = (x: number, z: number, clear: number): boolean => {
    if (terrain.roadDist(x, z) < clear) return true;
    if (lakeDist(x, z) < 1.1) return true;
    if (streamDist(x, z).d < 6.5) return true;
    if (crowdBox(x, z) || inPasture(x, z)) return true;
    for (const [bx, bz, br] of footprints) if ((x - bx) ** 2 + (z - bz) ** 2 < br * br) return true;
    return false;
  };

  // ---- trees, in tiles so the far ones can be skipped ----
  const sceneryMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const treeMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND_PATCH);
  };
  // three levels of detail, chosen by distance to the road (the camera is always on it):
  // detailed trees near the road (they cast shadows), simple ones further off, and blobs on the far hills
  const midPine = new Geo().cone(2.3, 7.6, 5, '#2f5b33', 0, 4.4, 0).cyl(0.15, 0.25, 1.6, 4, '#4a3526', 0, 0.8, 0).build();
  const midBirch = new Geo().ball(1.9, '#80ad48', 0, 5.6, 0, 1, 1.2, 1).cyl(0.1, 0.15, 4.6, 4, '#e6e2d8', 0, 2.3, 0).build();
  const midOak = new Geo().ball(2.8, '#507f33', 0, 5.0, 0, 1.15, 0.9, 1.1).cyl(0.25, 0.38, 3.2, 4, '#4a3526', 0, 1.6, 0).build();
  const farPine = new Geo().cone(2.6, 9, 5, '#2f5b33', 0, 4.5, 0).build();
  const farRound = new Geo().ball(3.0, '#5a8a3c', 0, 4.6, 0, 1, 1.1, 1).build();
  const kinds = [M.pine(), M.birch(), M.oak(), M.bush(), midPine, midBirch, midOak, farPine, farRound];
  for (const k of kinds) keep(k);
  const tiles = new Map<string, { kind: number; m: THREE.Matrix4; c: THREE.Color }[]>();
  const aoSpots: THREE.Matrix4[] = [];
  const addTree = (kind: number, x: number, z: number, s: number): void => {
    const y = terrain.visual(x, z) - 0.1;
    // near trees in small tiles (culled well), the rest in bigger ones (fewer draw calls)
    const lod = kind < 4 ? 0 : kind < 7 ? 1 : 2;
    const tile = [200, 420, 800][lod]!;
    const key = `${lod}:${Math.floor(x / tile)},${Math.floor(z / tile)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    const v = 0.82 + r() * 0.3;
    list.push({ kind, m: mat(x, y, z, 0, r() * Math.PI * 2, 0, s, s * (0.9 + r() * 0.25), s), c: new THREE.Color(v, v * (0.95 + r() * 0.1), v * (0.9 + r() * 0.1)) });
    if (kind < 4 && high) aoSpots.push(mat(x, y + 0.12, z, 0, 0, 0, s * (kind === 3 ? 2.2 : 3.4), 1, s * (kind === 3 ? 2.2 : 3.4)));
  };
  // distance to the road from a thinned-out centre line
  const roadFar = (x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < track.n; i += 4) {
      const d = (track.px[i]! - x) ** 2 + (track.pz[i]! - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const nearD = high ? 115 : 85;
  const cx = (track.minX + track.maxX) / 2;
  const cz = (track.minZ + track.maxZ) / 2;
  const nearR = 560;
  const cell = high ? 6.4 : 9.5;
  for (let x = cx - nearR; x < cx + nearR; x += cell)
    for (let z = cz - nearR; z < cz + nearR; z += cell) {
      const px = x + r() * cell;
      const pz = z + r() * cell;
      const rr = Math.hypot(px - cx, pz - cz);
      if (rr > nearR) continue;
      const fo = forest(px, pz);
      const lone = 0.006;
      const roll = r();
      if (roll > fo.d * 0.8 + lone) continue;
      if (blocked(px, pz, 24.5)) continue;
      if (inField(px, pz, 3)) continue;
      let kind: number;
      if (fo.d < 0.08) kind = r() < 0.45 ? 2 : r() < 0.7 ? 1 : 0;
      else if (fo.d < 0.45 && r() < 0.22) kind = 3;
      else kind = r() < fo.birch ? 1 : 0;
      const s = kind === 0 ? 0.8 + r() * 0.65 : kind === 1 ? 0.85 + r() * 0.45 : kind === 2 ? 0.9 + r() * 0.4 : 0.8 + r() * 0.6;
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
      const fo = forest(px, pz);
      if (r() > fo.d * 0.9) continue;
      if (inField(px, pz, 4)) continue;
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
      im.receiveShadow = false;
      group.add(im);
    }
  }
  // soft dark spots under the near trees
  const aoTex = keep(blobTex(64, 0.2));
  const aoGeo = keep(new THREE.PlaneGeometry(1, 1));
  aoGeo.rotateX(-Math.PI / 2);
  const aoMat = keep(new THREE.MeshBasicMaterial({ map: aoTex, color: '#1d2a12', transparent: true, opacity: high ? 0.35 : 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  if (aoSpots.length) {
    const ao = new THREE.InstancedMesh(aoGeo, aoMat, aoSpots.length);
    aoSpots.forEach((m, i) => ao.setMatrixAt(i, m));
    ao.computeBoundingSphere();
    group.add(ao);
  }

  // ---- buildings, all in one mesh ----
  const stat = new Geo();
  let sails: THREE.Mesh | null = null;
  const groundAt = (x: number, z: number, rad: number): number => {
    let y = Infinity;
    for (const [dx, dz] of [
      [0, 0],
      [rad, 0],
      [-rad, 0],
      [0, rad],
      [0, -rad],
    ] as const)
      y = Math.min(y, terrain.visual(x + dx, z + dz));
    return y;
  };
  const standGeo = grandstand();
  for (const b of BUILDINGS) {
    const y = groundAt(b.x, b.z, b.kind === 'barn' ? 9 : b.kind === 'grandstand' ? 12 : 4) - 0.25;
    const m = mat(b.x, y, b.z, 0, b.rot, 0);
    if (b.kind === 'cottage') stat.addColored(M.cottage(b.seed ?? 1, 8, 6, 3.4, b.roof), m);
    else if (b.kind === 'barn') stat.addColored(M.barn(), m);
    else if (b.kind === 'shed') stat.addColored(M.shed(), m);
    else if (b.kind === 'grandstand') stat.addColored(standGeo.clone(), m);
    else if (b.kind === 'windmill') {
      const wm = M.windmill();
      stat.addColored(wm.body, m);
      const sm = new THREE.Mesh(keep(wm.sails), sceneryMat);
      const hub = wm.hub.clone().applyMatrix4(m);
      sm.position.copy(hub);
      sm.rotation.order = 'YXZ';
      sm.rotation.y = b.rot;
      sm.castShadow = high;
      group.add(sm);
      sails = sm;
    }
  }
  standGeo.dispose();
  // the jetty and the rowing boat by the lake cottage
  const lakeCot = BUILDINGS.find((b) => b.kind === 'cottage' && b.seed === 3)!;
  let sx = lakeCot.x;
  let sz = lakeCot.z;
  const dirx = LAKE.cx - lakeCot.x;
  const dirz = LAKE.cz - lakeCot.z;
  const dl = Math.hypot(dirx, dirz);
  for (let k = 0; k < 200 && lakeDist(sx, sz) > 1.0; k++) {
    sx += (dirx / dl) * 0.5;
    sz += (dirz / dl) * 0.5;
  }
  sx -= (dirx / dl) * 3;
  sz -= (dirz / dl) * 3;
  const jettyRot = Math.atan2(-dirx / dl, -dirz / dl);
  stat.addColored(M.jetty(17, WATER_Y), mat(sx, 0, sz, 0, jettyRot, 0));
  const boatMesh = new THREE.Mesh(keep(M.boat()), sceneryMat);
  const bp = new THREE.Vector3(2.0, 0, -12).applyAxisAngle(new THREE.Vector3(0, 1, 0), jettyRot);
  boatMesh.position.set(sx + bp.x, WATER_Y - 0.12, sz + bp.z);
  boatMesh.rotation.y = jettyRot + 0.3;
  group.add(boatMesh);
  // bales: white round ones on the green fields' edges, straw ones by the barn
  const whiteBale = keep(M.roundBale(false));
  const strawBale = keep(M.roundBale(true));
  const baleSpots: { m: THREE.Matrix4; straw: boolean }[] = [];
  const baleAt = (x: number, z: number, rot: number, straw: boolean, stack = 0): void => {
    if (blocked(x, z, 23) && stack === 0) return;
    baleSpots.push({ m: mat(x, terrain.visual(x, z) - 0.05 + stack * 1.45, z, 0, rot, 0), straw });
  };
  const barn = BUILDINGS.find((b) => b.kind === 'barn')!;
  for (let k = 0; k < 6; k++) baleAt(barn.x + 14 + (k % 3) * 1.4, barn.z - 4 + Math.floor(k / 3) * 1.8, 0, true);
  baleAt(barn.x + 15.4, barn.z - 3.1, 0, true, 1);
  for (const [bx, bz, n] of [
    [60, -40, 7],
    [-90, -20, 5],
    [280, 60, 6],
    [-300, 120, 6],
    [200, 300, 5],
    [-220, 300, 6],
    [330, -200, 4],
  ] as const)
    for (let k = 0; k < n; k++) baleAt(bx + (r() - 0.5) * 30, bz + (r() - 0.5) * 22, r() * Math.PI, r() < 0.25);
  for (const straw of [false, true]) {
    const list = baleSpots.filter((b) => b.straw === straw);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(straw ? strawBale : whiteBale, sceneryMat, list.length);
    list.forEach((b, i) => im.setMatrixAt(i, b.m));
    im.computeBoundingSphere();
    im.castShadow = high;
    im.receiveShadow = high;
    group.add(im);
  }
  // boulders
  const rockGeo = keep(M.rock());
  const rocks: THREE.Matrix4[] = [];
  for (let k = 0; k < 140 && rocks.length < (high ? 70 : 35); k++) {
    const x = cx + (r() - 0.5) * 900;
    const z = cz + (r() - 0.5) * 760;
    if (blocked(x, z, 25) || inField(x, z, 2)) continue;
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

  // ---- pasture fences ----
  const pole = M.fencePiece(1);
  keep(pole.geo);
  const pfences: THREE.Matrix4[] = [];
  for (const p of PASTURES) {
    const corners: [number, number][] = [
      [p.x - p.hw, p.z - p.hd],
      [p.x + p.hw, p.z - p.hd],
      [p.x + p.hw, p.z + p.hd],
      [p.x - p.hw, p.z + p.hd],
    ];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      const len = Math.hypot(bx - ax, bz - az);
      const nn = Math.max(1, Math.round(len / pole.len));
      const hd = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < nn; i++) {
        const f = (i + 0.5) / nn;
        const x = ax + (bx - ax) * f;
        const z = az + (bz - az) * f;
        pfences.push(mat(x, terrain.visual(x, z) - 0.05, z, 0, hd + Math.PI / 2, 0, len / nn / pole.len, 1, 1));
      }
    }
  }
  const pf = new THREE.InstancedMesh(pole.geo, sceneryMat, pfences.length);
  pfences.forEach((m, i) => pf.setMatrixAt(i, m));
  pf.computeBoundingSphere();
  group.add(pf);

  // ---- animals: grazing in pastures, and cheering at the start ----
  interface Beast {
    kind: number;
    x: number;
    y: number;
    z: number;
    rot: number;
    phase: number;
    /** 0 grazing, 1 in the crowd */
    crowd: number;
  }
  const animalKinds: M.Animal[] = [M.cow(false), M.cow(true), M.sheep(), M.pig(), M.hen(), M.horse()];
  for (const a of animalKinds) {
    keep(a.body);
    keep(a.head);
  }
  const beasts: Beast[] = [];
  for (const p of PASTURES) {
    for (let k = 0; k < p.n; k++) {
      const x = p.x + (r() - 0.5) * (p.hw * 2 - 6);
      const z = p.z + (r() - 0.5) * (p.hd * 2 - 6);
      const kind = p.animal === 'cow' ? (r() < 0.5 ? 0 : 1) : p.animal === 'sheep' ? 2 : 5;
      beasts.push({ kind, x, y: terrain.visual(x, z), z, rot: r() * Math.PI * 2, phase: r() * 10, crowd: 0 });
    }
  }

  // ---- the crowd along the start straight, on the stand, and out by the hairpin ----
  interface Fan {
    x: number;
    y: number;
    z: number;
    rot: number;
    phase: number;
    shirt: THREE.Color;
    skin: THREE.Color;
  }
  const fans: Fan[] = [];
  const shirts = ['#e8412c', '#2f6fe0', '#f4c20d', '#2fa84f', '#ff8a1f', '#8a4fd8', '#f06ba8', '#ffffff', '#18b7c9', '#006aa7'];
  const skins = ['#f2cfb0', '#e8b896', '#c98f68', '#8d5a3c', '#f6dcc4'];
  const crowds: THREE.Vector3[] = [];
  const facing = (x: number, z: number): number => {
    const p = track.project(x, z, -1, { i: 0, u: 0, s: 0, d: 0 });
    const c = track.point(p.s, 0);
    return Math.atan2(c.x - x, c.z - z);
  };
  const addFan = (x: number, z: number, y?: number): void => {
    fans.push({
      x,
      z,
      y: y ?? terrain.visual(x, z),
      rot: facing(x, z) + (r() - 0.5) * 0.5,
      phase: r() * 10,
      shirt: new THREE.Color(shirts[Math.floor(r() * shirts.length)]!),
      skin: new THREE.Color(skins[Math.floor(r() * skins.length)]!),
    });
  };
  const addCrowdBeast = (kind: number, x: number, z: number): void => {
    beasts.push({ kind, x, y: terrain.visual(x, z), z, rot: facing(x, z), phase: r() * 10, crowd: 1 });
  };
  const rowN = high ? 46 : 24;
  for (let k = 0; k < rowN; k++) {
    const s = -66 + (132 * k) / rowN + (r() - 0.5) * 1.2;
    if (Math.abs(s) < 4.5) continue;
    const row = k % 2;
    const d = -(track.at(track.wallR, s) + 1.4 + row * 1.5 + r() * 0.4);
    const p = track.point(s, d);
    addFan(p.x, p.z);
  }
  // animals among the fans
  const crowdAnimals: [number, number][] = [
    [0, -40],
    [2, -33],
    [2, -31.5],
    [4, -24],
    [4, -23.2],
    [4, -22.4],
    [3, 20],
    [3, 22],
    [5, 30],
    [1, 38],
    [2, 45],
    [4, 52],
    [4, 52.8],
  ];
  for (const [kind, s] of crowdAnimals) {
    const d = -(track.at(track.wallR, s) + (kind === 4 ? 0.9 : 2.2));
    const p = track.point(s, d);
    addCrowdBeast(kind, p.x, p.z);
  }
  crowds.push(new THREE.Vector3(0, 0, 175));
  const stand = BUILDINGS.find((b) => b.kind === 'grandstand')!;
  const standY = groundAt(stand.x, stand.z, 12) - 0.25;
  const perTier = high ? 13 : 7;
  for (let tier = 0; tier < 4; tier++)
    for (let k = 0; k < perTier; k++) {
      if (r() < 0.15) continue;
      const x = stand.x - 15 + (30 * (k + 0.5)) / perTier + (r() - 0.5) * 0.8;
      const z = stand.z + tier * 1.6 + 0.1;
      addFan(x, z, standY + 0.5 + tier * 0.8);
    }
  // the hairpin
  let hairS = 0;
  let maxK = 0;
  for (let i = 0; i < track.n; i++)
    if (track.curv[i]! > maxK) {
      maxK = track.curv[i]!;
      hairS = i * track.ds;
    }
  for (let k = 0; k < (high ? 12 : 6); k++) {
    const s = hairS - 18 + k * 3 + r();
    const d = -(track.at(track.wallR, s) + 2.5 + r() * 3);
    const p = track.point(s, d);
    if (terrain.roadDist(p.x, p.z) < track.at(track.wallR, s) + 1.5) continue;
    addFan(p.x, p.z);
  }
  {
    const p = track.point(hairS + 4, -(track.at(track.wallR, hairS + 4) + 4));
    addCrowdBeast(5, p.x, p.z);
    const q = track.point(hairS - 8, -(track.at(track.wallR, hairS - 8) + 3));
    addCrowdBeast(0, q.x, q.z);
    crowds.push(new THREE.Vector3(p.x, p.y, p.z));
  }

  // instanced animals (body and head)
  const beastMeshes: { body: THREE.InstancedMesh; head: THREE.InstancedMesh; list: Beast[] }[] = [];
  for (let kind = 0; kind < animalKinds.length; kind++) {
    const list = beasts.filter((b) => b.kind === kind);
    if (!list.length) continue;
    const body = new THREE.InstancedMesh(animalKinds[kind]!.body, sceneryMat, list.length);
    const head = new THREE.InstancedMesh(animalKinds[kind]!.head, sceneryMat, list.length);
    body.castShadow = high;
    head.castShadow = high;
    body.frustumCulled = false;
    head.frustumCulled = false;
    group.add(body, head);
    beastMeshes.push({ body, head, list });
  }
  // instanced fans
  const person = M.person();
  keep(person.shirt);
  keep(person.rest);
  const fanShirt = new THREE.InstancedMesh(person.shirt, sceneryMat, fans.length);
  const fanRest = new THREE.InstancedMesh(person.rest, sceneryMat, fans.length);
  fans.forEach((f, i) => {
    fanShirt.setColorAt(i, f.shirt);
    fanRest.setColorAt(i, f.skin.clone().lerp(new THREE.Color(1, 1, 1), 0.55));
  });
  fanShirt.frustumCulled = false;
  fanRest.frustumCulled = false;
  fanShirt.castShadow = high;
  group.add(fanShirt, fanRest);

  // ---- flags ----
  const flagTex = keep(swedishFlag());
  const flagGeo = keep(new THREE.PlaneGeometry(2.0, 1.25, 10, 5));
  const flagBase = (flagGeo.getAttribute('position').array as Float32Array).slice();
  const flagMat = keep(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }));
  const poleGeo = keep(new THREE.CylinderGeometry(0.06, 0.08, 9, 6));
  const poleMat = keep(new THREE.MeshLambertMaterial({ color: '#f4f4f0' }));
  const flags: THREE.Mesh[] = [];
  const mainHouse = BUILDINGS.find((b) => b.kind === 'cottage' && b.seed === 1)!;
  for (const [fx, fz] of [
    [mainHouse.x + 9, mainHouse.z + 9],
    [lakeCot.x - 8, lakeCot.z - 4],
    [stand.x - 19, stand.z + 2],
    [stand.x + 19, stand.z + 2],
  ] as const) {
    const y = terrain.visual(fx, fz);
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(fx, y + 4.5, fz);
    p.castShadow = high;
    group.add(p);
    const f = new THREE.Mesh(flagGeo.clone(), flagMat);
    disposables.push(f.geometry);
    f.position.set(fx, y + 8.2, fz);
    f.rotation.y = 1.9;
    f.castShadow = high;
    group.add(f);
    flags.push(f);
  }

  // ---- lupins and tufts just outside the fences ----
  const tuft = new Geo();
  for (let k = 0; k < 3; k++) tuft.add(new THREE.ConeGeometry(0.22, 0.75, 3, 1, true), k === 1 ? '#6e9f3f' : '#5d8c35', mat(0.12 * Math.cos(k * 2.1), 0.36, 0.12 * Math.sin(k * 2.1), 0.15, k * 2.1, 0.12));
  const tuftGeo = keep(tuft.build());
  const lupin = new Geo();
  lupin.cyl(0.03, 0.03, 0.6, 3, '#4f7d33', 0, 0.3, 0);
  lupin.cone(0.12, 0.55, 5, '#ffffff', 0, 0.85, 0);
  lupin.add(new THREE.ConeGeometry(0.28, 0.25, 5, 1, true), '#4f7d33', mat(0, 0.12, 0));
  const lupinGeo = keep(lupin.build());
  const tufts: THREE.Matrix4[] = [];
  const lupins: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const lupinCols = ['#8c5bd6', '#b06ad8', '#e07ab8', '#f0f0f0', '#7a4fc8', '#d966b0'].map((c) => new THREE.Color(c));
  const nTuft = high ? 2600 : 900;
  for (let k = 0; k < nTuft; k++) {
    const s = r() * track.length;
    const sgn = r() < 0.5 ? 1 : -1;
    const wall = track.at(sgn > 0 ? track.wallL : track.wallR, s);
    const d = sgn * (wall + 0.6 + r() * r() * 9);
    const p = track.point(s, d);
    if (terrain.roadDist(p.x, p.z) < wall - 0.3 || lakeDist(p.x, p.z) < 1.05 || streamDist(p.x, p.z).d < 4) continue;
    const y = terrain.visual(p.x, p.z);
    const cluster = Math.floor(s / 37) % 3 === 0;
    if (cluster && r() < 0.55) {
      const sc = 0.8 + r() * 0.5;
      lupins.push({ m: mat(p.x, y - 0.05, p.z, 0, r() * 6, 0, sc, sc * (0.8 + r() * 0.5), sc), c: lupinCols[Math.floor(r() * lupinCols.length)]! });
    } else {
      const sc = 0.7 + r() * 0.8;
      tufts.push(mat(p.x, y - 0.05, p.z, 0, r() * 6, 0, sc, sc, sc));
    }
  }
  if (tufts.length) {
    const im = new THREE.InstancedMesh(tuftGeo, treeMat, tufts.length);
    tufts.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    group.add(im);
  }
  if (lupins.length) {
    const im = new THREE.InstancedMesh(lupinGeo, treeMat, lupins.length);
    lupins.forEach((l, i) => {
      im.setMatrixAt(i, l.m);
      im.setColorAt(i, l.c);
    });
    im.computeBoundingSphere();
    group.add(im);
  }

  // the merged buildings
  const statGeo = keep(stat.build());
  const statMesh = new THREE.Mesh(statGeo, sceneryMat);
  statMesh.castShadow = high;
  statMesh.receiveShadow = high;
  group.add(statMesh);

  // ---- animation ----
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const hm = new THREE.Matrix4();
  const hm2 = new THREE.Matrix4();
  const hairP = crowds[1]!;
  return {
    group,
    crowds,
    update(time, focus, cheer) {
      if (sails) sails.rotation.z = -time * 0.55;
      boatMesh.position.y = WATER_Y - 0.12 + Math.sin(time * 1.3) * 0.05;
      boatMesh.rotation.z = Math.sin(time * 1.1) * 0.04;
      // flags
      for (let k = 0; k < flags.length; k++) {
        const pa = flags[k]!.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = pa.array as Float32Array;
        for (let i = 0; i < pa.count; i++) {
          const x = flagBase[i * 3]! + 1.0;
          arr[i * 3 + 2] = (Math.sin(x * 2.6 - time * 6 + k * 1.7) * 0.16 + Math.sin(x * 4.1 - time * 9.3) * 0.05) * x;
        }
        pa.needsUpdate = true;
      }
      // the crowd: more excited when the player is close
      const near0 = clamp(1 - (Math.hypot(focus.x - 0, focus.z - 160) - 30) / 80, 0, 1);
      const near1 = clamp(1 - (focus.distanceTo(hairP) - 25) / 60, 0, 1);
      fans.forEach((f, i) => {
        const ex = Math.max(cheer, f.z > 100 ? near0 : near1);
        const ph = time * (5 + ex * 4) + f.phase;
        const hop = Math.max(0, Math.sin(ph)) * (0.06 + ex * 0.42);
        const sway = Math.sin(ph * 0.5) * (0.05 + ex * 0.18);
        m4.compose(v.set(f.x, f.y + hop, f.z), q.setFromEuler(e.set(0, f.rot, sway)), one);
        fanShirt.setMatrixAt(i, m4);
        fanRest.setMatrixAt(i, m4);
      });
      fanShirt.instanceMatrix.needsUpdate = true;
      fanRest.instanceMatrix.needsUpdate = true;
      for (const bm of beastMeshes) {
        const neck = animalKinds[bm.list[0]!.kind]!.neck;
        bm.list.forEach((b, i) => {
          let hop = 0;
          let pitch: number;
          if (b.crowd) {
            const ex = Math.max(cheer, b.z > 100 ? near0 : near1);
            hop = Math.max(0, Math.sin(time * (4 + ex * 4) + b.phase)) * (0.03 + ex * 0.35);
            pitch = -0.25 + Math.sin(time * 3 + b.phase) * 0.15 * (0.3 + ex);
          } else {
            // graze: head down most of the time, up now and then
            const cyc = Math.sin(time * 0.35 + b.phase);
            pitch = cyc > 0.55 ? -0.1 : 0.75 + Math.sin(time * 3.1 + b.phase) * 0.08;
          }
          m4.compose(v.set(b.x, b.y + hop, b.z), q.setFromEuler(e.set(0, b.rot, 0)), one);
          bm.body.setMatrixAt(i, m4);
          hm.makeRotationX(pitch);
          hm.setPosition(neck);
          bm.head.setMatrixAt(i, hm2.multiplyMatrices(m4, hm));
        });
        bm.body.instanceMatrix.needsUpdate = true;
        bm.head.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const o of group.children) if (o instanceof THREE.InstancedMesh) o.dispose();
    },
  };
}
