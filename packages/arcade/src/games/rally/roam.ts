// Free roam round the farm: coins to find on and off the roads, hay-bale ramps with a score for the
// airtime and the distance, two drift zones marked with cones, straw bales to smash (they come back),
// and the edges of the world: buildings, the lake and a soft push back from the far hills.
import * as THREE from 'three';
import { ROAM_COIN_COUNT } from '@lilla-garden/shared';
import type { Car } from './car.ts';
import { Geo, mat } from './geo.ts';
import { BUILDINGS, lakeDist, streamDist, type Layout } from './layout.ts';
import type { Terrain } from './terrain.ts';
import type { Track } from './track.ts';
import { clamp, rng } from './util.ts';

export interface Ramp {
  x: number;
  z: number;
  /** Direction it launches you (radians, as heading). */
  rot: number;
  len: number;
  w: number;
  h: number;
}

interface Coin {
  x: number;
  y: number;
  z: number;
  taken: boolean;
}

interface Bale {
  hx: number;
  hy: number;
  hz: number;
  hr: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  flying: boolean;
  /** Seconds since it was knocked over (it comes back after 20 s). */
  gone: number;
}

export interface Zone {
  x: number;
  z: number;
  r: number;
}

/** Things that happened this frame, for the sounds, the particles and the HUD. */
export interface RoamEvents {
  coins: number;
  coinAt: THREE.Vector3 | null;
  bales: number;
  baleAt: THREE.Vector3 | null;
  splash: boolean;
  bump: number;
}

const BOX_SIZE: Record<string, [number, number]> = {
  barn: [23, 13],
  cottage: [8.6, 6.6],
  shed: [4.8, 4],
  windmill: [7.5, 7.5],
  grandstand: [35, 8.5],
};

export class RoamWorld {
  readonly group = new THREE.Group();
  readonly ramps: Ramp[] = [];
  readonly zones: Zone[] = [];
  readonly coins: Coin[] = [];
  private readonly bales: Bale[] = [];
  private readonly coinMesh: THREE.InstancedMesh;
  private readonly baleMesh: THREE.InstancedMesh;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  taken = 0;

