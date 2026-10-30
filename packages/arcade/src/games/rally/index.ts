// Rallyt: a little 3D racing game round the farm. Three laps against five farm animals in rally cars,
// through golden-hour countryside: crests, a hairpin, a gravel stretch through the forest, a bridge
// over the stream and a chicane. Countdown lights, live positions, a minimap, and confetti at the end.
//
// Rallyvärlden opens it with RallyOptions (options.ts): one of five courses, the room's rules (laps,
// computer cars, difficulty, time of day, rain, damage, nitro, pickups), the player's own garage car, a
// race online with the family, a time trial against your own ghost, or a free drive round the farm
// collecting coins. Without options it plays the arcade race exactly as it always did.
import * as THREE from 'three';
import { NITRO_SECONDS, RACE_DNF_PRIZE, ROAM_COIN_KR, cleanRules, defaultRules, isRallyCourse, newCar, raceMedal, racePrize, type CarSnap, type GarageCar, type RaceResultLine, type RoomInfo } from '@lilla-garden/shared';
import { Loop } from '../../kit.ts';
import type { GameContext, GameInstance } from '../../types.ts';
import { Driver, steerTo } from './ai.ts';
import { RallyAudio } from './audio.ts';
import { Car, collideCars, Ground_, type Controls } from './car.ts';
import { COURSES } from './courses.ts';
import { Confetti, Particles, Skids } from './fx.ts';
import { blobTex } from './geo.ts';
import { Hud, type Racer, type ResultRow } from './hud.ts';
import { lakeDist } from './layout.ts';
import { carModel, WHEELS, WHEEL_R, type CarModel, type Driver as Face } from './models.ts';
import { rallyOptions, type RallyMode, type RallyNet, type RallyOptions, type RemoteRacer } from './options.ts';
import { buildPickups, pickupAt, placePickups, type Pickup, type PickupMeshes } from './pickups.ts';
import { buildThemeScenery, Weather } from './props.ts';
import { GhostTrack, ghostify, RemoteCar } from './remote.ts';
import { buildRoad, type Road } from './road.ts';
import { RoamWorld, type RoamEvents } from './roam.ts';
import { buildScenery, type Scenery } from './scenery.ts';
import { buildSky, rainy, type Sky } from './sky.ts';
import { Terrain, buildFields, buildWater, type Water } from './terrain.ts';
import { Fence, Track } from './track.ts';
import { aiCar, arcadeCar, damageGrip, damagePower, isBody, smokeColor, tuneFor, type Tune } from './tuning.ts';
import { clamp, damp, fmtTime, lerp, ordinal, smooth, wrapAngle } from './util.ts';

const CAMS = ['Bakom bilen', 'På huven', 'Långt bakom'];

interface Entrant {
  /** Player id, or `ai:<n>` for a computer car. */
  id: string;
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
  tune: Tune;
  /** 0..100 */
  damage: number;
  /** Seconds left in a mud puddle's grip, and of a boost pad's shove (no re-trigger while on it). */
  mudT: number;
  padT: number;
}

/** Anyone on the track, for the standings, the minimap and the name tags. */
interface Runner {
  id: string;
  name: string;
  color: string;
  car: Car;
  u: number;
  finished: boolean;
  finishTime: number;
  me: boolean;
}

const ROSTER: { name: string; face: Face; skill: number; power: number; bias: number; wobble: number }[] = [
  { name: 'Kossan Mu', face: 'cow', skill: 0.93, power: 1.0, bias: 0.3, wobble: 0.4 },
  { name: 'Hästen Blixt', face: 'horse', skill: 0.91, power: 0.98, bias: -0.6, wobble: 0.8 },
  { name: 'Grisen Kurre', face: 'pig', skill: 0.88, power: 0.96, bias: 0.9, wobble: 1.0 },
  { name: 'Tuppen Kuckeli', face: 'rooster', skill: 0.86, power: 0.94, bias: -1.0, wobble: 1.2 },
  { name: 'Fåret Ull', face: 'sheep', skill: 0.83, power: 0.91, bias: 0.2, wobble: 0.9 },
];
const PALETTE = ['#2f6fe0', '#f4c20d', '#2fa84f', '#8a4fd8', '#ff8a1f', '#e8412c', '#18b7c9', '#f06ba8', '#f2f2f2'];
/** Difficulty: the computer cars' courage and how hard the rubber band pulls. */
const DIFF = { easy: { skill: 0.88, power: 0.96, band: 1.35 }, normal: { skill: 1, power: 1, band: 1 }, hard: { skill: 1.06, power: 1.03, band: 0.6 } } as const;

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
const LAPS_Q = Math.max(1, Math.min(9, Number(Q.get('rallylaps')) || 3));

/**
 * The lab's stand-in for Rallyvärlden: ?rallycourse=ice&rallymode=roam&rallyrules=laps:1,ai:3,time:night,
 * weather:rain,damage:1,nitro:1,same:0,pickups:1,difficulty:hard&rallybody=monster&rallyparts=3&rallynet=echo.
 * `rallynet=echo` plays a pretend family member who drives your own line 1.5 s behind you.
 */
function labOptions(player: { name: string; color: string }): RallyOptions | null {
  if (!['rallycourse', 'rallymode', 'rallyrules', 'rallynet', 'rallybody', 'rallyparts'].some((k) => Q.has(k))) return null;
  const raw: Record<string, unknown> = { ...defaultRules(), laps: LAPS_Q };
  const course = Q.get('rallycourse');
  if (isRallyCourse(course)) raw.course = course;
  for (const kv of (Q.get('rallyrules') ?? '').split(',')) {
    const [k, v] = kv.split(':');
    if (!k || v === undefined) continue;
    const key = k === 'same' ? 'sameCars' : k;
    raw[key] = /^\d+$/.test(v) ? (['damage', 'nitro', 'sameCars', 'pickups'].includes(key) ? v === '1' : Number(v)) : v;
  }
  const rules = cleanRules(raw);
  const bodyQ = Q.get('rallybody');
  const car = newCar(1, isBody(bodyQ) ? bodyQ : 'hatch', player.name, player.color);
  const lvl = Math.max(0, Math.min(3, Number(Q.get('rallyparts')) || 0));
  for (const k of Object.keys(car.parts) as (keyof typeof car.parts)[]) car.parts[k] = lvl;
  const modeQ = Q.get('rallymode');
  const mode: RallyMode = modeQ === 'roam' || modeQ === 'timetrial' ? modeQ : 'race';
  const echo = Q.get('rallynet') === 'echo';
  const o: RallyOptions = {
    mode,
    rules,
    car,
    me: 'lab',
    host: true,
    best: Number(Q.get('rallybest')) || undefined,
    onDone: (r) => {
      (window as unknown as { __rallyDone: unknown }).__rallyDone = r;
      console.info('rally done', r);
    },
  };
  if (echo) {
    const twin = newCar(2, 'buggy', 'Ekot', '#2f6fe0');
    twin.style.number = 22;
    o.net = echoNet(twin, rules.laps);
    if (mode === 'race')
      o.room = {
        id: 'lab',
        host: 'lab',
        hostName: player.name,
        rules,
        phase: 'countdown',
        members: [
          { id: 'lab', name: player.name, car, ready: true },
          { id: 'echo', name: 'Ekot', car: twin, ready: true },
        ],
        startAt: Date.now() + 5000,
        seed: 1234,
      };
  }
  return o;
}

/** A pretend server for the lab: echoes my snapshots back as another car, beside my line and 1.5 s late. */
function echoNet(twin: GarageCar, laps: number): RallyNet {
  let snapCb: ((from: string, snaps: CarSnap[]) => void) | null = null;
  let roamCb: ((from: string, snap: CarSnap) => void) | null = null;
  let finishCb: ((from: string, time: number) => void) | null = null;
  let resultCb: ((r: RaceResultLine[]) => void) | null = null;
  const later = (ms: number, f: () => void): void => void setTimeout(f, ms);
  const twinOf = (s: CarSnap): CarSnap => ({ ...s, id: 'echo', x: s.x - Math.cos(s.h) * 5, z: s.z + Math.sin(s.h) * 5 });
  return {
    sendSnaps: (snaps) => {
      const mine = snaps.find((s) => s.id === 'lab');
      if (mine) later(1500, () => snapCb?.('echo', [twinOf(mine)]));
    },
    onSnaps: (cb) => ((snapCb = cb), () => (snapCb = null)),
    onFinish: (cb) => ((finishCb = cb), () => (finishCb = null)),
    sendFinish: (time, _damage, id) => {
      if (id) return;
      later(1600, () => finishCb?.('echo', time + 1600));
      const rules = { ...defaultRules(), laps };
      later(2600, () =>
        resultCb?.([
          { id: 'lab', name: 'Labbet', time, place: 1, prize: racePrize(rules, 1, 2), medal: null },
          { id: 'echo', name: 'Ekot', time: time + 1600, place: 2, prize: racePrize(rules, 2, 2), medal: null },
        ]),
      );
    },
    onResult: (cb) => ((resultCb = cb), () => (resultCb = null)),
    onLeft: () => () => {},
    onRoamSnap: (cb) => ((roamCb = cb), () => (roamCb = null)),
    onRoamPeers: (cb) => {
      later(500, () => cb([{ id: 'echo', name: 'Ekot', car: twin }]));
      return () => {};
    },
    sendRoamSnap: (snap) => later(1500, () => roamCb?.('echo', twinOf(snap))),
    serverNow: () => Date.now(),
  };
}

