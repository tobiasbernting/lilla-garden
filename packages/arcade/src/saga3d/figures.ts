// Chibi figures: a big round head, a stubby body, arms and legs that swing. Geometry and materials are
// shared between every figure, so a whole crowd costs only a few extra draw calls. Figures face +z.
import * as THREE from 'three';
import type { ClassDef } from '@lilla-garden/shared';
import { Baker } from './bake.ts';

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
  /** Dazed by a stun: the head wobbles and the feet stand still. */
  stunned?: boolean;
}

export interface Figure {
  group: THREE.Group;
  animate(s: FigureState): void;
  /** A fallen monster has sunk into the floor and is hidden: the integrator should stop drawing it. */
  readonly gone: boolean;
  /** Diameter of the blob shadow under its feet (the integrator draws it through `Shadows`). */
  readonly shadow: number;
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
/** For everything small (eyes, hands, feet, buds): at that size nobody sees the difference, and there are many of them. */
const bead = (): THREE.BufferGeometry => geo('bead', () => new THREE.SphereGeometry(1, 8, 6));
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

let shadowMat: THREE.MeshBasicMaterial | null = null;
/** A soft dark circle, drawn once and shared by every shadow. */
function shadowMaterial(): THREE.MeshBasicMaterial {
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
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  return shadowMat;
}

/**
 * The blob shadows of every figure in ONE instanced draw call: call begin(), then add() for each figure that is drawn
 * this frame, then end().
 */
export class Shadows {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(private max = 96) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }
  begin(): void {
    this.n = 0;
  }
  /** A shadow `size` wide centred under (x, z). */
  add(x: number, z: number, size: number): void {
    if (this.n >= this.max) return;
    // a flat square: scale in x and z, lifted a hair off the floor (the matrix is written by hand, it is column major)
    const e = this.mesh.instanceMatrix.array;
    e.set([size, 0, 0, 0, 0, 1, 0, 0, 0, 0, size, 0, x, 0.025, z, 1], this.n * 16);
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
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
    part(rig, bead(), eye, [0.032, 0.04, 0.026], [s * r * 0.36, y + 0.01, r * 0.93]);
    // a tiny white sparkle in each eye
    part(rig, bead(), glowMat(0xffffff), 0.009, [s * r * 0.36 + 0.01, y + 0.025, r * 0.93 + 0.022]);
    part(rig, bead(), lambert(0xff9db0), [0.045, 0.028, 0.012], [s * r * 0.66, y - 0.05, r * 0.78], [0, s * 0.5, 0]);
  }
  part(rig, smile(), eye, [0.04, 0.04, 0.04], [0, y - 0.07, r * 0.95], [0, 0, Math.PI]);
}

/** What the arms and the held thing do, so animate() can find them. */
interface Rig {
  rig: THREE.Group;
  /** The torso (belt included): after baking, the one mesh that breathes. */
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
    part(l, bead(), lambert(0x4a3a30), [0.06, 0.04, 0.08], [0, -0.17, 0.02]);
  }
  const body = part(rig, capsule(), lambert(shirt), [0.14, 0.07, 0.12], [0, 0.33, 0]);
  part(rig, cyl(), lambert(0x6b4a30), [0.145, 0.025, 0.125], [0, 0.28, 0]);
  const armL = joint(rig, [-0.185, 0.41, 0]);
  const armR = joint(rig, [0.185, 0.41, 0]);
  for (const a of [armL, armR]) {
    part(a, capsule(), lambert(shirt), [0.045, 0.07, 0.045], [0, -0.07, 0]);
    part(a, bead(), lambert(SKIN), 0.05, [0, -0.17, 0]);
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
      part(r.armL, bead(), lambert(0xffd24a), [0.05, 0.05, 0.03], [-0.075, -0.15, 0.06]);
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
        part(head, bead(), lambert(i % 2 ? 0x5fd38d : 0x3fb870), [0.03, 0.07, 0.015], [Math.sin(a) * 0.19, 0.12, Math.cos(a) * 0.19], [Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5]);
      }
      part(head, bead(), lambert(0xff9ed0), 0.03, [0.0, 0.2, 0.12]);
      const staff = joint(r.armR, [0, -0.17, 0.02]);
      part(staff, cyl(), lambert(0x9a6a46), [0.015, 0.7, 0.015], [0, 0.18, 0.06]);
      part(staff, bead(), lambert(0x5fd38d), [0.05, 0.07, 0.03], [-0.03, 0.55, 0.06], [0, 0, 0.5]);
      part(staff, bead(), lambert(0x3fb870), [0.05, 0.07, 0.03], [0.03, 0.55, 0.06], [0, 0, -0.5]);
      r.tip = part(staff, bead(), glowMat(0xb8ffd0), 0.03, [0, 0.62, 0.06]);
      break;
    }
    case 'krigare': {
      // horned helmet and a big axe
      part(head, dome(), lambert(0xb0a58f), [0.228, 0.21, 0.222], [0, 0.02, 0], [-0.1, 0, 0]);
      part(head, box(), lambert(0xb0a58f), [0.03, 0.06, 0.03], [0, 0.0, 0.21]);
      for (const s of [-1, 1]) {
        part(head, cone(), lambert(0xfff1d0), [0.04, 0.17, 0.04], [s * 0.22, 0.14, 0], [0, 0, -s * 0.9]);
        part(head, bead(), lambert(0xfff1d0), 0.035, [s * 0.19, 0.06, 0]);
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
      part(head, bead(), glowMat(0xffe27a), 0.028, [0, 0.26, 0.19]);
      const staff = joint(r.armR, [0, -0.17, 0.02]);
      part(staff, cyl(), lambert(0x6b4a30), [0.015, 0.75, 0.015], [0, 0.2, 0.06]);
      r.tip = part(staff, bead(), glowMat(0xffe27a), 0.055, [0, 0.62, 0.06]);
      part(staff, bead(), lambert(0xb08cf0), [0.04, 0.03, 0.04], [0, 0.56, 0.06]);
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
    r.body.scale.y = 1 + idle * 0.02 * (1 - walk);
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
  const root = new THREE.Group();
  outer.add(root);
  const shirt = new THREE.Color(cls.color).getHex();
  const r = baseBody(shirt, cls.id === 'vaktare' ? 0x3a4a6a : cls.id === 'helare' ? 0x6a5a3a : cls.id === 'krigare' ? 0x5a4636 : 0x3a2a5a);
  root.add(r.rig);
  dressUp(r, cls);
  r.body = bakeRig(r);
  const animate = makeAnimator(r, root);
  return { group: outer, animate, gone: false, shadow: 0.85, dispose: () => outer.removeFromParent() };
}

// ---------------------------------------------------------------------------------------------------------------
// Monsters and bosses
//
// A crowd of figures must stay cheap, so a species is described once as a few *joints* (body, head, arms, legs, a
// tail ...), each with a list of primitives. Every joint is baked into ONE vertex-coloured geometry (shared by all
// figures of the species) and drawn with one shared material, so a monster is one draw call per joint: six for a
// biped or a golem, seven for a four-legged one or one with a tail or a cape (the blob shadows are drawn together
// through `Shadows`). Parts that should glow (eyes, cracks, flames) are marked in the same geometry (see figureMaterial).
// ---------------------------------------------------------------------------------------------------------------

type Prim = 'sphere' | 'box' | 'cyl' | 'cone' | 'capsule' | 'dome' | 'smile' | 'torus';
interface P {
  g: Prim;
  c: number;
  s: V3;
  p: V3;
  r: V3;
}
const v3 = (s: V3 | number): V3 => (typeof s === 'number' ? [s, s, s] : s);
const prim =
  (g: Prim) =>
  (c: number, s: V3 | number, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): P => ({ g, c, s: v3(s), p, r });
const sp = prim('sphere');
const bx = prim('box');
const cy = prim('cyl');
const co = prim('cone');
const cp = prim('capsule');
const dm = prim('dome');
const sm = prim('smile');
/** The same primitive mirrored to the other side (x = 0 is the middle). */
const mirror = (a: P): P => ({ ...a, p: [-a.p[0], a.p[1], a.p[2]], r: [a.r[0], -a.r[1], -a.r[2]] });
const duo = (a: P): P[] => [a, mirror(a)];

const lowGeos: Record<Prim, () => THREE.BufferGeometry> = {
  sphere: () => new THREE.SphereGeometry(1, 10, 7),
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(1, 1, 1, 8, 1),
  cone: () => new THREE.ConeGeometry(1, 1, 8, 1),
  capsule: () => new THREE.CapsuleGeometry(1, 1, 3, 8),
  dome: () => new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  smile: () => new THREE.TorusGeometry(1, 0.2, 4, 8, Math.PI),
  torus: () => new THREE.TorusGeometry(1, 0.25, 5, 12),
};
const lowCache = new Map<Prim, THREE.BufferGeometry>();

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Marks every vertex of a baked part as glowing (1: drawn at its plain colour, no light) or lit (0). */
function setGlow(g: THREE.BufferGeometry, glow: number): void {
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(glow), 1));
}

