// Minigolfen: nine holes of crazy golf on floating farm islands. This file runs one round: the
// renderer and its tilt-shift look, the camera that follows the ball, aiming by slingshot, keys or a
// gamepad, the life of each hole (fly-over, shots, splashes, the cup, the scorecard) and the score.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Loop } from '../../kit.ts';
import type { GameContext, GameInstance } from '../../types.ts';
import { THEME, buildHole, buildSky, type HoleView, type Sky } from './art.ts';
import { Sound } from './audio.ts';
import { AimView, BallView, Particles } from './fx.ts';
import { HOLES, PAR_TOTAL } from './holes.ts';
import { Hud } from './hud.ts';
import { Kit } from './kit3d.ts';
import { R_BALL, World, shotSpeed, type Ground, type PhysEvent } from './physics.ts';

const MAX_STROKES = 8;
const PLAY_PITCH = 0.9;
const FOV = 38;
const INTRO_T = 3.6;
const HIO_BONUS = 1500;
const LIGHT_DIR = new THREE.Vector3(-0.5, 1, 0.42).normalize();

type Phase = 'intro' | 'aim' | 'roll' | 'sink' | 'portal' | 'penalty' | 'maxed' | 'holed' | 'card' | 'done';

const TILT = {
  uniforms: {
    tDiffuse: { value: null },
    delta: { value: new THREE.Vector2(0.002, 0) },
    focus: { value: 0.45 },
    band: { value: 0.16 },
    grade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 delta;
    uniform float focus;
    uniform float band;
    uniform float grade;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - focus) - band);
      vec2 o = delta * clamp(d * 1.7, 0.0, 1.0);
      vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
      sum += (texture2D(tDiffuse, vUv + o) + texture2D(tDiffuse, vUv - o)) * 0.1531;
      sum += (texture2D(tDiffuse, vUv + 2.0 * o) + texture2D(tDiffuse, vUv - 2.0 * o)) * 0.12245;
      sum += (texture2D(tDiffuse, vUv + 3.0 * o) + texture2D(tDiffuse, vUv - 3.0 * o)) * 0.0918;
      sum += (texture2D(tDiffuse, vUv + 4.0 * o) + texture2D(tDiffuse, vUv - 4.0 * o)) * 0.051;
      if (grade > 0.5) {
        // a touch more colour, and a soft dark edge like a photo of a model
        float l = dot(sum.rgb, vec3(0.2126, 0.7152, 0.0722));
        sum.rgb = mix(vec3(l), sum.rgb, 1.12);
        vec2 q = vUv - 0.5;
        sum.rgb *= 1.0 - dot(q, q) * 0.42;
      }
      gl_FragColor = sum;
    }`,
};

interface Result {
  par: number;
  strokes: number;
  hio: boolean;
  points: number;
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerpAngle = (a: number, b: number, k: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** Words for how a hole went (strokes against par). */
function verdict(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole-in-one!';
  const d = strokes - par;
  if (d <= -2) return 'Örn! Fantastiskt!';
  if (d === -1) return 'Birdie! Jättebra!';
  if (d === 0) return 'Par! Bra spelat!';
  if (d === 1) return 'Bogey – nästan!';
  return 'Klart! Bra kämpat!';
}

export function startGolf(ctx: GameContext): GameInstance {
  const g = new Golf(ctx);
  return { pause: () => g.pause(), resume: () => g.resume(), destroy: () => g.destroy() };
}

class Golf {
  private wrap = document.createElement('div');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 700);
  private composer: EffectComposer | null = null;
  private tiltH: ShaderPass | null = null;
  private tiltV: ShaderPass | null = null;
  private sun: THREE.DirectionalLight;
  private envTex: THREE.Texture | null = null;
  private kit: Kit;
  private sky: Sky;
  private fx: Particles;
  private aim: AimView;
  private ballView: BallView;
  private hud: Hud;
  private sound: Sound;
  private loop: Loop;
  private ro: ResizeObserver;
  private w = 1;
  private h = 1;

  private holeIdx = 0;
  private world!: World;
  private view: HoleView | null = null;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private time = 0;
  private strokes = 0;
  private penalties = 0;
  private results: Result[] = [];
  private totalPoints = 0;
  private lastSpot = new THREE.Vector3();
  private portalIdx = 0;
  private portalSpeed = 0;
  private penaltyKind: 'water' | 'out' = 'water';
  private sinkFrom = new THREE.Vector3();
  private shotsTaken = 0;
  private idleT = 0;
  private ended = false;
  private destroyed = false;
  private rise = 0;
  private flowDrift: [number, number] | null = null;

  // ball interpolation
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();
  private ballShown = false;
  private ballPop = 0;

  // camera rig
  private cam = { target: new THREE.Vector3(), yaw: 0, pitch: PLAY_PITCH, dist: 11, yawTarget: 0 };
  private userDist = 11;
  private shake = 0;
  private overview = 0;
  private focusY = 0.45;

  // aiming
  private aimYaw = 0;
  private charging = false;
  private charge = 0;
  private chargeDir = 1;
  private usedKeys = false;
  private pendingShot: { dx: number; dz: number; p: number } | null = null;
  private pointers = new Map<number, { x: number; y: number; type: string; button: number }>();
  private drag: { id: number; ax: number; ay: number; x: number; y: number; onBall: boolean; power: number; dx: number; dz: number } | null = null;
  private camDrag: { id: number; x: number } | null = null;
  private pinch: { d: number; mx: number } | null = null;
  private tapped = false;
  private path: number[] = [];
  private pathInfo = { n: 0, bounce: -1 };
  private keyHold = 0;
  private lastBlip = 0;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private ndc = new THREE.Vector2();

  constructor(private ctx: GameContext) {
    const low = ctx.quality === 'low';
    this.kit = new Kit(ctx.quality);
    Object.assign(this.wrap.style, { position: 'absolute', inset: '0', overflow: 'hidden', background: '#bfe6fb' });
    ctx.root.append(this.wrap);

    this.renderer = new THREE.WebGLRenderer({ antialias: low, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(ctx.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = this.kit.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const cv = this.renderer.domElement;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    this.wrap.append(cv);

    // light, sky and a soft studio reflection for the shiny toys
    this.scene.fog = new THREE.Fog('#cdeefc', 60, 190);
    const hemi = new THREE.HemisphereLight('#e4f5ff', '#7aa35a', 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    this.sun.castShadow = this.kit.shadows;
    if (this.kit.shadows) {
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.025;
      this.sun.shadow.radius = 3;
    }
    this.scene.add(this.sun, this.sun.target);
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.envTex = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.42;
    } catch {
      this.envTex = null;
    }
    this.sky = buildSky(this.kit);
    this.scene.add(this.sky.root);

    this.fx = new Particles(this.kit, this.scene);
    this.aim = new AimView(ctx.player.color);
    this.scene.add(this.aim.root);
    this.ballView = new BallView(this.kit, ctx.player.color);
    this.scene.add(this.ballView.root);
    this.ballView.root.visible = false;

    if (!low) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.tiltH = new ShaderPass(TILT);
      this.tiltV = new ShaderPass(TILT);
      this.tiltV.uniforms.grade!.value = 1;
      this.composer.addPass(this.tiltH);
      this.composer.addPass(this.tiltV);
      this.composer.addPass(new OutputPass());
    }

    this.hud = new Hud(this.wrap);
    this.hud.cardEl.addEventListener('pointerdown', this.onCardTap);
    this.sound = new Sound(ctx.audio, ctx.out);

    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('lostpointercapture', this.onLost);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.addEventListener('contextmenu', this.onContext);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(ctx.root);
    this.resize();

    let first = 0;
    if (import.meta.env.DEV) {
      // the lab: ?play=golf&hole=4 starts on hole 4; window.__golf lets tests play
      const h = Number(new URLSearchParams(location.search).get('hole'));
      if (h >= 1 && h <= HOLES.length) first = h - 1;
      (window as unknown as { __golf?: Golf }).__golf = this;
    }
    this.startHole(first);
    this.sound.startMusic();
    this.loop = new Loop(
      (dt) => this.update(dt),
      (a) => this.render(a),
    );
  }

  // ------------------------------------------------------------ test hooks (the lab only)

  /** Putt at an angle (0 = towards -z, 90 = towards +x) with a power 0..1. */
  debugShoot(angleDeg: number, p: number): boolean {
    if (this.phase !== 'aim' || !this.ready()) return false;
    const a = (angleDeg * Math.PI) / 180;
    this.pendingShot = { dx: Math.sin(a), dz: -Math.cos(a), p };
    return true;
  }

  debugTap(): void {
    this.tapped = true;
  }

  /** Count the rest of the round as par and end it (to see the result card). */
  debugFinish(): void {
    while (this.results.length < HOLES.length) {
      const h = HOLES[this.results.length]!;
      const points = 4 * 400;
      this.results.push({ par: h.par, strokes: h.par, hio: false, points });
      this.totalPoints += points;
    }
    this.finish();
  }

  debugHole(n: number): void {
    this.hud.hideCard();
    this.startHole(clamp(n - 1, 0, HOLES.length - 1));
  }

  /** Hold the overview (like holding B). */
  debugOverview(on: boolean): void {
    this.overviewLock = on;
  }
  private overviewLock = false;

  debugState(): Record<string, unknown> {
    const b = this.world.ball;
    return {
      phase: this.phase,
      hole: this.holeIdx + 1,
      strokes: this.strokes,
      ready: this.phase === 'aim' && this.ready(),
      ball: [b.x, b.y, b.z],
      cup: [this.world.cup.x, this.world.cup.z],
      points: this.totalPoints,
      results: this.results.map((r) => r.strokes),
      ended: this.ended,
    };
  }

  // ------------------------------------------------------------ lifecycle

  pause(): void {
    this.loop.pause();
    this.sound.pause();
    this.cancelPointers();
    this.charging = false;
    this.charge = 0;
  }

  resume(): void {
    if (this.destroyed) return;
    this.sound.resume();
    this.loop.resume();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loop.stop();
    this.ro.disconnect();
    const cv = this.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('lostpointercapture', this.onLost);
    cv.removeEventListener('wheel', this.onWheel);
    cv.removeEventListener('contextmenu', this.onContext);
    this.hud.cardEl.removeEventListener('pointerdown', this.onCardTap);
    this.sound.destroy();
    this.view?.dispose();
    this.view = null;
    this.fx.dispose();
    this.aim.dispose();
    this.ballView.dispose();
    this.sky.dispose();
    this.kit.dispose();
    this.envTex?.dispose();
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose();
      this.composer.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.hud.destroy();
    this.wrap.remove();
  }

  private resize(): void {
    const r = this.ctx.root.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.ctx.dpr);
      this.composer.setSize(this.w, this.h);
    }
    // narrow (portrait) screens see the lane from a little further back
    const narrow = Math.max(1, 1.35 / this.camera.aspect);
    this.userDist = clamp(13.5 * narrow, 6, 26);
  }

  // ------------------------------------------------------------ holes

  private get spec() {
    return HOLES[this.holeIdx]!;
  }

  private startHole(i: number): void {
    this.holeIdx = i;
    this.view?.dispose();
    const spec = this.spec;
    this.world = new World(spec);
    this.view = buildHole(this.kit, spec, this.world, i);
    this.scene.add(this.view.root);
    this.rise = 0;
    this.view.root.position.y = -6;
    this.view.root.scale.setScalar(0.5);
    // the sun's shadow covers this island
    const c = this.view.center;
    const rad = this.view.radius + 4;
    this.sun.position.copy(c).addScaledVector(LIGHT_DIR, 40);
    this.sun.target.position.copy(c);
    if (this.kit.shadows) {
      const sc = this.sun.shadow.camera;
      sc.left = -rad;
      sc.right = rad;
      sc.top = rad;
      sc.bottom = -rad;
      sc.near = 5;
      sc.far = 90;
      sc.updateProjectionMatrix();
    }
    this.strokes = 0;
    this.penalties = 0;
    const b = this.world.ball;
    this.lastSpot.set(b.x, b.y, b.z);
    this.prev.copy(this.lastSpot);
    this.cur.copy(this.lastSpot);
    this.world.live = false;
    this.ballShown = false;
    this.ballView.root.visible = false;
    this.ballView.clearTrail();
    this.aim.hide();
    this.setPhase('intro');
    this.aimYaw = this.pathYaw(b.x, b.z);
    this.cam.yawTarget = this.aimYaw;
    const theme = THEME[i % THEME.length]!;
    this.hud.setHole(i + 1, HOLES.length, spec.name, spec.par, theme);
    this.hud.setStrokes(0, 0, MAX_STROKES);
    this.hud.setTotal(this.totalStrokes(), this.parSoFar(), this.totalPoints);
    this.hud.show(`Bana ${i + 1} av ${HOLES.length} · Par ${spec.par}`, spec.name, spec.sub, { color: theme, ms: INTRO_T * 1000 - 400 });
    this.hud.hint(null);
    this.hud.showHand(false);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    if (p !== 'aim') {
      this.hud.hint(null);
      this.hud.showHand(false);
    }
  }

  private totalStrokes(): number {
    return this.results.reduce((s, r) => s + r.strokes, 0);
  }

  private parSoFar(): number {
    return this.results.reduce((s, r) => s + r.par, 0);
  }

  /** Which way the course goes from here: a point a little further along its path. */
  private pathYaw(x: number, z: number): number {
    const path = this.spec.path;
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < best) {
        best = d;
        bi = i;
        bt = t;
      }
    }
    // walk 4 units along the path from the nearest point
    let left = 4;
    let px = 0;
    let pz = 0;
    let i = bi;
    let t = bt;
    for (;;) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rest = segLen * (1 - t);
      if (rest >= left || i >= path.length - 2) {
        const tt = Math.min(1, t + left / segLen);
        px = a[0] + (b[0] - a[0]) * tt;
        pz = a[1] + (b[1] - a[1]) * tt;
        break;
      }
      left -= rest;
      i++;
      t = 0;
    }
    const cup = this.world.cup;
    if (Math.hypot(cup.x - x, cup.z - z) < 4) {
      px = cup.x;
      pz = cup.z;
    }
    const dx = px - x;
    const dz = pz - z;
    if (Math.hypot(dx, dz) < 0.3) return this.cam.yaw;
    return Math.atan2(-dx, -dz);
  }

  // ------------------------------------------------------------ the update

  private update(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    const input = this.ctx.input;
    const b = this.world.ball;
    this.prev.copy(this.cur);

    // the island rises into place
    if (this.view && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 1.1);
      const e = this.rise;
      const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2);
      this.view.root.position.y = -6 * (1 - Math.min(1, back));
      this.view.root.scale.setScalar(0.5 + 0.5 * back);
    }

    this.cameraInput(dt);
    const tapped = this.tapped;
    this.tapped = false;
    const go = input.pressed('a') || input.pressed('start') || tapped;

    switch (this.phase) {
      case 'intro':
        if ((go && this.phaseT > 0.5) || this.phaseT >= INTRO_T) this.endIntro();
        break;
      case 'aim':
        this.aimUpdate(dt);
        break;
      case 'roll':
        if (this.phaseT > 28) {
          // something odd: call it a rest where it lies
          b.vx = b.vz = b.vy = 0;
          this.onRest();
        }
        break;
      case 'sink': {
        const k = Math.min(1, this.phaseT / 0.42);
        const cup = this.world.cup;
        const e = k * k;
        b.x = this.sinkFrom.x + (cup.x - this.sinkFrom.x) * Math.min(1, k * 1.6);
        b.z = this.sinkFrom.z + (cup.z - this.sinkFrom.z) * Math.min(1, k * 1.6);
        b.y = this.sinkFrom.y + (cup.h - 0.3 - this.sinkFrom.y) * e;
        if (k >= 1) this.holed();
        break;
      }
      case 'maxed': {
        // the ball hops into the cup by itself
        const k = Math.min(1, this.phaseT / 1.0);
        const cup = this.world.cup;
        b.x = this.sinkFrom.x + (cup.x - this.sinkFrom.x) * k;
        b.z = this.sinkFrom.z + (cup.z - this.sinkFrom.z) * k;
        b.y = this.sinkFrom.y + (cup.h - this.sinkFrom.y) * k + Math.sin(k * Math.PI) * 2.2;
        if (k >= 1) {
          this.sinkFrom.set(b.x, b.y, b.z);
          this.sound.plop();
          this.setPhase('sink');
        }
        break;
      }
      case 'portal': {
        const p = this.spec.portals![this.portalIdx]!;
        if (this.phaseT >= p.delay) {
          const sp = Math.max(2.8, this.portalSpeed * 0.85);
          b.set(p.exit[0], this.world.heightAt(p.exit[0], p.exit[1]) + R_BALL, p.exit[1]);
          this.prev.set(b.x, b.y, b.z);
          this.world.hit(p.dir[0] * sp, p.dir[1] * sp);
          this.ballShown = true;
          this.ballPop = 0;
          this.sound.pop();
          this.fx.puff(b.x, b.y, b.z, 8, '#fff6e0', 0.14);
          this.setPhase('roll');
        }
        break;
      }
      case 'penalty':
        if (this.penaltyKind === 'water') {
          // sink slowly (and drift with a stream)
          b.y -= dt * 0.25;
          if (this.flowDrift) {
            b.x += this.flowDrift[0] * dt;
            b.z += this.flowDrift[1] * dt;
          }
        }
        if (this.phaseT > 1.5) this.afterPenalty();
        break;
      case 'holed':
        if (this.phaseT > 2.6) this.showCard();
        break;
      case 'card':
        if ((go && this.phaseT > 0.7) || this.phaseT > 9) this.nextHole();
        break;
      case 'done':
        break;
    }

    this.world.update(dt);
    for (const e of this.world.events) this.onEvent(e);
    this.world.events.length = 0;
    // a cow that lost patience moos
    for (const c of this.view?.cows ?? []) {
      if (c.mover.moo) {
        c.mover.moo = false;
        this.sound.moo();
        const p = this.toScreen(c.mover.x, 1.6, c.mover.z);
        if (p) this.hud.bubble('Muu!', p.x, p.y);
      }
    }
    this.cur.set(b.x, b.y, b.z);

    this.updateCamera(dt);
    this.fx.update(dt);
    this.sky.update(this.time);
    this.sound.tick();
    input.frame();
  }

  private endIntro(): void {
    this.hud.hideBanner();
    const b = this.world.ball;
    this.ballShown = true;
    this.ballPop = 0;
    this.world.live = true;
    this.sound.pop();
    this.fx.sparkle(b.x, b.y + 0.2, b.z, 10, '#ffffff');
    this.setPhase('aim');
    this.idleT = 0;
    this.charging = false;
    this.charge = 0;
    // land the camera behind the ball
    this.cam.target.set(b.x, b.y, b.z);
    this.cam.yaw = this.cam.yawTarget = this.pathYaw(b.x, b.z);
    this.cam.pitch = PLAY_PITCH;
    this.cam.dist = this.userDist;
  }

  private ready(): boolean {
    const b = this.world.ball;
    return this.world.live && !b.air && b.still > 0.1;
  }

  private aimUpdate(dt: number): void {
    const input = this.ctx.input;
    const b = this.world.ball;
    const ready = this.ready();
    this.idleT += dt;
    // keys and gamepad: turn the aim, hold A to charge, let go to putt
    const st = input.stick(0);
    const turning = Math.abs(st.x) > 0.15;
    if (turning) {
      this.usedKeys = true;
      this.keyHold += dt;
      const speed = (this.keyHold < 0.35 ? 0.45 : Math.min(1.9, 0.45 + (this.keyHold - 0.35) * 2.6)) * Math.abs(st.x);
      this.aimYaw -= Math.sign(st.x) * speed * dt;
      this.idleT = 0;
    } else this.keyHold = 0;
    if (input.pressed('a') && ready && !this.drag) {
      this.charging = true;
      this.charge = 0;
      this.chargeDir = 1;
      this.usedKeys = true;
    }
    if (this.charging) {
      this.idleT = 0;
      if (input.pressed('b')) {
        this.charging = false;
        this.charge = 0;
      } else if (input.down('a')) {
        this.charge += this.chargeDir * dt / 1.35;
        if (this.charge >= 1) {
          this.charge = 1;
          this.chargeDir = -1;
        } else if (this.charge <= 0.02 && this.chargeDir < 0) {
          this.charge = 0.02;
          this.chargeDir = 1;
        }
        if (Math.floor(this.charge * 10) !== this.lastBlip) {
          this.lastBlip = Math.floor(this.charge * 10);
          this.sound.blip(this.charge);
        }
      } else {
        this.charging = false;
        if (this.charge > 0.03 && ready) this.pendingShot = { dx: -Math.sin(this.aimYaw), dz: -Math.cos(this.aimYaw), p: this.charge };
        this.charge = 0;
      }
    }
    // pointer: the slingshot
    if (this.drag) {
      this.idleT = 0;
      this.pointerAim();
    }
    if (this.pendingShot) {
      const s = this.pendingShot;
      this.pendingShot = null;
      if (this.ready()) this.shoot(s.dx, s.dz, s.p);
      return;
    }
    // the aim line
    let dx: number;
    let dz: number;
    let p: number;
    let pull = false;
    if (this.drag && this.drag.power > 0.01) {
      dx = this.drag.dx;
      dz = this.drag.dz;
      p = this.drag.power;
      pull = true;
    } else if (this.charging || this.usedKeys) {
      dx = -Math.sin(this.aimYaw);
      dz = -Math.cos(this.aimYaw);
      p = this.charging ? this.charge : 0;
      pull = this.charging;
    } else {
      this.aim.hide();
      this.hud.setPower(false);
      this.hints();
      return;
    }
    const len = p > 0 ? 1.4 + p * 6.5 : 1.6;
    const sp = p > 0 ? shotSpeed(p) : shotSpeed(0.35);
    const res = this.world.preview(dx * sp, dz * sp, len, this.path);
    this.pathInfo.n = res.n;
    this.pathInfo.bounce = res.bounce;
    this.aim.show(b.x, b.y, b.z, dx, dz, p, this.path, res.n, res.bounce, this.time, ready, pull);
    const sc = this.toScreen(b.x, b.y, b.z);
    if (sc && p > 0) {
      const side = sc.x > this.w - 120 ? -1 : 1;
      this.hud.setPower(true, p, sc.x - 70 * side, sc.y - 10);
    } else this.hud.setPower(false);
    this.hints();
  }

  private hints(): void {
    const first = this.holeIdx === 0 && this.shotsTaken === 0;
    const show = this.phase === 'aim' && !this.drag && !this.charging && (first || this.idleT > 12);
    if (!show) {
      this.hud.hint(null);
      this.hud.showHand(false);
      return;
    }
    if (this.ctx.touch) {
      this.hud.hint('Dra bakåt från bollen och släpp!');
      const b = this.world.ball;
      const s = this.toScreen(b.x, b.y, b.z);
      // pull towards the camera, away from where the course goes
      const ahead = this.toScreen(b.x - Math.sin(this.cam.yaw) * 2, b.y, b.z - Math.cos(this.cam.yaw) * 2);
      if (s && ahead) {
        const vx = s.x - ahead.x;
        const vy = s.y - ahead.y;
        const l = Math.hypot(vx, vy) || 1;
        this.hud.showHand(true, s.x, s.y, (vx / l) * 100, (vy / l) * 100);
      }
    } else {
      this.hud.hint(this.usedKeys ? '← → sikta · håll mellanslag · släpp!' : 'Dra bakåt från bollen och släpp!', this.usedKeys ? null : 'eller: ← → sikta, håll mellanslag');
      this.hud.showHand(false);
    }
  }

  private shoot(dx: number, dz: number, p: number): void {
    const b = this.world.ball;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const v = shotSpeed(p);
    this.strokes++;
    this.shotsTaken++;
    this.lastSpot.set(b.x, b.y, b.z);
    this.world.hit(dx * v, dz * v);
    this.sound.putt(p);
    this.fx.puff(b.x - dx * 0.2, b.y - 0.1, b.z - dz * 0.2, 4 + Math.round(p * 6), '#e9f7e0', 0.1);
    this.ballView.squash = 0.4 + p * 0.5;
    if (p > 0.8) this.shake = Math.max(this.shake, 0.08);
    this.hud.setStrokes(this.strokes, this.penalties, MAX_STROKES);
    this.aim.hide();
    this.hud.setPower(false);
    this.hud.hint(null);
    this.hud.showHand(false);
    this.drag = null;
    this.charging = false;
    this.aimYaw = Math.atan2(-dx, -dz);
    this.setPhase('roll');
  }

  private onEvent(e: PhysEvent): void {
    const b = this.world.ball;
    switch (e.t) {
      case 'hit': {
        this.sound.hit(e.snd, e.v);
        this.ballView.squash = Math.min(1, e.v / 9);
        if (e.v > 8) this.shake = Math.max(this.shake, 0.06);
        if (e.snd === 'hay') this.fx.hay(e.x, e.y, e.z);
        else if (e.snd === 'rubber') this.fx.sparkle(e.x, e.y, e.z, 8, '#ff7eb6');
        else if (e.v > 3) this.fx.puff(e.x, e.y, e.z, 3, '#ffffff', 0.07);
        if (e.snd === 'cow') {
          const c = this.view?.cows.find((q) => q.mover.bodies[0] === e.body);
          if (c) {
            c.bump = 1;
            const p = this.toScreen(c.mover.x, 1.6, c.mover.z);
            if (p) this.hud.bubble('Muu!', p.x, p.y);
          }
        }
        break;
      }
      case 'land':
        this.sound.land(e.v);
        if (e.v > 3) this.fx.puff(b.x, b.y - R_BALL, b.z, 5, '#f4fbe9', 0.1);
        this.ballView.squash = Math.min(1, e.v / 7);
        break;
      case 'lip': {
        this.sound.lip();
        const p = this.toScreen(b.x, b.y + 0.5, b.z);
        if (p) this.hud.float('Nästan!', p.x, p.y, '#ffffff');
        this.view && (this.view.flag.wiggle = 1);
        break;
      }
      case 'water': {
        this.sound.splash();
        this.fx.splash(e.x, e.level, e.z);
        this.view?.scare(e.x, e.z);
        if (this.spec.waters?.some((w) => w.ducks)) this.sound.quack();
        this.penalty('water', e.flow);
        break;
      }
      case 'out':
        this.sound.poof();
        this.fx.puff(b.x, b.y, b.z, 12, '#ffffff', 0.2);
        this.penalty('out', null);
        break;
      case 'cup':
        this.sinkFrom.set(b.x, b.y, b.z);
        this.sound.plop();
        this.aim.hide();
        this.hud.setPower(false);
        this.drag = null;
        this.charging = false;
        this.setPhase('sink');
        break;
      case 'portal': {
        this.portalIdx = e.i;
        this.portalSpeed = Math.hypot(b.vx, b.vz);
        this.ballShown = false;
        this.sound.rumble();
        this.sound.moo(0.3);
        const p = this.toScreen(b.x, 2.6, b.z - 1.5);
        if (p) this.hud.bubble(e.i === 0 ? 'Genvägen!' : 'Muu!', p.x, p.y);
        this.setPhase('portal');
        break;
      }
      case 'rest':
        if (this.phase === 'roll') this.onRest();
        break;
    }
  }

  private onRest(): void {
    const b = this.world.ball;
    if (this.strokes >= MAX_STROKES) {
      this.maxOut();
      return;
    }
    this.setPhase('aim');
    this.idleT = 0;
    this.cam.yawTarget = this.pathYaw(b.x, b.z);
    this.aimYaw = this.cam.yawTarget;
    this.ballView.clearTrail();
  }

  private maxOut(): void {
    const b = this.world.ball;
    this.world.live = false;
    this.ballShown = true;
    this.sinkFrom.set(b.x, b.y, b.z);
    this.hud.show(null, `${MAX_STROKES} slag`, 'Bollen hoppar i hålet åt dig!', { color: '#7c6cf0', ms: 2200 });
    this.sound.whoosh();
    this.setPhase('maxed');
  }

  private penalty(kind: 'water' | 'out', flow: [number, number] | null): void {
    this.world.live = false;
    this.penaltyKind = kind;
    this.flowDrift = flow ? [flow[0] * 0.6, flow[1] * 0.6] : null;
    if (kind === 'out') this.ballShown = false;
    const own = this.phase === 'roll';
    if (own) {
      this.strokes++;
      this.penalties++;
      this.hud.setStrokes(this.strokes, this.penalties, MAX_STROKES);
    }
    this.hud.show(own ? '+1 slag' : null, kind === 'water' ? 'Plask!' : 'Utanför!', kind === 'water' ? 'Bollen kommer tillbaka' : 'Bollen hoppade ut', {
      color: kind === 'water' ? '#3fb6ff' : '#ff8a3d',
      ms: 1500,
    });
    this.aim.hide();
    this.hud.setPower(false);
    this.drag = null;
    this.charging = false;
    this.setPhase('penalty');
  }

  private afterPenalty(): void {
    const b = this.world.ball;
    b.set(this.lastSpot.x, this.world.heightAt(this.lastSpot.x, this.lastSpot.z) + R_BALL, this.lastSpot.z);
    this.prev.set(b.x, b.y, b.z);
    this.cur.set(b.x, b.y, b.z);
    this.ballShown = true;
    this.ballPop = 0;
    this.ballView.clearTrail();
    this.sound.pop();
    this.fx.sparkle(b.x, b.y + 0.2, b.z, 8, '#ffffff');
    this.world.live = true;
    if (this.strokes >= MAX_STROKES) {
      this.maxOut();
      return;
    }
    this.setPhase('aim');
    this.idleT = 0;
    this.cam.yawTarget = this.pathYaw(b.x, b.z);
    this.aimYaw = this.cam.yawTarget;
  }

  private holed(): void {
    const spec = this.spec;
    const hio = this.strokes === 1;
    const strokes = Math.min(this.strokes, MAX_STROKES);
    const points = Math.max(0, (spec.par + 4 - strokes) * 400) + (hio ? HIO_BONUS : 0);
    this.results.push({ par: spec.par, strokes, hio, points });
    this.totalPoints += points;
    this.world.live = false;
    this.ballShown = false;
    const cup = this.world.cup;
    const theme = THEME[this.holeIdx % THEME.length]!;
    if (this.view) this.view.flag.wiggle = 1.4;
    if (hio) {
      this.sound.fanfare();
      this.sound.cheer(true);
      this.fx.confetti(cup.x, cup.h + 0.3, cup.z, 260, 9);
      this.fx.sparkle(cup.x, cup.h + 0.2, cup.z, 24);
      this.shake = 0.18;
      this.hud.show('I på första slaget!', 'Hole-in-one!', `+${(points).toLocaleString('sv-SE')} poäng`, { color: theme, rainbow: true, ms: 2600 });
    } else {
      this.sound.cheer(strokes <= spec.par);
      this.fx.sparkle(cup.x, cup.h + 0.2, cup.z, 16);
      if (strokes <= spec.par) this.fx.confetti(cup.x, cup.h + 0.3, cup.z, 70, 6);
      this.hud.show(strokes === MAX_STROKES && this.strokes >= MAX_STROKES ? null : 'I hålet!', verdict(strokes, spec.par), `+${points.toLocaleString('sv-SE')} poäng`, { color: theme, ms: 2400 });
    }
    const p = this.toScreen(cup.x, cup.h + 0.8, cup.z);
    if (p) this.hud.float(`+${points.toLocaleString('sv-SE')}`, p.x, p.y, '#ffe14d');
    this.hud.setTotal(this.totalStrokes(), this.parSoFar(), this.totalPoints);
    this.setPhase('holed');
  }

  private showCard(): void {
    const last = this.holeIdx === HOLES.length - 1;
    const r = this.results[this.results.length - 1]!;
    const theme = THEME[this.holeIdx % THEME.length]!;
    this.hud.hideBanner();
    this.hud.showCard({
      title: last ? 'Alla nio banor klara!' : `Bana ${this.holeIdx + 1} klar!`,
      word: last ? `${this.totalStrokes()} slag · par ${PAR_TOTAL}` : verdict(r.strokes, r.par),
      rows: HOLES.map((hh, i) => ({ par: hh.par, strokes: this.results[i]?.strokes ?? null, hio: this.results[i]?.hio })),
      now: this.holeIdx,
      holePoints: r.points,
      total: this.totalPoints,
      next: last ? (this.ctx.touch ? 'Tryck för att avsluta' : 'Tryck A för att avsluta') : this.ctx.touch ? 'Tryck för nästa bana ▶' : 'Tryck A för nästa bana ▶',
      color: theme,
    });
    this.sound.ui(2);
    this.setPhase('card');
  }

  private nextHole(): void {
    this.hud.hideCard();
    this.sound.ui(4);
    if (this.holeIdx < HOLES.length - 1) {
      this.startHole(this.holeIdx + 1);
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.setPhase('done');
    const strokes = this.totalStrokes();
    const hio = this.results.filter((r) => r.hio).length;
    const detail = `${strokes} slag · par ${PAR_TOTAL}${hio ? ` · ${hio} hole-in-one` : ''}`;
    this.ctx.end(Math.min(99999, Math.round(this.totalPoints)), detail);
  }

  // ------------------------------------------------------------ camera

  private cameraInput(dt: number): void {
    const input = this.ctx.input;
    let turn = 0;
    if (input.key('KeyQ')) turn += 1;
    if (input.key('KeyE')) turn -= 1;
    turn -= input.stick(1).x;
    const tr = input.triggers();
    turn += (tr.left - tr.right) * 0.8;
    if (turn !== 0) {
      this.cam.yawTarget += turn * 1.7 * dt;
      this.cam.yaw = lerpAngle(this.cam.yaw, this.cam.yawTarget, 1);
    }
    if (input.pressed('c')) {
      this.cam.yawTarget += Math.PI / 4;
      this.sound.ui(1);
    }
    // zoom: up/down (not while turning the aim with them) and the right stick
    let zoom = 0;
    if (input.key('ArrowUp') || input.key('KeyW')) zoom -= 1;
    if (input.key('ArrowDown') || input.key('KeyS')) zoom += 1;
    zoom += input.stick(1).y;
    if (zoom !== 0) this.userDist = clamp(this.userDist * (1 + zoom * dt * 1.2), 6, 24);
    const wantOverview = (input.down('b') || this.overviewLock) && !this.charging && this.phase !== 'intro' && this.phase !== 'card';
    this.overview += ((wantOverview ? 1 : 0) - this.overview) * Math.min(1, dt * 5);
  }

  private overviewPose(): { dist: number; pitch: number } {
    const v = this.view;
    const rad = v ? v.radius + 1.5 : 12;
    const pitch = 1.08;
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const th = tv * this.camera.aspect;
    const dist = Math.max((rad * Math.sin(pitch) + 1.5) / tv, rad / th) * 1.02;
    return { dist, pitch };
  }

  private updateCamera(dt: number): void {
    const c = this.cam;
    const b = this.world.ball;
    if (this.phase === 'intro') {
      // fly over the hole: from high above the whole island down behind the tee
      const ov = this.overviewPose();
      const k = easeInOut(clamp((this.phaseT - 0.6) / (INTRO_T - 0.8), 0, 1));
      const startYaw = c.yawTarget + 0.8;
      const center = this.view?.center ?? new THREE.Vector3();
      c.target.set(center.x + (b.x - center.x) * k, b.y * k, center.z + (b.z - center.z) * k);
      c.yaw = startYaw + (c.yawTarget - startYaw) * k - (1 - k) * this.phaseT * 0.06;
      c.pitch = ov.pitch + (PLAY_PITCH - ov.pitch) * k;
      c.dist = ov.dist * 1.08 + (this.userDist - ov.dist * 1.08) * k;
    } else {
      let tx = b.x;
      let ty = b.y;
      let tz = b.z;
      if (this.phase === 'portal') {
        const p = this.spec.portals![this.portalIdx]!;
        tx = p.exit[0];
        ty = 0.2;
        tz = p.exit[1];
      } else if (this.phase === 'penalty') {
        const k = clamp(this.phaseT / 1.2, 0, 1);
        tx = b.x + (this.lastSpot.x - b.x) * k;
        ty = this.lastSpot.y;
        tz = b.z + (this.lastSpot.z - b.z) * k;
      } else if (this.phase === 'roll') {
        // look a little ahead of a fast ball
        tx += b.vx * 0.22;
        tz += b.vz * 0.22;
        ty = Math.max(ty, 0) * 0.7;
      }
      if (this.phase === 'aim') {
        // look a little past the ball, so more of the course is on screen (and there is room to pull back)
        tx -= Math.sin(c.yaw) * 1.8;
        tz -= Math.cos(c.yaw) * 1.8;
      }
      let pitch = PLAY_PITCH;
      let dist = this.userDist * (this.phase === 'roll' ? 1 + Math.min(0.25, Math.hypot(b.vx, b.vz) * 0.015) : 1);
      if (this.overview > 0.01) {
        const ov = this.overviewPose();
        const center = this.view?.center ?? new THREE.Vector3();
        const o = easeInOut(this.overview);
        tx += (center.x - tx) * o;
        ty += (0 - ty) * o;
        tz += (center.z - tz) * o;
        pitch += (ov.pitch - pitch) * o;
        dist += (ov.dist - dist) * o;
      }
      const k = 1 - Math.exp(-dt * (this.phase === 'roll' ? 6 : 4));
      c.target.x += (tx - c.target.x) * k;
      c.target.y += (ty - c.target.y) * k;
      c.target.z += (tz - c.target.z) * k;
      c.yaw = lerpAngle(c.yaw, c.yawTarget, 1 - Math.exp(-dt * 3.2));
      c.pitch += (pitch - c.pitch) * (1 - Math.exp(-dt * 4));
      c.dist += (dist - c.dist) * (1 - Math.exp(-dt * 3));
    }
    this.shake = Math.max(0, this.shake - dt * 0.5);
  }

  private placeCamera(): void {
    const c = this.cam;
    const cp = Math.cos(c.pitch);
    const cam = this.camera;
    cam.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(c.target);
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------ drawing

  private lastFrame = 0;
  private render(alpha: number): void {
    if (this.destroyed || !this.view) return;
    const now = performance.now();
    const fdt = this.lastFrame ? clamp((now - this.lastFrame) / 1000, 0.001, 0.1) : 1 / 60;
    this.lastFrame = now;
    const b = this.world.ball;
    const x = this.prev.x + (this.cur.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.cur.y - this.prev.y) * alpha;
    const z = this.prev.z + (this.cur.z - this.prev.z) * alpha;
    this.placeCamera();
    // the ball: pops in, rolls, sinks into the cup
    this.ballPop = Math.min(1, this.ballPop + fdt * 3);
    const pop = this.ballPop < 1 ? 1 + Math.sin(this.ballPop * Math.PI) * 0.35 - (1 - this.ballPop) * 0.6 : 1;
    this.ballView.scale = this.phase === 'sink' ? Math.max(0.6, 1 - this.phaseT) : Math.max(0.05, pop);
    const ground = this.groundY(x, z, y);
    this.ballView.set(x, y, z, b.vx, b.vz, fdt, ground, this.ballShown && this.phase !== 'intro');
    // the flag comes out when the ball is close and moving
    const cup = this.world.cup;
    const dc = Math.hypot(x - cup.x, z - cup.z);
    const near = (this.phase === 'roll' && dc < 3.2) || this.phase === 'sink' || this.phase === 'maxed' || (this.phase === 'aim' && dc < 1.6);
    this.view.flag.lift = near ? 1 : 0;
    this.view.update(this.world.t, fdt, this.world, x, y, z, this.camera.position);
    if (this.phase !== 'aim') {
      this.aim.hide();
      this.hud.setPower(false);
    }
    // keep the ball's band of the picture sharp
    const sc = this.toScreen(x, y, z);
    const wantFocus = this.phase === 'intro' || this.overview > 0.5 || !sc ? 0.5 : clamp(1 - sc.y / this.h, 0.2, 0.8);
    this.focusY += (wantFocus - this.focusY) * Math.min(1, fdt * 5);
    if (this.composer && this.tiltH && this.tiltV) {
      const px = this.ctx.dpr;
      this.tiltH.uniforms.delta!.value.set((1.25 * px) / (this.w * px), 0);
      this.tiltV.uniforms.delta!.value.set(0, (1.25 * px) / (this.h * px));
      for (const p of [this.tiltH, this.tiltV]) {
        p.uniforms.focus!.value = this.focusY;
        p.uniforms.band!.value = this.phase === 'intro' || this.overview > 0.5 ? 0.3 : 0.17;
      }
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }

  private gq: Ground = { h: 0, gx: 0, gz: 0, surf: 'felt', piece: null };
  private groundY(x: number, z: number, y: number): number {
    const w = this.world;
    const g = this.gq;
    if (w.ground(x, z, y - R_BALL + 0.3, g)) return g.h;
    const wt = w.waterAt(x, z);
    return wt ? wt.level : -0.12;
  }

  /** World point to CSS pixels on screen (null if behind the camera). */
  private toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.v1.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** Where a screen point (CSS px) meets the ground plane at height y. */
  private toGround(sx: number, sy: number, y: number, out: THREE.Vector3): boolean {
    this.ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -y;
    return this.raycaster.ray.intersectPlane(this.plane, out) !== null;
  }

  // ------------------------------------------------------------ pointer input

  private rect(): DOMRect {
    return this.renderer.domElement.getBoundingClientRect();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.destroyed) return;
    e.preventDefault();
    const r = this.rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    this.pointers.set(e.pointerId, { x, y, type: e.pointerType, button: e.button });
    if (e.pointerType === 'mouse' && e.button !== 0) {
      this.camDrag = { id: e.pointerId, x };
      return;
    }
    if (this.pointers.size >= 2) {
      // two fingers: turn and zoom the camera instead of aiming
      this.drag = null;
      this.aim.hide();
      this.hud.setPower(false);
      this.startPinch();
      return;
    }
    if (this.phase === 'intro' || this.phase === 'card') {
      this.tapped = true;
      return;
    }
    if (this.phase !== 'aim') return;
    const b = this.world.ball;
    const s = this.toScreen(b.x, b.y, b.z);
    const near = s ? Math.hypot(s.x - x, s.y - y) < Math.max(70, Math.min(this.w, this.h) * 0.1) : false;
    this.drag = { id: e.pointerId, ax: x, ay: y, x, y, onBall: near, power: 0, dx: 0, dz: -1 };
    this.charging = false;
  };

  private startPinch(): void {
    const ps = [...this.pointers.values()];
    if (ps.length < 2) return;
    const a = ps[0]!;
    const b = ps[1]!;
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 };
  }

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const r = this.rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dxp = x - p.x;
    p.x = x;
    p.y = y;
    if (this.camDrag && this.camDrag.id === e.pointerId) {
      this.cam.yawTarget -= dxp * 0.009;
      this.cam.yaw = this.cam.yawTarget;
      return;
    }
    if (this.pinch && this.pointers.size >= 2) {
      const ps = [...this.pointers.values()];
      const a = ps[0]!;
      const b = ps[1]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      this.cam.yawTarget -= (mx - this.pinch.mx) * 0.01;
      this.cam.yaw = this.cam.yawTarget;
      if (this.pinch.d > 20 && d > 20) this.userDist = clamp(this.userDist * (this.pinch.d / d), 6, 24);
      this.pinch = { d, mx };
      return;
    }
    if (this.drag && this.drag.id === e.pointerId) {
      this.drag.x = x;
      this.drag.y = y;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.camDrag?.id === e.pointerId) this.camDrag = null;
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag && this.drag.id === e.pointerId) {
      const d = this.drag;
      this.drag = null;
      if (e.type === 'pointerup' && this.phase === 'aim' && d.power > 0.04) this.pendingShot = { dx: d.dx, dz: d.dz, p: d.power };
      else {
        this.aim.hide();
        this.hud.setPower(false);
      }
    }
  };

  private onLost = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) this.onUp(new PointerEvent('pointercancel', { pointerId: e.pointerId }));
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.userDist = clamp(this.userDist * (1 + clamp(e.deltaY, -100, 100) * 0.0015), 6, 24);
  };

  private onContext = (e: Event): void => {
    e.preventDefault();
  };

  private onCardTap = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.phase === 'card') this.tapped = true;
  };

  private cancelPointers(): void {
    this.pointers.clear();
    this.drag = null;
    this.camDrag = null;
    this.pinch = null;
    this.aim.hide();
    this.hud.setPower(false);
  }

  /** Turn the finger's pull into a direction and a strength. */
  private pointerAim(): void {
    const d = this.drag!;
    const b = this.world.ball;
    let ax = d.ax;
    let ay = d.ay;
    if (d.onBall) {
      const s = this.toScreen(b.x, b.y, b.z);
      if (s) {
        ax = s.x;
        ay = s.y;
      }
    }
    const px = d.x - ax;
    const py = d.y - ay;
    const len = Math.hypot(px, py);
    const full = clamp(Math.min(this.w, this.h) * 0.32, 120, 300);
    d.power = clamp((len - 12) / full, 0, 1);
    if (len < 4) return;
    let dx = 0;
    let dz = 0;
    if (this.toGround(ax, ay, b.y, this.v1) && this.toGround(d.x, d.y, b.y, this.v2)) {
      dx = this.v1.x - this.v2.x;
      dz = this.v1.z - this.v2.z;
    }
    if (Math.hypot(dx, dz) < 1e-4) {
      // fall back on the camera's own axes
      const yaw = this.cam.yaw;
      dx = -(Math.cos(yaw) * px + Math.sin(yaw) * py);
      dz = -(-Math.sin(yaw) * px + Math.cos(yaw) * py);
    }
    const l = Math.hypot(dx, dz) || 1;
    d.dx = dx / l;
    d.dz = dz / l;
    this.aimYaw = Math.atan2(-d.dx, -d.dz);
  }
}