  constructor(
    private track: Track,
    private terrain: Terrain,
    private layout: Layout,
    seed: number,
    quality: 'high' | 'low',
  ) {
    const r = rng(seed ^ 0x2ea1);
    const t = track;
    const high = quality === 'high';
    const keep = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const clearOf = (x: number, z: number, m: number): boolean => {
      if (lakeDist(x, z, layout) < 1.12 || streamDist(x, z, layout).d < 8) return false;
      if (terrain.edge(x, z) > 0.92) return false;
      for (const b of BUILDINGS) if (Math.hypot(x - b.x, z - b.z) < (BOX_SIZE[b.kind]?.[0] ?? 8) / 2 + m) return false;
      return true;
    };
    const flat = (x: number, z: number, rad: number): boolean => {
      const h0 = terrain.height(x, z);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        if (Math.abs(terrain.height(x + Math.cos(a) * rad, z + Math.sin(a) * rad) - h0) > rad * 0.12) return false;
      }
      return true;
    };
    const cx = (t.minX + t.maxX) / 2;
    const cz = (t.minZ + t.maxZ) / 2;
    const somewhere = (minRoad: number, maxRoad: number, rad: number, tries = 400): [number, number] | null => {
      for (let k = 0; k < tries; k++) {
        const x = cx + (r() - 0.5) * (t.maxX - t.minX + 240);
        const z = cz + (r() - 0.5) * (t.maxZ - t.minZ + 240);
        const rd = terrain.roadDist(x, z);
        if (rd < minRoad || rd > maxRoad || !clearOf(x, z, rad) || !flat(x, z, rad)) continue;
        if (this.ramps.some((p) => Math.hypot(p.x - x, p.z - z) < 50) || this.zones.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 40)) continue;
        return [x, z];
      }
      return null;
    };

    // ---- ramps: straw bales under a plank ramp ----
    const rampGeo = new Geo();
    for (let k = 0; k < 4; k++) {
      const at = somewhere(26, 130, 14);
      if (!at) continue;
      const ramp: Ramp = { x: at[0], z: at[1], rot: r() * Math.PI * 2, len: 10, w: 6, h: 2.3 };
      this.ramps.push(ramp);
      const y = terrain.visual(ramp.x, ramp.z) - 0.05;
      const g = new Geo();
      g.prism(
        [
          [-ramp.len / 2, 0, ramp.w / 2],
          [ramp.len / 2, 0, ramp.w / 2],
          [ramp.len / 2, ramp.h, ramp.w / 2],
        ],
        '#d9b65a',
      );
      for (let i = 0; i < 6; i++) g.box(ramp.w + 0.1, 0.06, 0.12, '#8a6a3a', 0, ((i + 0.5) / 6) * ramp.h + 0.04, -ramp.len / 2 + ((i + 0.5) / 6) * ramp.len, -Math.atan2(ramp.h, ramp.len));
      for (const sx of [-1, 1]) g.cyl(0.75, 0.75, 1.2, 9, '#e3c25e', sx * (ramp.w / 2 + 0.7), 0.75, ramp.len / 2 - 1, 0, 0, Math.PI / 2);
      g.box(0.3, 2.2, 0.3, '#f4f4f0', ramp.w / 2 + 1.6, 1.1, ramp.len / 2);
      g.box(1.2, 0.6, 0.05, '#e8412c', ramp.w / 2 + 1.6, 2.1, ramp.len / 2);
      rampGeo.addColored(g.build(), mat(ramp.x, y, ramp.z, 0, ramp.rot, 0));
    }

    // ---- drift zones: a ring of cones ----
    const coneGeo = new Geo();
    for (let k = 0; k < 2; k++) {
      const at = somewhere(22, 110, 26);
      if (!at) continue;
      const zone: Zone = { x: at[0], z: at[1], r: 24 };
      this.zones.push(zone);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const x = zone.x + Math.cos(a) * zone.r;
        const z = zone.z + Math.sin(a) * zone.r;
        const c = new Geo().cone(0.32, 0.8, 6, '#ff7a1a', 0, 0.4, 0).cyl(0.33, 0.33, 0.12, 6, '#ffffff', 0, 0.42, 0).box(0.7, 0.06, 0.7, '#ff7a1a', 0, 0.03, 0);
        coneGeo.addColored(c.build(), mat(x, terrain.visual(x, z), z));
      }
      // a painted ring on the grass
      const ring = new THREE.RingGeometry(zone.r - 0.25, zone.r + 0.25, 64);
      ring.rotateX(-Math.PI / 2);
      const pos = ring.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.visual(zone.x + pos.getX(i), zone.z + pos.getZ(i)) + 0.05);
      ring.translate(zone.x, 0, zone.z);
      coneGeo.add(ring, '#ffffff');
    }
    const propMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    for (const g of [rampGeo, coneGeo]) {
      if (g.empty) continue;
      const geo = keep(g.build());
      const mesh = new THREE.Mesh(geo, propMat);
      mesh.castShadow = high;
      mesh.receiveShadow = high;
      this.group.add(mesh);
    }

    // ---- coins: most along the roads, the rest out in the country, a few on the ramps' far side ----
    for (let k = 0; k < ROAM_COIN_COUNT; k++) {
      let x = 0;
      let z = 0;
      if (k < ROAM_COIN_COUNT * 0.55) {
        const s = ((k + r() * 0.6) / (ROAM_COIN_COUNT * 0.55)) * t.length;
        const hw = t.at(t.hw, s);
        const p = t.point(s, (r() - 0.5) * (hw - 1.5) * 2);
        x = p.x;
        z = p.z;
      } else if (k < ROAM_COIN_COUNT * 0.55 + this.ramps.length * 2) {
        const ramp = this.ramps[(k - Math.ceil(ROAM_COIN_COUNT * 0.55)) % this.ramps.length]!;
        const f = 16 + ((k % 2) * 8);
        x = ramp.x + Math.sin(ramp.rot) * f;
        z = ramp.z + Math.cos(ramp.rot) * f;
      } else {
        const at = somewhere(18, 220, 2, 200) ?? [cx + (r() - 0.5) * 200, cz + (r() - 0.5) * 200];
        x = at[0];
        z = at[1];
      }
      const p = t.project(x, z, -1, { i: 0, u: 0, s: 0, d: 0 });
      const onRoad = Math.abs(p.d) < t.at(t.hw, p.s) + 0.3;
      const gy = onRoad ? t.roadY(p) : Math.max(terrain.height(x, z), layout.waterY);
      // the ones past a ramp hang in the air where you fly
      const air = k >= ROAM_COIN_COUNT * 0.55 && k < ROAM_COIN_COUNT * 0.55 + this.ramps.length * 2 ? 3.2 : 0;
      this.coins.push({ x, y: gy + 1.3 + air, z, taken: false });
    }
    const coinGeo = keep(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 18));
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = keep(new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#7a5200', emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3 }));
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, this.coins.length);
    this.coinMesh.frustumCulled = false;
    this.group.add(this.coinMesh);

    // ---- smashable straw bales in little stacks near the road ----
    const baleGeo = keep(new Geo().box(1.2, 0.8, 0.9, '#e3c25e').box(1.22, 0.82, 0.05, '#b8933c', 0, 0, 0.2).box(1.22, 0.82, 0.05, '#b8933c', 0, 0, -0.2).build());
    for (let g = 0; g < 8; g++) {
      const s = ((g + 0.5) / 8) * t.length + r() * 20;
      const sgn = r() < 0.5 ? 1 : -1;
      const hw = t.at(t.hw, s);
      for (let k = 0; k < 4; k++) {
        const p = t.point(s + (k % 2) * 1.4, sgn * (hw + 2 + Math.floor(k / 2) * 1.0));
        const y = terrain.height(p.x, p.z) + 0.4 + (k === 3 ? 0.8 : 0);
        const hr = t.heading(s);
        this.bales.push({ hx: p.x, hy: y, hz: p.z, hr, x: p.x, y, z: p.z, vx: 0, vy: 0, vz: 0, rx: 0, ry: hr, rz: 0, spin: 0, flying: false, gone: -1 });
      }
    }
    const baleMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.baleMesh = new THREE.InstancedMesh(baleGeo, baleMat, this.bales.length);
    this.baleMesh.castShadow = high;
    this.baleMesh.frustumCulled = false;
    this.group.add(this.baleMesh);
    this.drawBales();
  }

  /** Extra ground height from the ramps (0 elsewhere). */
  rampHeight(x: number, z: number): number {
    for (const p of this.ramps) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz > 64) continue;
      const u = dx * Math.sin(p.rot) + dz * Math.cos(p.rot);
      const v = dx * Math.cos(p.rot) - dz * Math.sin(p.rot);
      if (Math.abs(v) > p.w / 2 || u < -p.len / 2 || u > p.len / 2) continue;
      return (p.h * (u + p.len / 2)) / p.len;
    }
    return 0;
  }

  /** In a drift zone? */
  zoneAt(x: number, z: number): Zone | null {
    for (const zz of this.zones) if ((x - zz.x) ** 2 + (z - zz.z) ** 2 < zz.r * zz.r) return zz;
    return null;
  }

  /** Coins, bales, walls round buildings, the lake and the edge of the world for the player's car. */
  update(dt: number, time: number, car: Car, ev: RoamEvents): void {
    ev.coins = 0;
    ev.coinAt = null;
    ev.bales = 0;
    ev.baleAt = null;
    ev.splash = false;
    ev.bump = 0;
    // coins
    this.coins.forEach((c, i) => {
      if (c.taken) return;
      const d2 = (car.x - c.x) ** 2 + (car.z - c.z) ** 2;
      if (d2 < 2.7 * 2.7 && Math.abs(car.y + 0.6 - c.y) < 2.6) {
        c.taken = true;
        this.taken++;
        ev.coins++;
        ev.coinAt = new THREE.Vector3(c.x, c.y, c.z);
      }
      const bob = Math.sin(time * 2.2 + i) * 0.18;
      this.m4.compose(this.v.set(c.x, c.y + bob, c.z), this.q.setFromEuler(this.e.set(0, time * 2.6 + i, 0)), c.taken ? this.s.set(0, 0, 0) : this.s.set(1, 1, 1));
      this.coinMesh.setMatrixAt(i, this.m4);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;

    // bales: knocked flying, tumbling, back home after a while
    for (const b of this.bales) {
      if (!b.flying && b.gone < 0) {
        const d2 = (car.x - b.x) ** 2 + (car.z - b.z) ** 2;
        if (d2 < 2.1 * 2.1 && car.speed > 3 && Math.abs(car.y - b.y) < 2) {
          b.flying = true;
          b.gone = 0;
          const k = 0.75 + Math.random() * 0.3;
          b.vx = car.vx * k + (Math.random() - 0.5) * 4;
          b.vz = car.vz * k + (Math.random() - 0.5) * 4;
          b.vy = 3 + Math.min(8, car.speed * 0.25) + Math.random() * 2;
          b.spin = (Math.random() - 0.5) * 10;
          ev.bales++;
          ev.baleAt = new THREE.Vector3(b.x, b.y, b.z);
          car.vx *= 0.97;
          car.vz *= 0.97;
        }
      }
      if (b.gone >= 0) {
        b.gone += dt;
        if (b.flying) {
          b.vy -= 9.81 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          b.rx += b.spin * dt;
          b.rz += b.spin * 0.7 * dt;
          const gy = this.terrain.height(b.x, b.z) + 0.4;
          if (b.y < gy) {
            b.y = gy;
            b.vy = Math.abs(b.vy) * 0.3;
            b.vx *= 0.6;
            b.vz *= 0.6;
            b.spin *= 0.5;
            if (Math.hypot(b.vx, b.vz) < 0.5 && b.vy < 0.6) {
              b.flying = false;
              b.rx = Math.round(b.rx / (Math.PI / 2)) * (Math.PI / 2);
              b.rz = Math.round(b.rz / (Math.PI / 2)) * (Math.PI / 2);
            }
          }
        }
        if (b.gone > 20 && Math.hypot(car.x - b.hx, car.z - b.hz) > 12) {
          b.gone = -1;
          b.flying = false;
          b.x = b.hx;
          b.y = b.hy;
          b.z = b.hz;
          b.rx = b.rz = 0;
          b.ry = b.hr;
        }
      }
    }
    this.drawBales();

    // buildings are solid (an oriented box each, a car's half width round it)
    for (const bd of BUILDINGS) {
      const sz = BOX_SIZE[bd.kind];
      if (!sz) continue;
      const dx = car.x - bd.x;
      const dz = car.z - bd.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      const c = Math.cos(bd.rot);
      const s = Math.sin(bd.rot);
      // the building's own frame: u along its local x, v along its local z
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      const hu = sz[0] / 2 + 1.2;
      const hv = sz[1] / 2 + 1.2;
      if (Math.abs(u) > hu || Math.abs(v) > hv) continue;
      const pu = hu - Math.abs(u);
      const pv = hv - Math.abs(v);
      // out through the nearer side
      let nx: number;
      let nz: number;
      let pen: number;
      if (pu < pv) {
        nx = c * Math.sign(u);
        nz = -s * Math.sign(u);
        pen = pu;
      } else {
        nx = s * Math.sign(v);
        nz = c * Math.sign(v);
        pen = pv;
      }
      car.x += nx * pen;
      car.z += nz * pen;
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) {
        car.vx -= nx * vn * 1.3;
        car.vz -= nz * vn * 1.3;
        ev.bump = Math.max(ev.bump, -vn);
      }
    }

    // the water: a splash and a firm push back to the shore (the sea and the farm lake, not ice)
    if (this.layout.lake && this.layout.lakeKind !== 'ice') {
      const ld = lakeDist(car.x, car.z, this.layout);
      const edge = this.layout.lakeKind === 'sea' ? 1 - 6 / this.layout.lake.rz : 0.96;
      if (ld < edge + 0.06) ev.splash = car.speed > 2;
      if (ld < edge) {
        const lk = this.layout.lake;
        let nx = car.x - lk.cx;
        let nz = car.z - lk.cz;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) {
          car.vx -= nx * vn * 1.2;
          car.vz -= nz * vn * 1.2;
        }
        car.vx += nx * 6 * dt;
        car.vz += nz * 6 * dt;
        car.vx *= Math.exp(-dt * 1.5);
        car.vz *= Math.exp(-dt * 1.5);
      }
    }

    // the far hills: a soft push back towards the middle
    const ed = this.terrain.edge(car.x, car.z);
    if (ed > 1) {
      const cx = (this.track.minX + this.track.maxX) / 2;
      const cz = (this.track.minZ + this.track.maxZ) / 2;
      let nx = cx - car.x;
      let nz = cz - car.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      const k = clamp((ed - 1) * 12, 0, 3);
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) {
        car.vx -= nx * vn * clamp(k * dt * 3, 0, 1);
        car.vz -= nz * vn * clamp(k * dt * 3, 0, 1);
      }
      car.vx += nx * k * 4 * dt;
      car.vz += nz * k * 4 * dt;
    }
  }

  private drawBales(): void {
    this.bales.forEach((b, i) => {
      this.m4.compose(this.v.set(b.x, b.y, b.z), this.q.setFromEuler(this.e.set(b.rx, b.ry, b.rz)), this.s.set(1, 1, 1));
      this.baleMesh.setMatrixAt(i, this.m4);
    });
    this.baleMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.coinMesh.dispose();
    this.baleMesh.dispose();
  }
}
