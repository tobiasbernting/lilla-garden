// Chibi figures: a big round head, a stubby body, arms and legs that swing. Geometry and materials are
// shared between every figure, so a whole crowd costs only a few extra draw calls. Figures face +z.
import * as THREE from 'three';
import type { ClassDef } from '@lilla-garden/shared';

export interface FigureState {
  /** Seconds, any steady clock (the walk cycle and the idle breathing run on it). */
  t: number;
  moving: boolean;
  /** Tiles per second, for the pace of the walk cycle. */
  speed: number;
  /** 0..1 progress of an attack swing, or -1 when not attacking. */
  attack: number;
  /** Casting a spell: both arms up. */
  cast: boolean;
  /** Fallen: lies on its back. */
  down: boolean;
}

export interface Figure {
  group: THREE.Group;
  animate(s: FigureState): void;
  dispose(): void;
}

// ---- shared geometry, materials and the blob shadow texture ----
const geos = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
};
const sphere = (): THREE.BufferGeometry => geo('sphere', () => new THREE.SphereGeometry(1, 16, 12));
const box = (): THREE.BufferGeometry => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const cyl = (): THREE.BufferGeometry => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1));
const cone = (): THREE.BufferGeometry => geo('cone', () => new THREE.ConeGeometry(1, 1, 12, 1));
const capsule = (): THREE.BufferGeometry => geo('capsule', () => new THREE.CapsuleGeometry(1, 1, 4, 10));
const dome = (): THREE.BufferGeometry => geo('dome', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
const smile = (): THREE.BufferGeometry => geo('smile', () => new THREE.TorusGeometry(1, 0.2, 4, 10, Math.PI));

const mats = new Map<string, THREE.Material>();
const lambert = (color: number | string): THREE.MeshLambertMaterial => {
  const key = `l${new THREE.Color(color).getHexString()}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color })));
  return m as THREE.MeshLambertMaterial;
};
const glowMat = (color: number): THREE.MeshBasicMaterial => {
  const key = `g${color}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshBasicMaterial({ color })));
  return m as THREE.MeshBasicMaterial;
};

