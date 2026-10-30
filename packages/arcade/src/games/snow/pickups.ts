// Treats that drift down into the player's yard: gingerbread (points), hot cocoa (a heart back), a
// giant snowball (rolls through everything) and rapid throws. Walk into one to take it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Particles } from './fx.ts';
import { heightAt } from './world.ts';
import { rand } from './util.ts';

export type ItemKind = 'cookie' | 'cocoa' | 'giant' | 'rapid';

const COLOR: Record<ItemKind, number> = { cookie: 0xffc35a, cocoa: 0xff7a5a, giant: 0x7fd8ff, rapid: 0xffe36a };

export interface Pickup {
  kind: ItemKind;
  group: THREE.Group;
  model: THREE.Object3D;
  beam: THREE.Mesh;
  pos: THREE.Vector3;
  y: number;
  landed: boolean;
  life: number;
  t: number;
}

function gingerShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.1, 0.42);
  s.quadraticCurveTo(0.3, 0.42, 0.46, 0.4);
  s.quadraticCurveTo(0.6, 0.38, 0.58, 0.28);
  s.quadraticCurveTo(0.56, 0.2, 0.44, 0.2);
  s.quadraticCurveTo(0.28, 0.2, 0.22, 0.15);
  s.quadraticCurveTo(0.22, 0.0, 0.24, -0.18);
  s.quadraticCurveTo(0.34, -0.38, 0.4, -0.54);
  s.quadraticCurveTo(0.42, -0.68, 0.28, -0.66);
  s.quadraticCurveTo(0.18, -0.62, 0.1, -0.44);
  s.quadraticCurveTo(0.0, -0.34, -0.1, -0.44);
  s.quadraticCurveTo(-0.18, -0.62, -0.28, -0.66);
  s.quadraticCurveTo(-0.42, -0.68, -0.4, -0.54);
  s.quadraticCurveTo(-0.34, -0.38, -0.24, -0.18);
  s.quadraticCurveTo(-0.22, 0.0, -0.22, 0.15);
  s.quadraticCurveTo(-0.28, 0.2, -0.44, 0.2);
  s.quadraticCurveTo(-0.56, 0.2, -0.58, 0.28);
  s.quadraticCurveTo(-0.6, 0.38, -0.46, 0.4);
  s.quadraticCurveTo(-0.3, 0.42, -0.1, 0.42);
  s.absarc(0, 0.62, 0.23, Math.PI * 1.36, Math.PI * -0.36, true);
  return s;
}

function bolt(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.06, 0.5);
  s.lineTo(-0.2, 0.0);
  s.lineTo(-0.02, 0.02);
  s.lineTo(-0.1, -0.5);
  s.lineTo(0.2, 0.08);
  s.lineTo(0.02, 0.06);
  s.closePath();
  return s;
}

