// Particles: little squares that fly and fall like Minecraft's, plus the 2D game's effect sprites as billboards.
import * as THREE from 'three';
import { fxTexture } from './sprites.ts';

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  gravity: number;
  life: number;
  age: number;
  fade: boolean;
  grow?: number;
  onDone?: () => void;
}

let white: THREE.Texture | null = null;
const whiteTex = () => {
  if (!white) {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 2, 2);
    white = new THREE.CanvasTexture(c);
  }
  return white;
};

export class Fx {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  /** Camera shake amount, decays each frame. */
  shake = 0;

  /** A burst of coloured squares. */
  burst(pos: THREE.Vector3, colors: string[], n: number, opts: { speed?: number; up?: number; gravity?: number; size?: number; life?: number } = {}): void {
    const speed = opts.speed ?? 2;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: whiteTex(), color: colors[i % colors.length]!, transparent: true, depthWrite: false }));
      const s = (opts.size ?? 0.1) * (0.7 + Math.random() * 0.6);
      m.scale.set(s, s, 1);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4));
      const vel = new THREE.Vector3((Math.random() - 0.5) * speed, (opts.up ?? 1.5) + Math.random() * speed * 0.5, (Math.random() - 0.5) * speed);
      this.add({ obj: m, vel, gravity: opts.gravity ?? 9, life: (opts.life ?? 0.6) * (0.7 + Math.random() * 0.6), age: 0, fade: true });
    }
  }

  /** One of the 2D effect sprites (heart, coin…) floating up. */
  icon(pos: THREE.Vector3, kind: string, opts: { n?: number; rise?: number; size?: number; life?: number; spread?: number } = {}): void {
    const n = opts.n ?? 1;
    for (let i = 0; i < n; i++) {
      const tex = fxTexture(kind, i);
      if (!tex) return;
      const img = tex.image as HTMLCanvasElement;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const s = (opts.size ?? 0.4) * (img.width / 8);
      m.scale.set(s, (s * img.height) / img.width, 1);
      const spread = opts.spread ?? 0.4;
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, i * 0.15, (Math.random() - 0.5) * spread));
      this.add({ obj: m, vel: new THREE.Vector3(0, opts.rise ?? 1, 0), gravity: 0, life: (opts.life ?? 1) + i * 0.15, age: -i * 0.08, fade: true });
    }
  }

  /** A billboard that grows and fades (explosions, smoke puffs). */
  puff(pos: THREE.Vector3, kind: string, frame: number, size: number, grow: number, life: number): void {
    const tex = fxTexture(kind, frame);
    if (!tex) return;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.scale.set(size, size, 1);
    m.position.copy(pos);
    this.add({ obj: m, vel: new THREE.Vector3(0, 0.3, 0), gravity: 0, life, age: 0, fade: true, grow });
  }

  /** Something flying from a to b (arrows, rockets, lasso loops). */
  projectile(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, seconds: number, onDone?: () => void, trail?: () => void): void {
    obj.position.copy(from);
    obj.lookAt(to);
    const vel = to.clone().sub(from).divideScalar(seconds);
    const p: Particle = { obj, vel, gravity: 0, life: seconds, age: 0, fade: false, onDone };
    if (trail) p.obj.userData.trail = trail;
    this.add(p);
  }

  private add(p: Particle): void {
    this.parts.push(p);
    this.group.add(p.obj);
    if (p.age < 0) p.obj.visible = false;
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.age += dt;
      if (p.age < 0) continue;
      p.obj.visible = true;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.grow) p.obj.scale.multiplyScalar(1 + p.grow * dt);
      (p.obj.userData.trail as (() => void) | undefined)?.();
      if (p.fade && p.obj instanceof THREE.Sprite) p.obj.material.opacity = Math.min(1, 2 * (1 - p.age / p.life));
      if (p.age >= p.life) {
        this.group.remove(p.obj);
        if (p.obj instanceof THREE.Sprite) p.obj.material.dispose();
        p.onDone?.();
        this.parts.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.parts) this.group.remove(p.obj);
    this.parts = [];
  }
}
