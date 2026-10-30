// Snöbollskriget: a first-person snowball fight against living snowmen in a Swedish village at blue
// hour. Five waves that ramp up, then Snökungen. This file runs the show: the renderer, input, the
// waves, scoring, collisions and the camera feel. The pieces live next to it.
import * as THREE from 'three';
import { Loop } from '../../kit.ts';
import type { GameContext, GameInstance } from '../../types.ts';
import { WAVES, type Arena, type Difficulty, type WaveDef } from './arena.ts';
import { Sound } from './audio.ts';
import { Balls, Giant, PLAYER_G, type Ball } from './balls.ts';
import { Boss } from './boss.ts';
import { Enemy, POINTS } from './enemies.ts';
import { Chunks, DebrisSet, Particles, Splats } from './fx.ts';
import { Hud } from './hud.ts';
import { ITEM_COLOR, Pickups, type ItemKind } from './pickups.ts';
import { EYE, Hand, MAX_HEARTS, Player } from './player.ts';
import { createSky, FOG_HEX, MOON_DIR, SUNSET_DIR, type Sky } from './sky.ts';
import { createSnowfall, type Snowfall } from './snowfall.ts';
import { disposeSnowmen, type Kind } from './snowman.ts';
import { blobTexture, glowTexture, splatTexture } from './textures.ts';
import { clamp, damp, pick, rand } from './util.ts';
import { createWorld, heightAt, PLAYER_ZONE, type World } from './world.ts';

type Phase = 'ready' | 'intro' | 'fight' | 'clear' | 'boss' | 'victory' | 'lost' | 'tally' | 'done';

const MAX_AMMO = 6;
const THROW_SPEED = 34;
const RAPID_TIME = 9;
const DEG = Math.PI / 180;

interface Rocket {
  p: THREE.Vector3;
  v: THREE.Vector3;
  c: number;
}

export class SnowGame implements GameInstance, Arena {
  // ---- the Arena the snowmen see ----
  world: World;
  scene = new THREE.Scene();
  sound: Sound;
  puffs: Particles;
  sparks: Particles;
  chunks: Chunks;
  splats: Splats;
  debris: DebrisSet;
  glowTex: THREE.Texture;
  shadows: boolean;
  low: boolean;
  diff: Difficulty = WAVES[0]!.diff;
  time = 0;
  playerPos: THREE.Vector3;
  playerVel: THREE.Vector3;