/**
 * Every figure is drawn with this one material: lit by the lights, except the vertices marked `glow`, which keep
 * their colour (eyes, cracks, flames). Glow used to be a second mesh per joint with an unlit material; as an attribute
 * a joint is one draw call.
 */
let solidMat: THREE.MeshLambertMaterial | null = null;
function figureMaterial(): THREE.MeshLambertMaterial {
  if (solidMat) return solidMat;
  solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  solidMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float glow;\nvarying float vGlow;\nvoid main() {\n  vGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vGlow;\nvoid main() {').replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, vGlow);\n#include <opaque_fragment>');
  };
  return solidMat;
}

/** Merges the primitives of one joint (lit ones, then glowing ones) into one geometry that carries a colour per vertex. */
function bakeJoint(solid: P[] = [], glow: P[] = []): THREE.BufferGeometry | null {
  const baker = new Baker();
  for (const [list, lit] of [[solid, 0], [glow, 1]] as const) {
    for (const o of list) {
      let base = lowCache.get(o.g);
      if (!base) lowCache.set(o.g, (base = lowGeos[o.g]()));
      setGlow(baker.add(base, _m.compose(_p.set(...o.p), _q.setFromEuler(_e.set(...o.r)), _s.set(...o.s)), _c.set(o.c)), lit);
    }
  }
  return baker.build();
}

/**
 * Bakes a hero that was built part by part (easy to write and tweak; a draw call per eye would be far too many for a
 * tablet) into one mesh per joint that really moves (legs, arms, head) plus one for the torso and whatever else hangs
 * on the rig. Things held in a hand (a sword, an axe, a staff) join the arm. Only the staff's glowing tip stays a mesh
 * of its own, because it pulses. Returns the torso mesh.
 */
function bakeRig(r: Rig): THREE.Mesh {
  const mat = figureMaterial();
  const joints = new Set<THREE.Object3D>([r.legL, r.legR, r.armL, r.armR, r.head]);
  const gather = (baker: Baker, node: THREE.Object3D, m: THREE.Matrix4): void => {
    for (const c of [...node.children]) {
      if (c === r.tip) continue;
      if (c instanceof THREE.Mesh) {
        c.updateMatrix();
        const col = (c.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial).color;
        setGlow(baker.add(c.geometry as THREE.BufferGeometry, new THREE.Matrix4().multiplyMatrices(m, c.matrix), col), c.material instanceof THREE.MeshBasicMaterial ? 1 : 0);
        node.remove(c);
      } else if (c instanceof THREE.Group && !joints.has(c)) {
        c.updateMatrix();
        gather(baker, c, new THREE.Matrix4().multiplyMatrices(m, c.matrix));
        // a group that still holds the glowing tip stays where it is
        if (!c.children.length) node.remove(c);
      }
    }
  };
  for (const j of joints) {
    const baker = new Baker();
    gather(baker, j, new THREE.Matrix4());
    const g = baker.build();
    if (g) j.add(new THREE.Mesh(g, mat));
  }
  const baker = new Baker();
  gather(baker, r.rig, new THREE.Matrix4());
  const torso = new THREE.Mesh(baker.build()!, mat);
  r.rig.add(torso);
  return torso;
}

interface PartDef {
  at: V3;
  solid?: P[];
  glow?: P[];
}
type Parts = Record<string, PartDef>;
type Style = 'biped' | 'golem' | 'quad' | 'float' | 'hop' | 'block';
interface Def {
  style: Style;
  /** Half the width of the body: how far to lift it when it falls on its side. */
  halfW: number;
  /** Diameter of the blob shadow at size 1. */
  shadow: number;
  parts: Parts;
}

const addTo = (parts: Parts, joint: string, ...ps: P[]): void => {
  const j = parts[joint];
  if (j) (j.solid ??= []).push(...ps);
};
const glowTo = (parts: Parts, joint: string, ...ps: P[]): void => {
  const j = parts[joint];
  if (j) (j.glow ??= []).push(...ps);
};
/** A long thin box that starts at `from` (in a joint) and points `tilt` radians from straight up towards +z. */
function stick(c: number, from: V3, len: number, w: V3 | number, tilt: number, off = 0): P {
  const [wx, , wz] = v3(w);
  const d = len / 2 + off;
  return bx(c, [wx, len, wz], [from[0], from[1] + d * Math.cos(tilt), from[2] + d * Math.sin(tilt)], [tilt, 0, 0]);
}

const EYE = 0x2c2733;
const BONE = 0xf1ead2;
const BONE2 = 0xd3cbb0;
const STEEL = 0xc8d2e6;
const GOLD = 0xffd24a;