let shadowTex: THREE.CanvasTexture | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;
const shadowGeo = (): THREE.BufferGeometry => geo('shadow', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
/** A soft dark circle, drawn once and shared by every figure. */
function blobShadow(size: number): THREE.Mesh {
  if (!shadowMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
    shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(shadowGeo(), shadowMat);
  m.scale.set(size, 1, size);
  m.position.y = 0.025;
  m.renderOrder = 1;
  return m;
}

type V3 = [number, number, number];
function part(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, size: V3 | number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  const s: V3 = typeof size === 'number' ? [size, size, size] : size;
  mesh.scale.set(...s);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
}
/** A joint: an empty group at the shoulder or hip that the limb hangs from, so rotating it swings the limb. */
function joint(parent: THREE.Object3D, pos: V3): THREE.Group {
  const j = new THREE.Group();
  j.position.set(...pos);
  parent.add(j);
  return j;
}

const SKIN = 0xffdcc0;
const DARK = 0x2a2233;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (x: number): number => x * x * (3 - 2 * x);

/** Shared cute face on a head of radius r centred at `head`. */
function face(rig: THREE.Object3D, y: number, r: number): void {
  const eye = lambert(DARK);
  for (const s of [-1, 1]) {
    part(rig, sphere(), eye, [0.032, 0.04, 0.026], [s * r * 0.36, y + 0.01, r * 0.93]);
    // a tiny white sparkle in each eye
    part(rig, sphere(), glowMat(0xffffff), 0.009, [s * r * 0.36 + 0.01, y + 0.025, r * 0.93 + 0.022]);
    part(rig, sphere(), lambert(0xff9db0), [0.045, 0.028, 0.012], [s * r * 0.66, y - 0.05, r * 0.78], [0, s * 0.5, 0]);
  }
  part(rig, smile(), eye, [0.04, 0.04, 0.04], [0, y - 0.07, r * 0.95], [0, 0, Math.PI]);
}

/** What the arms and the held thing do, so animate() can find them. */
interface Rig {
  rig: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** The glowing tip of a magic staff (pulses while casting). */
  tip: THREE.Mesh | null;
}

function baseBody(shirt: number, pants: number): Rig {
  const rig = new THREE.Group();
  const legL = joint(rig, [-0.07, 0.2, 0]);
  const legR = joint(rig, [0.07, 0.2, 0]);
  for (const l of [legL, legR]) {
    part(l, capsule(), lambert(pants), [0.052, 0.07, 0.052], [0, -0.09, 0]);
    part(l, sphere(), lambert(0x4a3a30), [0.06, 0.04, 0.08], [0, -0.17, 0.02]);
  }
  const body = part(rig, capsule(), lambert(shirt), [0.14, 0.07, 0.12], [0, 0.33, 0]);
  part(rig, cyl(), lambert(0x6b4a30), [0.145, 0.025, 0.125], [0, 0.28, 0]);
  const armL = joint(rig, [-0.185, 0.41, 0]);
  const armR = joint(rig, [0.185, 0.41, 0]);
  for (const a of [armL, armR]) {
    part(a, capsule(), lambert(shirt), [0.045, 0.07, 0.045], [0, -0.07, 0]);
    part(a, sphere(), lambert(SKIN), 0.05, [0, -0.17, 0]);
  }
  const head = joint(rig, [0, 0.68, 0]);
  part(head, sphere(), lambert(SKIN), [0.21, 0.2, 0.2], [0, 0, 0]);
  face(head, 0, 0.2);
  return { rig, body, head, armL, armR, legL, legR, tip: null };
}

const hair = (head: THREE.Object3D, color: number): void => {
  part(head, dome(), lambert(color), [0.222, 0.2, 0.215], [0, 0.02, -0.01], [-0.35, 0, 0]);
};

function dressUp(r: Rig, cls: ClassDef): void {
  const head = r.head;
  switch (cls.id) {
    case 'vaktare': {
      // helmet with a red crest, round shield on the left arm, sword in the right hand
      part(head, dome(), lambert(0xa9bcd8), [0.228, 0.21, 0.222], [0, 0.02, 0], [-0.1, 0, 0]);
      part(head, box(), lambert(0xa9bcd8), [0.03, 0.06, 0.03], [0, 0.0, 0.21]);
      part(head, box(), lambert(0xe0453a), [0.02, 0.07, 0.2], [0, 0.22, 0]);
      part(r.armL, cyl(), lambert(0x4f8fe8), [0.17, 0.02, 0.17], [-0.05, -0.15, 0.06], [0, 0, Math.PI / 2]);
      part(r.armL, sphere(), lambert(0xffd24a), [0.05, 0.05, 0.03], [-0.075, -0.15, 0.06]);
      const sword = joint(r.armR, [0, -0.17, 0.02]);
      part(sword, box(), lambert(0xe9eef7), [0.04, 0.34, 0.012], [0, 0.2, 0.07], [0.15, 0, 0]);
      part(sword, box(), lambert(0xffd24a), [0.12, 0.025, 0.03], [0, 0.04, 0.07]);
      part(sword, box(), lambert(0x6b4a30), [0.025, 0.07, 0.025], [0, 0, 0.07]);
      break;
    }
    case 'helare': {
      // a crown of leaves, a hint of hair and a staff with a leaf
      hair(head, 0xf2d27a);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        part(head, sphere(), lambert(i % 2 ? 0x5fd38d : 0x3fb870), [0.03, 0.07, 0.015], [Math.sin(a) * 0.19, 0.12, Math.cos(a) * 0.19], [Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5]);
      }
      part(head, sphere(), lambert(0xff9ed0), 0.03, [0.0, 0.2, 0.12]);
      const staff = joint(r.armR, [0, -0.17, 0.02]);
      part(staff, cyl(), lambert(0x9a6a46), [0.015, 0.7, 0.015], [0, 0.18, 0.06]);
      part(staff, sphere(), lambert(0x5fd38d), [0.05, 0.07, 0.03], [-0.03, 0.55, 0.06], [0, 0, 0.5]);
      part(staff, sphere(), lambert(0x3fb870), [0.05, 0.07, 0.03], [0.03, 0.55, 0.06], [0, 0, -0.5]);
      r.tip = part(staff, sphere(), glowMat(0xb8ffd0), 0.03, [0, 0.62, 0.06]);
      break;
    }
    case 'krigare': {
      // horned helmet and a big axe
      part(head, dome(), lambert(0xb0a58f), [0.228, 0.21, 0.222], [0, 0.02, 0], [-0.1, 0, 0]);
      part(head, box(), lambert(0xb0a58f), [0.03, 0.06, 0.03], [0, 0.0, 0.21]);
      for (const s of [-1, 1]) {
        part(head, cone(), lambert(0xfff1d0), [0.04, 0.17, 0.04], [s * 0.22, 0.14, 0], [0, 0, -s * 0.9]);
        part(head, sphere(), lambert(0xfff1d0), 0.035, [s * 0.19, 0.06, 0]);
      }
      const axe = joint(r.armR, [0, -0.17, 0.02]);
      part(axe, cyl(), lambert(0x9a6a46), [0.017, 0.5, 0.017], [0, 0.12, 0.07]);
      part(axe, box(), lambert(0xc8d0de), [0.04, 0.17, 0.2], [0, 0.32, 0.07]);
      part(axe, box(), lambert(0xe9eef7), [0.045, 0.1, 0.06], [0, 0.32, 0.17]);
      break;
    }
    case 'magiker': {
      // a tall purple hat with a brim and a star, and a staff with a glowing tip
      hair(head, 0x7a4fd0);
      part(head, cyl(), lambert(0x8a52d8), [0.3, 0.02, 0.3], [0, 0.13, 0]);
      part(head, cone(), lambert(0x9a62e8), [0.19, 0.42, 0.19], [0, 0.34, 0], [0.12, 0, 0.04]);
      part(head, cyl(), lambert(0xffd24a), [0.195, 0.03, 0.195], [0, 0.18, 0]);
      part(head, sphere(), glowMat(0xffe27a), 0.028, [0, 0.26, 0.19]);
      const staff = joint(r.armR, [0, -0.17, 0.02]);
      part(staff, cyl(), lambert(0x6b4a30), [0.015, 0.75, 0.015], [0, 0.2, 0.06]);
      r.tip = part(staff, sphere(), glowMat(0xffe27a), 0.055, [0, 0.62, 0.06]);
      part(staff, sphere(), lambert(0xb08cf0), [0.04, 0.03, 0.04], [0, 0.56, 0.06]);
      break;
    }
  }
}

/** Walk cycle, swings, casting pose and falling over: one animate() for every figure built from a Rig. */
function makeAnimator(r: Rig, root: THREE.Group): (s: FigureState) => void {
  let walk = 0;
  let phase = 0;
  let fall = 0;
  let last = -1;
  return (s) => {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, s.t - last));
    last = s.t;
    walk += ((s.moving ? 1 : 0) - walk) * Math.min(1, dt * 12);
    fall += ((s.down ? 1 : 0) - fall) * Math.min(1, dt * 8);
    phase += dt * (3 + 2.2 * Math.max(0.5, s.speed)) * (s.moving ? 1 : 0);
    const sw = Math.sin(phase);
    const bob = Math.abs(Math.cos(phase)) * 0.045 * walk;
    const idle = Math.sin(s.t * 2.2);
    r.legL.rotation.x = sw * 0.75 * walk;
    r.legR.rotation.x = -sw * 0.75 * walk;
    r.armL.rotation.x = -sw * 0.65 * walk;
    r.armL.rotation.z = 0.06 + idle * 0.02;
    let armR = sw * 0.65 * walk;
    let lean = 0.08 * walk;
    if (s.cast) {
      // both arms up, wobbling a little
      r.armL.rotation.x = -2.5 + Math.sin(s.t * 14) * 0.12;
      armR = -2.5 + Math.sin(s.t * 14 + 1) * 0.12;
    } else if (s.attack >= 0) {
      // wind up (raise), strike (down fast), settle back
      const a = Math.min(1, s.attack);
      armR = a < 0.3 ? lerp(0, -2.5, smooth(a / 0.3)) : a < 0.55 ? lerp(-2.5, 0.5, smooth((a - 0.3) / 0.25)) : lerp(0.5, 0, smooth((a - 0.55) / 0.45));
      lean += a >= 0.3 && a < 0.7 ? 0.25 : 0;
    }
    r.armR.rotation.x = armR;
    r.armR.rotation.z = -0.06 - idle * 0.02;
    r.body.scale.y = 0.07 * (1 + idle * 0.02 * (1 - walk));
    r.head.position.y = 0.68 + bob + idle * 0.004;
    r.head.rotation.z = Math.sin(phase) * 0.05 * walk;
    r.rig.position.y = bob * 0.6;
    r.rig.rotation.x = lean;
    if (r.tip) r.tip.scale.setScalar((r.tip.userData.base ??= r.tip.scale.x) * (s.cast ? 1.5 + Math.sin(s.t * 18) * 0.25 : 1 + idle * 0.08));
    // fall over onto the back, face up
    root.rotation.x = -fall * (Math.PI / 2);
    root.position.y = fall * 0.17;
  };
}