  // ---- rendering ----
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1200);
  private sky: Sky;
  private snow: Snowfall;
  private hand: Hand;
  private hud: Hud;
  private textures: THREE.Texture[] = [];
  private ro: ResizeObserver;
  private loop: Loop;
  private w = 1;
  private h = 1;
  private pxScale = 400;
  private dprTarget: number;
  private dpr: number;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private dprCheck = 0;

  // ---- the game ----
  private player = new Player();
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private balls: Balls;
  private giants: Giant[] = [];
  private pickups: Pickups;
  private phase: Phase = 'ready';
  private phaseT = 0;
  private waveIdx = 0;
  private wave: WaveDef = WAVES[0]!;
  private queue: Kind[] = [];
  private spawnCD = 0;
  private waveTime = 0;
  private drops: { at: number; kind: ItemKind }[] = [];
  private lastCocoa = -99;
  private hurtThisWave = false;
  private throwers = 0;
  private lastThrowStart = -99;
  private bossTime = 0;
  private rockets: Rocket[] = [];
  private rocketT = 0;
  private tallyLines = 0;
  private finalScore = 0;
  private detail = '';
  private won = false;

  // ---- score ----
  private score = 0;
  private throws = 0;
  private hits = 0;
  private streak = 0;
  private bestStreak = 0;

  // ---- player state ----
  private ammo = MAX_AMMO;
  private sinceThrow = 9;
  private cooldown = 0;
  private throwBuffer = 0;
  private rapidT = 0;
  private giantHeld = false;
  private rollStop: (() => void) | null = null;

  // ---- input ----
  private lookDX = 0;
  private lookDY = 0;
  private lastLookDX = 0;
  private lastLookDY = 0;
  private mouseDown = false;
  private mouseClicked = false;
  private locked = false;
  private lockFailed = false;
  private expectUnlock = false;
  private usedMouse = false;
  private usedPad = false;
  private lookId = -1;
  private lookLast = { x: 0, y: 0 };
  private dragStart = { x: 0, y: 0, moved: 0 };
  private rtWas = false;
  private arrowHold = 0;
  private debugMove: { x: number; y: number; jump: boolean } | null = null;
  private hurtLog: string[] = [];
  private missLog: Record<string, number> = {};

  // ---- feel ----
  private trauma = 0;
  private hitStop = 0;
  private timeScale = 1;
  private slowT = 0;
  private realT = 0;
  private dmgDir = 0;
  private dmgT = 9;
  private blockHints = 0;
  private paused = false;
  private ended = false;
  private destroyed = false;

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private sph: { c: THREE.Vector3; r: number }[] = [];

  constructor(private ctx: GameContext) {
    this.low = ctx.quality === 'low';
    this.shadows = !this.low;
    this.playerPos = this.player.pos;
    this.playerVel = this.player.vel;
    this.player.pos.y = heightAt(this.player.pos.x, this.player.pos.z);

    // renderer
    this.dprTarget = this.low ? Math.min(ctx.dpr, 1.5) : ctx.dpr;
    this.dpr = this.dprTarget;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const cv = this.renderer.domElement;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' });
    ctx.root.append(cv);

    // the world
    this.scene.fog = new THREE.Fog(FOG_HEX, 35, 260);
    this.glowTex = glowTexture();
    const blob = blobTexture();
    const splat = splatTexture();
    this.textures.push(this.glowTex, blob, splat);
    this.sky = createSky(this.low);
    this.scene.add(this.sky.group);
    this.world = createWorld(this.low, this.shadows);
    this.scene.add(this.world.group);
    this.snow = createSnowfall(this.low ? 900 : 2600);
    this.scene.add(this.snow.points);
    this.addLights();

    // effects and things
    this.chunks = new Chunks(this.low ? 160 : 300, this.shadows);
    this.puffs = new Particles(this.low ? 260 : 520, false, this.glowTex);
    this.sparks = new Particles(this.low ? 200 : 400, true, this.glowTex);
    this.splats = new Splats(40, splat);
    this.debris = new DebrisSet(this.scene);
    this.scene.add(this.chunks.mesh, this.puffs.points, this.sparks.points, this.splats.mesh);
    this.balls = new Balls(this.scene, blob, this.low);
    this.pickups = new Pickups(this.scene, this.sparks, this.puffs);
    this.sound = new Sound(ctx.audio, ctx.out);
    this.debris.onLand = (p) => this.sound.splat(this.pan(p), true);

    // the player's mitten and the HUD
    const warmDir = new THREE.Vector3(SUNSET_DIR.x, 0.42, SUNSET_DIR.z).normalize();
    this.hand = new Hand(ctx.player.color, new THREE.Vector3(MOON_DIR.x, 0.55, MOON_DIR.z).normalize(), warmDir);
    this.hud = new Hud(ctx.root);
    this.hud.setHearts(this.player.hearts, MAX_HEARTS);
    this.hud.setAmmo(MAX_AMMO, MAX_AMMO, 'normal');
    this.hud.setWave('Våg 1 av 6');
    this.hud.setScore(0, false);

    // input
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('contextmenu', this.onContext);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(ctx.root);
    this.fit();

    if (ctx.touch) {
      this.startGame();
    } else {
      this.hud.prompt('Klicka för att börja!', 'Musen siktar · klick kastar · mellanslag hoppar');
      // the Spela click may still let us grab the mouse
      this.requestLock();
    }
    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    if (typeof location !== 'undefined' && location.search.includes('snowdebug')) this.debugHook();
  }

  /** Test hook for the lab (only with ?snowdebug): read the state, aim, fast-forward. */
  private debugHook(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__snow = {
      state: () => ({
        phase: this.phase,
        wave: this.waveIdx,
        score: this.score,
        hearts: this.player.hearts,
        throws: this.throws,
        hits: this.hits,
        streak: this.streak,
        enemies: this.enemies.map((e) => ({ kind: e.kind, state: e.state, x: e.pos.x, z: e.pos.z })),
        boss: this.boss ? { hp: this.boss.hp, state: this.boss.state, exposed: this.boss.exposed, rings: this.boss.rings.map((r) => Math.round((Math.hypot(this.player.pos.x - r.cx, this.player.pos.z - r.cz) - r.r) * 10) / 10) } : null,
        puffs: this.puffs.count,
        puffDump: this.puffs.dump(),
        hurt: this.hurtLog,
        misses: this.missLog,
        ended: this.ended,
        final: this.finalScore,
        detail: this.detail,
        time: this.time,
      }),
      /** Turn towards the nearest snowman (or the King's heart when it is open); returns false if none. */
      aim: (jitter = 0, visibleOnly = false) => {
        const eye = this.eye(new THREE.Vector3());
        let best: THREE.Vector3 | null = null;
        let bd = 1e9;
        for (const e of this.enemies) {
          if (!e.targetable) continue;
          const c = e.center(new THREE.Vector3());
          if (visibleOnly) {
            const d = c.distanceTo(eye);
            if (this.world.raycast(eye, c.clone().sub(eye).divideScalar(d), d) < d - 0.8) continue;
          }
          const d = c.distanceTo(eye) + (e.state === 'windup' ? -15 : 0);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (this.boss && this.boss.fighting && (this.boss.exposed || !best)) best = this.boss.heartPos(new THREE.Vector3());
        if (!best) return false;
        this.player.yaw = Math.atan2(-(best.x - eye.x), -(best.z - eye.z)) + (Math.random() - 0.5) * jitter;
        this.player.pitch = Math.atan2(best.y - eye.y, Math.hypot(best.x - eye.x, best.z - eye.z)) + (Math.random() - 0.5) * jitter;
        return true;
      },
      look: (yaw: number, pitch: number) => {
        this.player.yaw = yaw;
        this.player.pitch = pitch;
      },
      throw: () => {
        this.mouseClicked = true;
      },
      move: (x: number, y: number, jump = false) => {
        this.debugMove = { x, y, jump };
      },
      /** Run the game clock ahead without drawing (n steps of 1/60 s). */
      skip: (n: number) => {
        for (let i = 0; i < n; i++) this.update(1 / 60);
      },
      start: () => this.startGame(),
      toggle: (name: string) => this.scene.traverse((o) => {
        if (o.name === name) o.visible = !o.visible;
      }),
      spawn: (kind: Kind, x: number, z: number) => this.spawnEnemy(kind, new THREE.Vector2(x, z)),
      wave: (i: number) => {
        for (const e of this.enemies) e.dispose();
        this.enemies = [];
        this.startWave(i);
      },
      drop: (kind: ItemKind, x: number, z: number) => this.pickups.drop(kind, x, z),
      hurt: () => this.hurtPlayer(new THREE.Vector3(5, 1, -10)),
      give: (what: 'giant' | 'rapid') => {
        if (what === 'giant') this.giantHeld = true;
        else this.rapidT = RAPID_TIME;
      },
      clearFoes: () => {
        for (const e of this.enemies) e.dispose();
        this.enemies = [];
        this.queue = [];
      },
      freeze: () => this.loop.pause(),
      unfreeze: () => this.loop.resume(),
      renderOnce: () => this.render(),
      info: () => ({ ...this.renderer.info.render, programs: this.renderer.info.programs?.length, dpr: this.dpr }),
    };
  }

  // ================================================================ lifecycle

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.loop.pause();
    this.sound.setPaused(true);
    this.hud.setPaused(true);
    this.mouseDown = false;
    this.lookId = -1;
    if (this.locked) {
      this.expectUnlock = true;
      document.exitPointerLock?.();
    }
  }

  resume(): void {
    if (!this.paused || this.destroyed) return;
    this.paused = false;
    this.sound.setPaused(false);
    this.hud.setPaused(false);
    this.loop.resume();
    // called from the click on "Fortsätt": grab the mouse again
    if (!this.ctx.touch && this.usedMouse && !this.ended) this.requestLock();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loop.stop();
    this.ro.disconnect();
    this.rollStop?.();
    const cv = this.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('contextmenu', this.onContext);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    if (document.pointerLockElement === cv) document.exitPointerLock?.();
    this.sound.dispose();
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.boss?.dispose();
    this.boss = null;
    for (const g of this.giants) g.dispose();
    this.pickups.dispose();
    this.debris.clear();
    this.hand.dispose();
    this.puffs.dispose();
    this.sparks.dispose();
    disposeSnowmen();
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
    });
    for (const g of geos) g.dispose();
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if (x && x.value instanceof THREE.Texture) x.value.dispose();
      m.dispose();
    }
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    cv.remove();
    this.hud.dispose();
  }

  // ================================================================ setup

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9fb0ff, 0xe9c6e4, 0.95));
    const moon = new THREE.DirectionalLight(0xdfe6ff, 1.15);
    const ld = new THREE.Vector3(MOON_DIR.x, 0.55, MOON_DIR.z).normalize();
    moon.position.copy(ld).multiplyScalar(80).add(new THREE.Vector3(0, 0, -4));
    moon.target.position.set(0, 0, -4);
    if (this.shadows) {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 2048);
      const sc = moon.shadow.camera;
      sc.left = -38;
      sc.right = 38;
      sc.top = 38;
      sc.bottom = -38;
      sc.near = 10;
      sc.far = 180;
      moon.shadow.bias = -0.0004;
      moon.shadow.normalBias = 0.04;
    }
    this.scene.add(moon, moon.target);
    const warm = new THREE.DirectionalLight(0xffb39a, 0.85);
    warm.position.copy(new THREE.Vector3(SUNSET_DIR.x, 0.42, SUNSET_DIR.z).normalize().multiplyScalar(50));
    this.scene.add(warm);
  }

  private fit(): void {
    const r = this.ctx.root.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    const aspect = this.w / this.h;
    // keep a wide enough view on tall screens
    const hfov = 2 * Math.atan(Math.tan((60 * DEG) / 2) * aspect);
    let fov = 60;
    if (hfov < 78 * DEG) fov = Math.min(92, (2 * Math.atan(Math.tan((78 * DEG) / 2) / aspect)) / DEG);
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.hand.resize(aspect, fov);
    this.hud.resize(this.w, this.h);
    this.updatePxScale();
  }

  private updatePxScale(): void {
    const hpx = this.h * this.renderer.getPixelRatio();
    this.pxScale = hpx / (2 * Math.tan((this.camera.fov * DEG) / 2));
  }

  // ================================================================ input

  private requestLock(): void {
    const cv = this.renderer.domElement;
    if (this.ctx.touch || this.lockFailed || !cv.requestPointerLock) return;
    try {
      const p = cv.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch {
      /* not allowed right now */
    }
  }

  private inCorner(x: number, y: number): boolean {
    const r = this.renderer.domElement.getBoundingClientRect();
    const lx = x - r.left;
    const ly = y - r.top;
    return ly > r.height - 250 && (lx < 260 || lx > r.width - 270);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.paused || this.ended) return;
    if (e.pointerType === 'mouse' && !this.ctx.touch) {
      this.usedMouse = true;
      if (!this.locked && !this.lockFailed) {
        this.requestLock();
        return;
      }
      if (this.lockFailed) {
        // no mouse lock here: drag to look, click to throw
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
        this.dragStart = { x: e.clientX, y: e.clientY, moved: 0 };
        this.renderer.domElement.setPointerCapture(e.pointerId);
        if (this.phase === 'ready') this.startGame();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      return;
    }
    // touch / pen: drag to look (not from the control corners)
    if (this.lookId !== -1 || this.inCorner(e.clientX, e.clientY)) return;
    this.lookId = e.pointerId;
    this.lookLast = { x: e.clientX, y: e.clientY };
    this.renderer.domElement.setPointerCapture(e.pointerId);
    if (this.phase === 'ready') this.startGame();
  };

  private onMove = (e: PointerEvent): void => {
    if (this.paused) return;
    if (this.locked && e.pointerType === 'mouse') {
      this.lookDX += clamp(e.movementX, -250, 250);
      this.lookDY += clamp(e.movementY, -250, 250);
      return;
    }
    if (e.pointerId !== this.lookId) return;
    const dx = e.clientX - this.lookLast.x;
    const dy = e.clientY - this.lookLast.y;
    this.lookLast = { x: e.clientX, y: e.clientY };
    this.dragStart.moved += Math.abs(dx) + Math.abs(dy);
    this.lookDX += dx;
    this.lookDY += dy;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !this.lockFailed) {
      if (e.button === 0) this.mouseDown = false;
      return;
    }
    if (e.pointerId !== this.lookId) return;
    this.lookId = -1;
    if (e.pointerType === 'mouse' && this.lockFailed && this.dragStart.moved < 8) this.mouseClicked = true;
  };

  private onContext = (e: Event): void => e.preventDefault();

  private onLockChange = (): void => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (this.locked) {
      this.usedMouse = true;
      this.hud.prompt(null);
      if (this.phase === 'ready') this.startGame();
      return;
    }
    if (was && !this.expectUnlock && !this.paused && !this.ended && !this.destroyed) this.ctx.requestPause();
    this.expectUnlock = false;
    this.mouseDown = false;
  };

  private onLockError = (): void => {
    // a click that could not lock the mouse (embedded page, old browser): fall back to dragging
    if (this.usedMouse) {
      this.lockFailed = true;
      this.hud.prompt(null);
      if (this.phase === 'ready') this.startGame();
    }
  };

  // ================================================================ the Arena

  pan(p: THREE.Vector3): number {
    const c = this.camera;
    this.tmp2.copy(p).applyMatrix4(c.matrixWorldInverse);
    return clamp(this.tmp2.x / Math.max(4, Math.hypot(this.tmp2.x, this.tmp2.z)), -0.9, 0.9);
  }

  requestThrow(): boolean {
    if (this.phase !== 'fight' && this.phase !== 'boss') return false;
    if (this.throwers >= this.diff.maxThrowers) return false;
    if (this.time - this.lastThrowStart < this.diff.minGap) return false;
    this.throwers++;
    this.lastThrowStart = this.time;
    return true;
  }

  releaseThrow(): void {
    this.throwers = Math.max(0, this.throwers - 1);
  }

  enemyThrow(from: THREE.Vector3, to: THREE.Vector3, flight: number, big: boolean): void {
    this.balls.throwEnemy(from, to, flight, big);
  }

  spawnEnemy(kind: Kind, at?: THREE.Vector2): void {
    this.enemies.push(new Enemy(this, kind, at));
  }

  shake(a: number): void {
    this.trauma = Math.min(1, this.trauma + a);
  }

  // ================================================================ flow

  private startGame(): void {
    if (this.phase !== 'ready') return;
    this.hud.prompt(null);
    this.startWave(0);
  }

  private startWave(i: number): void {
    this.waveIdx = i;
    this.wave = WAVES[i]!;
    this.diff = this.wave.diff;
    this.queue = [...this.wave.foes];
    this.spawnCD = 0.6;
    this.waveTime = 0;
    this.hurtThisWave = false;
    this.phase = 'intro';
    this.phaseT = 0;
    const boss = i === WAVES.length - 1;
    this.hud.banner(this.wave.title, this.wave.sub, boss ? 3.2 : 2.6, boss ? 'boss' : '');
    this.hud.setWave(boss ? 'Våg 6 av 6 · Snökungen' : `Våg ${i + 1} av ${WAVES.length}`);
    this.sound.waveStart();
    this.sound.setMusic('calm');
    // treats spread over the wave
    this.drops = this.wave.items.map((kind, k) => ({ kind, at: 7 + k * (boss ? 11 : 8.5) + rand(0, 3) }));
    if (i === 0 && this.ctx.touch) this.hud.hint('Dra för att sikta · ❄️ kastar', 4);
  }

  private beginFight(): void {
    const boss = this.waveIdx === WAVES.length - 1;
    this.phaseT = 0;
    if (boss) {
      this.phase = 'boss';
      this.boss = new Boss(this);
      this.bossTime = 0;
      this.hud.bossBar(true, 1);
      this.sound.setMusic('boss');
    } else {
      this.phase = 'fight';
      this.sound.setMusic('fight');
    }
  }

  private waveCleared(): void {
    this.phase = 'clear';
    this.phaseT = 0;
    const bonus = 200 + 50 * (this.waveIdx + 1);
    const flawless = !this.hurtThisWave;
    this.addScore(bonus + (flawless ? 200 : 0));
    this.hud.banner('Våg klar!', flawless ? `+${bonus} · Oskadd! +200` : `+${bonus} poäng`, 2.8, 'gold');
    this.sound.waveClear();
    this.sound.setMusic('calm');
    this.ammo = MAX_AMMO;
  }

  private victory(): void {
    this.won = true;
    this.phase = 'victory';
    this.phaseT = 0;
    this.hud.bossBar(false);
    const bonus = 1500 + Math.max(0, Math.round((100 - this.bossTime) * 12));
    this.addScore(bonus);
    this.hud.banner('Du vann!', 'Snökungen gick upp i rök – snörök!', 4.2, 'gold');
    this.sound.setMusic('off');
    this.sound.victory();
    this.rocketT = 0.2;
    // every snowman left just melts away with a poof
    for (const e of this.enemies) e.poof();
    this.enemies = [];
  }

  private lose(): void {
    this.phase = 'lost';
    this.phaseT = 0;
    this.hud.bossBar(false);
    this.hud.banner('Insnöad!', 'Bra kämpat!', 3, '');
    for (let i = 0; i < 3; i++) this.hud.splat();
    this.sound.setMusic('off');
    this.sound.lose();
  }

  private finishTally(): void {
    const acc = this.throws > 0 ? this.hits / this.throws : 0;
    const pct = Math.round(acc * 100);
    const wavesDone = this.won ? WAVES.length : this.waveIdx;
    const accBonus = Math.round(acc * 250 * wavesDone);
    const heartBonus = this.won ? this.player.hearts * 200 : 0;
    this.finalScore = Math.min(99999, Math.max(0, Math.round(this.score + accBonus + heartBonus)));
    this.detail = this.won ? `Snökungen besegrad · ${pct} % träffar` : `Våg ${this.waveIdx + 1} av ${WAVES.length} · ${pct} % träffar`;
    const lines: [string, string][] = [
      ['Poäng', this.score.toLocaleString('sv-SE')],
      [`Träffar ${pct} %`, `+${accBonus.toLocaleString('sv-SE')}`],
    ];
    if (this.won) lines.push([`Hjärtan kvar × ${this.player.hearts}`, `+${heartBonus.toLocaleString('sv-SE')}`]);
    this.hud.tally(this.won ? '🏆 Snökungen besegrad!' : '❄️ Bra kämpat!', lines, this.finalScore.toLocaleString('sv-SE'));
    this.tallyLines = 0;
    this.phase = 'tally';
    this.phaseT = 0;
    if (this.locked) {
      this.expectUnlock = true;
      document.exitPointerLock?.();
    }
  }

  // ================================================================ update

  private update(dt: number): void {
    const inp = this.ctx.input;
    this.realT += dt;
    // slow motion and hit pauses
    if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = damp(this.timeScale, 0.28, 12, dt);
    } else this.timeScale = damp(this.timeScale, 1, 6, dt);
    let sdt = dt * this.timeScale;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      sdt = 0;
    }
    this.time += sdt;

    if (this.phase === 'ready') {
      // keyboard or gamepad players can just start
      const pad = Math.hypot(inp.stick(1).x, inp.stick(1).y) > 0.3 || inp.triggers().right > 0.5;
      if (inp.anyPressed() || pad) {
        if (pad || inp.pressed('a')) this.usedPad = true;
        this.startGame();
      }
    }

    this.controls(dt, sdt);
    this.flow(sdt, dt);
    if (sdt > 0) {
      for (const e of this.enemies) e.update(sdt);
      for (const e of this.enemies) if (e.dead) e.dispose();
      this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.boss) this.updateBoss(sdt);
      this.updateBalls(sdt);
      this.updateGiants(sdt);
      this.updatePickups(sdt);
      this.updateRockets(sdt);
    }
    this.chunks.update(sdt);
    this.puffs.update(sdt, this.pxScale);
    this.sparks.update(sdt, this.pxScale);
    this.splats.update(sdt);
    this.debris.update(sdt);
    this.updateHud(dt);
    this.sound.updateMusic();
    inp.frame();
  }

  /** Look, move, jump and throw. */
  private controls(dt: number, sdt: number): void {
    const inp = this.ctx.input;
    const p = this.player;
    const active = this.phase !== 'ready' && this.phase !== 'tally' && this.phase !== 'done';

    // ---- looking ----
    let dYaw = 0;
    let dPitch = 0;
    const touchLook = this.ctx.touch || this.lockFailed;
    const sens = this.locked ? 0.0022 : touchLook ? (Math.PI * 1.05) / Math.max(400, this.w) : 0;
    dYaw -= this.lookDX * sens;
    dPitch -= this.lookDY * sens;
    this.lastLookDX = this.lookDX;
    this.lastLookDY = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    const rs = inp.stick(1);
    const rlen = Math.hypot(rs.x, rs.y);
    if (rlen > 0.05) {
      this.usedPad = true;
      const curve = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
      dYaw -= curve(rs.x) * 3.1 * dt;
      dPitch -= curve(rs.y) * 2.1 * dt;
    }
    const ax = (inp.key('ArrowRight') ? 1 : 0) - (inp.key('ArrowLeft') ? 1 : 0);
    const ay = (inp.key('ArrowDown') ? 1 : 0) - (inp.key('ArrowUp') ? 1 : 0);
    if (ax || ay) {
      this.arrowHold = Math.min(1, this.arrowHold + dt * 3);
      dYaw -= ax * 2.3 * dt * (0.35 + 0.65 * this.arrowHold);
      dPitch -= ay * 1.5 * dt * (0.35 + 0.65 * this.arrowHold);
    } else this.arrowHold = 0;

    // gentle aim assist for thumbs and sticks: slow down over a target, and drift onto it
    const assist = this.ctx.touch || this.usedPad || this.lockFailed;
    if (assist && active) {
      const eye = this.eye(this.tmp);
      const t = this.assistTarget(eye, p.forward(this.tmp2), 8 * DEG);
      if (t) {
        if (t.ang < 4.5 * DEG) {
          dYaw *= 0.6;
          dPitch *= 0.6;
        }
        const inputting = Math.abs(dYaw) + Math.abs(dPitch) > 0.0005 || Math.hypot(p.vel.x, p.vel.z) > 1;
        if (inputting) {
          const tyaw = Math.atan2(-(t.pos.x - eye.x), -(t.pos.z - eye.z));
          const tpitch = Math.atan2(t.pos.y - eye.y, Math.hypot(t.pos.x - eye.x, t.pos.z - eye.z));
          let dy = tyaw - p.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          const pull = 2.2 * dt;
          dYaw += clamp(dy, -pull, pull) * 0.55;
          dPitch += clamp(tpitch - p.pitch, -pull, pull) * 0.45;
        }
      }
    }
    if (this.phase === 'ready') {
      // a slow look round the village while waiting
      p.yaw = Math.sin(this.realT * 0.25) * 0.12;
      p.pitch = 0.04 + Math.sin(this.realT * 0.17) * 0.02;
    } else if (this.phase !== 'done') {
      p.yaw += dYaw;
      p.pitch = clamp(p.pitch + dPitch, -1.15, 1.2);
    }

    // ---- moving ----
    let mx = 0;
    let my = 0;
    const arrows = inp.key('ArrowLeft') || inp.key('ArrowRight') || inp.key('ArrowUp') || inp.key('ArrowDown');
    if (arrows) {
      mx = (inp.key('KeyD') ? 1 : 0) - (inp.key('KeyA') ? 1 : 0);
      my = (inp.key('KeyS') ? 1 : 0) - (inp.key('KeyW') ? 1 : 0);
    } else {
      const s = inp.stick(0);
      mx = s.x;
      my = s.y;
    }
    if (this.debugMove) {
      mx = this.debugMove.x;
      my = this.debugMove.y;
    }
    if (!active || this.phase === 'lost') {
      mx = 0;
      my = 0;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const speed = 6.3;
    const sy = Math.sin(p.yaw);
    const cy = Math.cos(p.yaw);
    const tx = (cy * mx - sy * -my) * speed;
    const tz = (-sy * mx - cy * -my) * speed;
    const acc = p.grounded ? 13 : 4;
    p.vel.x = damp(p.vel.x, tx, acc, sdt);
    p.vel.z = damp(p.vel.z, tz, acc, sdt);
    const jump = inp.keyPressed('Space') || inp.pressed('b') || !!this.debugMove?.jump;
    if (jump && p.grounded && active && this.phase !== 'lost' && sdt > 0) {
      p.vel.y = 6.4;
      p.grounded = false;
      this.sound.jump();
    }
    p.vel.y -= 19 * sdt;
    p.pos.addScaledVector(p.vel, sdt);
    p.pos.x = clamp(p.pos.x, PLAYER_ZONE.x0, PLAYER_ZONE.x1);
    p.pos.z = clamp(p.pos.z, PLAYER_ZONE.z0, PLAYER_ZONE.z1);
    this.world.push(p.pos, 0.42, p.pos.y);
    const g = heightAt(p.pos.x, p.pos.z);
    if (p.pos.y <= g) {
      if (!p.grounded) {
        const hard = p.vel.y < -7;
        p.dip = Math.min(0.2, -p.vel.y * 0.022);
        this.sound.land(hard);
        if (hard) this.puffs.emit(this.tmp.set(p.pos.x, g + 0.1, p.pos.z), { n: 6, size: [0.3, 0.6], grow: 1.8, speed: 2.5, up: 0, life: [0.3, 0.5] });
      }
      p.pos.y = g;
      p.vel.y = 0;
      p.grounded = true;
    } else if (p.grounded && p.vel.y <= 0 && p.pos.y - g < 0.35) {
      p.pos.y = g;
      p.vel.y = 0;
    } else p.grounded = false;
    p.dip = damp(p.dip, 0, 9, sdt);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (p.grounded && hs > 0.6) {
      p.bobPhase += sdt * (4.2 + hs * 0.9);
      p.stepAcc += hs * sdt;
      if (p.stepAcc > 1.7) {
        p.stepAcc = 0;
        this.sound.step();
      }
    }
    p.bob = Math.abs(Math.sin(p.bobPhase)) * 0.045 * clamp(hs / 6, 0, 1);
    p.invuln = Math.max(0, p.invuln - sdt);
    p.kickPitch = damp(p.kickPitch, 0, 10, dt);
    p.kickRoll = damp(p.kickRoll, 0, 6, dt);

    // ---- throwing ----
    const spaceNow = inp.keyPressed('Space');
    const rt = inp.triggers().right > 0.5;
    if (rt) this.usedPad = true;
    const pressed = this.mouseClicked || (inp.pressed('a') && !spaceNow) || (rt && !this.rtWas);
    const held = this.mouseDown || (inp.down('a') && !inp.key('Space')) || rt;
    this.rtWas = rt;
    this.mouseClicked = false;
    this.throwBuffer = Math.max(0, this.throwBuffer - dt);
    if (pressed) this.throwBuffer = 0.26;
    this.cooldown -= sdt;
    this.sinceThrow += sdt;
    this.rapidT = Math.max(0, this.rapidT - sdt);
    const canThrow = active && this.phase !== 'lost' && this.phase !== 'victory' && sdt > 0;
    if (canThrow && (this.throwBuffer > 0 || held) && this.cooldown <= 0) {
      if (this.giantHeld) {
        this.rollGiant();
      } else if (this.ammo >= 1 || this.rapidT > 0) {
        this.throwBall();
      } else if (this.throwBuffer > 0 && pressed) {
        this.sound.empty();
        this.throwBuffer = 0;
      }
    }
    // the handful refills while you are not throwing
    if (this.sinceThrow > 0.32 && this.ammo < MAX_AMMO) {
      const before = Math.floor(this.ammo);
      this.ammo = Math.min(MAX_AMMO, this.ammo + sdt / 0.4);
      if (Math.floor(this.ammo) > before) this.sound.reload();
    }
  }

  private eye(out: THREE.Vector3): THREE.Vector3 {
    const p = this.player;
    return out.set(p.pos.x, p.pos.y + EYE + p.bob - p.dip, p.pos.z);
  }

  /** The best target near the crosshair (for aim assist). */
  private assistTarget(eye: THREE.Vector3, dir: THREE.Vector3, maxAng: number): { pos: THREE.Vector3; ang: number; enemy?: Enemy; boss?: boolean } | null {
    let best: { pos: THREE.Vector3; ang: number; enemy?: Enemy; boss?: boolean } | null = null;
    const c = new THREE.Vector3();
    const consider = (pos: THREE.Vector3, enemy?: Enemy, boss?: boolean): void => {
      c.subVectors(pos, eye);
      const d = c.length();
      if (d < 1 || d > 70) return;
      const ang = Math.acos(clamp(c.dot(dir) / d, -1, 1));
      // closer targets get a little more pull
      const score = ang * (0.8 + d / 120);
      if (ang > maxAng || (best && score >= best.ang * (0.8 + best.pos.distanceTo(eye) / 120))) return;
      if (this.world.raycast(eye, c.clone().divideScalar(d), d) < d - 1.2) return;
      best = { pos: pos.clone(), ang, enemy, boss };
    };
    for (const e of this.enemies) if (e.targetable) consider(e.center(new THREE.Vector3()), e);
    if (this.boss && this.boss.fighting && this.boss.exposed) consider(this.boss.heartPos(new THREE.Vector3()), undefined, true);
    return best;
  }

  private throwBall(): void {
    const p = this.player;
    const eye = this.eye(new THREE.Vector3());
    const dir = p.forward(new THREE.Vector3());
    const start = this.hand.launchOffset(new THREE.Vector3()).applyQuaternion(this.camera.quaternion).add(eye);
    // what is under the crosshair?
    let maxD = this.world.raycast(eye, dir, 75);
    let target: Enemy | null = null;
    let bossTarget = false;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const n = e.spheres(this.sph);
      for (let i = 0; i < n; i++) {
        const t = raySphere(eye, dir, this.sph[i]!.c, this.sph[i]!.r);
        if (t !== null && t < maxD) {
          maxD = t;
          target = e;
        }
      }
    }
    if (this.boss && this.boss.fighting) {
      const hp = this.boss.heartPos(new THREE.Vector3());
      const t = raySphere(eye, dir, hp, 1.05);
      if (t !== null && t < maxD) {
        maxD = t;
        target = null;
        bossTarget = true;
      } else {
        const n = this.boss.spheres(this.sph);
        for (let i = 0; i < n; i++) {
          const tb = raySphere(eye, dir, this.sph[i]!.c, this.sph[i]!.r);
          if (tb !== null && tb < maxD) {
            maxD = tb;
            target = null;
          }
        }
      }
    }
    let point = eye.clone().addScaledVector(dir, maxD);
    // a little help: snap onto a snowman just off the crosshair
    if (!target && !bossTarget) {
      const assistAng = (this.ctx.touch || this.usedPad || this.lockFailed ? 5.5 : 2.4) * DEG;
      const a = this.assistTarget(eye, dir, assistAng);
      if (a) {
        target = a.enemy ?? null;
        bossTarget = !!a.boss;
        point = a.pos;
      }
    } else if (target) {
      // aim at the body of the snowman hit, so a hat-brush still counts
      point = target.center(new THREE.Vector3()).lerp(point, 0.5);
    }
    // lead a moving snowman
    if (target) {
      const tt = Math.hypot(point.x - start.x, point.z - start.z) / THROW_SPEED;
      point.addScaledVector(target.vel, tt);
    }
    const dx = point.x - start.x;
    const dz = point.z - start.z;
    const T = Math.max(0.07, Math.hypot(dx, dz) / THROW_SPEED);
    const v = new THREE.Vector3().subVectors(point, start).divideScalar(T);
    v.y += 0.5 * PLAYER_G * T;
    const tgt = target;
    const homing = tgt ? () => (tgt.dead ? null : tgt.center(new THREE.Vector3())) : bossTarget && this.boss ? () => (this.boss && this.boss.alive ? this.boss.heartPos(new THREE.Vector3()) : null) : null;
    this.balls.throwPlayer(start, v, homing, this.rapidT > 0);
    this.throws++;
    if (this.rapidT <= 0) this.ammo -= 1;
    this.sinceThrow = 0;
    this.cooldown = this.rapidT > 0 ? 0.09 : 0.2;
    this.throwBuffer = 0;
    this.hand.throw();
    this.sound.throwBall();
    p.kickPitch = 0.012;
  }

  private rollGiant(): void {
    const p = this.player;
    this.giantHeld = false;
    const dir = p.forward(new THREE.Vector3()).setY(0).normalize();
    const from = p.pos.clone().addScaledVector(dir, 1.6);
    this.giants.push(new Giant(this.scene, from, dir, this.shadows));
    this.hand.rollGiant();
    this.sound.throwBall(true);
    this.rollStop?.();
    this.rollStop = this.sound.roll();
    this.cooldown = 0.5;
    this.sinceThrow = 0;
    this.shake(0.25);
  }

  // ---------------------------------------------------------------- waves

  private flow(sdt: number, dt: number): void {
    this.phaseT += sdt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > (this.waveIdx === WAVES.length - 1 ? 2.6 : 2.3)) this.beginFight();
        break;
      case 'fight': {
        this.waveTime += sdt;
        this.spawnCD -= sdt;
        const alive = this.enemies.length;
        if (this.queue.length && alive < this.wave.alive && (this.spawnCD <= 0 || alive === 0)) {
          this.spawnEnemy(this.queue.shift()!);
          this.spawnCD = rand(0.9, 1.7);
        }
        this.dropTreats();
        if (!this.queue.length && alive === 0) this.waveCleared();
        break;
      }
      case 'clear':
        if (this.phaseT > 3.3) this.startWave(this.waveIdx + 1);
        break;
      case 'boss':
        this.bossTime += sdt;
        this.waveTime += sdt;
        this.dropTreats();
        break;
      case 'victory':
        if (this.phaseT > 4.6) this.finishTally();
        break;
      case 'lost':
        if (this.phaseT > 3.0) this.finishTally();
        break;
      case 'tally': {
        // reveal the lines one by one on the real clock
        const n = Math.floor(this.phaseT / 0.45) + 1;
        if (n !== this.tallyLines) {
          this.tallyLines = n;
          this.hud.revealTally(n);
          if (n <= 4) this.sound.cookie();
        }
        if (this.phaseT > 3.2 && !this.ended) {
          this.ended = true;
          this.phase = 'done';
          this.ctx.end(this.finalScore, this.detail);
        }
        break;
      }
      default:
        break;
    }
    void dt;
  }

  private dropTreats(): void {
    const t = this.waveTime;
    for (const d of this.drops) {
      if (d.at < 0 || t < d.at) continue;
      d.at = -1;
      let kind = d.kind;
      if (kind === 'cocoa' && this.player.hearts >= MAX_HEARTS) kind = 'cookie';
      if (kind === 'cocoa') this.lastCocoa = this.time;
      this.dropAt(kind);
    }
    // a cup of cocoa when things look grim
    if (this.player.hearts <= 2 && this.time - this.lastCocoa > 22 && t > 5) {
      this.lastCocoa = this.time;
      this.dropAt('cocoa');
    }
  }

  private dropAt(kind: ItemKind): void {
    const p = this.player.pos;
    for (let i = 0; i < 30; i++) {
      const x = rand(PLAYER_ZONE.x0 + 1, PLAYER_ZONE.x1 - 1);
      const z = rand(PLAYER_ZONE.z0 + 1, PLAYER_ZONE.z1 - 1);
      if (Math.hypot(x - p.x, z - p.z) < 3 || Math.hypot(x - p.x, z - p.z) > 11) continue;
      if (this.world.cyls.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) continue;
      this.pickups.drop(kind, x, z);
      return;
    }
    this.pickups.drop(kind, clamp(p.x + 3, PLAYER_ZONE.x0, PLAYER_ZONE.x1), clamp(p.z + 1, PLAYER_ZONE.z0, PLAYER_ZONE.z1));
  }

  // ---------------------------------------------------------------- boss

  private updateBoss(dt: number): void {
    const b = this.boss!;
    b.update(dt);
    const pan = this.pan(b.pos);
    for (const ev of b.events) {
      switch (ev) {
        case 'roar':
          this.sound.bossRoar();
          this.shake(0.4);
          break;
        case 'jump':
          this.hud.hint('Hoppa över snövågen! ⤒', 3);
          break;
        case 'land':
          this.sound.stomp();
          break;
        case 'windup':
          this.sound.windup(pan, 1.3, true);
          if (this.blockHints === 0) this.hud.hint('Hjärtat lyser – kasta nu!', 2);
          break;
        case 'throw':
          this.sound.enemyThrow(pan, true);
          break;
        case 'hurt':
          this.sound.bossHurt(pan);
          this.hitStop = Math.max(this.hitStop, 0.07);
          this.shake(0.2);
          break;
        case 'block':
          this.sound.bossBlock(pan);
          if (this.blockHints < 3) {
            this.blockHints++;
            this.hud.hint('Vänta tills hjärtat lyser!', 1.8);
          }
          break;
        case 'dropBall': {
          const head = b.model.head.getWorldPosition(new THREE.Vector3());
          this.chunks.burst(head.setY(head.y + 1), 20, 0.25, 6);
          this.puffs.emit(head, { n: 14, size: [1, 1.8], grow: 2, speed: 5, life: [0.5, 0.9] });
          this.sound.poof(pan, 1.6);
          this.popupAt(head, 'Hoppsan!', 'blue');
          break;
        }
        case 'dead':
          this.slowT = 1.3;
          // every snowball still in the air bursts
          for (const o of this.balls.list) {
            if (!o.enemy || !o.alive) continue;
            o.alive = false;
            this.puffs.emit(o.p, { n: 6, size: [0.3, 0.6], grow: 2, speed: 2, life: [0.3, 0.6] });
          }
          this.sound.bossHurt(pan);
          this.hud.flash(0.5, 400);
          break;
      }
    }
    b.events.length = 0;
    // shockwaves
    for (const r of b.rings) {
      if (r.catches(this.player.pos)) this.hurtPlayer(new THREE.Vector3(r.cx, 1, r.cz));
      if (Math.random() < dt * 40) {
        const a = rand(0, Math.PI * 2);
        const x = r.cx + Math.cos(a) * r.r;
        const z = r.cz + Math.sin(a) * r.r;
        this.puffs.one(this.tmp.set(x, heightAt(x, z) + 0.4, z), this.tmp2.set(Math.cos(a) * 2, 1.5, Math.sin(a) * 2), 0.9, 0.5, 0xffffff, 0.7, 1.8);
      }
    }
    this.hud.bossBar(b.alive || b.state === 'dying', b.hp / 12);
    if (b.state === 'gone' && this.phase === 'boss') {
      b.poof();
      this.sound.poof(pan, 2.2);
      this.shake(0.8);
      this.victory();
    }
  }

  // ---------------------------------------------------------------- snowballs

  private updateBalls(dt: number): void {
    for (const b of this.balls.list) {
      if (!b.alive) continue;
      const sp = b.v.length();
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.22));
      const h = dt / steps;
      for (let s = 0; s < steps && b.alive; s++) {
        this.balls.step(b, h);
        if (b.enemy) this.collideEnemyBall(b);
        else this.collidePlayerBall(b);
      }
      if (b.alive && (b.p.y < -30 || b.age > 7)) {
        b.alive = false;
        if (!b.enemy && !b.scored) this.miss();
      }
      // trails
      if (b.alive) {
        b.trail += dt;
        if (b.trail > (b.enemy ? 0.016 : 0.03)) {
          b.trail = 0;
          if (b.enemy) this.puffs.one(b.p, this.tmp.set(0, 0, 0), b.big ? 0.42 : 0.3, 0.32, 0xffc4dc, 0.55, 0.3);
          else this.puffs.one(b.p, this.tmp.set(0, 0, 0), 0.16, 0.22, 0xffffff, 0.5, 0.3);
        }
      }
    }
    this.balls.sync();
  }

  private collidePlayerBall(b: Ball): void {
    // snowmen
    for (const e of this.enemies) {
      if (e.dead || (e.state === 'rise' && e.t < e.dur * 0.3)) continue;
      const n = e.spheres(this.sph);
      for (let i = 0; i < n; i++) {
        const s = this.sph[i]!;
        if (b.p.distanceToSquared(s.c) < (s.r + b.r) ** 2) {
          b.alive = false;
          this.hitEnemy(e, b);
          return;
        }
      }
    }
    // the Snow King
    const boss = this.boss;
    if (boss && boss.fighting) {
      const hp = boss.heartPos(this.tmp);
      if (b.p.distanceToSquared(hp) < (1.0 + b.r) ** 2) {
        b.alive = false;
        const r = boss.hitHeart();
        if (r === 'block') {
          this.puffs.emit(b.p, { n: 6, size: [0.3, 0.5], grow: 1.8, speed: 2, life: [0.3, 0.5] });
          this.miss();
        } else {
          this.scoreHit(b, 75, hp, r === 'kill');
          this.sparks.emit(hp, { n: 16, size: [0.3, 0.6], grow: 0.4, speed: 7, life: [0.3, 0.6], color: 0x9ff0ff, alpha: 1, drag: 2 });
          this.chunks.burst(hp, 8, 0.12, 5);
        }
        return;
      }
      const n = boss.spheres(this.sph);
      for (let i = 0; i < n; i++) {
        const s = this.sph[i]!;
        if (b.p.distanceToSquared(s.c) < (s.r + b.r) ** 2) {
          b.alive = false;
          this.splats.add(b.p, this.tmp2.subVectors(b.p, s.c).normalize(), 0.5);
          this.puffs.emit(b.p, { n: 5, size: [0.3, 0.5], grow: 1.8, speed: 2, life: [0.3, 0.5] });
          this.sound.splat(this.pan(b.p), true);
          this.miss();
          return;
        }
      }
    }
    // knock an incoming snowball out of the air
    for (const o of this.balls.list) {
      if (!o.alive || !o.enemy) continue;
      if (b.p.distanceToSquared(o.p) < (b.r + o.r + 0.18) ** 2) {
        b.alive = false;
        o.alive = false;
        this.chunks.burst(b.p, 8, 0.07, 4);
        this.puffs.emit(b.p, { n: 8, size: [0.3, 0.6], grow: 2, speed: 3, life: [0.3, 0.6] });
        this.sound.crack(this.pan(b.p));
        this.scoreHit(b, 30, b.p, false);
        this.popupAt(b.p, 'Snyggt!', 'pink');
        return;
      }
    }
    // the world
    const hit = this.world.hitTest(b.p, b.r, false);
    if (hit) {
      b.alive = false;
      this.splatWorld(b, hit.kind, hit.normal, hit.tree ? this.world.treeTop(hit.tree) : null);
      this.missLog[hit.kind] = (this.missLog[hit.kind] ?? 0) + 1;
      this.miss();
    }
  }

  private collideEnemyBall(b: Ball): void {
    const p = this.player.pos;
    // the player: a capsule from the knees to the head (forgiving: smaller than you'd think)
    const r = 0.34 + b.r * 0.55;
    const y0 = p.y + 0.35;
    const y1 = p.y + EYE + 0.05;
    const cy = clamp(b.p.y, y0, y1);
    const dx = b.p.x - p.x;
    const dz = b.p.z - p.z;
    const dy = b.p.y - cy;
    if (dx * dx + dy * dy + dz * dz < r * r) {
      b.alive = false;
      if (this.player.invuln > 0 || this.phase === 'victory' || this.phase === 'tally' || this.phase === 'done' || this.phase === 'lost') {
        this.puffs.emit(b.p, { n: 6, size: [0.3, 0.6], grow: 2, speed: 2.5, life: [0.3, 0.5] });
        this.sound.splat(0, true);
      } else this.hurtPlayer(b.p.clone().sub(b.v));
      return;
    }
    const hit = this.world.hitTest(b.p, b.r, true);
    if (hit) {
      b.alive = false;
      this.splatWorld(b, hit.kind, hit.normal, hit.tree ? this.world.treeTop(hit.tree) : null);
    }
  }

  private splatWorld(b: Ball, kind: string, normal: THREE.Vector3, treeTop: THREE.Vector3 | null): void {
    const pan = this.pan(b.p);
    if (kind === 'ice') {
      this.sound.clink(pan);
      this.chunks.burst(b.p, 5, 0.05, 3, 0xe8f4ff);
    } else if (kind === 'tree') {
      this.sound.treeFlump(pan);
      if (treeTop) {
        this.puffs.emit(treeTop, { n: 10, size: [0.5, 1.0], grow: 2, speed: 1.5, up: -0.5, life: [0.6, 1.1], grav: 2, spread: 1 });
        this.chunks.burst(treeTop, 6, 0.08, 2, 0xf4f7ff, -0.2);
      }
    } else this.sound.splat(pan, kind === 'ground');
    this.splats.add(b.p, normal, b.big ? 0.75 : b.enemy ? 0.62 : 0.5);
    this.puffs.emit(b.p, { n: b.enemy ? 6 : 5, size: [0.25, 0.5], grow: 2, speed: 2.2, up: 0.4, life: [0.3, 0.55] });
    this.chunks.burst(b.p, 4, 0.05, 2.5);
  }

  private hitEnemy(e: Enemy, b: Ball): void {
    const res = e.hit();
    const c = e.center(new THREE.Vector3());
    if (res === 'kill') {
      this.scoreHit(b, POINTS[e.kind], c, true);
      e.poof();
      this.hitStop = Math.max(this.hitStop, 0.05);
      this.shake(0.12);
    } else {
      this.scoreHit(b, 20, c, false);
      this.chunks.burst(b.p, 10, 0.1, 4.5);
      this.puffs.emit(b.p, { n: 8, size: [0.4, 0.8], grow: 2, speed: 3, life: [0.3, 0.6] });
      this.sound.bigHit(this.pan(b.p));
    }
  }

  private mult(): number {
    return Math.min(4, 1 + Math.floor(this.streak / 3) * 0.5);
  }

  private scoreHit(b: Ball, base: number, at: THREE.Vector3, big: boolean): void {
    if (!b.scored) {
      b.scored = true;
      this.hits++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    const m = this.mult();
    const pts = Math.round(base * m);
    this.addScore(pts);
    this.popupAt(at, `+${pts}`, big ? 'big' : '');
    this.hud.hitMarker(big);
    this.hud.setStreak(this.streak, m);
    this.sound.streakNote(Math.min(10, this.streak - 1));
    if (this.streak === 5) this.hud.hint('5 i rad! ❄️', 1.4);
    else if (this.streak === 10) this.hud.hint('Snöstorm! 10 i rad!', 1.8);
    else if (this.streak > 10 && this.streak % 5 === 0) this.hud.hint(`${this.streak} i rad!`, 1.4);
  }

  private miss(): void {
    if (this.streak >= 3) this.hud.setStreak(0, 1);
    this.streak = 0;
  }

  private addScore(n: number): void {
    this.score += Math.round(n);
    this.hud.setScore(this.score);
  }

  private hurtPlayer(from: THREE.Vector3): void {
    const p = this.player;
    if (p.invuln > 0 || this.phase === 'lost' || this.phase === 'victory' || this.phase === 'tally' || this.phase === 'done') return;
    // once the King is bursting, nothing more can hurt you
    if (this.boss && !this.boss.alive) return;
    p.hearts--;
    p.invuln = 1.6;
    this.hurtLog.push(`${Math.round(this.time)}s w${this.waveIdx + 1} ${from.y === 1 ? 'ring' : 'ball'}`);
    this.hurtThisWave = true;
    this.hud.setHearts(p.hearts, MAX_HEARTS);
    this.hud.heartPop(p.hearts);
    this.hud.splat();
    this.hud.flash(0.45, 300);
    this.sound.playerHit();
    this.shake(0.55);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.hand.flinch();
    p.kickPitch = 0.05;
    p.kickRoll = (Math.random() < 0.5 ? -1 : 1) * 0.06;
    // where it came from, for the edge marker
    const eye = this.eye(this.tmp);
    this.dmgDir = Math.atan2(from.x - eye.x, from.z - eye.z);
    this.dmgT = 0;
    this.miss();
    if (p.hearts <= 0) this.lose();
  }

  // ---------------------------------------------------------------- giant snowball, treats, fireworks

  private updateGiants(dt: number): void {
    for (const g of this.giants) {
      g.update(dt);
      if (Math.random() < dt * 30) this.puffs.one(this.tmp.set(g.pos.x, g.pos.y - g.r * 0.8, g.pos.z), this.tmp2.set(rand(-1, 1), 1.2, rand(-1, 1)), 0.6, 0.6, 0xffffff, 0.7, 1.6);
      for (const e of this.enemies) {
        if (e.dead || g.hitIds.has(e.id)) continue;
        const c = e.center(this.tmp);
        if (Math.hypot(c.x - g.pos.x, c.z - g.pos.z) < g.r + 0.7) {
          g.hitIds.add(e.id);
          while (!e.dead) e.hit();
          const fake = { scored: true } as Ball;
          this.scoreHitGiant(fake, POINTS[e.kind] * 2, c);
          e.poof();
          this.shake(0.15);
        }
      }
      const boss = this.boss;
      if (boss && boss.fighting && !g.bossHit && Math.hypot(boss.pos.x - g.pos.x, boss.pos.z - g.pos.z) < g.r + 1.6) {
        g.bossHit = true;
        g.alive = false;
        boss.bowled();
        this.scoreHitGiant({ scored: true } as Ball, 300, boss.pos.clone().setY(boss.pos.y + 2.5));
      }
      // crossing a wall: a spray of snow
      for (const w of this.world.boxes) {
        if (w.kind !== 'wall') continue;
        const dx = g.pos.x - w.cx;
        const dz = g.pos.z - w.cz;
        const lx = dx * w.c - dz * w.s;
        const lz = dx * w.s + dz * w.c;
        if (Math.abs(lx) < w.hx + g.r * 0.5 && Math.abs(lz) < w.hz + g.r * 0.5 && Math.random() < dt * 25) this.chunks.burst(this.tmp.set(g.pos.x, w.y1, g.pos.z), 3, 0.12, 4);
      }
      if (!g.alive) {
        this.chunks.burst(g.pos, this.low ? 18 : 34, 0.22, 7);
        this.puffs.emit(g.pos, { n: 18, size: [0.8, 1.5], grow: 2, speed: 5, life: [0.5, 0.9], spread: 0.8 });
        this.sound.poof(this.pan(g.pos), 1.8);
        g.dispose();
      }
    }
    this.giants = this.giants.filter((g) => g.alive);
    if (!this.giants.length && this.rollStop) {
      this.rollStop();
      this.rollStop = null;
    }
  }

  private scoreHitGiant(b: Ball, base: number, at: THREE.Vector3): void {
    const pts = Math.round(base * this.mult());
    this.addScore(pts);
    this.popupAt(at, `+${pts}`, 'big');
    this.hud.hitMarker(true);
    void b;
  }

  private updatePickups(dt: number): void {
    for (const p of this.pickups.update(dt, this.player.pos)) {
      const at = p.group.position.clone();
      this.sparks.emit(at, { n: 18, size: [0.25, 0.5], grow: 0.3, speed: 4, up: 0.8, life: [0.4, 0.8], color: ITEM_COLOR[p.kind], alpha: 1, drag: 2 });
      switch (p.kind) {
        case 'cookie':
          this.addScore(100);
          this.sound.cookie();
          this.popupAt(at, '+100 🍪', 'big');
          break;
        case 'cocoa':
          if (this.player.hearts < MAX_HEARTS) {
            this.player.hearts++;
            this.hud.setHearts(this.player.hearts, MAX_HEARTS);
            this.hud.heartPop(this.player.hearts - 1);
            this.popupAt(at, '+1 ❤️ Varm choklad!', 'pink');
          } else {
            this.addScore(150);
            this.popupAt(at, '+150 ☕', 'big');
          }
          this.sound.cocoa();
          break;
        case 'giant':
          this.giantHeld = true;
          this.rapidT = 0;
          this.sound.power();
          this.hud.hint('Jättesnöboll! Kasta den!', 2.2);
          break;
        case 'rapid':
          this.rapidT = RAPID_TIME;
          this.giantHeld = false;
          this.sound.power();
          this.hud.hint('Snabbkast!', 1.8);
          break;
      }
    }
    void dt;
  }

  private updateRockets(dt: number): void {
    if (this.phase === 'victory') {
      this.rocketT -= dt;
      if (this.rocketT <= 0) {
        this.rocketT = rand(0.18, 0.4);
        const c = pick([0xff6f9e, 0xffe36a, 0x7fe8ff, 0x9dff8a, 0xc79bff, 0xffffff]);
        this.rockets.push({ p: new THREE.Vector3(rand(-22, 22), 2, rand(-48, -26)), v: new THREE.Vector3(rand(-2, 2), rand(19, 25), rand(-1, 1)), c });
      }
    }
    for (const r of this.rockets) {
      r.v.y -= 9 * dt;
      r.p.addScaledVector(r.v, dt);
      if (Math.random() < 0.7) this.sparks.one(r.p, this.tmp.set(0, -1, 0), 0.35, 0.4, 0xffd9a0, 0.9, 0.3);
      if (r.v.y < 2) {
        this.sparks.emit(r.p, { n: this.low ? 34 : 60, size: [0.7, 1.2], grow: 0.2, speed: 11, up: 0, life: [0.9, 1.6], color: r.c, alpha: 1, drag: 1.4, grav: 2.4 });
        this.sound.firework(this.pan(r.p));
        r.v.set(0, -999, 0);
      }
    }
    this.rockets = this.rockets.filter((r) => r.v.y > -900);
  }

  // ---------------------------------------------------------------- HUD

  private popupAt(p: THREE.Vector3, text: string, cls = ''): void {
    const v = this.tmp2.copy(p).project(this.camera);
    if (v.z > 1 || v.z < -1) return;
    const x = clamp((v.x * 0.5 + 0.5) * this.w, 40, this.w - 40);
    const y = clamp((-v.y * 0.5 + 0.5) * this.h, 60, this.h - 60);
    this.hud.popup(x, y, text, cls);
  }

  private lastAmmoShown = -1;
  private lastMode = '';

  private updateHud(dt: number): void {
    const mode = this.giantHeld ? 'giant' : this.rapidT > 0 ? 'rapid' : 'normal';
    const shown = Math.floor(this.ammo + 1e-6);
    if (shown !== this.lastAmmoShown || mode !== this.lastMode) {
      this.hud.setAmmo(shown, MAX_AMMO, mode);
      this.lastAmmoShown = shown;
      this.lastMode = mode;
    }
    if (mode === 'rapid') this.hud.setPower('⚡ Snabbkast!', this.rapidT / RAPID_TIME);
    else if (mode === 'giant') this.hud.setPower('⚪ Jättesnöboll – kasta!', 1);
    else this.hud.setPower(null);
    const p = this.player;
    this.hud.blinkHearts(p.invuln > 0 && this.phase !== 'lost');
    this.hud.frost(p.hearts <= 1 && this.phase !== 'tally' && this.phase !== 'done' ? 0.75 + Math.sin(this.realT * 4) * 0.15 : p.hearts === 2 ? 0.25 : 0);
    // crosshair: pink when a snowman is right under it
    const playing = this.phase !== 'ready' && this.phase !== 'tally' && this.phase !== 'done';
    let on = false;
    if (playing) {
      const eye = this.eye(this.tmp);
      const dir = p.forward(this.tmp2);
      const wall = this.world.raycast(eye, dir, 70);
      for (const e of this.enemies) {
        if (!e.targetable) continue;
        const n = e.spheres(this.sph);
        for (let i = 0; i < n && !on; i++) {
          const t = raySphere(eye, dir, this.sph[i]!.c, this.sph[i]!.r);
          if (t !== null && t < wall) on = true;
        }
        if (on) break;
      }
      if (!on && this.boss && this.boss.exposed) {
        const t = raySphere(eye, dir, this.boss.heartPos(new THREE.Vector3()), 1.05);
        if (t !== null && t < wall) on = true;
      }
    }
    this.hud.setCross(on, playing);
    // edge arrows: treats out of view, snowmen winding up out of view, and where a hit came from
    const arrows: { angle: number; kind: 'dmg' | 'item' | 'foe' }[] = [];
    if (playing) {
      this.camera.updateMatrixWorld();
      for (const it of this.pickups.list) if (it.landed) this.edgeArrow(it.group.position, 'item', arrows);
      for (const e of this.enemies) if (e.state === 'windup') this.edgeArrow(e.center(new THREE.Vector3()), 'foe', arrows);
      this.dmgT += dt;
      if (this.dmgT < 0.9) {
        const rel = this.dmgDir - Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
        arrows.push({ angle: -rel, kind: 'dmg' });
      }
    }
    this.hud.setArrows(arrows);
    this.hud.update(dt);
  }

  private edgeArrow(p: THREE.Vector3, kind: 'item' | 'foe', out: { angle: number; kind: 'dmg' | 'item' | 'foe' }[]): void {
    const v = this.tmp2.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
    // in front and on screen: no arrow
    if (v.z < 0) {
      const ndc = p.clone().project(this.camera);
      if (Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.9) return;
    }
    // screen direction (0 = up, clockwise); things behind point down towards their side
    out.push({ angle: Math.atan2(v.x, v.z < 0 ? v.y : -v.z), kind });
  }

  // ================================================================ render

  private render(): void {
    const now = performance.now();
    const p = this.player;
    // camera: eye, bob, landing dip, shake and hit kicks
    this.trauma = Math.max(0, this.trauma - (1 / 60) * 1.6);
    const s = this.trauma * this.trauma;
    const t = this.realT;
    const shY = s * 0.035 * (Math.sin(t * 37.1) + Math.sin(t * 23.3) * 0.6);
    const shP = s * 0.03 * (Math.sin(t * 41.7 + 1) + Math.sin(t * 19.9) * 0.5);
    const shR = s * 0.03 * Math.sin(t * 29.3 + 2);
    this.eye(this.camera.position);
    this.camera.rotation.set(p.pitch + p.kickPitch + shP, p.yaw + shY, p.kickRoll + shR, 'YXZ');
    this.camera.updateMatrixWorld();
    // the world's moving parts
    this.sky.update(this.time, this.camera, this.renderer.getPixelRatio());
    this.snow.update(this.realT, this.camera.position, this.pxScale);
    this.world.update(this.realT);
    this.world.setView(this.camera.position, this.pxScale);
    // the mitten
    const mode = this.giantHeld ? 'giant' : this.rapidT > 0 ? 'rapid' : 'normal';
    const dt = Math.min(0.05, this.lastFrame ? (now - this.lastFrame) / 1000 : 1 / 60);
    this.hand.update(this.paused ? 0 : dt, {
      camQuat: this.camera.quaternion,
      moving: p.grounded ? clamp(Math.hypot(p.vel.x, p.vel.z) / 6, 0, 1) : 0,
      bobPhase: p.bobPhase,
      ammo: this.ammo >= 1 ? 1 : 0,
      mode,
      vy: p.vel.y,
      lookDX: this.lastLookDX,
      lookDY: this.lastLookDY,
    });
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (this.phase !== 'tally' && this.phase !== 'done') this.hand.render(r);
    // keep it smooth: lower the resolution a little if frames are slow
    if (this.lastFrame) this.adaptResolution(now - this.lastFrame);
    this.lastFrame = now;
  }

  private adaptResolution(ms: number): void {
    if (this.paused || ms > 200) return;
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    this.dprCheck++;
    const min = this.low ? 0.75 : 1;
    if (avg > 24 && this.dpr > min) this.dpr = Math.max(min, this.dpr - 0.25);
    else if (avg < 13 && this.dpr < this.dprTarget && this.dprCheck % 4 === 0) this.dpr = Math.min(this.dprTarget, this.dpr + 0.25);
    else return;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.updatePxScale();
  }
}

function raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
