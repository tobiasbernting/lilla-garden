// Sagan i 3D: a standalone page that shows one of the saga dungeons in 3D, third person, in a cute toy style.
// Query: ?d=draug|frost|surt  ?c=vaktare|helare|krigare|magiker  ?quality=low|high  ?touch=1  ?stats=1
// (?autodpr=0 turns the automatic pixel-ratio drop off, handy for screenshots on a slow machine).
import * as THREE from 'three';
import { CLASSES, DUNGEONS, GCD_MS, SAGA_BOSSES, SAGA_MOBS, SPELLS, generateSaga, isClassId, isDungeonId, type ClassDef, type DungeonId } from '@lilla-garden/shared';
import { Input } from '../input.ts';
import { Loop } from '../kit.ts';
import { ThirdPersonCamera } from './camera.ts';
import { Fx } from './fx.ts';
import { makeMobFigure, makePlayerFigure, type Figure } from './figures.ts';
import { Hud } from './hud.ts';
import { Sim, type SimEvent, type SimMob } from './sim.ts';
import { buildWorld } from './world.ts';

const params = new URLSearchParams(location.search);
const dungeonParam = params.get('d');
const classParam = params.get('c');
const dungeonId: DungeonId = isDungeonId(dungeonParam) ? dungeonParam : 'draug';
const cls: ClassDef = CLASSES[isClassId(classParam) ? classParam : 'krigare'];
const def = DUNGEONS[dungeonId];

// ---- quality: low on touch screens and small screens, like the arcade shell ----
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 800;
const qualityParam = params.get('quality');
const low = qualityParam === 'low' ? true : qualityParam === 'high' ? false : coarse || small;
const touch = params.get('touch') === '1' || coarse || 'ontouchstart' in window;
const stats = params.get('stats') === '1';
const autoDpr = params.get('autodpr') !== '0';
const deviceDpr = window.devicePixelRatio || 1;
let dpr = low ? Math.min(deviceDpr, 1) : Math.min(deviceDpr, 1.5);

const ATTACK_S = 0.45;
/** Figures farther than this from the player are not drawn at all (the fog hides the cut). */
const DRAW_DIST = 22;
const STEP = 1 / 60;
/** Spell kinds that swing a weapon; the rest raise both arms for a moment. */
const SWING_KINDS = new Set(['melee', 'bash', 'whirl', 'charge']);

const root = document.getElementById('root')!;
root.replaceChildren();

// ---- renderer, scene, lights ----
const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(root.clientWidth || innerWidth, root.clientHeight || innerHeight, false);
const canvas = renderer.domElement;
Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
root.append(canvas);

// `def.ambient` only gives the hue (scaled so its strongest channel is 1); the brightness is set per dungeon below.
// The "ceiling" is just darkness: fog is a very dark tint of the hue and the void behind it is darker still, so the top
// of the frame never looks like open sky and the walls (lit by the lights) are always lighter than what is behind them.
const hue = new THREE.Color(def.ambient[0], def.ambient[1], def.ambient[2]);
hue.multiplyScalar(1 / Math.max(hue.r, hue.g, hue.b));
const LOOK: Record<DungeonId, { hemi: number; sun: number; sunColor: number; fog: number; fogNear: number; fogFar: number; ground: number }> = {
  draug: { hemi: 1.2, sun: 1.0, sunColor: 0xdfe6ff, fog: 0.05, fogNear: 9, fogFar: 26, ground: 0.25 },
  frost: { hemi: 1.65, sun: 1.0, sunColor: 0xd6e6ff, fog: 0.07, fogNear: 9, fogFar: 26, ground: 0.5 },
  surt: { hemi: 1.9, sun: 0.9, sunColor: 0xffb68a, fog: 0.05, fogNear: 9, fogFar: 26, ground: 0.2 },
};
const look = LOOK[dungeonId];
const fogColor = hue.clone().multiplyScalar(look.fog);
const scene = new THREE.Scene();
scene.background = fogColor.clone().multiplyScalar(0.4);
scene.fog = new THREE.Fog(fogColor, look.fogNear, look.fogFar);
scene.add(new THREE.HemisphereLight(hue.clone().lerp(new THREE.Color(1, 1, 1), 0.4), hue.clone().multiplyScalar(look.ground), look.hemi));
const sun = new THREE.DirectionalLight(look.sunColor, look.sun);
sun.position.set(-4, 9, 5);
scene.add(sun);