const rally = (ctx: GameContext): GameInstance => {
  const high = ctx.quality === 'high';
  let destroyed = false;
  let paused = false;
  let loop: Loop | null = null;

  // ---- what we are playing ----
  const opts = rallyOptions(ctx.options) ?? (import.meta.env.DEV ? labOptions(ctx.player) : null);
  const mode: RallyMode = opts?.mode ?? 'race';
  const roam = mode === 'roam';
  const trial = mode === 'timetrial';
  const rules = opts ? cleanRules({ ...opts.rules, ...(roam ? { course: 'farm' } : {}) }) : null;
  const course = COURSES[rules?.course ?? 'farm'];
  const room: RoomInfo | undefined = !roam && !trial ? opts?.room : undefined;
  const net: RallyNet | undefined = opts?.net;
  const online = !!(room && net);
  const host = !online || !!opts?.host;
  const LAPS = rules ? rules.laps : LAPS_Q;
  const rain = rules?.weather === 'rain';
  const timeOfDay = rules?.time ?? 'day';
  const night = course.theme.alwaysNight || timeOfDay === 'night';
  const rainGrip = rain ? 0.85 : 1;
  const diff = DIFF[rules?.difficulty ?? 'normal'];
  /** Damage counts in races with the rule, and a little in free roam. */
  const damageK = roam ? 0.4 : rules?.damage ? 1 : 0;
  const myCar: GarageCar = opts?.car ?? arcadeCar(ctx.player.color);
  const myTune = tuneFor(myCar, !!rules?.sameCars, !!rules?.nitro && !roam);
  /** Free roam: coins that still pay today (the counter and the end card show no more than these). */
  const coinsLeft = Math.max(0, opts?.roamCoinsLeft ?? Infinity);
  const nAi = roam || trial ? 0 : rules ? Math.min(rules.ai, 8 - (room?.members.length ?? 1)) : ROSTER.length;

  const track = new Track(course, rainGrip);
  const hud = new Hud(ctx.root, track, ctx.dpr, ctx.touch);
  // on touch screens the third round button is the camera when there is no nitro (info.ts): no second 🎥 then
  hud.camBtn.classList.toggle('show', ctx.touch && myTune.charges > 0);
  const audio = new RallyAudio(ctx.audio, ctx.out);
  const skyPreset = rain ? rainy(course.theme.sky[timeOfDay]) : course.theme.sky[timeOfDay];

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: high && ctx.dpr < 1.6, powerPreference: 'high-performance' });
  renderer.setPixelRatio(ctx.dpr);
  renderer.toneMapping = TONE === 'aces' ? THREE.ACESFilmicToneMapping : TONE === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = skyPreset.exposure;
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
  let weather: Weather | null = null;
  let pickups: Pickup[] = [];
  let pickupMeshes: PickupMeshes | null = null;
  let world: RoamWorld | null = null;
  let shadowTex: THREE.Texture;
  const timeU = { value: 0 };
  const entrants: Entrant[] = [];
  const remotes = new Map<string, RemoteCar>();
  /** Every car on the track this frame (refilled each frame). */
  const carsBuf: Car[] = [];
  const disposers: (() => void)[] = [];
  const ground = { height: (x: number, z: number): number => terrain.height(x, z) + (world ? world.rampHeight(x, z) : 0) };
  let meE: Entrant | null = null;
  const headlights: THREE.SpotLight[] = [];
  let ghostModel: CarModel | null = null;
  let ghostRun: GhostTrack | null = null;
  const ghostRec = trial ? new GhostTrack() : null;
  const ghostKey = `rally-ghost:v1:${course.id}:${myCar.body}:${LAPS}`;

  /** What lies off the road on this course. */
  const offroad = (): ((x: number, z: number) => number) | null => {
    if (course.theme.scenery === 'ice') return (x, z) => (lakeDist(x, z, course.layout) < 1.0 ? Ground_.Ice : Ground_.DeepSnow);
    if (course.theme.scenery === 'beach') return () => Ground_.SoftSand;
    return null;
  };

  const modelFor = (car: GarageCar, driver?: Face): CarModel => {
    const m = carModel({ body: car.body, style: car.style, driver, shadowTex, envMap: sky.env, quality: ctx.quality });
    m.setDamage(car.damage ?? 0);
    m.setNight(night);
    scene.add(m.root, m.shadow);
    return m;
  };

  const build = async (): Promise<void> => {
    sky = buildSky(renderer, ctx.quality, skyPreset);
    scene.add(sky.mesh, sky.sun, sky.sun.target, sky.hemi);
    scene.fog = sky.fog;
    scene.background = sky.fog.color.clone();
    disposers.push(() => sky.dispose());
    hud.progress(0.15);
    await nextFrame();
    if (destroyed) return;
    terrain = new Terrain(track, ctx.quality, course);
    scene.add(terrain.mesh);
    disposers.push(() => terrain.dispose());
    hud.progress(0.4);
    await nextFrame();
    if (destroyed) return;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const humans = room?.members.length ?? 1;
    road = buildRoad(track, terrain, ctx.quality, aniso, course, { wet: rain || course.theme.lit, envMap: sky.env, grid: roam ? 0 : trial ? 1 : Math.max(6, humans + nAi), roam });
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
    water = buildWater(sky.env, course.layout);
    for (const m of water.meshes) scene.add(m);
    disposers.push(() => water.dispose());
    hud.progress(0.6);
    await nextFrame();
    if (destroyed) return;
    scenery = course.id === 'farm' ? buildScenery(track, terrain, ctx.quality, timeU) : buildThemeScenery(track, terrain, course, ctx.quality, timeU, course.theme.lit || night);
    scene.add(scenery.group);
    disposers.push(() => scenery.dispose());
    if (rain || course.theme.snow) {
      const w = (weather = new Weather(rain ? 'rain' : 'snow', ctx.quality));
      scene.add(w.object);
      disposers.push(() => w.dispose());
    }
    if (rules?.pickups && !roam) {
      pickups = placePickups(track, room?.seed ?? 20261030);
      const pm = (pickupMeshes = buildPickups(track, pickups));
      scene.add(pm.group);
      disposers.push(() => pm.dispose());
    }
    if (roam) {
      const wd = (world = new RoamWorld(track, terrain, course.layout, 4711, ctx.quality));
      scene.add(wd.group);
      disposers.push(() => wd.dispose());
    }
    hud.progress(0.85);
    await nextFrame();
    if (destroyed) return;
    // cars
    shadowTex = blobTex(64, 0.3);
    disposers.push(() => shadowTex.dispose());
    buildCars();
    particles = new Particles(high ? 1600 : 600);
    skids = new Skids(high ? 3000 : 1200);
    confetti = new Confetti(high ? 420 : 200);
    scene.add(particles.points, skids.mesh, confetti.mesh);
    disposers.push(
      () => particles.dispose(),
      () => skids.dispose(),
      () => confetti.dispose(),
    );
    if (night) addHeadlights();
    if (trial) loadGhost();
    if (net) wireNet(net);
    hud.progress(1);
    // warm up the shaders so the first frames do not stutter
    placeCamera(0);
    syncModels(0);
    renderer.compile(scene, camera);
    await nextFrame();
    if (destroyed) return;
    hud.ready();
    hud.roam(roam, ctx.touch);
    hud.setNitro(nitroLeft, myTune.charges, false);
    hud.setDamage(damageK > 0 ? meE!.damage : null);
    if (roam) {
      phase = 'race';
      phaseT = 10;
      hud.hideRace(false);
      hud.msg('Fri körning!', 1800, 'small');
      hud.subtitle('Hitta mynten, hoppa och sladda!');
      setTimeout(() => hud.subtitle(''), 3200);
    }
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
      const w = window as unknown as Record<string, unknown>;
      w.__rallyTris = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([k, v]) => `${k}=${Math.round(v)}`);
      // teleport the player (free-roam tests) and list the coins
      w.__rallyTp = (x: number, z: number, h?: number, v = 0) => {
        const c = player().car;
        c.x = x;
        c.z = z;
        if (h !== undefined) c.heading = h;
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
        track.project(x, z, -1, c.proj);
        c.y = c.groundAt(x, z, ground);
      };
      w.__rallyCoins = () => world?.coins.filter((c) => !c.taken).map((c) => [c.x, c.z]) ?? [];
      w.__rallyRamps = () => world?.ramps ?? [];
      w.__rallyZones = () => world?.zones ?? [];
    }
    loop = new Loop((dt) => {
      for (let k = 0; k < TURBO && !ended; k++) update(dt);
    }, render);
    if (paused) loop.pause();
    audio.music(roam ? 0.4 : 0.6);
  };

  /** The grid: the humans in room order (or just me), then the computer cars. */
  function buildCars(): void {
    const colors = online ? PALETTE.slice(0, ROSTER.length) : pickColors(ctx.player.color, ROSTER.length);
    const humans: RemoteRacer[] = room ? room.members.map((m) => ({ id: m.id, name: m.name, car: m.car })) : [];
    const meId = opts?.me ?? 'me';
    // where I stand: by my place in the room, at the back of the arcade grid, first alone
    const total = (online ? humans.length : 1) + nAi;
    const mySlot = online ? Math.max(0, humans.findIndex((h) => h.id === meId)) : roam || trial ? 0 : Math.min(4, nAi);
    let ai = 0;
    for (let slot = 0; slot < total; slot++) {
      const s = -11 - slot * 9;
      const d = slot % 2 ? -3.4 : 3.4;
      const isMe = slot === mySlot;
      const humanSlot = online && slot < humans.length;
      if (humanSlot && !isMe) {
        // someone else's car: drawn from their snapshots
        addRemote(humans[slot]!, s, d);
        continue;
      }
      if (!isMe && !host) {
        // a computer car the host drives
        const k = ai++;
        const r = ROSTER[k]!;
        addRemote({ id: `ai:${k}`, name: r.name, car: aiCar(k, colors[k] ?? PALETTE[k]!, r.face) }, s, d, r.face);
        continue;
      }
      const k = isMe ? -1 : ai++;
      const r = isMe ? null : ROSTER[k]!;
      const color = isMe ? (opts ? myCar.style.paint : ctx.player.color) : colors[k] ?? PALETTE[k]!;
      const gcar = isMe ? myCar : opts ? aiCar(k, color, r!.face) : arcadeCar(color);
      if (!isMe && !opts) gcar.style.number = k + 2;
      const model = modelFor(isMe || opts ? gcar : { ...gcar, body: 'hatch' }, isMe ? undefined : r!.face);
      disposers.push(() => model.dispose());
      const car = new Car(track);
      car.place(s, d, ground);
      car.offroadAt = offroad();
      car.roam = roam;
      const kid = ctx.touch;
      let driver: Driver | null = null;
      let power = 1;
      const tune = isMe ? myTune : tuneFor(newCar(0, 'hatch', ''), false, false);
      if (r) {
        const skill = r.skill * (kid ? 0.93 : 1) * diff.skill;
        driver = new Driver({ skill, bias: r.bias, lineUse: 0.85 + r.skill * 0.15, wobble: r.wobble, phase: k * 1.7 });
        power = r.power * (kid ? 0.92 : 1) * diff.power;
        car.assist = 0.75;
      } else {
        car.assist = (kid ? 0.75 : 0.45) + tune.assist;
        car.traction = kid ? 0.75 : 0.85;
        power = tune.power;
        car.grip = tune.grip;
        car.brakeMul = tune.brakeMul;
        car.size = tune.size;
      }
      car.power *= power;
      const e: Entrant = {
        id: isMe ? meId : `ai:${k}`,
        name: isMe ? (room?.members.find((m) => m.id === meId)?.name ?? ctx.player.name) || 'Du' : r!.name,
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
        tune,
        damage: isMe ? clamp(myCar.damage ?? 0, 0, 100) : 0,
        mudT: 0,
        padT: 0,
      };
      if (isMe) meE = e;
      entrants.push(e);
    }
  }

  function addRemote(h: RemoteRacer, s: number, d: number, face?: Face): RemoteCar {
    const old = remotes.get(h.id);
    if (old) return old;
    const model = modelFor(h.car, face);
    const rc = new RemoteCar(h.id, h.name, h.car.style.paint, model, track, tuneFor(h.car, false, false).size);
    rc.car.place(s, d, ground);
    rc.u = s;
    model.root.visible = false;
    model.shadow.visible = false;
    remotes.set(h.id, rc);
    hud.resetBoard();
    return rc;
  }

  function removeRemote(id: string): void {
    const rc = remotes.get(id);
    if (!rc) return;
    rc.dispose();
    remotes.delete(id);
    hud.resetBoard();
  }

  function addHeadlights(): void {
    const me = player();
    const spots = high ? me.model.headlights : [me.model.headlights.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, me.model.headlights.length))];
    for (const p of spots) {
      const l = new THREE.SpotLight('#fff1d0', high ? 160 : 260, 90, 0.55, 0.5, 1.2);
      l.position.copy(p);
      l.target.position.set(p.x * 0.6, -1.2, p.z + 22);
      me.model.root.add(l, l.target);
      headlights.push(l);
    }
  }

  function loadGhost(): void {
    try {
      const raw = localStorage.getItem(ghostKey);
      if (!raw) return;
      const g = JSON.parse(raw) as { time: number; data: number[] };
      if (!Array.isArray(g.data) || g.data.length < 8) return;
      ghostRun = new GhostTrack();
      ghostRun.data = g.data;
      ghostModel = carModel({ body: myCar.body, style: myCar.style, shadowTex, envMap: sky.env, quality: 'low' });
      const undo = ghostify(ghostModel);
      scene.add(ghostModel.root);
      const gm = ghostModel;
      disposers.push(() => {
        undo();
        gm.dispose();
      });
    } catch {
      ghostRun = null;
    }
  }

  function saveGhost(time: number): void {
    if (!ghostRec) return;
    try {
      const raw = localStorage.getItem(ghostKey);
      const old = raw ? (JSON.parse(raw) as { time: number }) : null;
      if (old && old.time <= time) return;
      localStorage.setItem(ghostKey, JSON.stringify({ time, data: ghostRec.data }));
    } catch {
      // private mode or full: the ghost lives only for this drive
    }
  }

  // ---- the network: snapshots in and out, finishes and the result ----
  const unsubs: (() => void)[] = [];
  let resultLines: RaceResultLine[] | null = null;
  let resultT = -1;
  function wireNet(n: RallyNet): void {
    if (online) {
      unsubs.push(
        n.onSnaps((_from, snaps) => {
          const now = performance.now();
          for (const s of snaps) {
            if (s.id === (opts?.me ?? 'me')) continue;
            const rc = remotes.get(s.id);
            if (rc) rc.push(s, now);
          }
        }),
        n.onFinish((from, time) => {
          const rc = remotes.get(from);
          if (rc && !rc.finished) {
            rc.finished = true;
            rc.finishTime = time / 1000;
          }
        }),
        n.onResult((lines) => {
          if (resultLines) return;
          resultLines = lines;
          resultT = 0;
          showResults(lines);
        }),
        n.onLeft((id) => {
          removeRemote(id);
          // the host drove the computer cars: they leave with it
          if (id === room?.host) for (const k of [...remotes.keys()]) if (k.startsWith('ai:')) removeRemote(k);
        }),
      );
    }
    if (roam) {
      unsubs.push(
        // the garage maps the server's "went home" to onLeft
        n.onLeft((id) => removeRemote(id)),
        n.onRoamPeers((peers) => {
          const ids = new Set(peers.map((p) => p.id));
          for (const id of [...remotes.keys()]) if (!ids.has(id)) removeRemote(id);
          for (const p of peers) if (p.id !== opts?.me && !remotes.has(p.id)) addRemote(p, 0, 0);
        }),
        n.onRoamSnap((from, snap) => {
          if (from === opts?.me) return;
          remotes.get(from)?.push(snap, performance.now());
        }),
      );
    }
  }

  const player = (): Entrant => meE!;

  // ---- race state ----
  type Phase = 'intro' | 'count' | 'race' | 'finish' | 'over';
  let phase: Phase = GO && !online ? 'count' : 'intro';
  let phaseT = GO && !online ? 2.99 : 0;
  let raceT = 0;
  let lastLight = -1;
  let camMode = CAM0;
  let camPress = false;
  let homePress = false;
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
  let sendT = 0;
  let waitT = -1;
  // nitro, drift boost and style points (the player only)
  let nitroLeft = myTune.charges;
  let nitroT = 0;
  const drift = { on: false, t: 0, grace: 0, pts: 0, tier: 0 };
  let driftBoostT = 0;
  let stylePts = 0;
  // free roam
  let stunt = 0;
  let airFrom: { x: number; z: number } | null = null;
  let airTime = 0;
  let zonePts = 0;
  let zoneIdle = 0;
  let zoneShown = 0;
  /** The drift boost and style points belong to Rallyvärlden; the arcade race stays as it was. */
  const tricksOn = !!opts;
  const roamEv: RoamEvents = { coins: 0, coinAt: null, bales: 0, baleAt: null, splash: false, bump: 0 };
  hud.camBtn.addEventListener('click', () => (camPress = true));
  hud.homeBtn.addEventListener('click', () => (homePress = true));

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camYaw = 0;
  let camFov = 62;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const colDust = new THREE.Color('#c9b48a');
  const colSnow = new THREE.Color('#f2f6fb');
  const colSand = new THREE.Color('#e2cc94');
  const colSmoke = new THREE.Color('#d9d6d0');
  const colMySmoke = new THREE.Color();
  const colGrass = new THREE.Color('#6f9a3f');
  const colDirt = new THREE.Color('#8a7350');
  const colMud = new THREE.Color('#5c4226');
  const colSkid = new THREE.Color('#16161a');
  const colRut = new THREE.Color('#5d4a32');
  const colSnowRut = new THREE.Color('#9aaac0');
  const colSandRut = new THREE.Color('#b39660');
  const colHay = new THREE.Color('#e8c862');
  const colSpark = new THREE.Color('#ffffff');
  const colHot = new THREE.Color('#ffd25a');
  const colFlame = new THREE.Color('#ffb040');
  const colWater = new THREE.Color('#cfe8f5');
  const colDark = new THREE.Color('#3a3634');
  const colCoin = new THREE.Color('#ffd23f');
  const TIER_COL = [colSpark, new THREE.Color('#4fb3ff'), new THREE.Color('#ff9a2a'), new THREE.Color('#c070ff')];

  /** One Runner per car, kept and refreshed (runners() is called several times a frame). */
  const runnerOf = new WeakMap<Car, Runner>();
  const runnerList: Runner[] = [];
  const rankList: Runner[] = [];
  function runnerSlot(car: Car, id: string, name: string, color: string): Runner {
    let r = runnerOf.get(car);
    if (!r) runnerOf.set(car, (r = { id, name, color, car, u: 0, finished: false, finishTime: 0, me: false }));
    runnerList.push(r);
    return r;
  }

  /**
   * Everyone on the track: my car, the computer cars I drive, and the others' cars (not the ones gone
   * quiet, unless they already finished). The same list each call: copy it to keep it.
   */
  function runners(): Runner[] {
    runnerList.length = 0;
    for (const e of entrants) {
      const r = runnerSlot(e.car, e.id, e.name, e.color);
      r.u = e.u;
      r.finished = e.finished;
      r.finishTime = e.finishTime;
      r.me = e === meE;
    }
    for (const rc of remotes.values()) {
      if ((!rc.ready && roam) || (rc.stale && !rc.finished)) continue;
      const r = runnerSlot(rc.car, rc.id, rc.name, rc.color);
      r.u = rc.u;
      r.finished = rc.finished;
      r.finishTime = rc.finishTime;
    }
    return runnerList;
  }

  /** The standings (its own list, kept until the next call). */
  function ranking(): Runner[] {
    rankList.length = 0;
    rankList.push(...runners());
    return rankList.sort((a, b) => {
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

  /** Style points add a little on top (only in Rallyvärlden, where drifts count). */
  const styleBonus = (): number => (opts ? Math.min(2500, Math.round(stylePts * 0.25)) : 0);

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
    const onRoad = Math.abs(p.d) < hw + 3;
    // kids on touch screens: the car drives itself, slowing for bends; they steer
    if (ctx.touch && brk < 0.1 && phase === 'race') {
      const v = Math.max(0, car.vLong);
      const target = roam && !onRoad ? 18 : track.at(track.vmax, p.s + 4 + v * 0.3) * 0.95;
      if (v > target + 2.5) {
        thr = 0;
        brk = clamp((v - target - 2.5) / 7, 0, 0.55);
      } else thr = Math.max(thr, v > target ? 0.4 : 1);
    }
    thrIn = thr > thrIn ? Math.min(thr, thrIn + dt * 6) : thr;
    // a gentle hand keeping the car on the road (strong for the little ones); free roam lets go off the road
    const w = (ctx.touch ? 0.55 : 0.14) * (roam && !onRoad ? 0 : roam ? 0.5 : 1);
    const v = Math.max(0, car.vLong);
    const off = clamp(p.d, -(hw - 2.6), hw - 2.6);
    const assist = w > 0 ? steerTo(car, track, 6 + v * 0.45, off) : 0;
    let steer = steerIn + w * assist * (1 - 0.65 * Math.abs(steerIn));
    if (!roam && Math.abs(p.d) > hw - 1.2 && Math.sign(p.d) * Math.sin(car.heading - track.heading(p.s)) > 0) steer += (ctx.touch ? 0.3 : 0.1) * -Math.sign(p.d);
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
      if (!runners().some((o) => o.car !== c && Math.hypot(o.car.x - p.x, o.car.z - p.z) < 5)) break;
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
      drift.on = false;
    }
  }

  function poof(x: number, y: number, z: number): void {
    for (let k = 0; k < (high ? 26 : 12); k++) {
      const a = (k / 26) * Math.PI * 2;
      particles.emit({ x, y: y + 0.8, z, vx: Math.cos(a) * 5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 5, life: 0.8, size0: 1.2, size1: 2.8, color: colSpark, alpha: 0.8, drag: 3 });
    }
  }

  // ---- per-frame effects for one car ----
  function carEffects(c: Car, idx: number, isPlayer: boolean, dt: number): void {
    if (c.air) {
      for (let w = 0; w < 4; w++) skids.lift(idx * 4 + w);
      return;
    }
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    const rate = high ? 1 : 0.45;
    const sp = c.speed;
    const surf = c.surface;
    const dusty = surf === Ground_.Gravel || surf === Ground_.Snow || surf === Ground_.Sand || surf === Ground_.DeepSnow || surf === Ground_.SoftSand;
    const dustCol = surf === Ground_.Snow || surf === Ground_.DeepSnow ? colSnow : surf === Ground_.Sand || surf === Ground_.SoftSand ? colSand : colDust;
    const rutCol = surf === Ground_.Snow || surf === Ground_.DeepSnow ? colSnowRut : surf === Ground_.Sand || surf === Ground_.SoftSand ? colSandRut : colRut;
    const smoke = isPlayer && opts ? smokeColor(myCar.style.smoke, timeU.value, colMySmoke) : colSmoke;
    for (let w = 0; w < 4; w++) {
      const [wx, wz] = WHEELS[w]!;
      const x = c.x + sinH * wz + cosH * wx;
      const z = c.z + cosH * wz - sinH * wx;
      const rear = w >= 2;
      const slip = rear ? Math.max(c.slip, c.wheelspin) : c.frontSlip * smooth(3, 8, sp);
      const id = idx * 4 + w;
      const onRoad = surf === Ground_.Asphalt || surf === Ground_.Kerb || surf === Ground_.Ice;
      if (slip > 0.38 && onRoad) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.26, surf === Ground_.Ice ? colSnowRut : colSkid, clamp(slip * 0.55, 0.15, 0.5));
      else if (dusty && rear && sp > 3 && (isPlayer || slip > 0.3)) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.32, rutCol, 0.22);
      else skids.lift(id);
      if (!rear) continue;
      // dust on gravel, spray on snow and sand
      if (dusty && sp > 4 && Math.random() < rate * (0.25 + sp / 40) * (surf === Ground_.Gravel ? 1 : 0.6)) {
        particles.emit({
          x: x + (Math.random() - 0.5) * 0.6,
          y: c.y + 0.3,
          z: z + (Math.random() - 0.5) * 0.6,
          vx: -sinH * sp * 0.15 + (Math.random() - 0.5) * 2,
          vy: 0.8 + Math.random() * 1.2,
          vz: -cosH * sp * 0.15 + (Math.random() - 0.5) * 2,
          life: 1.6 + Math.random() * 1.4,
          size0: 1.0,
          size1: (surf === Ground_.Gravel ? 4.2 : 3.0) + sp * 0.06,
          color: dustCol,
          alpha: surf === Ground_.Gravel ? 0.4 : 0.26,
          drag: 1.4,
          gravity: -0.15,
        });
      }
      // smoke when sliding on tarmac
      if (onRoad && slip > 0.35 && Math.random() < rate * slip * 0.9) {
        particles.emit({ x, y: c.y + 0.25, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 1.2 + Math.random(), size0: 0.7, size1: 3.2, color: smoke, alpha: 0.42 * slip, drag: 1.8, gravity: -0.3 });
      }
      // grass and earth flying off the tyres
      if (surf === Ground_.Grass && sp > 5 && Math.random() < rate * 0.6) {
        particles.emit({ x, y: c.y + 0.2, z, vx: -sinH * sp * 0.25 + (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 2.5, vz: -cosH * sp * 0.25 + (Math.random() - 0.5) * 2.5, life: 0.7, size0: 0.25, size1: 0.18, color: Math.random() < 0.6 ? colGrass : colDirt, alpha: 0.95, drag: 0.6, gravity: 9 });
        if (Math.random() < 0.3) particles.emit({ x, y: c.y + 0.3, z, vy: 0.6, life: 1.2, size0: 0.8, size1: 2.6, color: colDirt, alpha: 0.3, drag: 2 });
      }
    }
  }

  /** Damage from a knock of strength `j` (m/s), scaled by the rules and the car's toughness. */
  function hurt(e: Entrant, j: number, k = 1): void {
    if (damageK <= 0 || j <= 0) return;
    const before = e.damage;
    e.damage = clamp(e.damage + Math.min(15, j * k) * e.tune.dmgMul * damageK, 0, 100);
    if (Math.floor(e.damage / 4) !== Math.floor(before / 4)) e.model.setDamage(e.damage);
  }

  function sparks(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) particles.emit({ x, y: y + 0.5, z, vx: (Math.random() - 0.5) * 9, vy: 1 + Math.random() * 4, vz: (Math.random() - 0.5) * 9, life: 0.35 + Math.random() * 0.25, size0: 0.22, size1: 0.08, color: colHot, alpha: 1, drag: 1, gravity: 9 });
  }

  // ---- the player's tricks: nitro, the drift boost, style points ----
  function tricks(dt: number, me: Entrant, racing: boolean): void {
    const inp = ctx.input;
    const c = me.car;
    // nitro on C (L, gamepad X/Y, the 🔥 button); the C key itself is the camera
    const nitroKey = inp.pressed('c') && !inp.keyPressed('KeyC');
    if (myTune.charges > 0 && nitroKey && racing && phase === 'race' && !me.finished && nitroT <= 0) {
      if (nitroLeft > 0) {
        nitroLeft--;
        nitroT = NITRO_SECONDS;
        audio.boost();
        hud.toast('🔥 Nitro!');
      } else hud.toast('Slut på nitro');
    }
    nitroT = Math.max(0, nitroT - dt);
    driftBoostT = Math.max(0, driftBoostT - dt);
    // the drift: a handbrake flick starts it, keep it sliding to charge the mini-turbo
    const beta = c.vLong > 3 ? Math.atan2(Math.abs(c.vLat), c.vLong) : 0;
    const sliding = !c.air && c.speed > 7 && beta > 0.2;
    if (!drift.on && tricksOn && me.ctl.handbrake && c.speed > 8 && racing && !me.finished) {
      drift.on = true;
      drift.t = drift.pts = drift.grace = 0;
      drift.tier = 0;
    }
    if (drift.on) {
      if (sliding || me.ctl.handbrake) {
        drift.grace = 0;
        if (sliding) {
          drift.t += dt;
          drift.pts += beta * c.speed * dt * 6;
        }
      } else drift.grace += dt;
      const tier = drift.t >= 2.4 ? 3 : drift.t >= 1.6 ? 2 : drift.t >= 0.8 ? 1 : 0;
      if (tier > drift.tier) {
        drift.tier = tier;
        audio.chime();
      }
      // sparks off the rear wheels in the tier's colour
      if (tier > 0 && !c.air && Math.random() < (high ? 0.9 : 0.5)) {
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        for (const wx of [-0.8, 0.8]) {
          const x = c.x - sinH * 1.35 + cosH * wx;
          const z = c.z - cosH * 1.35 - sinH * wx;
          particles.emit({ x, y: c.y + 0.15, z, vx: -sinH * 3 + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: -cosH * 3 + (Math.random() - 0.5) * 3, life: 0.3, size0: 0.25, size1: 0.1, color: TIER_COL[tier]!, alpha: 1, drag: 1, gravity: 8 });
        }
      }
      const over = drift.grace > 0.35 || c.speed < 5 || c.wallHit > 2.5 || me.finished;
      if (over) {
        if (drift.tier > 0 && !c.wallHit) {
          driftBoostT = [0, 0.55, 0.9, 1.3][drift.tier]!;
          audio.boost();
          hud.popup(['', 'Turbo!', 'Superturbo!', 'Megaturbo!'][drift.tier]!, 'blue');
        }
        const pts = Math.round(drift.pts / 10) * 10;
        if (pts >= 30 && !c.wallHit) {
          stylePts += pts;
          setTimeout(() => hud.popup(`+${pts}`), drift.tier > 0 ? 350 : 0);
        }
        drift.on = false;
        drift.tier = 0;
      }
    }
    hud.setDrift(drift.on ? clamp(drift.t / 2.4, 0.04, 1) : 0, drift.tier);
    hud.setNitro(nitroLeft, myTune.charges, nitroT > 0);
    hud.setStyle(opts && !roam ? stylePts : 0);
    // flames and speed lines while the nitro burns
    const burn = nitroT > 0 ? 1 : driftBoostT > 0 ? 0.5 : 0;
    me.model.setNitro(burn);
    hud.speedLines(nitroT > 0 ? 0.8 : driftBoostT > 0 ? 0.35 : 0);
    if (burn > 0 && Math.random() < (high ? 1 : 0.6)) {
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      const fc = myCar.style.smoke === 'white' ? colFlame : smokeColor(myCar.style.smoke, timeU.value, colMySmoke);
      particles.emit({ x: c.x - sinH * 2.25 - cosH * 0.45, y: c.y + 0.32, z: c.z - cosH * 2.25 + sinH * 0.45, vx: -sinH * 4 + c.vx * 0.8, vy: 0.3, vz: -cosH * 4 + c.vz * 0.8, life: 0.2, size0: 0.8 * burn + 0.2, size1: 0.2, color: fc, alpha: 1, drag: 4 });
    }
  }

  /** Per frame for a car I drive: damage, mud, the boost pads and the boosts into the handling. */
  function handling(e: Entrant, dt: number, isMe: boolean): void {
    const c = e.car;
    e.mudT = Math.max(0, e.mudT - dt);
    e.padT = Math.max(0, e.padT - dt);
    if (pickups.length && !c.air) {
      const pk = pickupAt(pickups, track, c.proj.s, c.proj.d);
      if (pk?.kind === 'boost' && e.padT <= 0) {
        c.launch = Math.max(c.launch, 1.5);
        e.padT = 1.6;
        if (isMe) {
          audio.boost();
          hud.toast('⚡ Fart!');
        }
      } else if (pk?.kind === 'mud') {
        if (e.mudT <= 0 && isMe) audio.hay(6);
        e.mudT = 0.9;
        c.vx *= Math.exp(-dt * 1.4);
        c.vz *= Math.exp(-dt * 1.4);
        if (Math.random() < 0.5) particles.emit({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + 0.3, z: c.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.7, size0: 0.35, size1: 0.25, color: colMud, alpha: 1, drag: 0.8, gravity: 9 });
      }
    }
    const d = e.damage;
    c.grip = e.tune.grip * rainGrip * damageGrip(d) * (e.mudT > 0 ? 0.8 : 1);
    if (isMe) {
      c.power = e.basePower * damagePower(d);
      c.boost = nitroT > 0 ? 1.45 : driftBoostT > 0 ? 1.3 : 1;
    }
  }

  // ---- the game loop ----
  function update(dt: number): void {
    const inp = ctx.input;
    phaseT += dt;
    timeU.value += dt;
    const me = player();
    // phase transitions
    if (online && (phase === 'intro' || phase === 'count')) {
      // the lights go green at the room's start time on every screen
      const left = ((room!.startAt ?? net!.serverNow()) - net!.serverNow()) / 1000;
      if (phase === 'intro' && phaseT < dt * 1.5) {
        hud.msg('Gör dig redo!', 1700, 'small');
        hud.subtitle(ctx.touch ? 'Bilen gasar själv – du styr med ◀ ▶' : 'Gasa när lampan blir grön!');
      }
      if (left <= 3 && phase === 'intro') {
        phase = 'count';
        phaseT = 3 - left;
      }
      if (phase === 'count') phaseT = Math.max(phaseT - dt, 3 - left);
    }
    if (phase === 'intro') {
      if (phaseT < dt * 1.5 && !online) {
        hud.msg('Gör dig redo!', 1700, 'small');
        hud.subtitle(ctx.touch ? 'Bilen gasar själv – du styr med ◀ ▶' : 'Gasa när lampan blir grön!');
      }
      if (phaseT > 2.6 && !online) {
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
        const late = phaseT - 3;
        phase = 'race';
        phaseT = late;
        raceT = late;
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
      if (phaseT > 1.4 && phaseT - dt <= 1.4 && !roam) {
        hud.lights(0, false, false);
        road.setLights(0, false);
      }
      // a rocket start for pressing the gas just as it turns green
      if (!boosted && phaseT < 0.45 && !roam) {
        const on = me.ctl.throttle > 0.5;
        if (on && !thrPrev) {
          boosted = true;
          me.car.launch = 1.6;
          hud.toast('🚀 Raketstart!');
          audio.boost();
        }
        thrPrev = on;
      }
      if (roam && (inp.pressed('start') || homePress)) goHome();
    } else if (phase === 'finish') {
      raceT += dt;
      if (online) {
        // wait for the server's result; fall back to our own standings if it never comes
        waitT += dt;
        if (resultLines) {
          resultT += dt;
          if (resultT > 5) endOnline();
        } else if (waitT > 50) endOnline();
      } else if (phaseT > 5.6 && !ended) endSolo();
    }
    if (online && resultLines && phase === 'race') {
      // the race was closed before I got there
      phase = 'finish';
      phaseT = 0;
      waitT = 0;
      finishPlace = 0;
      hud.wrongWay(false);
    }
    const racing = phase === 'race' || phase === 'finish' || phase === 'over';

    // ---- the other screens' cars ----
    const now = performance.now();
    for (const rc of remotes.values()) {
      rc.update(now, dt, track, ground);
      if (!rc.finished && !roam && rc.lap >= LAPS && rc.id.startsWith('ai:')) {
        rc.finished = true;
        rc.finishTime = raceT;
      }
    }
    // everyone to steer round and bump into (my entrants first: collideCars' indexes rely on it)
    carsBuf.length = 0;
    for (const x of entrants) carsBuf.push(x.car);
    for (const r of remotes.values()) if (r.shown) carsBuf.push(r.car);

    // ---- controls ----
    const humanU = (): { lo: number; hi: number } => {
      let lo = me.u;
      let hi = me.u;
      for (const rc of remotes.values())
        if (!rc.id.startsWith('ai:') && !rc.stale) {
          lo = Math.min(lo, rc.u);
          hi = Math.max(hi, rc.u);
        }
      return { lo, hi };
    };
    const hu = humanU();
    const cars = carsBuf;
    for (const e of entrants) {
      if (e === me && !me.finished && phase !== 'over' && !AUTO) playerControls(dt, e);
      else if (e.ai || e === me) {
        const drv = e.ai ?? (me.ai = new Driver({ skill: AUTO && !me.finished ? AUTO : 0.62, bias: 0, lineUse: 0.6, wobble: 0, phase: 0 }));
        // rubber band: ease off when far ahead of the player, push a little when far behind
        let mul = 1;
        if (e !== me && !me.finished) {
          const k = diff.band * (online ? 0.6 : 1);
          // online: ahead of the best human, or behind the last one
          const gap = online ? (e.u > hu.hi ? e.u - hu.hi : e.u < hu.lo ? e.u - hu.lo : 0) : e.u - me.u;
          if (gap > 20) mul = 1 - Math.min(ctx.touch ? 0.2 : 0.13, (gap - 20) / (ctx.touch ? 500 : 800)) * k;
          else if (gap < -30) mul = 1 + Math.min(0.06, (-gap - 30) / 1200) * k;
          e.car.power = e.basePower * (gap < -30 ? 1 + Math.min(0.08, (-gap - 30) / 1000) * k : gap > 60 ? 1 - 0.07 * k : 1) * damagePower(e.damage);
        }
        if (e.finished) mul = Math.min(mul, 0.72);
        drv.drive(e.car, track, cars, mul, timeU.value + entrants.indexOf(e), dt, e.ctl);
        if (!racing) {
          e.ctl.throttle = Math.random() < 0.04 ? 0.8 : e.ctl.throttle * 0.9;
          e.ctl.brake = 0;
        }
      }
    }
    // a damaged car pulls to one side and wobbles a little
    if (me.damage > 70 && !me.finished) me.ctl.steer = clamp(me.ctl.steer + ((me.damage - 70) / 30) * (0.05 + 0.04 * Math.sin(timeU.value * 5)), -1, 1);
    for (const e of entrants) handling(e, dt, e === me);
    tricks(dt, me, racing);

    // ---- physics (two steps a frame) ----
    const nLocal = entrants.length;
    for (let k = 0; k < 2; k++) {
      for (const e of entrants) e.car.step(dt / 2, e.ctl, ground, !racing);
      if (racing)
        collideCars(cars, (a, b, j) => {
          const ea = a < nLocal ? entrants[a]! : null;
          const eb = b < nLocal ? entrants[b]! : null;
          if (ea === me || eb === me) {
            audio.bump(j);
            shake = Math.max(shake, Math.min(0.5, j * 0.06));
          }
          if (j > 2) {
            if (ea) hurt(ea, (j - 2) * 1.2);
            if (eb) hurt(eb, (j - 2) * 1.2);
          }
        });
    }
    for (const e of entrants) e.car.settle(dt, ground);
    if (world) {
      world.update(dt, timeU.value, me.car, roamEv);
      roamEvents(me);
    }

    // ---- race bookkeeping ----
    for (const e of entrants) {
      const c = e.car;
      const ds = track.wrapDist(c.proj.s - e.lastS);
      e.lastS = c.proj.s;
      if (racing && !roam) e.u += ds;
      e.rate = damp(e.rate, ds / dt, 2, dt);
      const done = Math.floor(e.u / track.length);
      if (racing && !roam && done > e.lapsDone && e.u > 0) {
        e.lapsDone = done;
        if (e === me && !me.finished) onPlayerLap();
        if (e.lapsDone >= LAPS && !e.finished) {
          e.finished = true;
          e.finishTime = raceT;
          if (e === me) onPlayerFinish();
          // the host's computer cars take their places in the server's result too
          else if (online && host && e.id.startsWith('ai:')) net!.sendFinish(Math.round(raceT * 1000), 0, e.id, e.name);
        }
      }
      // stuck or lost: back onto the road
      if (phase === 'race' && !e.finished) {
        const hw = track.at(track.hw, c.proj.s);
        const trying = e.ctl.throttle > 0.3 || e.ctl.brake > 0.3;
        if (c.speed < 1.6 && trying) e.stuckT += dt;
        else e.stuckT = Math.max(0, e.stuckT - dt * 2);
        if (Math.abs(c.proj.d) > hw + 1.5 && e.rate < (e.ai ? 5 : 7) && !roam) e.offT += dt;
        else e.offT = Math.max(0, e.offT - dt);
        if ((e.stuckT > (e.ai ? 2.2 : roam ? 4 : 2.8) && !(roam && e === me && !AUTO)) || e.offT > (e.ai ? 4 : 6)) respawn(e);
      }
    }
    if (phase === 'race' && !me.finished && (inp.keyPressed('KeyR') || inp.pressed('b'))) respawn(me);
    if (ghostRec && phase === 'race' && !me.finished) ghostRec.record(raceT, me.car);

    // positions
    const order = ranking();
    place = order.findIndex((r) => r.me) + 1;
    if (!online && !roam && phase === 'race' && entrants.every((e) => e === me || e.finished) && !me.finished && entrants.length > 1) {
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
    if (raceT > 600 && phase === 'race' && !roam) {
      phase = 'finish';
      phaseT = 0;
      finishPlace = 0;
      waitT = 0;
    }

    // wrong way
    if (phase === 'race' && !me.finished && !roam) {
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
        if (damageK > 0 && c.wallHit > 4) {
          hurt(e, (c.wallHit - 4) * (hay ? 0.5 : 1.4));
          if (!hay) sparks(c.x, c.y, c.z, high ? 10 : 5);
        }
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
        if (c.landed > 5) hurt(e, (c.landed - 5) * 1.5 * (1 - e.tune.assist));
      }
      c.landed = 0;
      // a battered car smokes from the bonnet
      if (e.damage > 60 && Math.random() < (high ? 0.35 : 0.15) * ((e.damage - 60) / 40 + 0.3)) {
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        particles.emit({ x: c.x + sinH * 1.6, y: c.y + 1.1, z: c.z + cosH * 1.6, vx: c.vx * 0.3, vy: 1.2, vz: c.vz * 0.3, life: 1.6, size0: 0.6, size1: 2.6, color: colDark, alpha: 0.45, drag: 1.5, gravity: -0.4 });
      }
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
    // splashes along the sea and the lake shore
    if (course.layout.lake && course.layout.lakeKind !== 'ice' && me.car.speed > 5 && !me.car.air) {
      const dm = (lakeDist(me.car.x, me.car.z, course.layout) - 1) * Math.min(course.layout.lake.rx, course.layout.lake.rz);
      if (dm < 6 && Math.random() < (high ? 0.8 : 0.4)) {
        const c = me.car;
        particles.emit({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + 0.2, z: c.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.8, size0: 0.5, size1: 1.6, color: colWater, alpha: 0.7, drag: 1, gravity: 6 });
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
    const onRoad = mc.surface === Ground_.Asphalt || mc.surface === Ground_.Kerb || mc.surface === Ground_.Ice;
    const loose = mc.surface === Ground_.Gravel || mc.surface === Ground_.Snow || mc.surface === Ground_.Sand || mc.surface === Ground_.DeepSnow || mc.surface === Ground_.SoftSand;
    const sp = mc.speed;
    audio.surface(
      onRoad && !mc.air ? clamp((mc.slip - 0.25) * 1.6, 0, 1) : 0,
      loose && !mc.air ? clamp(sp / 25, 0, 1) : 0,
      mc.surface === Ground_.Grass && !mc.air ? clamp(sp / 20, 0, 1) : 0,
      mc.onKerb && sp > 3 && !mc.air ? clamp(sp / 20, 0.3, 1) : 0,
      sp,
    );
    const near = runners()
      .filter((r) => !r.me)
      .map((r) => ({ r, d: Math.hypot(r.car.x - mc.x, r.car.z - mc.z) }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2; k++) {
      const n = near[k];
      if (n) audio.otherEngine(k, remotes.has(n.r.id) ? 1800 + n.r.car.speed * 110 : n.r.car.rpm, Math.pow(clamp(1 - n.d / 70, 0, 1), 2));
    }

    // ---- effects ----
    entrants.forEach((e, i) => carEffects(e.car, i, e === me, dt));
    let ri = entrants.length;
    for (const rc of remotes.values()) if (rc.shown) carEffects(rc.car, ri++, false, dt);
    particles.update(dt);
    skids.flush();
    confetti.update(dt, timeU.value);
    road.update(timeU.value);
    water.update(timeU.value);
    pickupMeshes?.update(timeU.value);
    scenery.update(timeU.value, tmpV.set(mc.x, mc.y, mc.z), phase === 'finish' || phase === 'over' ? 1 : phase === 'count' || (phase === 'race' && phaseT < 3 && !roam) ? 0.8 : 0);
    if (phase === 'finish' && phaseT < 3.2) {
      const k = Math.floor(phaseT / 0.8);
      if (k !== Math.floor((phaseT - dt) / 0.8)) {
        const g = track.point(0, 0);
        confetti.burst(g.x, g.y + 9, g.z, high ? 90 : 45, 7);
        confetti.burst(mc.x, mc.y + 2, mc.z, high ? 50 : 25, 6);
      }
    }

    // ---- snapshots out, 12 a second ----
    if (net) {
      sendT += dt;
      if (sendT >= 1 / 12) {
        sendT = 0;
        const t = Math.round(timeU.value * 1000);
        if (roam) net.sendRoamSnap(snapOf(me, t));
        else if (online) net.sendSnaps(host ? entrants.map((e) => snapOf(e, t)) : [snapOf(me, t)]);
      }
    }

    // ---- HUD ----
    if (racing && !roam) {
      const shownLap = Math.min(LAPS, me.lapsDone + 1);
      hud.setPosition(me.finished ? finishPlace || place : place, order.length, me.finished ? LAPS + 1 : shownLap, LAPS);
      hud.setTimes(me.finished ? finishTime : raceT, me.finished ? 0 : raceT - lapStart, bestLap);
      if (hudBoard) hud.setBoard(order.map((r) => toRacer(r)));
    }
    if (roam && world) hud.setRoam(world.taken, Math.min(world.coins.length, coinsLeft), stunt);
    if (damageK > 0) hud.setDamage(me.damage);

    // camera input: C (the key), Start, the 🎥 button; the C button is the camera too when there is no nitro
    if (inp.keyPressed('KeyC') || (inp.pressed('start') && !roam) || camPress || (inp.pressed('c') && myTune.charges === 0)) {
      camMode = (camMode + 1) % 3;
      hud.toast(`🎥 ${CAMS[camMode]}`);
    }
    camPress = false;
    shake = Math.max(0, shake - dt * 1.4);
    syncModels(timeU.value);
    placeCamera(dt);
    inp.frame();
  }

  const snapOf = (e: Entrant, t: number): CarSnap => {
    const c = e.car;
    const r2 = (v: number): number => Math.round(v * 100) / 100;
    return {
      id: e.id,
      x: r2(c.x),
      y: r2(c.y),
      z: r2(c.z),
      h: Math.round(c.heading * 1000) / 1000,
      vx: r2(c.vx),
      vz: r2(c.vz),
      st: r2(e.ctl.steer),
      th: r2(e.ctl.throttle),
      br: r2(e.ctl.brake),
      hb: e.ctl.handbrake,
      ni: e === meE && nitroT > 0,
      dm: Math.round(e.damage),
      lap: e.lapsDone,
      t,
    };
  };

  /** Free roam: coins, stunt jumps, the drift zones and the bales. */
  function roamEvents(me: Entrant): void {
    const c = me.car;
    if (roamEv.coins) {
      audio.chime();
      hud.popup(`🪙 ${world!.taken}`, 'coin');
      const p = roamEv.coinAt!;
      for (let k = 0; k < (high ? 18 : 8); k++) {
        const a = (k / 18) * Math.PI * 2;
        particles.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 4, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 4, life: 0.6, size0: 0.4, size1: 0.1, color: colCoin, alpha: 1, drag: 2, gravity: 4 });
      }
      if (world!.taken === world!.coins.length) {
        hud.msg('Alla mynt!', 2200, 'gold');
        audio.fanfare(true);
      }
    }
    if (roamEv.bales) {
      audio.hay(8);
      stunt += 25 * roamEv.bales;
      const p = roamEv.baleAt!;
      for (let k = 0; k < (high ? 14 : 6); k++) particles.emit({ x: p.x, y: p.y + 0.4, z: p.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 1, size0: 0.35, size1: 0.25, color: colHay, alpha: 1, drag: 1, gravity: 6 });
    }
    if (roamEv.bump > 2) {
      audio.thud(roamEv.bump);
      hurt(me, roamEv.bump - 2);
    }
    if (roamEv.splash && Math.random() < 0.6) particles.emit({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + 0.2, z: c.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.8, size0: 0.5, size1: 1.6, color: colWater, alpha: 0.7, drag: 1, gravity: 6 });
    // a stunt jump: airtime and distance
    const dt = 1 / 60;
    if (c.air) {
      airTime += dt;
      if (!airFrom && airTime > 0.12) airFrom = { x: c.x, z: c.z };
    } else {
      if (airFrom) {
        const dist = Math.hypot(c.x - airFrom.x, c.z - airFrom.z);
        if (dist > 8 && airTime > 0.5) {
          const pts = Math.round((airTime * 120 + dist * 4) / 5) * 5;
          stunt += pts;
          hud.popup(`🚀 Hopp! ${airTime.toFixed(1).replace('.', ',')} s · ${Math.round(dist)} m +${pts}`);
          audio.cheer(0.6);
        }
      }
      airFrom = null;
      airTime = 0;
    }
    // drift zones
    const zone = world!.zoneAt(c.x, c.z);
    const beta = c.vLong > 3 ? Math.atan2(Math.abs(c.vLat), c.vLong) : 0;
    if (zone && !c.air && c.speed > 7 && beta > 0.25) {
      zonePts += beta * c.speed * dt * 12;
      zoneIdle = 0;
      if (Math.floor(zonePts / 50) > zoneShown) {
        zoneShown = Math.floor(zonePts / 50);
        hud.toast(`🌀 Driftzon ${zoneShown * 50}`);
      }
    } else if (zonePts > 0) {
      zoneIdle += dt;
      if (zoneIdle > 1.2 || !zone) {
        const pts = Math.round(zonePts / 10) * 10;
        if (pts > 0) {
          stunt += pts;
          hud.popup(`🌀 Driftzon +${pts}`, 'blue');
        }
        zonePts = 0;
        zoneIdle = 0;
        zoneShown = 0;
      }
    }
  }

  const hudBoard = true;
  const toRacer = (r: Runner): Racer => ({ name: r.name, color: r.color, me: r.me, done: r.finished, x: r.car.x, z: r.car.z });

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
    finishPlace = order.findIndex((r) => r.me) + 1;
    phase = 'finish';
    phaseT = 0;
    waitT = 0;
    drift.on = false;
    hud.msg('MÅL!', 1800, 'gold');
    if (trial) hud.subtitle(`⏱️ ${fmtTime(finishTime)}`);
    else hud.subtitle(finishPlace === 1 ? `🏆 Du vann! ${fmtTime(finishTime)}` : `Du kom ${ordinal(finishPlace)}! ${fmtTime(finishTime)}`);
    hud.wrongWay(false);
    audio.fanfare(finishPlace === 1);
    audio.cheer(1);
    audio.music(0.75);
    const ms = Math.round(finishTime * 1000);
    if (rules) {
      const medal = raceMedal(course.id, LAPS, ms);
      const record = !opts?.best || ms < opts.best;
      const parts = [medal === 'gold' ? '🥇 Guld!' : medal === 'silver' ? '🥈 Silver!' : medal === 'bronze' ? '🥉 Brons!' : '', record ? '⭐ Nytt rekord!' : ''].filter(Boolean);
      if (parts.length) setTimeout(() => !destroyed && hud.toast(parts.join(' ')), 1900);
    }
    if (trial) saveGhost(ms);
    if (online) {
      net!.sendFinish(ms, Math.round(me.damage));
      setTimeout(() => !destroyed && !resultLines && hud.subtitle('Väntar på de andra…'), 2600);
    }
  }

  /** The end of a race alone (or the arcade's). */
  function endSolo(): void {
    ended = true;
    phase = 'over';
    const me = player();
    const total = runners().length;
    let sc = finishPlace > 0 ? score(finishPlace, finishTime) : 1200 + Math.round(1800 * clamp(me.u / (LAPS * track.length), 0, 1));
    let detail = finishPlace > 0 ? `${ordinal(finishPlace)} plats · ${fmtTime(finishTime)}` : `Nästan i mål! · ${Math.min(LAPS, me.lapsDone)} av ${LAPS} varv`;
    if (rules) {
      const ms = finishPlace > 0 ? Math.round(finishTime * 1000) : 0;
      const medal = ms ? raceMedal(course.id, LAPS, ms) : null;
      const medalTxt = medal === 'gold' ? ' · 🥇' : medal === 'silver' ? ' · 🥈' : medal === 'bronze' ? ' · 🥉' : '';
      if (trial) {
        sc = finishPlace > 0 ? Math.round(3000 + 12000 * clamp((track.idealLap * LAPS * 1.6 - finishTime) / (track.idealLap * LAPS * 0.56), 0, 1) ** 2) : 1200;
        detail = finishPlace > 0 ? `Tidskörning · ${fmtTime(finishTime)}${medalTxt}` : 'Tidskörning · ej i mål';
      } else {
        // the server pays the same formula; not finishing pays the small taking-part prize
        detail += ` · +${finishPlace > 0 ? racePrize(rules, finishPlace, total) : RACE_DNF_PRIZE} kr${medalTxt}`;
      }
      sc += styleBonus();
      opts?.onDone?.({ place: trial ? 1 : finishPlace > 0 ? finishPlace : total, n: trial ? 1 : total, time: ms, damage: Math.round(me.damage), coins: 0 });
    }
    finishEnd(sc, detail);
  }

  function showResults(lines: RaceResultLine[]): void {
    const meId = opts?.me ?? 'me';
    // the computer cars too (the one in slot k is ROSTER[k] on every screen)
    const nameOf = (l: RaceResultLine): string => (l.id.startsWith('ai:') ? ROSTER[Number(l.id.slice(3))]?.name : undefined) ?? l.name;
    const rows: ResultRow[] = [...lines].sort((a, b) => (a.place || 99) - (b.place || 99)).map((l) => ({ name: nameOf(l), me: l.id === meId, time: l.time, place: l.place, prize: l.prize, medal: l.medal }));
    hud.subtitle('');
    hud.results('🏁 Resultat', rows);
  }

  /** The end of an online race: the server's result, or our own standings when it never came. */
  function endOnline(): void {
    if (ended) return;
    ended = true;
    phase = 'over';
    const me = player();
    const meId = opts?.me ?? 'me';
    const mine = resultLines?.find((l) => l.id === meId);
    const pl = mine?.place || finishPlace;
    const t = mine?.time != null ? mine.time / 1000 : me.finished ? finishTime : 0;
    let sc: number;
    let detail: string;
    if (pl > 0 && t > 0) {
      sc = score(pl, t) + styleBonus();
      detail = `${ordinal(pl)} plats · ${fmtTime(t)}${mine ? ` · +${mine.prize} kr` : ''}`;
    } else {
      sc = 1200 + Math.round(1800 * clamp(me.u / (LAPS * track.length), 0, 1)) + styleBonus();
      detail = `Nästan i mål! · ${Math.min(LAPS, me.lapsDone)} av ${LAPS} varv${mine ? ` · +${mine.prize} kr` : ''}`;
    }
    finishEnd(sc, detail);
  }

  /** Free roam: home to the garage with the coins. */
  function goHome(): void {
    if (ended) return;
    ended = true;
    phase = 'over';
    const me = player();
    const coins = world?.taken ?? 0;
    opts?.onDone?.({ place: 0, n: 0, time: Math.round(raceT * 1000), damage: Math.round(me.damage), coins });
    // only the coins left of today's limit turn into kr (the server says the same)
    const kr = Math.min(coins, coinsLeft) * ROAM_COIN_KR;
    finishEnd(Math.min(99999, coins * 100 + stunt), `🪙 ${coins} mynt · ${kr} kr${coinsLeft <= 0 ? ' · Dagens mynt är slut' : ''}`);
  }

  function finishEnd(sc: number, detail: string): void {
    if (DEBUG) (window as unknown as { __rallyEnd: unknown }).__rallyEnd = { score: sc, detail };
    // the result card goes over the last frame: leave the picture, not the HUD
    hud.root.style.display = 'none';
    ctx.end(sc, detail);
  }

  // ---- drawing ----
  const up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncModel(c: Car, m: CarModel, time: number, blink = true): void {
    m.root.position.set(c.x, c.y, c.z);
    euler.set(-c.slopePitch, c.heading, c.slopeRoll, 'YXZ');
    m.root.quaternion.setFromEuler(euler);
    m.body.position.y = c.susp;
    m.body.rotation.x = clamp(-c.accLong * 0.009, -0.09, 0.07);
    m.body.rotation.z = clamp(c.accLat * 0.007, -0.08, 0.08);
    for (let w = 0; w < 4; w++) {
      const wg = m.wheels[w];
      if (!wg) continue;
      if (w < 2) wg.rotation.y = c.steerAngle;
      const spin = wg.children[0];
      if (spin) spin.rotation.x = w < 2 ? c.wheelRot : c.rearRot;
      wg.position.y = WHEEL_R + Math.max(-0.08, Math.min(0.06, c.susp * 0.3));
    }
    m.brakeMat.color.set(c.braking ? '#ff3a24' : '#701812');
    m.root.visible = !blink || c.ghost <= 0 || Math.floor(time * 12) % 2 === 0;
    // blob shadow on the ground, fading as the car flies
    const gy = c.groundAt(c.x, c.z, ground);
    const h = Math.max(0, c.y - gy);
    m.shadow.position.set(c.x, gy + 0.06, c.z);
    m.shadow.rotation.y = c.heading;
    (m.shadow.material as THREE.MeshBasicMaterial).opacity = (high ? 0.38 : 0.55) * clamp(1 - h / 4, 0.15, 1);
    const sc = 1 + h * 0.15;
    m.shadow.scale.set(sc, 1, sc);
  }

  let remoteDmg = new Map<string, number>();
  function syncModels(time: number): void {
    for (const e of entrants) syncModel(e.car, e.model, time);
    for (const rc of remotes.values()) {
      const vis = rc.shown;
      rc.model.root.visible = vis;
      rc.model.shadow.visible = vis;
      if (!vis) continue;
      syncModel(rc.car, rc.model, time, false);
      rc.model.setNitro(rc.nitro ? 1 : 0);
      if (Math.floor(remoteDmg.get(rc.id) ?? -1) !== Math.floor(rc.damage / 4)) {
        remoteDmg.set(rc.id, Math.floor(rc.damage / 4));
        rc.model.setDamage(rc.damage);
      }
    }
  }

  const ghostPos = { x: 0, y: 0, z: 0, h: 0 };
  function placeGhost(): void {
    if (!ghostModel || !ghostRun) return;
    const on = (phase === 'race' || phase === 'finish') && ghostRun.sample(raceT, ghostPos);
    ghostModel.root.visible = on;
    if (!on) return;
    ghostModel.root.position.set(ghostPos.x, ghostPos.y, ghostPos.z);
    ghostModel.root.rotation.set(0, ghostPos.h, 0);
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
      const sz = me.tune.size;
      const velYaw = c.speed > 4 ? Math.atan2(c.vx, c.vz) : c.heading;
      let target = c.heading;
      if (c.speed > 4 && c.vLong > 0) target = c.heading + wrapAngle(velYaw - c.heading) * 0.4;
      camYaw += wrapAngle(target - camYaw) * (1 - Math.exp(-dt * (far ? 3.5 : 5)));
      const dist = ((far ? 13 : 6.6) + c.speed * (far ? 0.05 : 0.035)) * sz;
      const hgt = (far ? 5.4 : 2.45) * sz;
      tmpV.set(c.x - Math.sin(camYaw) * dist, c.y + hgt, c.z - Math.cos(camYaw) * dist);
      const gy = terrain.visual(tmpV.x, tmpV.z) + 1.2;
      if (tmpV.y < gy) tmpV.y = gy;
      camPos.lerp(tmpV, 1 - Math.exp(-dt * 9));
      if (camPos.y < gy) camPos.y = gy;
      tmpV2.set(c.x + Math.sin(camYaw) * 2.5, c.y + (far ? 1.2 : 1.15) * sz, c.z + Math.cos(camYaw) * 2.5);
      camLook.lerp(tmpV2, 1 - Math.exp(-dt * 14));
      fov = (far ? 56 : 60) + smooth(6, 48, c.speed) * (far ? 8 : 16);
    }
    if (nitroT > 0 && phase === 'race') fov += 7;
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

  /** Names over the others' cars online and in free roam. */
  const tagV = new THREE.Vector3();
  function drawTags(): void {
    if (!net) return;
    const list: { id: string; name: string; color: string; x: number; y: number; alpha: number }[] = [];
    for (const r of runners()) {
      if (r.me) continue;
      const d = camera.position.distanceTo(tagV.set(r.car.x, r.car.y, r.car.z));
      if (d > 140) continue;
      tagV.set(r.car.x, r.car.y + 2.3 * (r.car.size || 1), r.car.z).project(camera);
      if (tagV.z > 1 || tagV.z < -1 || Math.abs(tagV.x) > 1.1 || Math.abs(tagV.y) > 1.1) continue;
      list.push({ id: r.id, name: r.name, color: r.color, x: ((tagV.x + 1) / 2) * W, y: ((1 - tagV.y) / 2) * H, alpha: clamp(1.3 - d / 120, 0.25, 1) });
    }
    hud.tags(list);
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
    weather?.update(timeU.value, camera.position);
    placeGhost();
    // the minimap and speedometer
    if (phase !== 'intro') {
      const c = player().car;
      hud.drawSpeedo(Math.abs(c.vLong) * 3.6, c.rpm, c.reverse ? -1 : c.gear, 7000);
      hud.drawMap(runners().map(toRacer), timeU.value);
    }
    renderer.render(scene, camera);
    drawTags();
    if (DEBUG) {
      const me = player();
      (window as unknown as { __rally: unknown }).__rally = {
        phase,
        mode,
        course: course.id,
        raceT,
        place,
        laps: me.lapsDone,
        u: me.u,
        x: me.car.x,
        z: me.car.z,
        speed: me.car.speed,
        ended,
        finishPlace,
        finishTime,
        bestLap,
        idealLap: track.idealLap,
        length: track.length,
        damage: me.damage,
        style: stylePts,
        nitro: nitroLeft,
        coins: world?.taken ?? 0,
        stunt,
        ghost: !!ghostRun && !!ghostModel?.root.visible,
        remotes: [...remotes.values()].map((r) => ({ id: r.id, ready: r.ready, u: Math.round(r.u), x: Math.round(r.car.x), z: Math.round(r.car.z) })),
        result: resultLines,
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
      // quit from the pause menu out in free roam: the coins found still go home to the garage
      if (roam && !ended && meE && phase !== 'intro') {
        ended = true;
        opts?.onDone?.({ place: 0, n: 0, time: Math.round(raceT * 1000), damage: Math.round(meE.damage), coins: world?.taken ?? 0 });
      }
      destroyed = true;
      loop?.stop();
      ro.disconnect();
      for (const u of unsubs) u();
      for (const rc of remotes.values()) rc.dispose();
      remotes.clear();
      remoteDmg = new Map();
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
      for (const l of headlights) l.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};

export default rally;
