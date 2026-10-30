// Sagan i 3D: a standalone page that shows one of the saga dungeons in 3D, third person, in a cute toy style.
// Query: ?d=draug|frost|surt  ?c=vaktare|helare|krigare|magiker  ?quality=low|high  ?touch=1  ?stats=1
// (?autodpr=0 turns the automatic pixel-ratio drop off, handy for screenshots on a slow machine).
import * as THREE from 'three';
import { CLASSES, DUNGEONS, SPELLS, generateSaga, isClassId, isDungeonId, type ClassDef, type DungeonId } from '@lilla-garden/shared';
import { Input } from '../input.ts';
import { Loop } from '../kit.ts';
import { ThirdPersonCamera } from './camera.ts';
import { makePlayerFigure } from './figures.ts';
import { Hud } from './hud.ts';
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

const SPEED = 4;
const RADIUS = 0.3;
const ATTACK_S = 0.45;

const root = document.getElementById('root')!;
root.replaceChildren();

// ---- renderer, scene, lights ----
const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(root.clientWidth || innerWidth, root.clientHeight || innerHeight, false);
const canvas = renderer.domElement;
Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
root.append(canvas);

const ambient = new THREE.Color(def.ambient[0], def.ambient[1], def.ambient[2]);
// the void and the fog share one colour: the ambient colour a little darker, so the far end melts away
const fogColor = ambient.clone().multiplyScalar(0.45);
const scene = new THREE.Scene();
scene.background = fogColor;
scene.fog = new THREE.Fog(fogColor, 12, 30);
scene.add(new THREE.HemisphereLight(ambient.clone().lerp(new THREE.Color(1, 1, 1), 0.55), ambient.clone().multiplyScalar(0.35), 2.6));
const sun = new THREE.DirectionalLight(0xfff0dd, 1.5);
sun.position.set(-4, 9, 5);
scene.add(sun);

const world = generateSaga(dungeonId);
const dungeon = buildWorld(world, def);
scene.add(dungeon.group);

// at most four real lights, hung on the flames nearest the player; the rest of the torches just glow
const LIGHTS = 4;
const lights: THREE.PointLight[] = [];
for (let i = 0; i < LIGHTS; i++) {
  const l = new THREE.PointLight(0xffa850, 9, 11, 2);
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
    l.intensity = l.userData.slot >= 0 ? 9 + Math.sin(t * 9 + k * 2.1) * 0.8 + Math.sin(t * 23 + k) * 0.4 : 0;
  });
}

// ---- the player ----
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
const orbit = new ThirdPersonCamera(camera, canvas);
const player = { x: dungeon.start.x, z: dungeon.start.z, facing: Math.PI };
const figure = makePlayerFigure(cls);
scene.add(figure.group);
let attackT = -1;
let moving = false;
const cooldown = [0, 0, 0, 0];
const hp = { now: cls.hp, max: cls.hp };

const input = new Input();
const hud = new Hud(root, { touch, stats, dungeonName: def.name, input });
hud.setPlayer(hp.now, hp.max, cls);

/** Phase 1 has no combat yet: a spell just plays the attack swing and shows its cooldown sweep. */
function castSlot(slot: number): void {
  const sp = SPELLS[cls.spells[slot] ?? ''];
  if (!sp || (cooldown[slot] ?? 0) > 0) return;
  cooldown[slot] = sp.cd / 1000;
  attackT = 0;
}
hud.onSpell = castSlot;
hud.onPotion = () => hud.setCooldown(4, 1);

const onKey = (e: KeyboardEvent): void => {
  if (input.keyEvent(e)) e.preventDefault();
};
const onBlur = (): void => input.clear();
window.addEventListener('keydown', onKey);
window.addEventListener('keyup', onKey);
window.addEventListener('blur', onBlur);

function resize(): void {
  const w = root.clientWidth || innerWidth;
  const h = root.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/** Can a body of radius 0.3 stand here? Four corner samples, as the spec says. */
const canStand = (x: number, z: number): boolean =>
  dungeon.isWalkable(x - RADIUS, z - RADIUS) && dungeon.isWalkable(x + RADIUS, z - RADIUS) && dungeon.isWalkable(x - RADIUS, z + RADIUS) && dungeon.isWalkable(x + RADIUS, z + RADIUS);

// ---- the fixed 60 Hz update ----
function update(dt: number): void {
  for (let i = 0; i < 4; i++) {
    if (input.keyPressed(`Digit${i + 1}`)) castSlot(i);
    cooldown[i] = Math.max(0, (cooldown[i] ?? 0) - dt);
    const sp = SPELLS[cls.spells[i] ?? ''];
    hud.setCooldown(i, sp ? (cooldown[i] ?? 0) / (sp.cd / 1000) : 0);
  }
  if (input.keyPressed('Digit5')) hud.onPotion();

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
  moving = len > 0.05;
  if (moving) {
    const k = (SPEED * Math.min(1, len)) / len;
    // each axis on its own, so you slide along a wall instead of sticking to it
    const nx = player.x + mx * k * dt;
    if (canStand(nx, player.z)) player.x = nx;
    const nz = player.z + mz * k * dt;
    if (canStand(player.x, nz)) player.z = nz;
    // turn smoothly to face the way we walk
    const want = Math.atan2(mx, mz);
    const diff = Math.atan2(Math.sin(want - player.facing), Math.cos(want - player.facing));
    player.facing += diff * (1 - Math.exp(-dt * 14));
    // the camera swings behind us when we walk away from or across the view, not when we walk at it
    orbit.wantYaw = s.y < 0.2 ? Math.atan2(-mx, -mz) : null;
  } else orbit.wantYaw = null;
  if (attackT >= 0) {
    attackT += dt / ATTACK_S;
    if (attackT >= 1) attackT = -1;
  }
  hud.setPlayer(hp.now, hp.max, cls);
  input.frame();
}

// ---- rendering, FPS and the automatic pixel-ratio drop ----
let frames = 0;
let windowStart = performance.now();
let fps = 60;
let slowSeconds = 0;
let note = '';
let grace = 2;
function render(): void {
  const now = performance.now();
  const t = now / 1000;
  figure.group.position.set(player.x, 0, player.z);
  figure.group.rotation.y = player.facing;
  figure.animate({ t, moving, speed: SPEED, attack: attackT, cast: false, down: false });
  orbit.follow({ x: player.x, y: 0, z: player.z });
  orbit.update(1 / 60, dungeon.isWalkable, dungeon.blocksView);
  assignLights(player.x, player.z, t);
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
Object.assign(window, { saga3d: { renderer, scene, camera, orbit, world, dungeon, player, hud, input, fps: () => fps } });

// no leaked animation loops or listeners when Vite hot-reloads this module
import.meta.hot?.dispose(() => {
  loop.stop();
  orbit.dispose();
  hud.dispose();
  dungeon.dispose();
  figure.dispose();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', resize);
  renderer.dispose();
  canvas.remove();
});