/** The chibi hero of a class: 0.9 tall, the head almost half of that, in the class's colour. */
export function makePlayerFigure(cls: ClassDef): Figure {
  const outer = new THREE.Group();
  outer.add(blobShadow(0.85));
  const root = new THREE.Group();
  outer.add(root);
  const shirt = new THREE.Color(cls.color).getHex();
  const r = baseBody(shirt, cls.id === 'vaktare' ? 0x3a4a6a : cls.id === 'helare' ? 0x6a5a3a : cls.id === 'krigare' ? 0x5a4636 : 0x3a2a5a);
  root.add(r.rig);
  dressUp(r, cls);
  const animate = makeAnimator(r, root);
  return { group: outer, animate, dispose: () => outer.removeFromParent() };
}

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** PLACEHOLDER monster: a round blob with eyes in a colour taken from the species name. Replaced later. */
export function makeMobFigure(species: string, size: number): Figure {
  const h = hashStr(species);
  const color = new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.62).getHex();
  const outer = new THREE.Group();
  outer.add(blobShadow(size * 1.1));
  const root = new THREE.Group();
  outer.add(root);
  const rig = new THREE.Group();
  root.add(rig);
  const R = size * 0.42;
  const bodyMesh = part(rig, sphere(), lambert(color), [R, R * 0.92, R], [0, R * 0.92, 0]);
  const eye = lambert(DARK);
  for (const s of [-1, 1]) {
    part(rig, sphere(), eye, [R * 0.13, R * 0.17, R * 0.1], [s * R * 0.36, R * 1.1, R * 0.88]);
    part(rig, sphere(), glowMat(0xffffff), R * 0.04, [s * R * 0.36 + R * 0.04, R * 1.17, R * 0.97]);
  }
  part(rig, smile(), eye, R * 0.16, [0, R * 0.8, R * 0.93], [0, 0, Math.PI]);
  let last = -1;
  let fall = 0;
  return {
    group: outer,
    animate(s) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, s.t - last));
      last = s.t;
      fall += ((s.down ? 1 : 0) - fall) * Math.min(1, dt * 8);
      // a springy hop while walking, a slow breath otherwise, a lunge when attacking
      const hop = s.moving ? Math.abs(Math.sin(s.t * (4 + s.speed * 1.4))) * 0.14 * size : 0;
      const squash = 1 + (s.moving ? Math.cos(s.t * (4 + s.speed * 1.4) * 2) * 0.05 : Math.sin(s.t * 2) * 0.02);
      bodyMesh.scale.set(R / squash, R * 0.92 * squash, R / squash);
      rig.position.y = hop;
      rig.position.z = s.attack >= 0 ? Math.sin(Math.min(1, s.attack) * Math.PI) * 0.3 * size : 0;
      root.rotation.z = fall * (Math.PI / 2);
      root.position.y = fall * R * 0.6;
    },
    dispose: () => outer.removeFromParent(),
  };
}