/** A bony chibi: big skull with a grin and glowing pupils, a ribcage, thin limbs. About 1.05 tall. */
function skeleton(bone: number, shade: number, glow: number): Parts {
  const leg = [cy(bone, [0.035, 0.3, 0.035], [0, -0.15, 0]), bx(shade, [0.07, 0.03, 0.1], [0, -0.285, 0.025])];
  const arm = [cy(bone, [0.03, 0.26, 0.03], [0, -0.13, 0]), sp(bone, 0.045, [0, -0.27, 0])];
  return {
    legL: { at: [-0.08, 0.3, 0], solid: leg },
    legR: { at: [0.08, 0.3, 0], solid: leg },
    body: {
      at: [0, 0, 0],
      solid: [
        bx(shade, [0.22, 0.07, 0.11], [0, 0.33, 0]),
        cy(bone, [0.025, 0.3, 0.025], [0, 0.5, -0.02]),
        bx(bone, [0.25, 0.035, 0.14], [0, 0.44, 0]),
        bx(bone, [0.23, 0.035, 0.13], [0, 0.52, 0]),
        bx(bone, [0.19, 0.035, 0.12], [0, 0.6, 0]),
        bx(bone, [0.32, 0.04, 0.08], [0, 0.67, 0]),
      ],
    },
    armL: { at: [-0.17, 0.66, 0], solid: [...arm] },
    armR: { at: [0.17, 0.66, 0], solid: [...arm] },
    head: {
      at: [0, 0.86, 0],
      solid: [
        sp(bone, [0.2, 0.19, 0.18]),
        sp(shade, [0.12, 0.065, 0.1], [0, -0.13, 0.06]),
        ...duo(sp(EYE, [0.055, 0.065, 0.035], [0.075, 0.02, 0.155])),
        sm(EYE, 0.075, [0, -0.1, 0.16], [0, 0, Math.PI]),
        bx(EYE, [0.01, 0.04, 0.01], [-0.035, -0.125, 0.18]),
        bx(EYE, [0.01, 0.04, 0.01], [0, -0.13, 0.19]),
        bx(EYE, [0.01, 0.04, 0.01], [0.035, -0.125, 0.18]),
      ],
      glow: duo(sp(glow, 0.02, [0.075, 0.025, 0.19])),
    },
  };
}

/** Pairs of paws and four legs for the four-legged ones: legL/legR in front, legBL/legBR behind. */
function fourLegs(parts: Parts, c: number, paw: number, r: number, h: number, x: number, zf: number, zb: number): void {
  const leg = [cy(c, [r, h, r], [0, -h / 2, 0]), sp(paw, [r * 1.5, r * 0.8, r * 2], [0, -h, r * 0.7])];
  parts.legL = { at: [-x, h, zf], solid: [...leg] };
  parts.legR = { at: [x, h, zf], solid: [...leg] };
  parts.legBL = { at: [-x, h, zb], solid: [...leg] };
  parts.legBR = { at: [x, h, zb], solid: [...leg] };
}

