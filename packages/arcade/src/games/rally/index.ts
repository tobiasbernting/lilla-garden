// Rallyt: a little 3D racing game round the farm. Three laps against five farm animals in rally cars,
// through golden-hour countryside: crests, a hairpin, a gravel stretch through the forest, a bridge
// over the stream and a chicane. Countdown lights, live positions, a minimap, and confetti at the end.
import * as THREE from 'three';
import { Loop } from '../../kit.ts';
import type { GameContext, GameInstance } from '../../types.ts';
import { Driver, steerTo } from './ai.ts';
import { RallyAudio } from './audio.ts';
import { Car, collideCars, Ground_, type Controls } from './car.ts';
import { Confetti, Particles, Skids } from './fx.ts';
import { blobTex } from './geo.ts';
import { Hud, type Racer } from './hud.ts';
import { carModel, WHEELS, WHEEL_R, type CarModel, type Driver as Face } from './models.ts';
import { buildRoad, type Road } from './road.ts';
import { buildScenery, type Scenery } from './scenery.ts';
import { buildSky, type Sky } from './sky.ts';
import { Terrain, buildFields, buildWater, type Water } from './terrain.ts';
import { Fence, Track } from './track.ts';
import { clamp, damp, fmtTime, lerp, ordinal, smooth, wrapAngle } from './util.ts';

const CAMS = ['Bakom bilen', 'På huven', 'Långt bakom'];

interface Entrant {
  name: string;
  color: string;
  car: Car;
  model: CarModel;
  ai: Driver | null;
  ctl: Controls;
  /** Distance raced along the centre line (continuous, negative on the grid). */
  u: number;
  lastS: number;
  rate: number;
  lapsDone: number;
  finished: boolean;
  finishTime: number;
  basePower: number;
  stuckT: number;
  offT: number;
  emit: number;
}

const ROSTER: { name: string; face: Face; skill: number; power: number; bias: number; wobble: number }[] = [
  { name: 'Kossan Mu', face: 'cow', skill: 0.93, power: 1.0, bias: 0.3, wobble: 0.4 },
  { name: 'Hästen Blixt', face: 'horse', skill: 0.91, power: 0.98, bias: -0.6, wobble: 0.8 },
  { name: 'Grisen Kurre', face: 'pig', skill: 0.88, power: 0.96, bias: 0.9, wobble: 1.0 },
  { name: 'Tuppen Kuckeli', face: 'rooster', skill: 0.86, power: 0.94, bias: -1.0, wobble: 1.2 },
  { name: 'Fåret Ull', face: 'sheep', skill: 0.83, power: 0.91, bias: 0.2, wobble: 0.9 },
];
const PALETTE = ['#2f6fe0', '#f4c20d', '#2fa84f', '#8a4fd8', '#ff8a1f', '#e8412c', '#18b7c9', '#f06ba8', '#f2f2f2'];

/** Opponent colours as far from the player's as possible. */
function pickColors(player: string, n: number): string[] {
  const pc = new THREE.Color(player);
  const ph = pc.getHSL({ h: 0, s: 0, l: 0 });
  const scored = PALETTE.map((c) => {
    const h = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 });
    let dh = Math.abs(h.h - ph.h);
    dh = Math.min(dh, 1 - dh);
    const d = dh * 2 + Math.abs(h.l - ph.l) * 0.6 + Math.abs(h.s - ph.s) * 0.3;
    return { c, d };
  });
  return scored
    .filter((s) => s.d > 0.12)
    .sort((a, b) => b.d - a.d)
    .slice(0, n)
    .map((s) => s.c);
}

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Test hooks, only in the lab (dev build) with rally… in the address: an autopilot, a fast-forward and a readout. */
const Q = new URLSearchParams(import.meta.env.DEV && typeof location !== 'undefined' ? location.search : '');
const DEBUG = Q.has('rallydebug');
const AUTO = Q.has('rallyauto') ? Number(Q.get('rallyauto')) || 0.9 : 0;
const TURBO = Math.max(1, Math.min(30, Number(Q.get('rallyturbo')) || 1));
const TONE = Q.get('rallytone');
const SKIP = Math.max(1, Number(Q.get('rallyskip')) || 1);
const AT = Q.has('rallyat') ? Number(Q.get('rallyat')) : NaN;
const CAM0 = Number(Q.get('rallycam')) || 0;
const GO = Q.has('rallygo');
const LAPS = Math.max(1, Math.min(9, Number(Q.get('rallylaps')) || 3));