export class Pickups {
  list: Pickup[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private templates = new Map<ItemKind, THREE.Object3D>();
  private beamMats = new Map<ItemKind, THREE.ShaderMaterial>();
  private beamGeo: THREE.BufferGeometry;

  constructor(
    private scene: THREE.Scene,
    private sparks: Particles,
    private puffs: Particles,
  ) {
    const lam = (c: number, e = 0.15): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(e) });
      this.mats.push(m);
      return m;
    };
    const g = <T extends THREE.BufferGeometry>(x: T): T => {
      this.geos.push(x);
      return x;
    };
    // gingerbread man with white icing
    {
      const grp = new THREE.Group();
      const body = g(new THREE.ExtrudeGeometry(gingerShape(), { depth: 0.09, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 8 }));
      body.translate(0, 0, -0.045);
      grp.add(new THREE.Mesh(body, lam(0xc0662a, 0.22)));
      const dots: THREE.BufferGeometry[] = [];
      const dot = (x: number, y: number, r: number): void => {
        const d = new THREE.SphereGeometry(r, 8, 6);
        d.translate(x, y, 0.09);
        dots.push(d);
      };
      dot(-0.08, 0.67, 0.035);
      dot(0.08, 0.67, 0.035);
      for (const y of [0.22, 0.06, -0.1]) dot(0, y, 0.04);
      for (let i = 0; i < 5; i++) dot(-0.09 + i * 0.045, 0.54 - Math.sin((i / 4) * Math.PI) * 0.035, 0.018);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) dot(sx * (0.36 + i * 0.05), 0.31 + (i % 2) * 0.03, 0.02);
      const icing = g(mergeGeometries(dots, false)!);
      for (const d of dots) d.dispose();
      grp.add(new THREE.Mesh(icing, lam(0xffffff, 0.35)));
      grp.scale.setScalar(0.8);
      this.templates.set('cookie', grp);
    }
    // a mug of hot cocoa with cream
    {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g(new THREE.CylinderGeometry(0.2, 0.17, 0.34, 18)), lam(0xe0413e)));
      const band = new THREE.Mesh(g(new THREE.CylinderGeometry(0.203, 0.19, 0.08, 18, 1, true)), lam(0xffffff, 0.3));
      band.position.y = 0.02;
      grp.add(band);
      const handle = new THREE.Mesh(g(new THREE.TorusGeometry(0.1, 0.03, 8, 14, Math.PI)), lam(0xe0413e));
      handle.rotation.z = -Math.PI / 2;
      handle.position.x = 0.19;
      grp.add(handle);
      const cocoa = new THREE.Mesh(g(new THREE.CircleGeometry(0.18, 18)), lam(0x6a3a22));
      cocoa.rotation.x = -Math.PI / 2;
      cocoa.position.y = 0.16;
      grp.add(cocoa);
      const cream = g(new THREE.SphereGeometry(0.09, 10, 8));
      for (const [x, y, z] of [
        [0, 0.21, 0],
        [0.07, 0.19, 0.05],
        [-0.07, 0.19, 0.04],
        [0.02, 0.27, 0.01],
      ]) {
        const c = new THREE.Mesh(cream, lam(0xffffff, 0.35));
        c.position.set(x!, y!, z!);
        grp.add(c);
      }
      grp.scale.setScalar(1.25);
      this.templates.set('cocoa', grp);
    }
    // a giant snowball
    {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g(new THREE.IcosahedronGeometry(0.36, 2)), lam(0xf4f7ff, 0.3)));
      const ring = new THREE.Mesh(g(new THREE.TorusGeometry(0.5, 0.035, 8, 32)), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, toneMapped: false }));
      this.mats.push(ring.material as THREE.Material);
      ring.rotation.x = Math.PI / 2;
      grp.add(ring);
      this.templates.set('giant', grp);
    }
    // rapid throws: a golden bolt with snowballs whirling round it
    {
      const grp = new THREE.Group();
      const b = g(new THREE.ExtrudeGeometry(bolt(), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }));
      b.translate(0, 0, -0.04);
      grp.add(new THREE.Mesh(b, lam(0xffd23f, 0.4)));
      const ball = g(new THREE.SphereGeometry(0.1, 10, 8));
      const orbit = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(ball, lam(0xffffff, 0.3));
        const a = (i / 3) * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
        orbit.add(m);
      }
      orbit.name = 'orbit';
      grp.add(orbit);
      grp.scale.setScalar(1.1);
      this.templates.set('rapid', grp);
    }
    // a soft beam of light so treats are easy to spot
    this.beamGeo = new THREE.CylinderGeometry(0.28, 0.5, 5, 14, 1, true);
    this.beamGeo.translate(0, 2.5, 0);
    for (const k of ['cookie', 'cocoa', 'giant', 'rapid'] as ItemKind[]) {
      this.beamMats.set(
        k,
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(COLOR[k]) }, uA: { value: 1 } },
          vertexShader: 'varying float vY; void main(){ vY = position.y / 5.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vY; void main(){ float a = (1.0 - vY) * (1.0 - vY) * 0.45 * uA; gl_FragColor = vec4(uColor * a, 1.0); }',
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
    }
  }

  drop(kind: ItemKind, x: number, z: number): void {
    const group = new THREE.Group();
    const model = this.templates.get(kind)!.clone();
    group.add(model);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMats.get(kind)!.clone());
    beam.visible = false;
    const ground = heightAt(x, z);
    const pos = new THREE.Vector3(x, ground, z);
    this.scene.add(group, beam);
    beam.position.copy(pos);
    this.list.push({ kind, group, model, beam, pos, y: 14, landed: false, life: 16, t: rand(0, 6) });
  }

  /** Move them; returns the ones the player walked into. */
  update(dt: number, player: THREE.Vector3): Pickup[] {
    const got: Pickup[] = [];
    const keep: Pickup[] = [];
    for (const p of this.list) {
      p.t += dt;
      if (!p.landed) {
        p.y -= dt * 5.5;
        if (Math.random() < dt * 30) this.sparks.one(p.group.position, new THREE.Vector3(rand(-0.3, 0.3), 0.6, rand(-0.3, 0.3)), 0.25, 0.6, COLOR[p.kind], 0.9, 0.3);
        if (p.y <= 0.75) {
          p.y = 0.75;
          p.landed = true;
          p.beam.visible = true;
          this.puffs.emit(p.pos.clone().setY(p.pos.y + 0.1), { n: 8, size: [0.4, 0.7], grow: 1.8, speed: 2, up: 0.2, life: [0.4, 0.7] });
        }
      } else p.life -= dt;
      const bob = p.landed ? Math.sin(p.t * 2.6) * 0.12 : Math.sin(p.t * 3) * 0.3;
      p.group.position.set(p.pos.x + (p.landed ? 0 : Math.sin(p.t * 2) * 0.4), p.pos.y + p.y + bob, p.pos.z);
      p.model.rotation.y = p.t * 2.2;
      if (p.kind === 'rapid') {
        const o = p.model.getObjectByName('orbit');
        if (o) o.rotation.y = p.t * 9;
      }
      if (p.kind === 'cocoa' && p.landed && Math.random() < dt * 5) this.puffs.one(p.group.position.clone().setY(p.group.position.y + 0.5), new THREE.Vector3(rand(-0.1, 0.1), 0.6, rand(-0.1, 0.1)), 0.18, 1.2, 0xffffff, 0.35, 2.4);
      // blink before it melts away
      const vis = p.life > 3 || Math.floor(p.life * 8) % 2 === 0;
      p.group.visible = vis;
      (p.beam.material as THREE.ShaderMaterial).uniforms.uA!.value = p.life > 3 ? 1 : p.life / 3;
      const dx = player.x - p.pos.x;
      const dz = player.z - p.pos.z;
      if (p.landed || p.y < 2.2) {
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(player.y - p.pos.y) < 2.5) {
          got.push(p);
          this.remove(p);
          continue;
        }
      }
      if (p.life <= 0) {
        this.puffs.emit(p.group.position, { n: 6, size: [0.3, 0.5], grow: 1.6, speed: 1.5, life: [0.3, 0.5] });
        this.remove(p);
        continue;
      }
      keep.push(p);
    }
    this.list = keep;
    return got;
  }

  private remove(p: Pickup): void {
    p.group.removeFromParent();
    p.beam.removeFromParent();
    (p.beam.material as THREE.Material).dispose();
  }

  clear(): void {
    for (const p of this.list) this.remove(p);
    this.list = [];
  }

  dispose(): void {
    this.clear();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const m of this.beamMats.values()) m.dispose();
    this.beamGeo.dispose();
  }
}

export const ITEM_COLOR = COLOR;