const DEFS: Record<string, () => Def> = {
  skelett: () => {
    const parts = skeleton(BONE, BONE2, 0x9bff9b);
    addTo(parts, 'armR', stick(STEEL, [0, -0.27, 0], 0.34, [0.02, 0, 0.055], 1.2), bx(GOLD, [0.03, 0.11, 0.03], [0, -0.27, 0.03]), sp(0x6b4a30, 0.03, [0, -0.27, -0.02]));
    return { style: 'biped', halfW: 0.15, shadow: 0.8, parts };
  },
  draugbage: () => {
    const parts = skeleton(BONE, BONE2, 0x7fe0ff);
    const cloak = 0x3d5566;
    addTo(parts, 'body', co(cloak, [0.2, 0.46, 0.15], [0, 0.4, -0.01]), sp(cloak, [0.17, 0.08, 0.12], [0, 0.66, 0]));
    addTo(parts, 'head', sp(cloak, [0.225, 0.21, 0.19], [0, 0.03, -0.045]), co(cloak, [0.1, 0.2, 0.1], [0, 0.2, -0.13], [-0.7, 0, 0]), bx(cloak, [0.3, 0.05, 0.06], [0, 0.12, 0.13], [0.2, 0, 0]));
    // a bow held out in the left hand, with its string
    addTo(parts, 'armL', bx(0x8a5a36, [0.025, 0.46, 0.025], [0, -0.27, 0.1], [0.12, 0, 0]), bx(0x8a5a36, [0.025, 0.12, 0.025], [0, -0.06, 0.11], [0.9, 0, 0]), bx(0x8a5a36, [0.025, 0.12, 0.025], [0, -0.48, 0.11], [-0.9, 0, 0]), bx(0xf5f0e0, [0.006, 0.52, 0.006], [0, -0.27, 0.06]));
    addTo(parts, 'armR', bx(0x8a5a36, [0.02, 0.02, 0.2], [0, -0.27, 0.12]), co(STEEL, [0.025, 0.05, 0.025], [0, -0.27, 0.24], [Math.PI / 2, 0, 0]));
    return { style: 'biped', halfW: 0.17, shadow: 0.8, parts };
  },
  gravrotta: () => {
    const fur = 0x8f95a3;
    const parts: Parts = {
      body: { at: [0, 0, 0], solid: [sp(fur, [0.24, 0.2, 0.3], [0, 0.23, 0]), sp(0xc9ccd6, [0.16, 0.12, 0.2], [0, 0.17, 0.08])] },
      head: {
        at: [0, 0.3, 0.25],
        solid: [
          sp(fur, [0.17, 0.15, 0.17]),
          sp(0xaeb3c0, [0.09, 0.08, 0.1], [0, -0.04, 0.12]),
          sp(0xf29ab4, 0.035, [0, -0.02, 0.2]),
          ...duo(sp(EYE, [0.028, 0.034, 0.02], [0.075, 0.05, 0.14])),
          ...duo(sp(fur, [0.11, 0.12, 0.02], [0.11, 0.16, -0.03], [0, 0.2, 0.2])),
          ...duo(sp(0xf4a0b8, [0.075, 0.085, 0.015], [0.11, 0.16, -0.012], [0, 0.2, 0.2])),
          bx(0xffffff, [0.03, 0.03, 0.01], [0, -0.075, 0.19]),
        ],
      },
      tail: { at: [0, 0.2, -0.27], solid: [cy(0xf0a0b4, [0.012, 0.18, 0.012], [0, 0.0, -0.09], [-1.45, 0, 0]), cy(0xf0a0b4, [0.012, 0.18, 0.012], [0, 0.03, -0.26], [-1.1, 0, 0])] },
    };
    fourLegs(parts, 0xaeb3c0, 0xf0a0b4, 0.035, 0.12, 0.1, 0.12, -0.12);
    return { style: 'quad', halfW: 0.18, shadow: 0.7, parts };
  },
  frosttroll: () => {
    const skin = 0x9fd0f0;
    const light = 0xdcf2ff;
    const leg = [cy(skin, [0.1, 0.22, 0.1], [0, -0.11, 0]), sp(0x7ab0d8, [0.12, 0.06, 0.16], [0, -0.21, 0.03])];
    const arm = [cp(skin, [0.085, 0.1, 0.085], [0, -0.16, 0]), sp(skin, 0.11, [0, -0.35, 0]), sp(light, [0.11, 0.05, 0.11], [0, -0.27, 0])];
    const parts: Parts = {
      legL: { at: [-0.15, 0.22, 0], solid: leg },
      legR: { at: [0.15, 0.22, 0], solid: leg },
      body: { at: [0, 0, 0], solid: [sp(skin, [0.33, 0.3, 0.28], [0, 0.45, 0]), sp(light, [0.23, 0.22, 0.1], [0, 0.4, 0.2]), sp(light, [0.34, 0.08, 0.26], [0, 0.22, 0])] },
      armL: { at: [-0.36, 0.64, 0], solid: arm },
      armR: { at: [0.36, 0.64, 0], solid: arm },
      head: {
        at: [0, 0.9, 0.02],
        solid: [
          sp(skin, [0.21, 0.18, 0.2]),
          sp(0x84badf, 0.05, [0, -0.01, 0.2]),
          ...duo(sp(EYE, [0.03, 0.04, 0.025], [0.08, 0.04, 0.175])),
          ...duo(bx(0x4a7090, [0.07, 0.02, 0.02], [0.08, 0.1, 0.18], [0, 0, -0.35])),
          ...duo(co(0xfffff0, [0.035, 0.13, 0.03], [0.09, -0.08, 0.17], [0.3, 0, -0.25])),
          sm(EYE, 0.07, [0, -0.07, 0.185], [0, 0, Math.PI]),
          co(light, [0.04, 0.12, 0.04], [0, 0.2, 0]),
          co(light, [0.035, 0.1, 0.035], [-0.07, 0.19, 0.02], [0, 0, 0.5]),
          co(light, [0.035, 0.1, 0.035], [0.07, 0.19, 0.02], [0, 0, -0.5]),
        ],
      },
    };
    return { style: 'biped', halfW: 0.3, shadow: 1.0, parts };
  },
  isvarg: () => canine({ fur: 0xeef3f8, shade: 0xc4d4e4, ear: 0xaec4dc, nose: 0x38485c, eye: 0x4cc0ff, mane: false }),
  isande: () => {
    const body = 0xe3effc;
    const hem: P[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      hem.push(sp(i % 2 ? 0xd2e4f6 : body, [0.1, 0.12, 0.1], [Math.cos(a) * 0.2, i % 2 ? 0.0 : -0.04, Math.sin(a) * 0.19]));
    }
    const parts: Parts = {
      body: { at: [0, 0, 0], solid: [cy(body, [0.25, 0.4, 0.23], [0, 0.45, 0]), sp(0xf3f9ff, [0.24, 0.12, 0.21], [0, 0.4, 0.04])] },
      tail: { at: [0, 0.24, 0], solid: hem },
      head: {
        at: [0, 0.68, 0],
        solid: [
          sp(body, [0.26, 0.27, 0.24]),
          ...duo(sp(EYE, [0.04, 0.065, 0.03], [0.09, 0.03, 0.2])),
          sp(EYE, [0.04, 0.05, 0.025], [0, -0.09, 0.215]),
          ...duo(sp(0xffb0c8, [0.045, 0.028, 0.012], [0.15, -0.04, 0.17])),
        ],
        glow: duo(sp(0x9fe0ff, 0.014, [0.1, 0.06, 0.225])),
      },
      armL: { at: [-0.26, 0.52, 0], solid: [sp(body, [0.07, 0.12, 0.07], [0, -0.08, 0])] },
      armR: { at: [0.26, 0.52, 0], solid: [sp(body, [0.07, 0.12, 0.07], [0, -0.08, 0])] },
    };
    return { style: 'float', halfW: 0.25, shadow: 0.7, parts };
  },
  eldimp: () => {
    const red = 0xe8503a;
    const dark = 0x4a2020;
    const leg = [cy(red, [0.045, 0.14, 0.045], [0, -0.07, 0]), sp(dark, [0.06, 0.035, 0.08], [0, -0.14, 0.02])];
    const arm = [cp(red, [0.035, 0.05, 0.035], [0, -0.08, 0]), sp(red, 0.04, [0, -0.17, 0])];
    const parts: Parts = {
      legL: { at: [-0.08, 0.15, 0], solid: leg },
      legR: { at: [0.08, 0.15, 0], solid: leg },
      body: { at: [0, 0, 0], solid: [sp(red, [0.17, 0.19, 0.15], [0, 0.3, 0]), sp(0xff9068, [0.11, 0.12, 0.06], [0, 0.27, 0.11])] },
      armL: { at: [-0.17, 0.4, 0], solid: arm },
      armR: { at: [0.17, 0.4, 0], solid: arm },
      head: {
        at: [0, 0.62, 0],
        solid: [
          sp(red, [0.2, 0.17, 0.18]),
          ...duo(co(dark, [0.035, 0.15, 0.035], [0.1, 0.17, 0], [0, 0, -0.45])),
          ...duo(co(red, [0.045, 0.12, 0.02], [0.2, 0.02, 0], [0, 0, -1.35])),
          ...duo(sp(EYE, [0.03, 0.04, 0.02], [0.075, 0.03, 0.15])),
          sm(EYE, 0.07, [0, -0.04, 0.165], [0, 0, Math.PI]),
          ...duo(co(0xffffff, [0.014, 0.04, 0.014], [0.035, -0.07, 0.168], [Math.PI, 0, 0])),
        ],
        glow: duo(sp(0xffd24a, [0.042, 0.052, 0.02], [0.075, 0.03, 0.145])),
      },
      tail: { at: [0, 0.22, -0.14], solid: [cy(red, [0.02, 0.3, 0.02], [0, 0.08, -0.126], [-1, 0, 0]), co(dark, [0.055, 0.1, 0.02], [0, 0.17, -0.26], [-1, 0, 0])] },
    };
    return { style: 'hop', halfW: 0.2, shadow: 0.7, parts };
  },
  lavagolem: () => {
    const rock = 0x3a3036;
    const rock2 = 0x4d4048;
    const lava = 0xff7a1a;
    const leg = [bx(rock, [0.2, 0.32, 0.22], [0, -0.16, 0]), bx(rock2, [0.24, 0.08, 0.3], [0, -0.3, 0.03])];
    const arm = [bx(rock2, [0.2, 0.2, 0.2], [0, 0.03, 0]), bx(rock, [0.18, 0.4, 0.18], [0, -0.2, 0]), bx(rock2, [0.26, 0.22, 0.26], [0, -0.45, 0])];
    const parts: Parts = {
      legL: { at: [-0.16, 0.32, 0], solid: leg, glow: [bx(lava, [0.03, 0.12, 0.01], [0.0, -0.13, 0.112], [0, 0, 0.3])] },
      legR: { at: [0.16, 0.32, 0], solid: leg, glow: [bx(lava, [0.03, 0.12, 0.01], [0.0, -0.13, 0.112], [0, 0, -0.3])] },
      body: {
        at: [0, 0, 0],
        solid: [bx(rock, [0.58, 0.5, 0.4], [0, 0.57, 0]), bx(rock2, [0.4, 0.14, 0.34], [0, 0.34, 0]), bx(rock2, [0.62, 0.1, 0.3], [0, 0.85, -0.02]), bx(rock2, [0.2, 0.2, 0.12], [0.12, 0.75, -0.22], [0.3, 0.2, 0])],
        glow: [bx(lava, [0.035, 0.3, 0.01], [0, 0.6, 0.202], [0, 0, 0.35]), bx(lava, [0.03, 0.2, 0.01], [-0.16, 0.6, 0.202], [0, 0, -0.5]), bx(lava, [0.03, 0.2, 0.01], [0.17, 0.5, 0.202], [0, 0, 0.7]), bx(lava, [0.18, 0.03, 0.01], [0, 0.4, 0.202], [0, 0, 0.1])],
      },
      armL: { at: [-0.4, 0.78, 0], solid: arm, glow: [bx(lava, [0.2, 0.025, 0.01], [0, -0.45, 0.135])] },
      armR: { at: [0.4, 0.78, 0], solid: arm, glow: [bx(lava, [0.2, 0.025, 0.01], [0, -0.45, 0.135])] },
      head: {
        at: [0, 1.0, 0.02],
        solid: [bx(rock2, [0.32, 0.26, 0.28]), bx(rock, [0.36, 0.06, 0.3], [0, 0.14, 0]), bx(rock, [0.1, 0.12, 0.1], [0.08, 0.2, -0.04], [0, 0.4, 0.2]), bx(EYE, [0.2, 0.04, 0.02], [0, -0.07, 0.145])],
        glow: [...duo(bx(lava, [0.07, 0.05, 0.02], [0.08, 0.03, 0.145])), bx(lava, [0.03, 0.1, 0.01], [0, 0.08, 0.146])],
      },
    };
    return { style: 'golem', halfW: 0.3, shadow: 1.1, parts };
  },
  eldhund: () => canine({ fur: 0xe8802f, shade: 0xf2b866, ear: 0x6a3018, nose: 0x2a1a14, eye: 0xffe04a, mane: true }),
  isblock: () => {
    const ice = 0xbfe8fa;
    const parts: Parts = {
      body: {
        at: [0, 0, 0],
        solid: [bx(ice, [0.92, 0.92, 0.92], [0, 0.46, 0]), bx(0xe8f8ff, [0.8, 0.05, 0.8], [0, 0.93, 0]), bx(0xa4d4ee, [0.96, 0.08, 0.96], [0, 0.04, 0]), bx(0xe0f6ff, [0.07, 0.4, 0.02], [-0.25, 0.55, 0.47], [0, 0, 0.5]), sp(0x86b4dc, [0.18, 0.2, 0.14], [0, 0.46, 0])],
      },
    };
    return { style: 'block', halfW: 0.46, shadow: 1.2, parts };
  },

  // ---- bosses ----
  gravvaktare: () => {
    const parts = skeleton(0xdde3d0, 0xb4bba8, 0xff9a4a);
    const steel = 0x8394ad;
    addTo(parts, 'head', dm(steel, [0.3, 0.28, 0.27], [0, 0.0, -0.005], [-0.1, 0, 0]), bx(steel, [0.05, 0.16, 0.03], [0, -0.04, 0.27]), bx(0xc03a3a, [0.04, 0.1, 0.34], [0, 0.29, 0]), bx(steel, [0.34, 0.035, 0.3], [0, 0.0, 0], [-0.1, 0, 0]));
    // the big shield on the left arm and a broad sword on the right
    addTo(parts, 'armL', cy(0x4f6fb0, [0.3, 0.04, 0.3], [0.0, -0.18, 0.15], [Math.PI / 2, 0, 0]), cy(steel, [0.32, 0.03, 0.32], [0.0, -0.18, 0.13], [Math.PI / 2, 0, 0]), sp(GOLD, [0.08, 0.08, 0.05], [0.0, -0.18, 0.2]));
    addTo(parts, 'armR', stick(STEEL, [0, -0.27, 0], 0.5, [0.025, 0, 0.08], 1.1), bx(GOLD, [0.04, 0.16, 0.04], [0, -0.27, 0.03]));
    addTo(parts, 'body', ...duo(sp(steel, [0.1, 0.07, 0.1], [0.19, 0.7, 0])));
    return { style: 'biped', halfW: 0.2, shadow: 0.9, parts };
  },
  draugkung: () => {
    const parts = skeleton(0xe9e4cc, 0xc2bba0, 0x7fdcff);
    const crown: P[] = [cy(GOLD, [0.2, 0.07, 0.19], [0, 0.19, 0])];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.push(co(GOLD, [0.04, 0.12, 0.04], [Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.16]), sp(0xe03a5a, 0.022, [Math.sin(a) * 0.17, 0.37, Math.cos(a) * 0.16]));
    }
    addTo(parts, 'head', ...crown);
    addTo(parts, 'armR', stick(STEEL, [0, -0.27, 0], 0.46, [0.025, 0, 0.07], 1.15), bx(GOLD, [0.04, 0.15, 0.04], [0, -0.27, 0.03]), sp(0x6b4a30, 0.035, [0, -0.27, -0.03]));
    addTo(parts, 'body', ...duo(sp(GOLD, [0.09, 0.06, 0.09], [0.19, 0.69, 0])));
    parts.cape = { at: [0, 0.7, -0.12], solid: [bx(0xa02a46, [0.36, 0.56, 0.025], [0, -0.28, 0]), bx(GOLD, [0.38, 0.03, 0.04], [0, 0.0, 0]), bx(0xe9e4cc, [0.36, 0.03, 0.03], [0, -0.56, 0])] };
    return { style: 'biped', halfW: 0.2, shadow: 0.9, parts };
  },
  isbjorn: () => {
    const fur = 0xf4f8fc;
    const snow = 0xe0ebf5;
    const parts: Parts = {
      body: {
        at: [0, 0, 0],
        solid: [sp(fur, [0.3, 0.3, 0.4], [0, 0.5, 0]), sp(snow, [0.2, 0.18, 0.26], [0, 0.4, 0.05]), co(0xa8e0f8, [0.05, 0.14, 0.05], [0, 0.82, 0.08]), co(0xa8e0f8, [0.045, 0.12, 0.045], [0, 0.82, -0.08], [0.2, 0, 0]), co(0xa8e0f8, [0.04, 0.1, 0.04], [0, 0.76, -0.22], [0.5, 0, 0])],
      },
      head: {
        at: [0, 0.62, 0.38],
        solid: [
          sp(fur, [0.21, 0.19, 0.2]),
          sp(snow, [0.1, 0.085, 0.1], [0, -0.06, 0.16]),
          sp(EYE, [0.04, 0.032, 0.03], [0, -0.03, 0.25]),
          ...duo(sp(EYE, [0.03, 0.036, 0.022], [0.085, 0.04, 0.17])),
          ...duo(sp(fur, [0.075, 0.075, 0.05], [0.14, 0.16, -0.02])),
          ...duo(sp(0xd0c0cc, [0.04, 0.04, 0.03], [0.14, 0.16, 0.012])),
          sm(EYE, 0.05, [0, -0.1, 0.22], [0, 0, Math.PI]),
        ],
      },
      tail: { at: [0, 0.5, -0.4], solid: [sp(fur, 0.07, [0, 0, -0.02])] },
    };
    fourLegs(parts, fur, snow, 0.1, 0.36, 0.18, 0.26, -0.26);
    return { style: 'quad', halfW: 0.3, shadow: 1.0, parts };
  },
  rimturs: () => {
    const skin = 0x86bfe8;
    const fur = 0xe6eef7;
    const leg = [cy(fur, [0.1, 0.3, 0.1], [0, -0.15, 0]), sp(0x6b7a8f, [0.12, 0.065, 0.16], [0, -0.28, 0.03])];
    const arm = [cp(skin, [0.085, 0.13, 0.085], [0, -0.17, 0]), sp(skin, 0.1, [0, -0.38, 0]), sp(fur, [0.105, 0.05, 0.105], [0, -0.3, 0])];
    const crown: P[] = [cy(0xb8e8ff, [0.2, 0.04, 0.2], [0, 0.17, 0])];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      crown.push(co(0xd8f4ff, [0.035, i % 2 ? 0.14 : 0.2, 0.035], [Math.sin(a) * 0.17, 0.28, Math.cos(a) * 0.16]));
    }
    return {
      style: 'biped',
      halfW: 0.35,
      shadow: 1.0,
      parts: {
        legL: { at: [-0.14, 0.32, 0], solid: leg },
        legR: { at: [0.14, 0.32, 0], solid: leg },
        body: { at: [0, 0, 0], solid: [cp(skin, [0.27, 0.16, 0.2], [0, 0.58, 0]), cy(fur, [0.3, 0.15, 0.22], [0, 0.36, 0]), sp(fur, [0.31, 0.09, 0.21], [0, 0.8, 0.02]), bx(0x6b7a8f, [0.6, 0.04, 0.44], [0, 0.44, 0])] },
        armL: { at: [-0.36, 0.74, 0], solid: arm },
        armR: { at: [0.36, 0.74, 0], solid: arm },
        head: {
          at: [0, 1.0, 0.02],
          solid: [
            sp(skin, [0.22, 0.2, 0.2]),
            sp(0x9fd0f2, 0.05, [0, -0.02, 0.2]),
            ...duo(sp(EYE, [0.03, 0.04, 0.025], [0.08, 0.04, 0.17])),
            ...duo(bx(0xffffff, [0.075, 0.025, 0.02], [0.08, 0.1, 0.18], [0, 0, -0.35])),
            sp(0xffffff, [0.19, 0.17, 0.1], [0, -0.13, 0.12]),
            ...duo(sp(0xffffff, [0.07, 0.03, 0.04], [0.05, -0.06, 0.19], [0, 0, 0.3])),
            ...crown,
          ],
          glow: duo(sp(0xbfeaff, 0.012, [0.085, 0.045, 0.193])),
        },
      },
    };
  },
  smeden: () => {
    const skin = 0xd4573c;
    const pants = 0x3b3340;
    const leg = [cy(pants, [0.085, 0.3, 0.085], [0, -0.15, 0]), sp(0x2e2420, [0.1, 0.06, 0.14], [0, -0.28, 0.03])];
    const arm = [cp(skin, [0.085, 0.1, 0.085], [0, -0.14, 0]), sp(skin, 0.1, [0, -0.34, 0]), cy(0x3a2a20, [0.095, 0.05, 0.095], [0, -0.27, 0])];
    const parts: Parts = {
      legL: { at: [-0.12, 0.3, 0], solid: leg },
      legR: { at: [0.12, 0.3, 0], solid: leg },
      body: {
        at: [0, 0, 0],
        solid: [cp(skin, [0.25, 0.15, 0.19], [0, 0.55, 0]), bx(0x5a3a28, [0.32, 0.42, 0.03], [0, 0.46, 0.18]), ...duo(bx(0x5a3a28, [0.03, 0.3, 0.02], [0.1, 0.68, 0.18], [0, 0, 0.35])), bx(0x3a2a20, [0.34, 0.04, 0.04], [0, 0.3, 0.17]), sp(0x2a2630, [0.07, 0.07, 0.01], [0.08, 0.43, 0.2])],
      },
      armL: { at: [-0.31, 0.7, 0], solid: [...arm] },
      armR: { at: [0.31, 0.7, 0], solid: [...arm] },
      head: {
        at: [0, 0.96, 0.01],
        solid: [
          sp(skin, [0.21, 0.19, 0.19]),
          dm(0x2a2630, [0.215, 0.2, 0.2], [0, 0.03, -0.015], [-0.45, 0, 0]),
          sp(0x2a2630, [0.17, 0.13, 0.1], [0, -0.13, 0.1]),
          cy(0xc0392b, [0.205, 0.025, 0.19], [0, 0.07, 0]),
          sp(0xe66b4f, 0.045, [0, -0.01, 0.19]),
          ...duo(sp(EYE, [0.028, 0.036, 0.022], [0.08, 0.04, 0.165])),
          ...duo(bx(0x2a2630, [0.075, 0.025, 0.02], [0.08, 0.095, 0.175], [0, 0, 0.3])),
        ],
      },
    };
    // the hammer: a long handle and a heavy head with a glowing face
    addTo(parts, 'armR', stick(0x8a5a36, [0, -0.34, 0], 0.5, [0.03, 0, 0.03], 0.55, -0.1), bx(0x4e5562, [0.34, 0.17, 0.17], [0, -0.34 + 0.4 * Math.cos(0.55), 0.4 * Math.sin(0.55)], [0.55, 0, 0]));
    glowTo(parts, 'armR', ...duo(bx(0xff9a30, [0.02, 0.15, 0.15], [0.175, -0.34 + 0.4 * Math.cos(0.55), 0.4 * Math.sin(0.55)], [0.55, 0, 0])));
    return { style: 'biped', halfW: 0.33, shadow: 1.0, parts };
  },
  surt: () => {
    const skin = 0x57333a;
    const rock = 0x3a2328;
    const lava = 0xff7a1a;
    const fire = 0xffd04a;
    const leg = [cy(rock, [0.11, 0.32, 0.11], [0, -0.16, 0]), sp(0x2a1a1c, [0.13, 0.07, 0.17], [0, -0.3, 0.03])];
    const arm = [cp(skin, [0.095, 0.12, 0.095], [0, -0.17, 0]), sp(skin, 0.11, [0, -0.38, 0]), sp(rock, [0.16, 0.11, 0.16], [0, 0.02, 0])];
    const hair: P[] = [];
    const beard: P[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      hair.push(co(i % 2 ? fire : lava, [0.055, i % 3 === 0 ? 0.28 : 0.2, 0.055], [Math.sin(a) * 0.13, 0.22, Math.cos(a) * 0.12], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]));
    }
    for (let i = 0; i < 5; i++) beard.push(co(i % 2 ? fire : lava, [0.05, 0.16 + (i === 2 ? 0.08 : 0), 0.05], [(i - 2) * 0.065, -0.2, 0.12 - Math.abs(i - 2) * 0.012], [Math.PI, 0, (i - 2) * 0.1]));
    const parts: Parts = {
      legL: { at: [-0.15, 0.32, 0], solid: leg, glow: [bx(lava, [0.03, 0.14, 0.01], [0, -0.14, 0.112], [0, 0, 0.3])] },
      legR: { at: [0.15, 0.32, 0], solid: leg, glow: [bx(lava, [0.03, 0.14, 0.01], [0, -0.14, 0.112], [0, 0, -0.3])] },
      body: {
        at: [0, 0, 0],
        solid: [cp(skin, [0.29, 0.17, 0.21], [0, 0.6, 0]), cy(rock, [0.31, 0.1, 0.23], [0, 0.4, 0]), bx(GOLD, [0.1, 0.07, 0.03], [0, 0.4, 0.22])],
        glow: [bx(lava, [0.03, 0.3, 0.01], [0, 0.62, 0.208], [0, 0, 0.35]), bx(lava, [0.025, 0.2, 0.01], [-0.12, 0.6, 0.2], [0, 0, -0.5]), bx(lava, [0.025, 0.18, 0.01], [0.14, 0.56, 0.2], [0, 0, 0.7])],
      },
      armL: { at: [-0.37, 0.8, 0], solid: [...arm] },
      armR: { at: [0.37, 0.8, 0], solid: [...arm] },
      head: {
        at: [0, 1.04, 0.02],
        solid: [
          sp(skin, [0.23, 0.21, 0.21]),
          ...duo(co(rock, [0.045, 0.2, 0.045], [0.16, 0.17, 0], [0, 0, -0.55])),
          ...duo(bx(rock, [0.09, 0.025, 0.02], [0.08, 0.095, 0.195], [0, 0, 0.35])),
          sm(rock, 0.08, [0, -0.08, 0.2], [0, 0, Math.PI]),
        ],
        glow: [...duo(sp(fire, [0.04, 0.03, 0.02], [0.085, 0.04, 0.19])), ...hair, ...beard],
      },
    };
    addTo(parts, 'armR', bx(0x2a1a1c, [0.04, 0.2, 0.04], [0, -0.38, 0.0]), bx(GOLD, [0.04, 0.05, 0.22], [0, -0.38, 0.08]));
    glowTo(parts, 'armR', stick(lava, [0, -0.38, 0], 1.0, [0.03, 0, 0.14], 0.8, 0.08), stick(fire, [0, -0.38, 0], 0.95, [0.035, 0, 0.06], 0.8, 0.1));
    return { style: 'biped', halfW: 0.36, shadow: 1.0, parts };
  },
};