const world = generateSaga(dungeonId);
const dungeon = buildWorld(world, def);
scene.add(dungeon.group);

// at most four real lights, hung on the flames nearest the player; the rest of the torches just glow
const LIGHTS = 4;
const lights: THREE.PointLight[] = [];
for (let i = 0; i < LIGHTS; i++) {
  const l = new THREE.PointLight(0xffa850, 7, 11, 2);
  l.position.set(0, -50, 0);
  scene.add(l);
  lights.push(l);
}
let lightClock = 0;
function assignLights(px: number, pz: number, t: number): void {
  // sorting a few dozen torches a few times a second is nothing; flicker runs every frame
  if (t - lightClock > 0.15) {
    lightClock = t;
    const order = dungeon.torches
      .map((v, i) => ({ i, d: (v.x - px) ** 2 + (v.z - pz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHTS);
    lights.forEach((l, k) => {
      const hit = order[k];
      if (hit) l.position.copy(dungeon.torches[hit.i]!);
      else l.position.set(0, -50, 0);
      l.userData.slot = hit?.i ?? -1;
    });
  }
  lights.forEach((l, k) => {
    l.intensity = l.userData.slot >= 0 ? 7 + Math.sin(t * 9 + k * 2.1) * 0.8 + Math.sin(t * 23 + k) * 0.4 : 0;
  });
}

// ---- the rules, the player and the monsters ----
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
const orbit = new ThirdPersonCamera(camera, canvas);
const sim = new Sim(world, { dungeon: dungeonId, cls: cls.id, walkable: dungeon.isWalkable });
if (sim.gateOpen) dungeon.setGateOpen(true);
const player = sim.player;
const figure = makePlayerFigure(cls);
scene.add(figure.group);
/** Smoothed facing for drawing (the sim turns instantly). */
let drawFacing = player.facing;
let lastCastKind = '';
let lastSlot = 0;

interface MobView {
  fig: Figure;
  facing: number;
  speed: number;
}
const views = new Map<number, MobView>();
function viewOf(m: SimMob): MobView {
  let v = views.get(m.id);
  if (!v) {
    const fig = makeMobFigure(m.species, m.size);
    fig.group.visible = false;
    scene.add(fig.group);
    const d = SAGA_BOSSES[m.species] ?? SAGA_MOBS[m.species];
    views.set(m.id, (v = { fig, facing: m.facing, speed: d?.speed ?? 2 }));
  }
  return v;
}

const input = new Input();
const hud = new Hud(root, { touch, stats, dungeonName: def.name, input });
hud.setPlayer(Math.round(player.hp), player.max, cls);
const fx = new Fx(scene, camera, root, sim);

function doCast(slot: number): void {
  lastSlot = slot;
  sim.cast(slot as 0 | 1 | 2 | 3);
}
hud.onSpell = doCast;
hud.onPotion = () => {
  lastSlot = 4;
  sim.potion();
};

const mobName = (m: SimMob): string => (SAGA_BOSSES[m.species] ?? SAGA_MOBS[m.species])?.name ?? m.species;

/** What the HUD and the world do with each thing the sim reports (the visuals themselves are in Fx). */
function onEvent(e: SimEvent): void {
  fx.handle(e);
  switch (e.type) {
    case 'cast':
      lastCastKind = e.kind;
      break;
    case 'yell': {
      const b = sim.mobs.get(e.by);
      hud.speak(b ? `${mobName(b)}: ”${e.text}”` : e.text);
      break;
    }
    case 'fail':
      hud.shake(lastSlot);
      if (e.reason === 'noTarget') hud.toast('Inget mål!', 1100);
      else if (e.reason === 'range') hud.toast('För långt bort!', 1100);
      break;
    case 'gateOpen':
      dungeon.setGateOpen(true);
      hud.toast('Porten öppnas!', 3500);
      break;
    case 'cleared':
      hud.toast('Dungeon klarad! 🎉', 8000);
      break;
    default:
      break;
  }
}

const onKey = (e: KeyboardEvent): void => {
  if (input.keyEvent(e)) e.preventDefault();
};
const onBlur = (): void => input.clear();
window.addEventListener('keydown', onKey);
window.addEventListener('keyup', onKey);
window.addEventListener('blur', onBlur);

// ---- clicking or tapping a monster: the nearest one to the finger within a few dozen pixels ----
const tapAt = { x: 0, y: 0, t: 0, id: -1 };
const onDown = (e: PointerEvent): void => {
  tapAt.x = e.clientX;
  tapAt.y = e.clientY;
  tapAt.t = performance.now();
  tapAt.id = e.pointerId;
};
const onUp = (e: PointerEvent): void => {
  if (e.pointerId !== tapAt.id) return;
  tapAt.id = -1;
  if (performance.now() - tapAt.t > 400 || Math.hypot(e.clientX - tapAt.x, e.clientY - tapAt.y) > 10) return;
  pickMob(e.clientX, e.clientY);
};
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointerup', onUp);
const pickV = new THREE.Vector3();
function pickMob(cx: number, cy: number): void {
  const r = canvas.getBoundingClientRect();
  let best: SimMob | null = null;
  let bestD = Infinity;
  for (const m of sim.mobs.values()) {
    if (m.dead || Math.hypot(m.x - player.x, m.z - player.z) > DRAW_DIST) continue;
    pickV.set(m.x, 0.5 * m.size, m.z).project(camera);
    if (pickV.z > 1) continue;
    const sx = r.left + (pickV.x * 0.5 + 0.5) * r.width;
    const sy = r.top + (-pickV.y * 0.5 + 0.5) * r.height;
    const d = Math.hypot(sx - cx, sy - cy);
    // bigger monsters are bigger targets
    if (d < 40 + 14 * m.size && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  if (best) sim.setTarget(best.id);
}
hud.onTap = pickMob;

function resize(): void {
  const w = root.clientWidth || innerWidth;
  const h = root.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fx.resize(w, h, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ---- the fixed 60 Hz update ----
function update(dt: number): void {
  for (let i = 0; i < 4; i++) if (input.keyPressed(`Digit${i + 1}`)) doCast(i);
  if (input.keyPressed('Digit5')) hud.onPotion();
  if (input.keyPressed('Tab')) sim.cycleTarget();
  if (input.keyPressed('Escape')) sim.setTarget(null);

  // gamepad: the right stick orbits the camera
  const look = input.stick(1);
  if (look.x || look.y) orbit.orbit(-look.x * 2.6 * dt, look.y * 1.6 * dt);

  // movement is relative to the camera: up on the stick is away from the camera
  const s = input.stick(0);
  const f = orbit.forward();
  const r = orbit.right();
  const mx = f.x * -s.y + r.x * s.x;
  const mz = f.z * -s.y + r.z * s.x;
  const len = Math.hypot(mx, mz);
  sim.move(mx, mz);
  // the camera swings behind us when we walk away from or across the view, not when we walk at it
  orbit.wantYaw = len > 0.05 && !player.down && s.y < 0.2 ? Math.atan2(-mx, -mz) : null;

  sim.update(dt);
  for (const e of sim.drain()) onEvent(e);
  input.frame();
}

// ---- rendering, FPS and the automatic pixel-ratio drop ----
let frames = 0;
let windowStart = performance.now();
let fps = 60;
let slowSeconds = 0;
let note = '';
let grace = 2;
/** Turns `a` towards `b` by a fraction of the way round (radians). */
const turn = (a: number, b: number, k: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
let lastNow = performance.now();

/** Everything that depends on what the sim says right now: figures, fx and the HUD. Once per rendered frame. */
function present(simT: number, t: number, rdt: number): void {
  // the player
  drawFacing = turn(drawFacing, player.facing, 1 - Math.exp(-rdt * 16));
  figure.group.position.set(player.x, 0, player.z);
  // figures face +z; the sim's facing is atan2(dz, dx), so the yaw is a quarter turn minus it
  figure.group.rotation.y = Math.PI / 2 - drawFacing;
  const since = simT - player.attackAt;
  const swing = SWING_KINDS.has(lastCastKind);
  figure.animate({ t, moving: player.moving, speed: player.speed, attack: swing && since >= 0 && since < ATTACK_S ? since / ATTACK_S : -1, cast: !swing && since >= 0 && since < 0.4, down: player.down });

  // the monsters: far ones are not drawn (and not animated) at all
  for (const m of sim.mobs.values()) {
    const v = viewOf(m);
    const g = v.fig.group;
    if (v.fig.gone || Math.hypot(m.x - player.x, m.z - player.z) > DRAW_DIST) {
      g.visible = false;
      continue;
    }
    g.visible = true;
    v.facing = turn(v.facing, m.facing, 1 - Math.exp(-rdt * 12));
    g.position.set(m.x, 0, m.z);
    g.rotation.y = Math.PI / 2 - v.facing;
    const hit = simT - m.atkAt;
    v.fig.animate({ t, moving: m.moving && !m.dead, speed: v.speed, attack: hit >= 0 && hit < ATTACK_S ? hit / ATTACK_S : -1, cast: !!m.cast && !m.dead, down: m.dead, stunned: simT < m.stunUntil && !m.dead });
  }

  // the HUD
  hud.setPlayer(Math.round(player.hp), player.max, cls);
  hud.setDown(player.down);
  for (let i = 0; i < 4; i++) {
    const sp = SPELLS[cls.spells[i] ?? ''];
    const left = Math.max(0, (player.cds[i] ?? 0) - sim.time) / ((sp?.cd ?? 1000) / 1000);
    const gcd = Math.max(0, player.gcdUntil - sim.time) / (GCD_MS / 1000);
    hud.setCooldown(i, Math.max(left, gcd));
  }
  hud.setCooldown(4, Math.max(0, player.potionReadyAt - sim.time) / 15);
  const tm = player.target === null ? undefined : sim.mobs.get(player.target);
  // the boss bar: the targeted boss, else any boss that is fighting (a targeted boss gets no second frame)
  let boss: SimMob | undefined = tm && !tm.dead && (tm.kind === 'boss' || tm.kind === 'mini') ? tm : undefined;
  if (!boss) for (const m of sim.mobs.values()) if (!m.dead && m.state === 'fight' && (m.kind === 'boss' || m.kind === 'mini')) boss = m;
  if (boss) hud.setBoss(mobName(boss), boss.hp, boss.max);
  else hud.setBoss(null);
  if (tm && !tm.dead && tm !== boss) hud.setTarget(mobName(tm), tm.hp, tm.max);
  else hud.setTarget(null);

  orbit.follow({ x: player.x, y: 0, z: player.z });
  orbit.update(rdt, dungeon.isWalkable, dungeon.blocksView);
  camera.updateMatrixWorld();
  assignLights(player.x, player.z, t);
  fx.update(rdt, simT);
}

function render(alpha: number): void {
  const now = performance.now();
  const t = now / 1000;
  const rdt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  present(sim.time + alpha * STEP, t, rdt);
  renderer.render(scene, camera);

  frames++;
  if (now - windowStart >= 500) {
    fps = (frames * 1000) / (now - windowStart);
    frames = 0;
    windowStart = now;
    hud.setFps(fps, note);
    hud.setStats(renderer.info.render.calls, renderer.info.render.triangles, dpr);
    // below 28 fps for three seconds: render fewer pixels (never under 0.6)
    if (grace > 0) grace -= 0.5;
    else if (fps < 28 && autoDpr && dpr > 0.6) {
      slowSeconds += 0.5;
      if (slowSeconds >= 3) {
        dpr = Math.max(0.6, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        note = `pixelratio sänkt till ${dpr.toFixed(2)}`;
        slowSeconds = 0;
        grace = 1.5;
      }
    } else slowSeconds = 0;
  }
}

const loop = new Loop(update, render);

// a handle for tests and for the people wiring in the sim
Object.assign(window, { saga3d: { renderer, scene, camera, orbit, world, dungeon, sim, player, fx, hud, input, views, makeMobFigure, fps: () => fps } });

// no leaked animation loops or listeners when Vite hot-reloads this module
import.meta.hot?.dispose(() => {
  loop.stop();
  orbit.dispose();
  hud.dispose();
  dungeon.dispose();
  figure.dispose();
  for (const v of views.values()) v.fig.dispose();
  fx.dispose();
  canvas.removeEventListener('pointerdown', onDown);
  canvas.removeEventListener('pointerup', onUp);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', resize);
  renderer.dispose();
  canvas.remove();
});
