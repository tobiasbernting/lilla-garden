// Snökungen, the Snow King: rises behind his castle, leaps over it and lands with a shockwave (jump!).
// Then a rhythm the player can read: he slides about with his arms crossed over his ice heart, lifts a
// huge snowball (the heart glows: hit it now!), throws a fan, pants for a moment, crosses his arms.
// At two thirds and one third he stomps again and calls small helpers. A hit in the wind-up makes
// him drop the snowball on his own head.
import * as THREE from 'three';
import type { Arena } from './arena.ts';
import { buildSnowman, disposeModel, type SnowmanModel } from './snowman.ts';
import { angleDiff, clamp, damp, easeInOut, easeOutBack, rand } from './util.ts';
import { heightAt } from './world.ts';

type State = 'rise' | 'leap' | 'move' | 'windup' | 'throw' | 'tired' | 'guard' | 'stomp' | 'dying' | 'gone';

export const BOSS_HP = 12;
const SCALE = 1.3;
const HOME_Z = -15.8;

/** A ring of snow rushing outwards along the ground. */
export class Shockwave {
  readonly mesh: THREE.Mesh;
  r = 1.5;
  alive = true;
  hitPlayer = false;
  private n = 96;
  private pos: Float32Array;
  constructor(
    scene: THREE.Scene,
    readonly cx: number,
    readonly cz: number,
    private speed = 11,
    private maxR = 42,
  ) {
    const n = this.n;
    this.pos = new Float32Array((n + 1) * 3 * 3);
    const alpha = new Float32Array((n + 1) * 3);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      alpha.set([0, 1, 0], i * 3);
      if (i < n) {
        const a = i * 3;
        const b = (i + 1) * 3;
        idx.push(a, b, a + 1, b, b + 1, a + 1); // ground band
        idx.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2); // wall
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(alpha, 1));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 1 } },
        vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uFade; varying float vA; void main(){ float a = vA * uFade; gl_FragColor = vec4(vec3(0.75, 0.92, 1.0) * a, a); }',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.update(0);
  }

  update(dt: number): void {
    this.r += this.speed * dt;
    if (this.r > this.maxR) this.alive = false;
    const n = this.n;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ri = Math.max(0, this.r - 1.6);
      const xi = this.cx + c * ri;
      const zi = this.cz + s * ri;
      const xo = this.cx + c * this.r;
      const zo = this.cz + s * this.r;
      const go = heightAt(xo, zo);
      this.pos.set([xi, heightAt(xi, zi) + 0.06, zi, xo, go + 0.08, zo, this.cx + c * (this.r - 0.35), go + 0.95, this.cz + s * (this.r - 0.35)], i * 9);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uFade!.value = clamp((this.maxR - this.r) / 8, 0, 1);
  }

  /** Does it catch the player (feet on the ground) this frame? */
  catches(p: THREE.Vector3): boolean {
    if (this.hitPlayer || !this.alive) return false;
    const d = Math.hypot(p.x - this.cx, p.z - this.cz);
    const feet = p.y - heightAt(p.x, p.z);
    if (Math.abs(d - (this.r - 0.4)) < 0.75 && feet < 0.42) {
      this.hitPlayer = true;
      return true;
    }
    return false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class Boss {
  readonly model: SnowmanModel;
  pos = new THREE.Vector3(0, 0, -32);
  hp = BOSS_HP;
  phase = 1;
  state: State = 'rise';
  t = 0;
  dur = 3.2;
  rings: Shockwave[] = [];
  /** Things the game reacts to. */
  events: ('land' | 'roar' | 'windup' | 'throw' | 'hurt' | 'block' | 'dropBall' | 'dead' | 'jump')[] = [];
  private yaw = 0;
  private guard = 1;
  private lift = 0;
  private flash = 0;
  private hurtT = 9;
  private targetX = 0;
  private fromX = 0;
  private cycles = 0;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private stepT = 0;
  private wob = 0;
  private bigBall: THREE.Mesh;

  constructor(private A: Arena) {
    this.model = buildSnowman('king', { scarf: 0x3d56d8, hat: 0xffd23f, hatType: 'crown', glowTex: A.glowTex, shadows: A.shadows, low: A.low });
    this.model.root.scale.setScalar(SCALE);
    A.scene.add(this.model.root);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    // the huge snowball he lifts over his head
    this.bigBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), new THREE.MeshLambertMaterial({ color: 0xf6f8ff, emissive: 0x30304a }));
    this.bigBall.visible = false;
    this.model.body.add(this.bigBall);
    this.events.push('roar');
  }

  /** Is the ice heart open to hits right now? */
  get exposed(): boolean {
    return (this.state === 'windup' || this.state === 'throw' || this.state === 'tired') && this.guard < 0.5;
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'gone';
  }

  /** In the fight proper (not rising or leaping in). */
  get fighting(): boolean {
    return this.alive && this.state !== 'rise' && this.state !== 'leap';
  }

  heartPos(out: THREE.Vector3): THREE.Vector3 {
    return this.model.heart!.getWorldPosition(out);
  }

  /** Body spheres (snowballs puff off them). */
  spheres(out: { c: THREE.Vector3; r: number }[]): number {
    const d = this.model.dims;
    const root = this.model.root.position;
    for (let i = 0; i < d.r.length; i++) {
      const s = out[i] ?? (out[i] = { c: new THREE.Vector3(), r: 0 });
      s.c.set(root.x, root.y + d.y[i]! * SCALE, root.z);
      s.r = d.r[i]! * SCALE * 1.05;
    }
    return d.r.length;
  }

  /** A snowball reached the heart. Returns what happened. */
  hitHeart(): 'hurt' | 'block' | 'kill' {
    if (!this.exposed) {
      this.events.push('block');
      this.flash = 0.3;
      return 'block';
    }
    this.hp--;
    this.flash = 1;
    this.hurtT = 0;
    if (this.state === 'windup') {
      // the big snowball drops on his own head
      this.bigBall.visible = false;
      this.events.push('dropBall');
      this.A.releaseThrow();
      this.go('tired', 2.2);
    }
    if (this.hp <= 0) {
      this.go('dying', 2.4);
      this.events.push('dead');
      return 'kill';
    }
    this.events.push('hurt');
    return 'hurt';
  }

  /** The giant snowball rolls into him. */
  bowled(): 'hurt' | 'kill' {
    this.hp = Math.max(0, this.hp - 3);
    this.flash = 1;
    this.hurtT = 0;
    if (this.hp <= 0) {
      if (this.state === 'windup') this.A.releaseThrow();
      this.go('dying', 2.4);
      this.events.push('dead');
      return 'kill';
    }
    this.events.push('hurt');
    if (this.state === 'windup') {
      this.bigBall.visible = false;
      this.events.push('dropBall');
      this.A.releaseThrow();
      this.go('tired', 2.0);
    }
    return 'hurt';
  }

  private go(s: State, dur: number): void {
    this.state = s;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number): void {
    const A = this.A;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.hurtT += dt;
    for (const r of this.rings) r.update(dt);
    this.rings = this.rings.filter((r) => {
      if (!r.alive) r.dispose();
      return r.alive;
    });
    const k = clamp(this.t / this.dur, 0, 1);
    switch (this.state) {
      case 'rise': {
        // up from behind the castle, snow sliding off him
        this.pos.set(0, heightAt(0, -32) - (1 - easeInOut(k)) * 7.5, -32);
        if (Math.random() < dt * 20) A.chunks.burst(new THREE.Vector3(rand(-2, 2), this.pos.y + 5.5, -31), 1, 0.15, 2);
        A.shake(0.25 * dt * 10);
        if (k >= 1) {
          this.leapFrom.copy(this.pos);
          this.leapTo.set(0, heightAt(0, HOME_Z), HOME_Z);
          this.go('leap', 1.25);
          this.events.push('roar', 'jump');
        }
        break;
      }
      case 'leap': {
        this.pos.lerpVectors(this.leapFrom, this.leapTo, easeInOut(k));
        this.pos.y += Math.sin(k * Math.PI) * 6;
        if (k >= 1) this.land();
        break;
      }
      case 'move': {
        const e = easeInOut(k);
        this.pos.x = this.fromX + (this.targetX - this.fromX) * e;
        this.pos.z = HOME_Z;
        this.pos.y = heightAt(this.pos.x, this.pos.z);
        this.wob += dt * 6;
        this.stepT += dt;
        if (this.stepT > 0.55) {
          this.stepT = 0;
          A.shake(0.12);
        }
        if (k >= 1) {
          this.cycles++;
          if (A.requestThrow()) this.go('windup', (this.phase === 3 ? 1.1 : 1.35));
          else this.pickMove();
        }
        break;
      }
      case 'windup': {
        this.bigBall.visible = true;
        if (this.t < dt * 1.5) this.events.push('windup');
        if (k >= 1) this.throwVolley();
        break;
      }
      case 'throw': {
        if (k >= 1) this.go('tired', this.phase === 3 ? 1.4 : 1.8);
        break;
      }
      case 'tired': {
        if (k >= 1) this.go('guard', 0.55);
        break;
      }
      case 'guard': {
        if (k >= 1) {
          // phase change: stomp and call helpers
          const want = this.hp <= 4 ? 3 : this.hp <= 8 ? 2 : 1;
          if (want > this.phase) {
            this.phase = want;
            this.go('stomp', 1.1);
            this.events.push('roar', 'jump');
          } else if (this.phase >= 2 && this.cycles % 3 === 2) {
            this.summon(2);
            this.pickMove();
          } else this.pickMove();
        }
        break;
      }
      case 'stomp': {
        const base = heightAt(this.pos.x, this.pos.z);
        this.pos.y = base + Math.sin(k * Math.PI) * 2.2;
        if (k >= 1) {
          this.pos.y = base;
          this.land();
          this.summon(this.phase === 3 ? 3 : 2);
        }
        break;
      }
      case 'dying': {
        this.wob += dt * 18;
        if (k >= 1) this.go('gone', 0);
        break;
      }
      case 'gone':
        break;
    }
    this.animate(dt);
  }

  private land(): void {
    const A = this.A;
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.rings.push(new Shockwave(A.scene, this.pos.x, this.pos.z));
    A.chunks.burst(this.pos.clone().setY(this.pos.y + 0.5), A.low ? 16 : 30, 0.2, 7, 0xf4f7ff, 0.8);
    A.puffs.emit(this.pos.clone().setY(this.pos.y + 0.6), { n: 24, size: [1.2, 2.2], grow: 2, speed: 9, up: -0.2, life: [0.6, 1.1], spread: 1.5 });
    A.shake(0.9);
    this.events.push('land');
    this.fromX = this.pos.x;
    this.targetX = this.pos.x;
    this.go('guard', 0.9);
  }

  private pickMove(): void {
    this.fromX = this.pos.x;
    let x = this.fromX;
    for (let i = 0; i < 10 && Math.abs(x - this.fromX) < 3; i++) x = rand(-6.5, 6.5);
    this.targetX = x;
    this.go('move', Math.abs(x - this.fromX) / (this.phase === 3 ? 4.5 : 3.2) + 0.3);
  }

  private summon(n: number): void {
    for (let i = 0; i < n; i++) {
      const x = clamp(this.pos.x + (i - (n - 1) / 2) * 4 + rand(-0.8, 0.8), -12, 12);
      this.A.spawnEnemy('small', new THREE.Vector2(x, rand(-10, -3)));
    }
  }

  private throwVolley(): void {
    const A = this.A;
    this.bigBall.visible = false;
    const from = this.bigBall.getWorldPosition(new THREE.Vector3());
    const p = A.playerPos;
    const n = 2 + this.phase;
    const dist = Math.hypot(p.x - from.x, p.z - from.z);
    const flight = clamp(0.9 + dist * 0.022, 1.2, 1.7) * A.diff.flight;
    const aim = new THREE.Vector3(p.x, p.y + 0.9, p.z).addScaledVector(A.playerVel, flight * 0.35);
    const side = new THREE.Vector3(aim.z - from.z, 0, -(aim.x - from.x)).normalize();
    const gap = this.phase === 3 ? 2.1 : 2.5;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap + rand(-0.3, 0.3);
      const to = aim.clone().addScaledVector(side, off);
      A.enemyThrow(from.clone().addScaledVector(side, off * 0.08), to, flight * (1 + Math.abs(off) * 0.015), true);
    }
    A.releaseThrow();
    this.events.push('throw');
    this.go('throw', 0.4);
  }

  private animate(dt: number): void {
    const m = this.model;
    const st = this.state;
    const p = this.A.playerPos;
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 2.5);
    m.root.rotation.y = this.yaw;
    m.root.position.copy(this.pos);
    const k = clamp(this.t / this.dur, 0, 1);
    // arms: crossed over the heart (guard) or up with the big ball (lift)
    const guarding = st === 'move' || st === 'guard' || st === 'rise' || st === 'leap' || st === 'stomp';
    this.guard = damp(this.guard, guarding ? 1 : 0, guarding ? 6 : 10, dt);
    const lifting = st === 'windup';
    this.lift = damp(this.lift, lifting ? 1 : 0, lifting ? 5 : 8, dt);
    const g = this.guard;
    const l = this.lift;
    m.armL.rotation.set(0, -1.15 * g, -0.55 + 0.25 * g + 2.0 * l);
    m.armR.rotation.set(0, 1.15 * g, 0.55 - 0.25 * g - 2.0 * l);
    // the big ball rests on his raised twig hands
    const d = m.dims;
    this.bigBall.position.set(0, d.y[2]! + d.r[2]! + 0.6 + (1 - l) * -1.2, 0.2);
    this.bigBall.scale.setScalar(0.4 + 0.6 * l);
    // body: waddle, pant, flinch, and the wobble before he bursts
    const tired = st === 'tired';
    let sy = 1 + (tired ? Math.sin(this.t * 9) * 0.035 : 0);
    if (st === 'leap') sy = 1 + Math.sin(k * Math.PI) * 0.1;
    if (st === 'stomp') sy = 1 - Math.sin(k * Math.PI) * 0.12;
    const hurt = this.hurtT < 0.45 ? Math.sin((this.hurtT / 0.45) * Math.PI) : 0;
    m.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    m.body.rotation.z = st === 'move' ? Math.sin(this.wob) * 0.06 : st === 'dying' ? Math.sin(this.wob) * 0.12 * (1 + k) : 0;
    m.body.rotation.x = -0.18 * hurt + (lifting ? -0.12 * l : 0) + (tired ? 0.08 : 0);
    m.head.rotation.z = Math.sin(this.A.time * 1.5) * 0.04 + (tired ? Math.sin(this.t * 4.5) * 0.06 : 0);
    // the heart: dim when guarded, bright and pulsing when open
    const open = this.exposed;
    const pulse = 0.5 + 0.5 * Math.sin(this.A.time * (open ? 10 : 3));
    const hs = (open ? 1.15 + pulse * 0.2 : 0.9) * (1 + this.flash * 0.4);
    m.heart!.scale.setScalar(hs);
    const glow = m.heartGlow!;
    glow.visible = true;
    (glow.material as THREE.SpriteMaterial).opacity = open ? 0.7 + pulse * 0.3 : 0.18;
    glow.scale.setScalar((open ? 3.4 + pulse * 0.8 : 1.6) * (1 + this.flash));
    m.bubble.visible = lifting && k > 0.05;
    if (m.bubble.visible) m.bubble.scale.setScalar(1.2 * (1 + Math.max(0, 0.4 - k * 3)) * (1 + Math.sin(this.t * 16) * 0.06));
    m.bodyMat.userData.flash.value = this.flash * 0.7;
    // rising: hide below the castle
    m.root.visible = st !== 'gone';
    if (st === 'rise') m.root.position.y = this.pos.y;
    // a fresh scale pop when he lands
    if (st === 'guard' && this.t < 0.3 && this.dur > 0.8) {
      const s = SCALE * (1 + (1 - easeOutBack(this.t / 0.3)) * 0.12);
      m.root.scale.set(s, SCALE * (2 - s / SCALE), s);
    } else m.root.scale.setScalar(SCALE);
  }

  /** Burst into a huge cloud of snow with the crown flying. */
  poof(): void {
    const A = this.A;
    const m = this.model;
    const c = this.pos.clone().setY(this.pos.y + 3);
    for (let i = 0; i < 3; i++) {
      const at = this.pos.clone().setY(this.pos.y + 1.4 + i * 1.8);
      A.chunks.burst(at, A.low ? 22 : 40, 0.32, 10);
      A.puffs.emit(at, { n: 18, size: [1.6, 2.6], grow: 2.2, speed: 8, up: 0.3, life: [0.7, 1.3], spread: 1.2 });
    }
    A.sparks.emit(c, { n: 40, size: [0.4, 0.8], grow: 0.3, speed: 12, up: 0.6, life: [0.6, 1.2], color: 0xbff4ff, alpha: 1, drag: 1.5 });
    m.hat.userData.s0 = m.hat.scale.x;
    A.debris.launch(m.hat, new THREE.Vector3(rand(-2, 2), 16, 6), 6, 0.5, 5);
    m.nose.userData.s0 = 1;
    A.debris.launch(m.nose, new THREE.Vector3(rand(-4, 4), 11, 8), 18, 0.15, 5);
    this.model.root.visible = false;
  }

  dispose(): void {
    for (const r of this.rings) r.dispose();
    this.rings = [];
    this.bigBall.geometry.dispose();
    (this.bigBall.material as THREE.Material).dispose();
    disposeModel(this.model);
  }
}