interface CanineOpts {
  fur: number;
  shade: number;
  ear: number;
  nose: number;
  eye: number;
  mane: boolean;
}
/** A wolf or a hound: long body, pointed ears, a snout and a bushy tail. */
function canine(o: CanineOpts): Def {
  const parts: Parts = {
    body: {
      at: [0, 0, 0],
      solid: [cp(o.fur, [0.17, 0.2, 0.17], [0, 0.4, 0], [Math.PI / 2, 0, 0]), sp(o.shade, [0.13, 0.1, 0.22], [0, 0.31, 0.02])],
      glow: o.mane ? [co(0xff6a1a, [0.07, 0.24, 0.07], [0, 0.64, 0.2], [0.5, 0, 0]), co(0xffc040, [0.07, 0.28, 0.07], [0, 0.65, 0.07], [0.2, 0, 0]), co(0xff6a1a, [0.07, 0.26, 0.07], [0, 0.63, -0.07], [-0.1, 0, 0]), co(0xffc040, [0.06, 0.2, 0.06], [0, 0.6, -0.2], [-0.4, 0, 0])] : [],
    },
    head: {
      at: [0, 0.52, 0.34],
      solid: [
        sp(o.fur, [0.15, 0.14, 0.15]),
        sp(o.shade, [0.075, 0.065, 0.1], [0, -0.04, 0.14]),
        sp(o.nose, 0.035, [0, -0.02, 0.235]),
        ...duo(sp(EYE, [0.025, 0.032, 0.02], [0.07, 0.035, 0.13])),
        ...duo(co(o.ear, [0.055, 0.14, 0.04], [0.085, 0.16, -0.02], [0, 0, -0.2])),
        bx(0xffffff, [0.06, 0.02, 0.01], [0, -0.075, 0.205]),
      ],
      glow: duo(sp(o.eye, 0.016, [0.07, 0.04, 0.152])),
    },
    tail: {
      at: [0, 0.46, -0.3],
      solid: o.mane ? [cy(o.fur, [0.03, 0.2, 0.03], [0, 0.07, -0.08], [-1.0, 0, 0])] : [sp(o.fur, [0.075, 0.075, 0.2], [0, 0.06, -0.14], [0.6, 0, 0])],
      glow: o.mane ? [co(0xff8a20, [0.08, 0.2, 0.08], [0, 0.2, -0.2], [-1.0, 0, 0])] : [],
    },
  };
  fourLegs(parts, o.fur, o.shade, 0.04, 0.3, 0.1, 0.2, -0.2);
  return { style: 'quad', halfW: 0.2, shadow: 0.8, parts };
}

