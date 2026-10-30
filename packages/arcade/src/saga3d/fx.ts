// Spell and attack visuals for the 3D saga: telegraphs on the floor, bolts, rings, sparkles, the shield dome and the
// floating numbers. It only reads the sim (zones, player, mobs) and its events; nothing here changes the rules.
//
// Cost control, because this has to run on an old tablet: every particle lives in ONE Points object (one draw call
// however many there are), meshes are shared and pooled, and the numbers are DOM elements that are reused.
import * as THREE from 'three';
import { SPELLS } from '@lilla-garden/shared';
import type { P2, Sim, SimEvent, SimMob, SimZone } from './sim.ts';

const MAX_PARTICLES = 360;
const MAX_NUMBERS = 40;
const NUMBER_S = 0.9;
const NUMBER_RISE = 40;
const FLOOR = 0.03;

// ---- particles: one Points object with a tiny shader, so size and fade work per particle ----
const PARTICLE_VERT = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 128.0);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = `
uniform sampler2D map;
varying vec4 vColor;
void main() {
  float a = texture2D(map, gl_PointCoord).a * vColor.a;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Particles {
  readonly points: THREE.Points;
  private n = 0;
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 4);
  private size = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private age = new Float32Array(MAX_PARTICLES);
  private s0 = new Float32Array(MAX_PARTICLES);
  private s1 = new Float32Array(MAX_PARTICLES);
  private alpha = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private c = new THREE.Color();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, uScale: { value: 800 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Pixels per world unit at distance 1: set when the view size changes. */
  setScale(s: number): void {
    this.mat.uniforms.uScale!.value = s;
  }

  spawn(color: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, alpha = 1, grav = 0): void {
    // a full pool drops the oldest slot, so a busy fight never stops showing the new sparks
    const i = this.n < MAX_PARTICLES ? this.n++ : 0;
    this.c.set(color);
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([this.c.r, this.c.g, this.c.b, alpha], i * 4);
    this.life[i] = life;
    this.age[i] = 0;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.alpha[i] = alpha;
    this.grav[i] = grav;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const a = (this.age[i]! += dt);
      if (a >= this.life[i]!) {
        // swap the last one into this slot
        const l = --this.n;
        if (i !== l) {
          this.pos.copyWithin(i * 3, l * 3, l * 3 + 3);
          this.vel.copyWithin(i * 3, l * 3, l * 3 + 3);
          this.col.copyWithin(i * 4, l * 4, l * 4 + 4);
          this.life[i] = this.life[l]!;
          this.age[i] = this.age[l]!;
          this.s0[i] = this.s0[l]!;
          this.s1[i] = this.s1[l]!;
          this.alpha[i] = this.alpha[l]!;
          this.grav[i] = this.grav[l]!;
        }
        continue;
      }
      const k = a / this.life[i]!;
      this.vel[i * 3 + 1]! -= this.grav[i]! * dt;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * k;
      this.col[i * 4 + 3] = this.alpha[i]! * (1 - k) * (1 - k * 0.3);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aColor').needsUpdate = true;
    this.geo.getAttribute('aSize').needsUpdate = true;
  }
}

// ---- flat shapes on the floor ----
const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateX(-Math.PI / 2);
const ringGeo = flat(new THREE.RingGeometry(0.8, 1, 36));
const thinRingGeo = flat(new THREE.RingGeometry(0.93, 1, 40));
const discGeo = flat(new THREE.CircleGeometry(1, 32));
const arcGeo = flat(new THREE.RingGeometry(0.35, 1, 16, 1, -1.1, 2.2));
const swirlGeo = flat(new THREE.RingGeometry(0.72, 1, 28, 1, 0, 4.4));
const runeGeo = (() => {
  // a ring, an inner ring and six small ticks in between: reads as a rune circle from above
  const parts: THREE.BufferGeometry[] = [new THREE.RingGeometry(0.9, 1, 40), new THREE.RingGeometry(0.55, 0.6, 32)];
  for (let i = 0; i < 6; i++) {
    const t = new THREE.PlaneGeometry(0.05, 0.3);
    t.translate(0, 0.75, 0);
    t.rotateZ((i / 6) * Math.PI * 2);
    parts.push(t);
  }
  const merged = mergeFlat(parts);
  return flat(merged);
})();

function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // tiny local merge (positions + index only) so fx.ts does not need the geometry utils
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

const fxMat = (color: number, opacity: number, additive = false): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

type FlashShape = 'ring' | 'arc' | 'swirl' | 'disc' | 'rune';
const FLASH_GEO: Record<FlashShape, THREE.BufferGeometry> = { ring: ringGeo, arc: arcGeo, swirl: swirlGeo, disc: discGeo, rune: runeGeo };

interface Flash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  on: boolean;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  alpha: number;
  spin: number;
  /** Stay on the player instead of the spot where it began. */
  follow: boolean;
}

interface Bolt {
  mesh: THREE.Object3D;
  from: P2;
  to: P2;
  t0: number;
  arrive: number;
  trail: number;
  glow: number;
  size: number;
  y0: number;
  y1: number;
}

interface ZoneVis {
  group: THREE.Group;
  base: THREE.Mesh;
  fill: THREE.Mesh;
  rim: THREE.Mesh;
  own: THREE.BufferGeometry[];
  zone: SimZone;
  landed: boolean;
}

interface Num {
  el: HTMLDivElement;
  on: boolean;
  t: number;
  x: number;
  y: number;
  z: number;
}

const SPELL_COLOR: Record<string, number> = {
  eldboll: 0xff8a2a,
  isspjut: 0xaee8ff,
  ljuspil: 0xfff07a,
  askregn: 0xfff59a,
  hugg: 0xe9eef7,
  yxhugg: 0xffe2b0,
  skoldslag: 0x9fd0ff,
  stormsteg: 0xffd0a0,
  virvelvind: 0xffe2b0,
};

export class Fx {
  private particles = new Particles();
  private flashes: Flash[] = [];
  private bolts: Bolt[] = [];
  private zones = new Map<string, ZoneVis>();
  private nums: Num[] = [];
  private numRoot: HTMLElement;
  private tint: HTMLElement;
  private storm: { mesh: THREE.Mesh; t: number }[] = [];
  private width = 800;
  private height = 600;

  private baseMat = fxMat(0xc81e1e, 0.38);
  private fillMat = fxMat(0xffa23a, 0.6);
  private rimMat = fxMat(0xff6a5a, 0.9);
  private poolBase = fxMat(0xff7a1a, 0.3);
  private poolFill = fxMat(0xffa030, 0.5);
  private poolRim = fxMat(0xffc060, 0.9);
  private selMat = fxMat(0xffdd33, 0.95);
  private selection: THREE.Mesh;
  private dome: THREE.Mesh;
  private hotRing: THREE.Mesh;
  private hotSpark = 0;
  private spikeGeo = new THREE.ConeGeometry(0.1, 0.8, 6).rotateX(Math.PI / 2);
  private arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.8);
  private ballGeo = new THREE.SphereGeometry(1, 10, 8);
  private boltMats = new Map<number, THREE.MeshBasicMaterial>();
  private stormGeo = new THREE.BoxGeometry(1, 1, 1);
  private stormMat = new THREE.MeshBasicMaterial({ color: 0xfff7b0 });
  private rng = (a: number, b: number): number => a + Math.random() * (b - a);
  private clock = 0;

  /**
   * @param host the element that holds the canvas and the HUD (the floating numbers and the rage tint go in here)
   */
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, host: HTMLElement, private sim: Sim) {
    scene.add(this.particles.points);

    this.selection = new THREE.Mesh(flat(new THREE.RingGeometry(0.4, 0.5, 32)), this.selMat);
    this.selection.position.y = FLOOR + 0.01;
    this.selection.renderOrder = 3;
    this.selection.visible = false;
    scene.add(this.selection);

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), fxMat(0x6ab8ff, 0.28));
    this.dome.renderOrder = 4;
    this.dome.visible = false;
    scene.add(this.dome);

    this.hotRing = new THREE.Mesh(runeGeo, fxMat(0x3fe07a, 0.75));
    this.hotRing.renderOrder = 3;
    this.hotRing.visible = false;
    scene.add(this.hotRing);

    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.stormGeo, this.stormMat);
      m.visible = false;
      scene.add(m);
      this.storm.push({ mesh: m, t: 0 });
    }

    this.numRoot = document.createElement('div');
    this.numRoot.className = 'saga3d-floats';
    host.append(this.numRoot);
    this.tint = document.createElement('div');
    this.tint.className = 'saga3d-rage';
    host.append(this.tint);
  }

  /** The canvas size in CSS pixels and the drawing buffer's height: projects the numbers and sizes the particles. */
  resize(cssW: number, cssH: number, bufferH: number): void {
    this.width = cssW;
    this.height = cssH;
    this.particles.setScale(bufferH / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  dispose(): void {
    this.numRoot.remove();
    this.tint.remove();
    this.particles.points.removeFromParent();
    for (const z of this.zones.values()) this.dropZone(z);
    this.zones.clear();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------------------------------------------

  handle(e: SimEvent): void {
    const p = this.sim.player;
    switch (e.type) {
      case 'cast': {
        const sp = SPELLS[e.spell];
        const col = SPELL_COLOR[e.spell] ?? 0xffffff;
        switch (e.kind) {
          case 'melee':
            this.flash('arc', e.from.x, 0.6, e.from.z, 0.4, 1.9, 0.25, col, 0.85, -e.facing);
            break;
          case 'bash':
            this.flash('arc', e.from.x, 0.6, e.from.z, 0.4, 2.1, 0.3, col, 0.9, -e.facing);
            if (e.to) this.burst(col, e.to.x, 0.6, e.to.z, 6, 0.35);
            break;
          case 'whirl':
            this.flash('swirl', e.from.x, 0.55, e.from.z, (sp?.radius ?? 2.2) * 0.7, sp?.radius ?? 2.2, 0.55, col, 0.8, 0, 14, true);
            break;
          case 'heal':
            this.flash('rune', e.from.x, FLOOR, e.from.z, 0.4, 1.1, 1.0, 0x6dff9a, 0.9, 0, 2, true);
            this.sparkles(e.from.x, e.from.z, 0.9, 8);
            break;
          case 'hot':
            this.flash('rune', e.from.x, FLOOR, e.from.z, 0.5, sp?.radius ?? 4, 0.8, 0x6dff9a, 0.8, 0, 1.5);
            this.sparkles(e.from.x, e.from.z, 1.2, 10);
            break;
          case 'wall':
            this.flash('ring', e.from.x, FLOOR, e.from.z, 0.4, 1.6, 0.5, 0x7ac0ff, 0.9);
            break;
          case 'rage':
            this.flash('ring', e.from.x, FLOOR, e.from.z, 0.4, 2.2, 0.5, 0xff4a30, 0.9);
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              this.particles.spawn(0xff5a30, e.from.x + Math.cos(a) * 0.5, 0.2, e.from.z + Math.sin(a) * 0.5, 0, this.rng(1.5, 2.8), 0, 0.7, 0.35, 0.1, 0.9);
            }
            break;
          case 'taunt':
            this.flash('ring', e.from.x, 0.3, e.from.z, 0.5, (sp?.radius ?? 5) * 0.7, 0.45, 0xffd24a, 0.8);
            break;
          case 'storm': {
            const at = e.to ?? e.from;
            const r = sp?.radius ?? 2.4;
            this.flash('ring', at.x, FLOOR, at.z, 0.3, r, 0.4, 0xfff59a, 0.9);
            for (let i = 0; i < 4; i++) {
              const s = this.storm[i]!;
              const a = Math.random() * Math.PI * 2;
              const d = i === 0 ? 0 : Math.random() * r * 0.8;
              s.mesh.position.set(at.x + Math.cos(a) * d, 3, at.z + Math.sin(a) * d);
              s.mesh.scale.set(0.09, 6, 0.09);
              s.mesh.rotation.z = this.rng(-0.12, 0.12);
              s.mesh.visible = true;
              s.t = -i * 0.05;
              this.burst(0xfff59a, s.mesh.position.x, 0.2, s.mesh.position.z, 5, 0.5);
            }
            break;
          }
          case 'bolt':
          case 'lance':
            this.burst(col, e.from.x, 0.7, e.from.z, 3, 0.2);
            break;
          default:
            break;
        }
        break;
      }
      case 'bolt': {
        const mob = e.target === 'player' ? null : this.sim.mobs.get(e.target);
        this.addBolt(e, mob?.size ?? 1);
        break;
      }
      case 'damage': {
        const mob = e.target === 'player' ? null : this.sim.mobs.get(e.target);
        const y = mob ? 0.6 * mob.size : 0.55;
        const col = e.target === 'player' ? 0xff5a5a : (SPELL_COLOR[e.spell ?? ''] ?? 0xfff2c0);
        this.burst(col, e.at.x, y, e.at.z, e.target === 'player' ? 5 : 4 + Math.floor(Math.random() * 3), 0.3);
        this.number(String(e.amount), e.target === 'player' ? 'hurt' : 'dmg', e.at.x, y + (mob ? 0.5 * mob.size : 0.7), e.at.z);
        break;
      }
      case 'heal':
        this.number(`+${e.amount}`, 'heal', e.at.x, 1.15, e.at.z);
        this.sparkles(e.at.x, e.at.z, 0.7, 3);
        break;
      case 'blink':
        this.streak(e.from, e.to, 0xc79bff, 0.9, 0.4);
        break;
      case 'charge':
        this.streak(e.from, e.to, e.who === 'player' ? 0xffd9a0 : 0xff8a5a, e.who === 'player' ? 0.7 : 1.2, 0.45);
        break;
      case 'spawn': {
        const m = this.sim.mobs.get(e.id);
        if (m) {
          this.flash('ring', m.x, FLOOR, m.z, 0.2, 1.2, 0.5, 0xc0a0ff, 0.8);
          this.burst(0xc0a0ff, m.x, 0.5, m.z, 6, 0.5);
        }
        break;
      }
      case 'mobDied': {
        const m = this.sim.mobs.get(e.id);
        if (m) this.burst(0xdddddd, m.x, 0.3 * m.size, m.z, 5, 0.5 * m.size);
        break;
      }
      case 'interrupt': {
        const m = this.sim.mobs.get(e.by);
        if (m) this.flash('ring', m.x, 0.5, m.z, 0.3, 1.8 * m.size, 0.4, 0xffffff, 0.9);
        break;
      }
      case 'rest':
        this.flash('rune', e.x, FLOOR, e.z, 0.5, 2.5, 1.2, 0xfff0a0, 0.7, 0, 1);
        break;
      case 'playerUp':
        this.flash('rune', p.x, FLOOR, p.z, 0.5, 1.6, 1.0, 0xffffff, 0.8);
        this.sparkles(p.x, p.z, 1, 8);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // building blocks
  // ---------------------------------------------------------------------------------------------------------------

  private burst(color: number, x: number, y: number, z: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = this.rng(0.2, 1);
      const s = this.rng(0.4, 1) * speed * 4;
      this.particles.spawn(color, x, y, z, Math.cos(a) * s, up * s * 0.8, Math.sin(a) * s, this.rng(0.25, 0.45), 0.28, 0.08, 1, 6);
    }
  }

  private sparkles(x: number, z: number, h: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = this.rng(0.15, 0.6);
      this.particles.spawn(i % 2 ? 0xb8ffc8 : 0x6dff9a, x + Math.cos(a) * d, this.rng(0.05, 0.3), z + Math.sin(a) * d, 0, this.rng(0.7, 1.4) * h, 0, this.rng(0.6, 1.0), 0.22, 0.06, 1);
    }
  }

  /** A fading line of soft blobs along a dash. */
  private streak(from: P2, to: P2, color: number, size: number, life: number): void {
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      this.particles.spawn(color, from.x + (to.x - from.x) * k, 0.5, from.z + (to.z - from.z) * k, 0, 0.1, 0, life * (0.5 + 0.5 * k), size * 0.55, size * 0.15, 0.9);
    }
  }

  private flash(shape: FlashShape, x: number, y: number, z: number, r0: number, r1: number, dur: number, color: number, alpha: number, rotY = 0, spin = 0, follow = false): void {
    let f = this.flashes.find((o) => !o.on);
    if (!f) {
      if (this.flashes.length >= 14) return;
      const mat = fxMat(0xffffff, 1);
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.scene.add(mesh);
      f = { mesh, mat, on: false, t: 0, dur: 1, r0: 1, r1: 1, alpha: 1, spin: 0, follow: false };
      this.flashes.push(f);
    }
    f.on = true;
    f.t = 0;
    f.dur = dur;
    f.r0 = r0;
    f.r1 = r1;
    f.alpha = alpha;
    f.spin = spin;
    f.follow = follow;
    f.mesh.geometry = FLASH_GEO[shape];
    f.mat.color.set(color);
    f.mesh.position.set(x, y, z);
    f.mesh.rotation.y = rotY;
    f.mesh.scale.set(r0, 1, r0);
    f.mesh.visible = true;
  }

  private addBolt(e: Extract<SimEvent, { type: 'bolt' }>, targetSize: number): void {
    const own = !e.spell.startsWith('mob_');
    let mesh: THREE.Object3D;
    let trail: number;
    let glow: number;
    let size = 0.5;
    const y1 = e.target === 'player' ? 0.6 : 0.6 * targetSize;
    const dx = e.to.x - e.from.x;
    const dz = e.to.z - e.from.z;
    const yaw = Math.atan2(dx, dz);
    if (e.spell === 'isspjut') {
      mesh = new THREE.Mesh(this.spikeGeo, this.boltMat(0xcff2ff));
      trail = 0xaee8ff;
      glow = 0x8fd6f5;
    } else if (e.spell === 'ljuspil') {
      mesh = new THREE.Mesh(this.arrowGeo, this.boltMat(0xfff07a));
      trail = 0xfff07a;
      glow = 0xffe14a;
      size = 0.35;
    } else if (own) {
      const b = new THREE.Mesh(this.ballGeo, this.boltMat(0xffb040));
      b.scale.setScalar(0.17);
      mesh = b;
      trail = 0xff5a1a;
      glow = 0xff8a2a;
      size = 0.75;
    } else {
      const b = new THREE.Mesh(this.ballGeo, this.boltMat(0xc8ffc8));
      b.scale.setScalar(0.14);
      mesh = b;
      trail = 0x6dff9a;
      glow = 0x7dffa8;
      size = 0.55;
    }
    mesh.rotation.y = yaw;
    mesh.position.set(e.from.x, 0.7, e.from.z);
    this.scene.add(mesh);
    this.bolts.push({ mesh, from: e.from, to: e.to, t0: this.sim.time, arrive: Math.max(e.arrive, this.sim.time + 0.02), trail, glow, size, y0: 0.7, y1 });
  }

  private boltMat(color: number): THREE.MeshBasicMaterial {
    let m = this.boltMats.get(color);
    if (!m) this.boltMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
    return m;
  }

  private number(text: string, cls: 'dmg' | 'hurt' | 'heal', x: number, y: number, z: number): void {
    let n = this.nums.find((o) => !o.on);
    if (!n) {
      if (this.nums.length < MAX_NUMBERS) {
        const el = document.createElement('div');
        this.numRoot.append(el);
        n = { el, on: false, t: 0, x: 0, y: 0, z: 0 };
        this.nums.push(n);
      } else {
        // the cap: reuse the oldest one
        n = this.nums.reduce((a, b) => (a.t > b.t ? a : b));
      }
    }
    n.on = true;
    n.t = 0;
    n.x = x + this.rng(-0.15, 0.15);
    n.y = y;
    n.z = z + this.rng(-0.15, 0.15);
    n.el.className = `saga3d-num saga3d-${cls}`;
    n.el.textContent = text;
    n.el.style.display = 'block';
  }

  // ---------------------------------------------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------------------------------------------

  /** `dt` real seconds, `simT` the sim clock (sim.time plus the part of a step not yet simulated). */
  update(dt: number, simT: number): void {
    this.clock += dt;
    const sim = this.sim;
    const p = sim.player;
    this.updateZones(simT);
    this.updateBolts(simT);

    // flashes: grow, fade, spin
    for (const f of this.flashes) {
      if (!f.on) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.on = false;
        f.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k);
      const r = f.r0 + (f.r1 - f.r0) * e;
      f.mesh.scale.set(r, 1, r);
      f.mat.opacity = f.alpha * (1 - k * k);
      if (f.spin) f.mesh.rotation.y += f.spin * dt;
      if (f.follow) f.mesh.position.set(p.x, f.mesh.position.y, p.z);
    }

    // lightning
    for (const s of this.storm) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      if (s.t > 0.3) s.mesh.visible = false;
      else if (s.t >= 0) {
        // flicker and thin out
        s.mesh.scale.x = s.mesh.scale.z = 0.1 * (1 - s.t / 0.3) + 0.01;
        s.mesh.rotation.z += (Math.random() - 0.5) * 0.1;
      } else s.mesh.scale.x = s.mesh.scale.z = 0.0001;
    }

    // shield dome, healing circle, rage tint, selection ring
    const wall = p.wallUntil > sim.time && !p.down;
    this.dome.visible = wall;
    if (wall) {
      this.dome.position.set(p.x, 0, p.z);
      const pulse = 1 + Math.sin(this.clock * 4) * 0.03;
      this.dome.scale.set(0.95 * pulse, 1.05 * pulse, 0.95 * pulse);
      (this.dome.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(this.clock * 5) * 0.05;
    }
    const hot = p.hotUntil > sim.time && !p.down;
    this.hotRing.visible = hot;
    if (hot) {
      const r = (SPELLS.lakekrets?.radius ?? 4) * 0.95;
      this.hotRing.position.set(p.x, FLOOR + 0.005, p.z);
      this.hotRing.scale.set(r, 1, r);
      this.hotRing.rotation.y += dt * 0.5;
      this.hotSpark -= dt;
      if (this.hotSpark <= 0) {
        this.hotSpark = 0.18;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        this.particles.spawn(0x9dffb8, p.x + Math.cos(a) * d, 0.05, p.z + Math.sin(a) * d, 0, this.rng(0.6, 1.2), 0, 0.9, 0.2, 0.05);
      }
    }
    const rage = p.rageUntil > sim.time && !p.down;
    this.tint.style.opacity = rage ? String(0.55 + Math.sin(this.clock * 7) * 0.25) : '0';

    const t = p.target === null ? undefined : sim.mobs.get(p.target);
    if (t && !t.dead) this.select(t);
    else this.selection.visible = false;

    this.particles.update(dt);
    this.updateNumbers(dt);
  }

  private select(m: SimMob): void {
    const s = this.selection;
    s.visible = true;
    const r = (0.55 + 0.35 * m.size) * (1 + Math.sin(this.clock * 6) * 0.04);
    s.position.set(m.x, FLOOR + 0.01, m.z);
    s.scale.set(r, 1, r);
  }

  private updateBolts(simT: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      const k = Math.min(1, (simT - b.t0) / Math.max(0.001, b.arrive - b.t0));
      const x = b.from.x + (b.to.x - b.from.x) * k;
      const z = b.from.z + (b.to.z - b.from.z) * k;
      const y = b.y0 + (b.y1 - b.y0) * k + Math.sin(k * Math.PI) * 0.1;
      b.mesh.position.set(x, y, z);
      this.particles.spawn(b.glow, x, y, z, 0, 0, 0, 0.05, b.size * 0.9, b.size * 0.9, 0.8);
      this.particles.spawn(b.trail, x + this.rng(-0.04, 0.04), y + this.rng(-0.04, 0.04), z + this.rng(-0.04, 0.04), this.rng(-0.2, 0.2), this.rng(-0.1, 0.3), this.rng(-0.2, 0.2), 0.3, b.size * 0.6, 0.05, 0.8);
      if (k >= 1) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  private makeZone(z: SimZone): ZoneVis {
    const group = new THREE.Group();
    group.position.set(z.x, 0, z.z);
    const own: THREE.BufferGeometry[] = [];
    let baseG = discGeo;
    let rimG = thinRingGeo;
    if (z.shape === 'cone') {
      const arc = ((z.arc ?? 90) * Math.PI) / 180;
      const start = -(z.dir ?? 0) - arc / 2;
      baseG = flat(new THREE.CircleGeometry(1, 24, start, arc));
      rimG = flat(new THREE.RingGeometry(0.94, 1, 24, 1, start, arc));
      own.push(baseG, rimG);
    }
    const base = new THREE.Mesh(baseG, this.baseMat);
    const fill = new THREE.Mesh(baseG, this.fillMat);
    const rim = new THREE.Mesh(rimG, this.rimMat);
    base.position.y = FLOOR;
    fill.position.y = FLOOR + 0.004;
    rim.position.y = FLOOR + 0.008;
    base.renderOrder = 2;
    fill.renderOrder = 2;
    rim.renderOrder = 2;
    base.scale.set(z.r, 1, z.r);
    rim.scale.set(z.r, 1, z.r);
    fill.scale.set(0.01, 1, 0.01);
    group.add(base, fill, rim);
    this.scene.add(group);
    return { group, base, fill, rim, own, zone: z, landed: false };
  }

  private dropZone(v: ZoneVis): void {
    v.group.removeFromParent();
    for (const g of v.own) g.dispose();
  }

  private updateZones(simT: number): void {
    const seen = new Set<string>();
    for (const z of this.sim.zones) {
      seen.add(z.id);
      let v = this.zones.get(z.id);
      if (!v) this.zones.set(z.id, (v = this.makeZone(z)));
      v.zone = z;
      const k = Math.min(1, Math.max(0, (simT - z.born) / Math.max(0.001, z.at - z.born)));
      if (simT < z.at) {
        const e = k * k * (3 - 2 * k);
        v.fill.scale.set(Math.max(0.01, z.r * e), 1, Math.max(0.01, z.r * e));
      } else if (z.until !== undefined) {
        // burning ground: orange, full, pulsing
        if (!v.landed) {
          v.landed = true;
          v.base.material = this.poolBase;
          v.fill.material = this.poolFill;
          v.rim.material = this.poolRim;
          this.flash('ring', z.x, FLOOR, z.z, z.r * 0.5, z.r * 1.2, 0.35, 0xffa030, 0.9);
        }
        v.fill.scale.set(z.r * 0.92, 1, z.r * 0.92);
        if (Math.random() < 0.25) this.particles.spawn(0xff9a30, z.x + this.rng(-z.r, z.r) * 0.7, 0.05, z.z + this.rng(-z.r, z.r) * 0.7, 0, this.rng(0.5, 1.2), 0, 0.7, 0.25, 0.05, 0.9);
      }
    }
    // pools pulse together: two shared materials, no per-zone cost
    const pulse = Math.sin(this.clock * 6);
    this.poolBase.opacity = 0.3 + pulse * 0.08;
    this.poolFill.opacity = 0.5 + pulse * 0.15;
    for (const [id, v] of this.zones) {
      if (seen.has(id)) continue;
      // a circle that just landed gets a flash and a puff of dust; one that was cancelled or timed out just goes
      const z = v.zone;
      if (z.until === undefined && simT >= z.at - 0.1) {
        if (z.shape === 'circle') {
          this.flash('ring', z.x, FLOOR, z.z, z.r * 0.4, z.r * 1.05, 0.3, 0xffb060, 0.9);
          this.flash('disc', z.x, FLOOR, z.z, z.r, z.r, 0.2, 0xff6a30, 0.5);
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.spawn(0xd8c0a0, z.x + Math.cos(a) * z.r * 0.5, 0.1, z.z + Math.sin(a) * z.r * 0.5, Math.cos(a) * 1.5, this.rng(0.5, 1.5), Math.sin(a) * 1.5, 0.5, 0.5, 0.15, 0.6);
          }
        } else {
          const a = z.dir ?? 0;
          this.flash('arc', z.x, 0.4, z.z, z.r * 0.4, z.r, 0.3, 0xffb060, 0.9, -a);
        }
      }
      this.dropZone(v);
      this.zones.delete(id);
    }
  }

  private updateNumbers(dt: number): void {
    const v = new THREE.Vector3();
    for (const n of this.nums) {
      if (!n.on) continue;
      n.t += dt;
      const k = n.t / NUMBER_S;
      if (k >= 1) {
        n.on = false;
        n.el.style.display = 'none';
        continue;
      }
      v.set(n.x, n.y, n.z).project(this.camera);
      if (v.z > 1 || v.z < -1) {
        n.el.style.opacity = '0';
        continue;
      }
      const px = (v.x * 0.5 + 0.5) * this.width;
      const py = (-v.y * 0.5 + 0.5) * this.height - NUMBER_RISE * (1 - (1 - k) * (1 - k));
      const pop = n.t < 0.12 ? 1.5 - (n.t / 0.12) * 0.5 : 1;
      n.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      n.el.style.opacity = k > 0.6 ? String((1 - k) / 0.4) : '1';
    }
  }
}