const rally = (ctx: GameContext): GameInstance => {
  const high = ctx.quality === 'high';
  let destroyed = false;
  let paused = false;
  let loop: Loop | null = null;
  const track = new Track();
  const hud = new Hud(ctx.root, track, ctx.dpr, ctx.touch);
  const audio = new RallyAudio(ctx.audio, ctx.out);

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: high && ctx.dpr < 1.6, powerPreference: 'high-performance' });
  renderer.setPixelRatio(ctx.dpr);
  renderer.toneMapping = TONE === 'aces' ? THREE.ACESFilmicToneMapping : TONE === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  ctx.root.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 5200);
  let W = 1;
  let H = 1;
  const fit = (): void => {
    const r = ctx.root.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(ctx.root);
  fit();

  // ---- the world, built over a few frames behind a loading card ----
  let sky: Sky;
  let terrain: Terrain;
  let road: Road;
  let water: Water;
  let scenery: Scenery;
  let particles: Particles;
  let skids: Skids;
  let confetti: Confetti;
  const timeU = { value: 0 };
  const entrants: Entrant[] = [];
  const disposers: (() => void)[] = [];
  const ground = { height: (x: number, z: number): number => terrain.height(x, z) };

  const build = async (): Promise<void> => {
    sky = buildSky(renderer, ctx.quality);
    scene.add(sky.mesh, sky.sun, sky.sun.target, sky.hemi);
    scene.fog = sky.fog;
    scene.background = sky.fog.color.clone();
    disposers.push(() => sky.dispose());
    hud.progress(0.15);
    await nextFrame();
    if (destroyed) return;
    terrain = new Terrain(track, ctx.quality);
    scene.add(terrain.mesh);
    disposers.push(() => terrain.dispose());
    hud.progress(0.4);
    await nextFrame();
    if (destroyed) return;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    road = buildRoad(track, terrain, ctx.quality, aniso);
    scene.add(road.group);
    disposers.push(() => road.dispose());
    for (const m of buildFields(terrain, ctx.quality)) {
      scene.add(m);
      disposers.push(() => {
        m.geometry.dispose();
        const mt = m.material as THREE.MeshLambertMaterial;
        mt.map?.dispose();
        mt.dispose();
      });
    }
    water = buildWater(sky.env);
    for (const m of water.meshes) scene.add(m);
    disposers.push(() => water.dispose());
    hud.progress(0.6);
    await nextFrame();
    if (destroyed) return;
    scenery = buildScenery(track, terrain, ctx.quality, timeU);
    scene.add(scenery.group);
    disposers.push(() => scenery.dispose());
    hud.progress(0.85);
    await nextFrame();
    if (destroyed) return;
    // cars
    const shadowTex = blobTex(64, 0.3);
    disposers.push(() => shadowTex.dispose());
    const colors = pickColors(ctx.player.color, ROSTER.length);
    const playerSlot = 4;
    let ai = 0;
    for (let slot = 0; slot < ROSTER.length + 1; slot++) {
      const me = slot === playerSlot;
      const r = me ? null : ROSTER[ai]!;
      const color = me ? ctx.player.color : colors[ai] ?? PALETTE[ai]!;
      const model = carModel(color, me ? 'human' : r!.face, me ? 1 : ai + 2, shadowTex, sky.env);
      scene.add(model.root, model.shadow);
      disposers.push(() => model.dispose());
      const car = new Car(track);
      const s = -11 - slot * 9;
      const d = slot % 2 ? -3.4 : 3.4;
      car.place(s, d, ground);
      const kid = ctx.touch;
      let driver: Driver | null = null;
      let power = 1;
      if (r) {
        driver = new Driver({ skill: r.skill * (kid ? 0.93 : 1), bias: r.bias, lineUse: 0.85 + r.skill * 0.15, wobble: r.wobble, phase: ai * 1.7 });
        power = r.power * (kid ? 0.92 : 1);
        car.assist = 0.75;
        ai++;
      } else {
        car.assist = kid ? 0.75 : 0.45;
        car.traction = kid ? 0.75 : 0.85;
      }
      car.power *= power;
      entrants.push({
        name: me ? ctx.player.name || 'Du' : r!.name,
        color,
        car,
        model,
        ai: driver,
        ctl: { throttle: 0, brake: 0, steer: 0, handbrake: false },
        u: s,
        lastS: car.proj.s,
        rate: 0,
        lapsDone: 0,
        finished: false,
        finishTime: 0,
        basePower: car.power,
        stuckT: 0,
        offT: 0,
        emit: 0,
      });
    }
    particles = new Particles(high ? 1600 : 600);
    skids = new Skids(high ? 3000 : 1200);
    confetti = new Confetti(high ? 420 : 200);
    scene.add(particles.points, skids.mesh, confetti.mesh);
    disposers.push(
      () => particles.dispose(),
      () => skids.dispose(),
      () => confetti.dispose(),
    );
    hud.progress(1);
    // warm up the shaders so the first frames do not stutter
    placeCamera(0);
    syncModels(0);
    renderer.compile(scene, camera);
    await nextFrame();
    if (destroyed) return;
    hud.ready();
    if (DEBUG) {
      // where the triangles go
      const tally: Record<string, number> = {};
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh && !(o as THREE.Points).isPoints) return;
        const g = m.geometry;
        if (!g) return;
        const tri = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        const key = `${o.parent === scene ? 'scene' : o.parent?.type}:${(o as THREE.InstancedMesh).isInstancedMesh ? 'inst' : 'mesh'}:${Math.round(tri)}`;
        tally[key] = (tally[key] ?? 0) + tri * inst;
      });
      (window as unknown as { __rallyTris: unknown }).__rallyTris = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([k, v]) => `${k}=${Math.round(v)}`);
    }
    loop = new Loop((dt) => {
      for (let k = 0; k < TURBO && !ended; k++) update(dt);
    }, render);
    if (paused) loop.pause();
    audio.music(0.6);
  };

  const player = (): Entrant => entrants[4]!;

  // ---- race state ----
  type Phase = 'intro' | 'count' | 'race' | 'finish' | 'over';
  let phase: Phase = GO ? 'count' : 'intro';
  let phaseT = GO ? 2.99 : 0;
  let raceT = 0;
  let lastLight = -1;
  let camMode = CAM0;
  let steerIn = 0;
  let thrIn = 0;
  let wrongT = 0;
  let wrongShown = false;
  let bestLap = Infinity;
  let lapStart = 0;
  let allDoneT = -1;
  let shake = 0;
  let cheerCd = 0;
  let thrPrev = false;
  let boosted = false;
  let place = 1;
  let ended = false;
  let finishPlace = 0;
  let finishTime = 0;
  let slowNote = 0;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camYaw = 0;
  let camFov = 62;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const colDust = new THREE.Color('#c9b48a');
  const colSmoke = new THREE.Color('#d9d6d0');
  const colGrass = new THREE.Color('#6f9a3f');
  const colDirt = new THREE.Color('#8a7350');
  const colSkid = new THREE.Color('#16161a');
  const colRut = new THREE.Color('#5d4a32');
  const colHay = new THREE.Color('#e8c862');
  const colSpark = new THREE.Color('#ffffff');
  const colFlame = new THREE.Color('#ffb040');

  function ranking(): Entrant[] {
    return [...entrants].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.u - a.u;
    });
  }

  function score(pl: number, total: number): number {
    const pts = [11000, 8000, 6200, 5000, 4000, 3200];
    const base = pts[pl - 1] ?? 3000;
    const ideal = track.idealLap * LAPS;
    const fast = ideal * 1.04 + 3;
    const slow = ideal * 1.6;
    const t = clamp((slow - total) / (slow - fast), 0, 1);
    return Math.round(base + 10000 * t * t);
  }

  // ---- controls ----
  function playerControls(dt: number, e: Entrant): void {
    const inp = ctx.input;
    const trig = inp.triggers();
    let thr = Math.max(inp.down('up') ? 1 : 0, trig.right);
    let brk = Math.max(inp.down('down') ? 1 : 0, trig.left);
    const dig = (inp.down('left') ? 1 : 0) - (inp.down('right') ? 1 : 0);
    if (dig !== 0) steerIn = clamp(steerIn + Math.sign(dig - steerIn) * Math.min(Math.abs(dig - steerIn), (Math.sign(dig) !== Math.sign(steerIn) ? 9 : 5) * dt), -1, 1);
    else {
      const ax = -inp.stick(0).x;
      if (Math.abs(ax) > 0.04) steerIn = ax;
      else steerIn = damp(steerIn, 0, 10, dt);
    }
    const car = e.car;
    const p = car.proj;
    const hw = track.at(track.hw, p.s);
    // kids on touch screens: the car drives itself, slowing for bends; they steer
    if (ctx.touch && brk < 0.1 && phase === 'race') {
      const v = Math.max(0, car.vLong);
      const target = track.at(track.vmax, p.s + 4 + v * 0.3) * 0.95;
      if (v > target + 2.5) {
        thr = 0;
        brk = clamp((v - target - 2.5) / 7, 0, 0.55);
      } else thr = Math.max(thr, v > target ? 0.4 : 1);
    }
    thrIn = thr > thrIn ? Math.min(thr, thrIn + dt * 6) : thr;
    // a gentle hand keeping the car on the road (strong for the little ones)
    const w = ctx.touch ? 0.55 : 0.14;
    const v = Math.max(0, car.vLong);
    const off = clamp(p.d, -(hw - 2.6), hw - 2.6);
    const assist = steerTo(car, track, 6 + v * 0.45, off);
    let steer = steerIn + w * assist * (1 - 0.65 * Math.abs(steerIn));
    if (Math.abs(p.d) > hw - 1.2 && Math.sign(p.d) * Math.sin(car.heading - track.heading(p.s)) > 0) steer += (ctx.touch ? 0.3 : 0.1) * -Math.sign(p.d);
    e.ctl.throttle = thrIn;
    e.ctl.brake = brk;
    e.ctl.steer = clamp(steer, -1, 1);
    e.ctl.handbrake = inp.down('a');
  }

  // ---- respawn ----
  function respawn(e: Entrant): void {
    const c = e.car;
    const s = c.proj.s - 4;
    let d = 0;
    for (const cand of [0, 3.6, -3.6, 0]) {
      d = cand;
      const p = track.point(s, cand);
      if (!entrants.some((o) => o !== e && Math.hypot(o.car.x - p.x, o.car.z - p.z) < 5)) break;
    }
    poof(c.x, c.y, c.z);
    c.place(s, d, ground);
    c.ghost = 2.2;
    e.lastS = c.proj.s;
    e.stuckT = 0;
    e.offT = 0;
    poof(c.x, c.y, c.z);
    if (e === player()) {
      audio.poof();
      hud.toast('Tillbaka på vägen!');
    }
  }

  function poof(x: number, y: number, z: number): void {
    for (let k = 0; k < (high ? 26 : 12); k++) {
      const a = (k / 26) * Math.PI * 2;
      particles.emit({ x, y: y + 0.8, z, vx: Math.cos(a) * 5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 5, life: 0.8, size0: 1.2, size1: 2.8, color: colSpark, alpha: 0.8, drag: 3 });
    }
  }

  // ---- per-frame effects for one car ----
  function carEffects(e: Entrant, dt: number, isPlayer: boolean): void {
    const c = e.car;
    if (c.air) {
      for (let w = 0; w < 4; w++) skids.lift(entrants.indexOf(e) * 4 + w);
      return;
    }
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    const rate = high ? 1 : 0.45;
    const sp = c.speed;
    e.emit += dt;
    const idx = entrants.indexOf(e);
    for (let w = 0; w < 4; w++) {
      const [wx, wz] = WHEELS[w]!;
      const x = c.x + sinH * wz + cosH * wx;
      const z = c.z + cosH * wz - sinH * wx;
      const rear = w >= 2;
      const slip = rear ? Math.max(c.slip, c.wheelspin) : c.frontSlip * smooth(3, 8, sp);
      const id = idx * 4 + w;
      const onRoad = c.surface === Ground_.Asphalt || c.surface === Ground_.Kerb;
      if (slip > 0.38 && onRoad) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.26, colSkid, clamp(slip * 0.55, 0.15, 0.5));
      else if (c.surface === Ground_.Gravel && rear && sp > 3 && (isPlayer || slip > 0.3)) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.32, colRut, 0.22);
      else skids.lift(id);
      if (!rear) continue;
      // dust on gravel
      if (c.surface === Ground_.Gravel && sp > 4 && Math.random() < rate * (0.25 + sp / 40)) {
        particles.emit({
          x: x + (Math.random() - 0.5) * 0.6,
          y: c.y + 0.3,
          z: z + (Math.random() - 0.5) * 0.6,
          vx: -sinH * sp * 0.15 + (Math.random() - 0.5) * 2,
          vy: 0.8 + Math.random() * 1.2,
          vz: -cosH * sp * 0.15 + (Math.random() - 0.5) * 2,
          life: 1.6 + Math.random() * 1.4,
          size0: 1.0,
          size1: 4.2 + sp * 0.06,
          color: colDust,
          alpha: 0.4,
          drag: 1.4,
          gravity: -0.15,
        });
      }
      // smoke when sliding on tarmac
      if (onRoad && slip > 0.35 && Math.random() < rate * slip * 0.9) {
        particles.emit({ x, y: c.y + 0.25, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 1.2 + Math.random(), size0: 0.7, size1: 3.2, color: colSmoke, alpha: 0.42 * slip, drag: 1.8, gravity: -0.3 });
      }
      // grass and earth flying off the tyres
      if (c.surface === Ground_.Grass && sp > 5 && Math.random() < rate * 0.6) {
        particles.emit({ x, y: c.y + 0.2, z, vx: -sinH * sp * 0.25 + (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 2.5, vz: -cosH * sp * 0.25 + (Math.random() - 0.5) * 2.5, life: 0.7, size0: 0.25, size1: 0.18, color: Math.random() < 0.6 ? colGrass : colDirt, alpha: 0.95, drag: 0.6, gravity: 9 });
        if (Math.random() < 0.3) particles.emit({ x, y: c.y + 0.3, z, vy: 0.6, life: 1.2, size0: 0.8, size1: 2.6, color: colDirt, alpha: 0.3, drag: 2 });
      }
    }
  }

  // ---- the game loop ----
  function update(dt: number): void {
    const inp = ctx.input;
    phaseT += dt;
    timeU.value += dt;
    const me = player();
    // phase transitions
    if (phase === 'intro') {
      if (phaseT < dt * 1.5) {
        hud.msg('Gör dig redo!', 1700, 'small');
        hud.subtitle(ctx.touch ? 'Bilen gasar själv – du styr med ◀ ▶' : 'Gasa när lampan blir grön!');
      }
      if (phaseT > 2.6) {
        phase = 'count';
        phaseT = 0;
      }
    } else if (phase === 'count') {
      const n = Math.min(3, Math.floor(phaseT) + 1);
      if (phaseT < 3 && n !== lastLight) {
        lastLight = n;
        road.setLights(n, false);
        hud.lights(n, false, true);
        hud.msg(String(4 - n), 800);
        audio.beep(false);
      }
      if (phaseT >= 3) {
        phase = 'race';
        phaseT = 0;
        raceT = 0;
        lapStart = 0;
        road.setLights(4, true);
        hud.lights(4, true, true);
        hud.msg('KÖR!', 900, 'go');
        hud.subtitle('');
        hud.hideRace(false);
        audio.beep(true);
        audio.cheer(0.7);
        audio.music(0.32);
        thrPrev = me.ctl.throttle > 0.5;
        if (Number.isFinite(AT)) {
          // test hook: start the player somewhere else on the lap, rolling
          me.car.place(AT, 0, ground);
          const h = me.car.heading;
          me.car.vx = Math.sin(h) * 18;
          me.car.vz = Math.cos(h) * 18;
          me.lastS = me.car.proj.s;
          me.u = AT;
          camPos.set(me.car.x - Math.sin(h) * 7, me.car.y + 2.5, me.car.z - Math.cos(h) * 7);
          camYaw = h;
        }
      }
    } else if (phase === 'race') {
      raceT += dt;
      if (phaseT > 1.4 && phaseT - dt <= 1.4) {
        hud.lights(0, false, false);
        road.setLights(0, false);
      }
      // a rocket start for pressing the gas just as it turns green
      if (!boosted && phaseT < 0.45) {
        const on = me.ctl.throttle > 0.5;
        if (on && !thrPrev) {
          boosted = true;
          me.car.launch = 1.6;
          hud.toast('🚀 Raketstart!');
          audio.boost();
        }
        thrPrev = on;
      }
    } else if (phase === 'finish') {
      raceT += dt;
      if (phaseT > 5.6 && !ended) {
        ended = true;
        phase = 'over';
        const sc = finishPlace > 0 ? score(finishPlace, finishTime) : 1200 + Math.round(1800 * clamp(me.u / (LAPS * track.length), 0, 1));
        const detail = finishPlace > 0 ? `${ordinal(finishPlace)} plats · ${fmtTime(finishTime)}` : `Nästan i mål! · ${Math.min(LAPS, me.lapsDone)} av ${LAPS} varv`;
        if (DEBUG) (window as unknown as { __rallyEnd: unknown }).__rallyEnd = { score: sc, detail };
        // the result card goes over the last frame: leave the picture, not the HUD
        hud.root.style.display = 'none';
        ctx.end(sc, detail);
      }
    }
    const racing = phase === 'race' || phase === 'finish' || phase === 'over';

    // ---- controls ----
    for (const e of entrants) {
      if (e === me && !me.finished && phase !== 'over' && !AUTO) playerControls(dt, e);
      else if (e.ai || e === me) {
        const drv = e.ai ?? (me.ai = new Driver({ skill: AUTO && !me.finished ? AUTO : 0.62, bias: 0, lineUse: 0.6, wobble: 0, phase: 0 }));
        // rubber band: ease off when far ahead of the player, push a little when far behind
        let mul = 1;
        if (e !== me && !me.finished) {
          const gap = e.u - me.u;
          if (gap > 20) mul = 1 - Math.min(ctx.touch ? 0.2 : 0.13, (gap - 20) / (ctx.touch ? 500 : 800));
          else if (gap < -30) mul = 1 + Math.min(0.06, (-gap - 30) / 1200);
          e.car.power = e.basePower * (gap < -30 ? 1 + Math.min(0.08, (-gap - 30) / 1000) : gap > 60 ? 0.93 : 1);
        }
        if (e.finished) mul = Math.min(mul, 0.72);
        drv.drive(e.car, track, entrants.map((x) => x.car), mul, timeU.value + entrants.indexOf(e), dt, e.ctl);
        if (!racing) {
          e.ctl.throttle = Math.random() < 0.04 ? 0.8 : e.ctl.throttle * 0.9;
          e.ctl.brake = 0;
        }
      }
    }
    // ---- physics (two steps a frame) ----
    for (let k = 0; k < 2; k++) {
      for (const e of entrants) e.car.step(dt / 2, e.ctl, ground, !racing);
      if (racing)
        collideCars(
          entrants.map((x) => x.car),
          (a, b, j) => {
            if (a === 4 || b === 4) {
              audio.bump(j);
              shake = Math.max(shake, Math.min(0.5, j * 0.06));
            }
          },
        );
    }
    for (const e of entrants) e.car.settle(dt, ground);

    // ---- race bookkeeping ----
    for (const e of entrants) {
      const c = e.car;
      const ds = track.wrapDist(c.proj.s - e.lastS);
      e.lastS = c.proj.s;
      if (racing) e.u += ds;
      e.rate = damp(e.rate, ds / dt, 2, dt);
      const done = Math.floor(e.u / track.length);
      if (racing && done > e.lapsDone && e.u > 0) {
        e.lapsDone = done;
        if (e === me && !me.finished) onPlayerLap();
        if (e.lapsDone >= LAPS && !e.finished) {
          e.finished = true;
          e.finishTime = raceT;
          if (e === me) onPlayerFinish();
        }
      }
      // stuck or lost: back onto the road
      if (phase === 'race' && !e.finished) {
        const hw = track.at(track.hw, c.proj.s);
        const trying = e.ctl.throttle > 0.3 || e.ctl.brake > 0.3;
        if (c.speed < 1.6 && trying) e.stuckT += dt;
        else e.stuckT = Math.max(0, e.stuckT - dt * 2);
        if (Math.abs(c.proj.d) > hw + 1.5 && e.rate < (e.ai ? 5 : 7)) e.offT += dt;
        else e.offT = Math.max(0, e.offT - dt);
        if (e.stuckT > (e.ai ? 2.2 : 2.8) || e.offT > (e.ai ? 4 : 6)) respawn(e);
      }
    }
    if (phase === 'race' && !me.finished && (inp.keyPressed('KeyR') || inp.pressed('b'))) respawn(me);

    // positions
    const order = ranking();
    place = order.indexOf(me) + 1;
    if (phase === 'race' && entrants.every((e) => e === me || e.finished) && !me.finished) {
      if (allDoneT < 0) allDoneT = 0;
      allDoneT += dt;
      const left = Math.ceil(30 - allDoneT);
      if (left !== slowNote) {
        slowNote = left;
        hud.subtitle(`Alla andra är i mål – ${left} s kvar!`);
      }
      if (allDoneT > 30) {
        hud.subtitle('');
        phase = 'finish';
        phaseT = 0;
        finishPlace = 0;
        hud.msg('Bra kämpat!', 2500, 'small gold');
        audio.fanfare(false);
      }
    }
    if (raceT > 600 && phase === 'race') {
      phase = 'finish';
      phaseT = 0;
      finishPlace = 0;
    }

    // wrong way
    if (phase === 'race' && !me.finished) {
      const th = track.heading(me.car.proj.s);
      const facing = Math.cos(me.car.heading - th);
      const along = me.car.vx * Math.sin(th) + me.car.vz * Math.cos(th);
      if ((facing < -0.3 && me.car.speed > 3) || along < -7) wrongT += dt;
      else wrongT = Math.max(0, wrongT - dt * 3);
      const show = wrongT > 1.1;
      if (show && !wrongShown) audio.wrongWay();
      wrongShown = show;
      hud.wrongWay(show);
    } else hud.wrongWay(false);

    // ---- events: fences, landings, crowd ----
    for (const e of entrants) {
      const c = e.car;
      const isMe = e === me;
      if (c.wallHit > 1.5) {
        const hay = c.wallKind === Fence.Bales;
        if (isMe) {
          if (hay) audio.hay(c.wallHit);
          else audio.thud(c.wallHit);
          shake = Math.max(shake, Math.min(0.6, c.wallHit * 0.05));
        }
        const n = Math.min(14, Math.round(c.wallHit * 1.5));
        for (let k = 0; k < (high ? n : n / 2); k++)
          particles.emit({ x: c.x, y: c.y + 0.7, z: c.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.9, size0: hay ? 0.35 : 0.9, size1: hay ? 0.25 : 2.2, color: hay ? colHay : colDirt, alpha: hay ? 1 : 0.4, drag: 1.2, gravity: hay ? 6 : 0 });
      }
      c.wallHit = 0;
      if (c.landed > 1.5) {
        if (isMe) {
          audio.thud(c.landed * 1.3);
          shake = Math.max(shake, Math.min(0.5, c.landed * 0.07));
        }
        for (let k = 0; k < (high ? 16 : 7); k++) {
          const a = Math.random() * Math.PI * 2;
          particles.emit({ x: c.x + Math.cos(a) * 1.4, y: c.y + 0.2, z: c.z + Math.sin(a) * 1.8, vx: Math.cos(a) * 3, vy: 0.6, vz: Math.sin(a) * 3, life: 1.2, size0: 1.0, size1: 3.4, color: c.surface === Ground_.Gravel ? colDust : colSmoke, alpha: 0.4, drag: 2 });
        }
      }
      c.landed = 0;
      // backfire on a quick upshift at high revs
      if (c.shifted > 0 && isMe && c.throttleIn > 0.8) {
        if (Math.random() < 0.45) {
          audio.pop();
          const sinH = Math.sin(c.heading);
          const cosH = Math.cos(c.heading);
          particles.emit({ x: c.x - sinH * 2.2 - cosH * 0.5, y: c.y + 0.32, z: c.z - cosH * 2.2 + sinH * 0.5, vx: -sinH * 3, vy: 0.3, vz: -cosH * 3, life: 0.18, size0: 0.6, size1: 0.2, color: colFlame, alpha: 1, drag: 4 });
        }
      }
    }
    cheerCd = Math.max(0, cheerCd - dt);
    if (racing && cheerCd <= 0 && me.car.speed > 10) {
      for (const cp of scenery.crowds)
        if (Math.hypot(me.car.x - cp.x, me.car.z - cp.z) < 34) {
          audio.cheer(0.8);
          cheerCd = 9;
        }
    }

    // ---- sound ----
    const mc = me.car;
    audio.playerEngine(mc.rpm, mc.throttleIn, mc.shifted);
    for (const e of entrants) e.car.shifted = 0;
    const onRoad = mc.surface === Ground_.Asphalt || mc.surface === Ground_.Kerb;
    const sp = mc.speed;
    audio.surface(
      onRoad && !mc.air ? clamp((mc.slip - 0.25) * 1.6, 0, 1) : 0,
      mc.surface === Ground_.Gravel && !mc.air ? clamp(sp / 25, 0, 1) : 0,
      mc.surface === Ground_.Grass && !mc.air ? clamp(sp / 20, 0, 1) : 0,
      mc.onKerb && sp > 3 && !mc.air ? clamp(sp / 20, 0.3, 1) : 0,
      sp,
    );
    const near = entrants
      .filter((e) => e !== me)
      .map((e) => ({ e, d: Math.hypot(e.car.x - mc.x, e.car.z - mc.z) }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2; k++) {
      const n = near[k];
      if (n) audio.otherEngine(k, n.e.car.rpm, Math.pow(clamp(1 - n.d / 70, 0, 1), 2));
    }

    // ---- effects ----
    for (const e of entrants) carEffects(e, dt, e === me);
    particles.update(dt);
    skids.flush();
    confetti.update(dt, timeU.value);
    road.update(timeU.value);
    water.update(timeU.value);
    scenery.update(timeU.value, tmpV.set(mc.x, mc.y, mc.z), phase === 'finish' || phase === 'over' ? 1 : phase === 'count' || (phase === 'race' && phaseT < 3) ? 0.8 : 0);
    if (phase === 'finish' && phaseT < 3.2) {
      const k = Math.floor(phaseT / 0.8);
      if (k !== Math.floor((phaseT - dt) / 0.8)) {
        const g = track.point(0, 0);
        confetti.burst(g.x, g.y + 9, g.z, high ? 90 : 45, 7);
        confetti.burst(mc.x, mc.y + 2, mc.z, high ? 50 : 25, 6);
      }
    }

    // ---- HUD ----
    if (racing) {
      const shownLap = Math.min(LAPS, me.lapsDone + 1);
      hud.setPosition(me.finished ? finishPlace || place : place, entrants.length, me.finished ? LAPS + 1 : shownLap, LAPS);
      hud.setTimes(me.finished ? finishTime : raceT, me.finished ? 0 : raceT - lapStart, bestLap);
      if (hudBoard) hud.setBoard(order.map((e) => toRacer(e)));
    }

    // camera input
    if (inp.pressed('c')) {
      camMode = (camMode + 1) % 3;
      hud.toast(`🎥 ${CAMS[camMode]}`);
    }
    shake = Math.max(0, shake - dt * 1.4);
    syncModels(timeU.value);
    placeCamera(dt);
    inp.frame();
  }

  const hudBoard = true;
  const toRacer = (e: Entrant): Racer => ({ name: e.name, color: e.color, me: e === player(), done: e.finished, x: e.car.x, z: e.car.z });

  function onPlayerLap(): void {
    const me = player();
    const lt = raceT - lapStart;
    lapStart = raceT;
    const best = lt < bestLap;
    bestLap = Math.min(bestLap, lt);
    if (me.lapsDone >= LAPS) return;
    if (me.lapsDone === LAPS - 1) {
      hud.msg('Sista varvet!', 1800, 'small gold');
      audio.lap(true);
    } else {
      hud.msg(`Varv ${me.lapsDone + 1}`, 1300, 'small');
      audio.lap(false);
    }
    hud.toast(`${best && me.lapsDone > 1 ? '⭐ Bästa varvet! ' : 'Varvtid '}${fmtTime(lt)}`);
  }

  function onPlayerFinish(): void {
    const me = player();
    finishTime = me.finishTime;
    const order = ranking();
    finishPlace = order.indexOf(me) + 1;
    phase = 'finish';
    phaseT = 0;
    hud.msg('MÅL!', 1800, 'gold');
    hud.subtitle(finishPlace === 1 ? `🏆 Du vann! ${fmtTime(finishTime)}` : `Du kom ${ordinal(finishPlace)}! ${fmtTime(finishTime)}`);
    hud.wrongWay(false);
    audio.fanfare(finishPlace === 1);
    audio.cheer(1);
    audio.music(0.75);
  }

  // ---- drawing ----
  const up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncModels(time: number): void {
    for (const e of entrants) {
      const c = e.car;
      const m = e.model;
      m.root.position.set(c.x, c.y, c.z);
      euler.set(-c.slopePitch, c.heading, c.slopeRoll, 'YXZ');
      m.root.quaternion.setFromEuler(euler);
      m.body.position.y = c.susp;
      m.body.rotation.x = clamp(-c.accLong * 0.009, -0.09, 0.07);
      m.body.rotation.z = clamp(c.accLat * 0.007, -0.08, 0.08);
      for (let w = 0; w < 4; w++) {
        const wg = m.wheels[w]!;
        if (w < 2) wg.rotation.y = c.steerAngle;
        wg.children[0]!.rotation.x = w < 2 ? c.wheelRot : c.rearRot;
        wg.position.y = WHEEL_R + Math.max(-0.08, Math.min(0.06, c.susp * 0.3));
      }
      m.brakeMat.color.set(c.braking ? '#ff3a24' : '#701812');
      m.root.visible = c.ghost <= 0 || Math.floor(time * 12) % 2 === 0;
      // blob shadow on the ground, fading as the car flies
      const gy = c.groundAt(c.x, c.z, ground);
      const h = Math.max(0, c.y - gy);
      m.shadow.position.set(c.x, gy + 0.06, c.z);
      m.shadow.rotation.y = c.heading;
      (m.shadow.material as THREE.MeshBasicMaterial).opacity = (high ? 0.38 : 0.55) * clamp(1 - h / 4, 0.15, 1);
      const sc = 1 + h * 0.15;
      m.shadow.scale.set(sc, 1, sc);
    }
  }

  function placeCamera(dt: number): void {
    const me = player();
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    let fov = 62;
    if (phase === 'intro' || dt === 0) {
      // a sweep from in front of the grid round to behind the player
      const f = smooth(0, 2.6, phaseT);
      const ang = c.heading + Math.PI * (0.85 - 0.85 * f);
      const dist = lerp(22, 7, f);
      const hgt = lerp(8, 2.6, f);
      camPos.set(c.x + Math.sin(ang) * dist, c.y + hgt, c.z + Math.cos(ang) * dist);
      camLook.set(c.x + sinH * lerp(-6, 2.5, f), c.y + 1.1, c.z + cosH * lerp(-6, 2.5, f));
      camYaw = c.heading;
      fov = 58;
    } else if (phase === 'finish' || phase === 'over') {
      const ang = c.heading + 2.2 + phaseT * 0.35;
      tmpV.set(c.x + Math.sin(ang) * 8.5, c.y + 2.8, c.z + Math.cos(ang) * 8.5);
      camPos.lerp(tmpV, 1 - Math.exp(-dt * 3));
      camLook.lerp(tmpV2.set(c.x, c.y + 1.0, c.z), 1 - Math.exp(-dt * 6));
      fov = 55;
    } else if (camMode === 1) {
      me.model.root.updateMatrixWorld();
      me.model.body.localToWorld(camPos.set(0, 1.42, 0.95));
      me.model.body.localToWorld(camLook.set(0, 1.2, 25));
      fov = 74 + smooth(5, 45, c.speed) * 10;
    } else {
      const far = camMode === 2;
      const velYaw = c.speed > 4 ? Math.atan2(c.vx, c.vz) : c.heading;
      let target = c.heading;
      if (c.speed > 4 && c.vLong > 0) target = c.heading + wrapAngle(velYaw - c.heading) * 0.4;
      camYaw += wrapAngle(target - camYaw) * (1 - Math.exp(-dt * (far ? 3.5 : 5)));
      const dist = (far ? 13 : 6.6) + c.speed * (far ? 0.05 : 0.035);
      const hgt = far ? 5.4 : 2.45;
      tmpV.set(c.x - Math.sin(camYaw) * dist, c.y + hgt, c.z - Math.cos(camYaw) * dist);
      const gy = terrain.visual(tmpV.x, tmpV.z) + 1.2;
      if (tmpV.y < gy) tmpV.y = gy;
      camPos.lerp(tmpV, 1 - Math.exp(-dt * 9));
      if (camPos.y < gy) camPos.y = gy;
      tmpV2.set(c.x + Math.sin(camYaw) * 2.5, c.y + (far ? 1.2 : 1.15), c.z + Math.cos(camYaw) * 2.5);
      camLook.lerp(tmpV2, 1 - Math.exp(-dt * 14));
      fov = (far ? 56 : 60) + smooth(6, 48, c.speed) * (far ? 8 : 16);
    }
    camFov = dt === 0 ? fov : damp(camFov, fov, 3, dt);
    camera.position.copy(camPos);
    if (shake > 0) {
      const t = timeU.value;
      camera.position.x += Math.sin(t * 61) * shake * 0.25;
      camera.position.y += Math.sin(t * 47 + 1) * shake * 0.2;
      camera.position.z += Math.cos(t * 53) * shake * 0.25;
    }
    camera.up.copy(up);
    camera.lookAt(camLook);
    camera.near = camMode === 1 && phase !== 'finish' && phase !== 'over' ? 0.1 : 0.3;
    if (camera.fov !== camFov || dt === 0) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }
  }

  let frames = 0;
  // a slow machine renders fewer pixels rather than stutter
  let resScale = 1;
  let lastFrame = 0;
  let frameMs = 16;
  let slowT = 0;
  let fastT = 0;
  const adaptive = !DEBUG || Q.has('rallyadapt');
  function adapt(): void {
    const now = performance.now();
    const d = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (!adaptive || d > 250) return;
    frameMs = frameMs * 0.9 + d * 0.1;
    if (frameMs > 23) slowT += d / 1000;
    else slowT = Math.max(0, slowT - d / 2000);
    if (frameMs < 15) fastT += d / 1000;
    else fastT = 0;
    let next = resScale;
    if (slowT > 1.5 && resScale > 0.55) next = Math.max(0.55, resScale * 0.85);
    else if (fastT > 6 && resScale < 1) next = Math.min(1, resScale / 0.85);
    if (next !== resScale) {
      resScale = next;
      slowT = 0;
      fastT = 0;
      renderer.setPixelRatio(Math.max(0.6, ctx.dpr * resScale));
      renderer.setSize(W, H, false);
    }
  }
  function render(): void {
    frames++;
    if (SKIP > 1 && frames % SKIP !== 1) return;
    adapt();
    sky.update(timeU.value, camera, tmpV.set(player().car.x, player().car.y, player().car.z));
    particles.setScale(H * ctx.dpr, camera.fov);
    // the minimap and speedometer
    if (phase !== 'intro') {
      const c = player().car;
      hud.drawSpeedo(Math.abs(c.vLong) * 3.6, c.rpm, c.reverse ? -1 : c.gear, 7000);
      hud.drawMap(entrants.map(toRacer), timeU.value);
    }
    renderer.render(scene, camera);
    if (DEBUG) {
      const me = player();
      (window as unknown as { __rally: unknown }).__rally = {
        phase,
        raceT,
        place,
        laps: me.lapsDone,
        u: me.u,
        speed: me.car.speed,
        ended,
        finishPlace,
        finishTime,
        bestLap,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        others: entrants.map((e) => ({ name: e.name, laps: e.lapsDone, u: Math.round(e.u), done: e.finished, t: e.finishTime })),
      };
    }
  }

  void build().catch((err) => {
    console.error(err);
  });

  return {
    pause() {
      paused = true;
      loop?.pause();
      audio.pause();
    },
    resume() {
      paused = false;
      lastFrame = 0;
      loop?.resume();
      audio.resume();
    },
    destroy() {
      destroyed = true;
      loop?.stop();
      ro.disconnect();
      audio.destroy();
      hud.destroy();
      for (const d of disposers) {
        try {
          d();
        } catch (err) {
          console.error(err);
        }
      }
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mt of mats) {
          for (const v of Object.values(mt)) if (v instanceof THREE.Texture) v.dispose();
          mt.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};

export default rally;