interface Blueprint {
  def: Def;
  joints: { name: string; at: V3; geo: THREE.BufferGeometry | null }[];
}
const blueprints = new Map<string, Blueprint>();
function blueprint(species: string): Blueprint {
  let bp = blueprints.get(species);
  if (bp) return bp;
  const make = DEFS[species];
  // an unknown species still gets a friendly round blob, so a new monster never crashes the page
  const def: Def = make
    ? make()
    : { style: 'hop', halfW: 0.3, shadow: 1, parts: { body: { at: [0, 0, 0], solid: [sp(0xb08cf0, [0.35, 0.32, 0.35], [0, 0.32, 0]), ...duo(sp(EYE, 0.04, [0.12, 0.4, 0.31]))] } } };
  bp = {
    def,
    joints: Object.entries(def.parts).map(([name, p]) => ({ name, at: p.at, geo: bakeJoint(p.solid, p.glow) })),
  };
  blueprints.set(species, bp);
  return bp;
}

/** How each style walks: leg and arm swing, body bob, stride rate. */
const GAIT: Record<Style, { leg: number; arm: number; bob: number; rate: number; sway: number }> = {
  biped: { leg: 0.75, arm: 0.65, bob: 0.04, rate: 1, sway: 0 },
  golem: { leg: 0.45, arm: 0.35, bob: 0.02, rate: 0.6, sway: 0.07 },
  quad: { leg: 0.6, arm: 0.6, bob: 0.025, rate: 1.1, sway: 0 },
  float: { leg: 0, arm: 0.2, bob: 0, rate: 0.6, sway: 0 },
  hop: { leg: 0.4, arm: 0.8, bob: 0, rate: 1, sway: 0 },
  block: { leg: 0, arm: 0, bob: 0, rate: 0, sway: 0 },
};

/** A monster or boss of a species at a size (1 is about a player's height; the sim says how big each one is). */
export function makeMobFigure(species: string, size: number): Figure {
  const bp = blueprint(species);
  const { def } = bp;
  const mat = figureMaterial();
  const outer = new THREE.Group();
  const root = new THREE.Group();
  outer.add(root);
  const rig = new THREE.Group();
  rig.scale.setScalar(size);
  root.add(rig);
  const j: Record<string, THREE.Group> = {};
  for (const o of bp.joints) {
    const g = new THREE.Group();
    g.position.set(...o.at);
    if (o.geo) g.add(new THREE.Mesh(o.geo, mat));
    rig.add(g);
    j[o.name] = g;
  }
  const gait = GAIT[def.style];
  const quad = def.style === 'quad';
  const hasArms = !!(j.armL && j.armR);
  const headY = j.head?.position.y ?? 0;
  const hemY = j.tail?.position.y ?? 0;
  let walk = 0;
  let phase = 0;
  let fall = 0;
  let last = -1;
  let diedAt = -1;
  let gone = false;
  const self: Figure = {
    group: outer,
    shadow: def.shadow * size,
    get gone() {
      return gone;
    },
    animate(s) {
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, s.t - last));
      last = s.t;
      const t = s.t;
      if (!s.down) {
        diedAt = -1;
        gone = false;
        root.scale.setScalar(1);
      } else if (diedAt < 0) diedAt = t;
      const walking = s.moving && !s.stunned && !s.down;
      walk += ((walking ? 1 : 0) - walk) * Math.min(1, dt * 12);
      fall += ((s.down ? 1 : 0) - fall) * Math.min(1, dt * 7);
      phase += dt * (3 + 2.2 * Math.max(0.5, s.speed)) * gait.rate * (walking ? 1 : 0) / Math.sqrt(size);
      const sw = Math.sin(phase);
      const idle = Math.sin(t * 2.2);
      const bob = Math.abs(Math.cos(phase)) * gait.bob * walk;
      const atk = s.attack >= 0 ? Math.min(1, s.attack) : -1;

      // legs: a diagonal gait for the four-legged ones
      if (j.legL) j.legL.rotation.x = sw * gait.leg * walk;
      if (j.legR) j.legR.rotation.x = -sw * gait.leg * walk;
      if (j.legBL) j.legBL.rotation.x = -sw * gait.leg * walk;
      if (j.legBR) j.legBR.rotation.x = sw * gait.leg * walk;
      // arms swing against the legs; an attack raises the right one and brings it down, a cast raises both
      if (hasArms) {
        const armL = j.armL!;
        const armR = j.armR!;
        armL.rotation.x = -sw * gait.arm * walk;
        armL.rotation.z = 0.08 + idle * 0.02;
        let ar = sw * gait.arm * walk;
        if (s.cast) {
          armL.rotation.x = -2.5 + Math.sin(t * 12) * 0.12;
          ar = -2.5 + Math.sin(t * 12 + 1) * 0.12;
        } else if (atk >= 0) {
          ar = atk < 0.3 ? lerp(0, -2.5, smooth(atk / 0.3)) : atk < 0.55 ? lerp(-2.5, 0.6, smooth((atk - 0.3) / 0.25)) : lerp(0.6, 0, smooth((atk - 0.55) / 0.45));
        }
        armR.rotation.x = ar;
        armR.rotation.z = -0.08 - idle * 0.02;
      }
      // head: nods while walking, dips on an attack, wobbles when stunned
      const head = j.head;
      if (head) {
        head.position.y = headY + bob + idle * 0.004;
        head.rotation.z = Math.sin(phase) * 0.05 * walk + (s.stunned ? Math.sin(t * 16) * 0.2 : 0);
        head.rotation.x = quad ? (atk >= 0 ? Math.sin(atk * Math.PI) * 0.7 : 0) - (s.cast ? 0.5 : 0) : s.cast ? -0.35 : 0;
      }
      if (j.tail) {
        if (def.style === 'float') j.tail.rotation.y = Math.sin(t * 2.5) * 0.4;
        else {
          j.tail.rotation.y = Math.sin(t * (4 + walk * 4)) * 0.45;
          j.tail.position.y = hemY;
        }
      }
      if (j.cape) j.cape.rotation.x = 0.06 + walk * 0.35 + Math.sin(t * 2) * 0.03;

      // the whole body: bob, hop, float, lunge, sway, rear up
      let y = bob;
      let z = 0;
      let squash = 1;
      if (def.style === 'float') y = 0.2 + Math.sin(t * 2.2) * 0.05 + walk * 0.04;
      if (def.style === 'hop') {
        const h = walking ? Math.abs(Math.sin(phase * 0.55)) : 0;
        y = h * 0.22;
        squash = 1 + (walking ? Math.cos(phase * 1.1) * 0.06 : idle * 0.015);
      }
      if (atk >= 0) z = Math.sin(atk * Math.PI) * 0.22;
      rig.position.set(0, y * size, z * size);
      rig.scale.set(size / squash, size * squash, size / squash);
      rig.rotation.x = quad ? (s.cast ? -0.35 : atk >= 0 ? Math.sin(atk * Math.PI) * 0.12 : 0) : 0.05 * walk;
      rig.rotation.z = gait.sway * sw * walk + (s.stunned ? Math.sin(t * 14) * 0.06 : 0);

      // falling over, then sinking into the floor and out of sight
      if (def.style === 'block') {
        if (s.down) {
          const k = Math.min(1, (t - diedAt) / 0.5);
          root.scale.setScalar(Math.max(0.001, 1 - k * k));
          gone = k >= 1;
        }
        return;
      }
      root.rotation.z = fall * (Math.PI / 2);
      let sink = 0;
      if (s.down) {
        const k = t - diedAt;
        sink = Math.min(1, Math.max(0, (k - 0.6) / 0.9));
        gone = k > 1.5;
      }
      root.position.y = fall * def.halfW * size - sink * (def.halfW + 0.25) * size;
    },
    dispose: () => outer.removeFromParent(),
  };
  return self;
}
