// The living snowmen: three kinds and the Snow King. Built from shared geometry (merged per kind) so
// a dozen of them stay cheap. Each model exposes the parts the game animates: body, head, arms, the
// snowball in the hand, the carrot nose and the hat (both fly off when it goes poof).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fluffy, type Fluffy } from './materials.ts';
import { bangTexture, stripeTexture } from './textures.ts';

export type Kind = 'small' | 'normal' | 'big' | 'king';

export interface Dims {
  /** Ball radii, bottom first. */
  r: number[];
  /** Ball centres (height above the ground). */
  y: number[];
  /** Height of the top of the head. */
  top: number;
  shoulderY: number;
  shoulderX: number;
  armLen: number;
  neckY: number;
}

const DIMS: Record<Kind, Dims> = {
  small: { r: [0.33, 0.23], y: [0.3, 0.76], top: 0.99, shoulderY: 0.42, shoulderX: 0.27, armLen: 0.38, neckY: 0.76 },
  normal: { r: [0.44, 0.33, 0.25], y: [0.4, 1.03, 1.5], top: 1.75, shoulderY: 1.1, shoulderX: 0.28, armLen: 0.55, neckY: 1.5 },
  big: { r: [0.7, 0.52, 0.37], y: [0.64, 1.62, 2.34], top: 2.71, shoulderY: 1.72, shoulderX: 0.45, armLen: 0.85, neckY: 2.34 },
  king: { r: [1.5, 1.12, 0.82], y: [1.38, 3.44, 5.0], top: 5.82, shoulderY: 3.65, shoulderX: 0.95, armLen: 1.9, neckY: 5.0 },
};

export const dimsOf = (k: Kind): Dims => DIMS[k];

export interface SnowmanModel {
  kind: Kind;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  handBall: THREE.Mesh;
  nose: THREE.Mesh;
  hat: THREE.Group;
  bubble: THREE.Sprite;
  /** The king's ice heart (his weak spot) and its glow. */
  heart?: THREE.Mesh;
  heartGlow?: THREE.Sprite;
  /** Materials owned by this model (cloned so it can flash on its own). */
  bodyMat: Fluffy;
  dims: Dims;
  scarfColor: number;
  hatColor: number;
}

// ---- shared materials (made on first use, freed by disposeSnowmen) ----
interface Shared {
  body: Fluffy;
  outline: THREE.MeshBasicMaterial;
  coal: THREE.MeshLambertMaterial;
  carrot: THREE.MeshLambertMaterial;
  twig: THREE.MeshLambertMaterial;
  ball: THREE.MeshLambertMaterial;
  topHat: THREE.MeshLambertMaterial;
  bucket: THREE.MeshLambertMaterial;
  gold: THREE.MeshLambertMaterial;
  cape: THREE.MeshLambertMaterial;
  ermine: THREE.MeshLambertMaterial;
  heart: THREE.MeshBasicMaterial;
  bang: THREE.SpriteMaterial;
  glow: THREE.SpriteMaterial;
  colored: Map<number, THREE.MeshLambertMaterial>;
  scarves: Map<number, THREE.MeshLambertMaterial>;
  geos: Map<string, THREE.BufferGeometry>;
  textures: THREE.Texture[];
}
let shared: Shared | null = null;

export const SCARF_COLORS = [0xe8412c, 0x3f7bff, 0x2fb36a, 0xffb627, 0xb05cff, 0xff5fa8];

function S(glowTex: THREE.Texture): Shared {
  if (shared) return shared;
  const bang = bangTexture();
  shared = {
    body: fluffy(0xf7f9ff, 0xffcfe9, 0.5),
    outline: new THREE.MeshBasicMaterial({ color: 0x3d4688, side: THREE.BackSide }),
    coal: new THREE.MeshLambertMaterial({ color: 0x24232e }),
    carrot: new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x6a2400 }),
    twig: new THREE.MeshLambertMaterial({ color: 0x6e4a33 }),
    ball: new THREE.MeshLambertMaterial({ color: 0xf4f7ff, emissive: 0x30304a }),
    topHat: new THREE.MeshLambertMaterial({ color: 0x2a2836 }),
    bucket: new THREE.MeshLambertMaterial({ color: 0x8fa3c4, emissive: 0x1a2030 }),
    gold: new THREE.MeshLambertMaterial({ color: 0xffcf3a, emissive: 0x6a4a00 }),
    cape: new THREE.MeshLambertMaterial({ color: 0x3d56d8, emissive: 0x0c1440, side: THREE.DoubleSide }),
    ermine: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x303040 }),
    heart: new THREE.MeshBasicMaterial({ color: 0x8ff0ff, toneMapped: false }),
    bang: new THREE.SpriteMaterial({ map: bang, depthTest: false, depthWrite: false, transparent: true }),
    glow: new THREE.SpriteMaterial({ map: glowTex, color: 0x7fe8ff, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }),
    colored: new Map(),
    scarves: new Map(),
    geos: new Map(),
    textures: [bang],
  };
  return shared;
}

function colored(c: number): THREE.MeshLambertMaterial {
  const s = shared!;
  let m = s.colored.get(c);
  if (!m) s.colored.set(c, (m = new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.12) })));
  return m;
}

function scarfMat(c: number): THREE.MeshLambertMaterial {
  const s = shared!;
  let m = s.scarves.get(c);
  if (!m) {
    const t = stripeTexture('#' + new THREE.Color(c).getHexString(), '#ffffff');
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.repeat.set(1, 6);
    s.textures.push(t);
    s.scarves.set(c, (m = new THREE.MeshLambertMaterial({ map: t, emissive: new THREE.Color(c).multiplyScalar(0.1) })));
  }
  return m;
}

/** Build (once per key) and cache a geometry. */
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const s = shared!;
  let g = s.geos.get(key);
  if (!g) s.geos.set(key, (g = make()));
  return g;
}

function sphereAt(r: number, x: number, y: number, z: number, sy = 1, seg = 22): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7));
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x : x)), false)!;
  for (const x of list) x.dispose();
  return g;
}

/** A twig arm along +x with two little fingers at the end. */
function twigGeometry(len: number, thick: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.CylinderGeometry(thick * 0.7, thick, len, 6);
  main.rotateZ(-Math.PI / 2);
  main.translate(len / 2, 0, 0);
  parts.push(main);
  for (const [a, l] of [
    [0.6, 0.32],
    [-0.5, 0.26],
    [0.15, 0.22],
  ] as [number, number][]) {
    const fl = len * l;
    const f = new THREE.CylinderGeometry(thick * 0.45, thick * 0.6, fl, 5);
    f.rotateZ(-Math.PI / 2);
    f.translate(fl / 2, 0, 0);
    f.rotateZ(a);
    f.translate(len * (a === 0.15 ? 0.55 : 0.92), 0, 0);
    parts.push(f);
  }
  return merge(parts);
}

function heartShapeGeometry(size: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const k = size;
  s.moveTo(0, -0.9 * k);
  s.bezierCurveTo(-0.15 * k, -0.6 * k, -1.0 * k, -0.25 * k, -1.0 * k, 0.25 * k);
  s.bezierCurveTo(-1.0 * k, 0.75 * k, -0.35 * k, 0.95 * k, 0, 0.5 * k);
  s.bezierCurveTo(0.35 * k, 0.95 * k, 1.0 * k, 0.75 * k, 1.0 * k, 0.25 * k);
  s.bezierCurveTo(1.0 * k, -0.25 * k, 0.15 * k, -0.6 * k, 0, -0.9 * k);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12 * k, bevelEnabled: true, bevelThickness: 0.08 * k, bevelSize: 0.08 * k, bevelSegments: 2, curveSegments: 10 });
  g.center();
  return g;
}

export function buildSnowman(kind: Kind, opts: { scarf: number; hat: number; hatType: 'top' | 'beanie' | 'bucket' | 'crown'; glowTex: THREE.Texture; shadows: boolean; low: boolean }): SnowmanModel {
  const s = S(opts.glowTex);
  const d = DIMS[kind];
  const seg = opts.low ? 16 : kind === 'king' ? 32 : 22;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bodyMat = kind === 'big' || kind === 'king' ? (s.body.clone() as Fluffy) : s.body;
  if (bodyMat !== s.body) {
    // a clone needs its own uniforms for the flash and rim
    const src = s.body.userData;
    const rim = src.rim.clone();
    const strength = { value: src.rimStrength.value };
    const flash = { value: 0 };
    bodyMat.userData = { rim, rimStrength: strength, flash };
    bodyMat.onBeforeCompile = (sh) => {
      s.body.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
      sh.uniforms.uRim = { value: rim };
      sh.uniforms.uRimStrength = strength;
      sh.uniforms.uFlash = flash;
    };
  }

  // ---- lower body: all balls but the head, merged ----
  const n = d.r.length;
  const lowerGeo = geo(`${kind}-lower-${seg}`, () => merge(d.r.slice(0, n - 1).map((r, i) => sphereAt(r, 0, d.y[i]!, 0, i === 0 ? 0.92 : 1, seg))));
  const lowerHull = geo(`${kind}-lowerhull`, () => merge(d.r.slice(0, n - 1).map((r, i) => sphereAt(r * 1.055 + 0.012, 0, d.y[i]!, 0, i === 0 ? 0.92 : 1, 14))));
  const lower = new THREE.Mesh(lowerGeo, bodyMat);
  lower.castShadow = opts.shadows;
  lower.receiveShadow = opts.shadows;
  body.add(lower, new THREE.Mesh(lowerHull, s.outline));

  // coal buttons down the front
  const bGeo = geo(`${kind}-buttons`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const ball = n - 2; // the ball under the head
    const r = d.r[ball]!;
    const cy = d.y[ball]!;
    for (const a of n === 2 ? [0.15, -0.25] : [0.45, 0.05, -0.35]) parts.push(sphereAt(r * 0.12, 0, cy + Math.sin(a) * r, Math.cos(a) * r * 0.99, 1, 8));
    return merge(parts);
  });
  body.add(new THREE.Mesh(bGeo, s.coal));

  // scarf round the neck with a hanging end
  const scarfY = d.neckY - d.r[n - 1]! * 0.78;
  const sGeo = geo(`${kind}-scarf`, () => {
    const hr = d.r[n - 1]!;
    const ring = new THREE.TorusGeometry(hr * 0.86, hr * 0.26, 8, 20);
    ring.rotateX(Math.PI / 2);
    ring.scale(1, 0.8, 1);
    ring.translate(0, scarfY, 0);
    const tail = new THREE.BoxGeometry(hr * 0.42, hr * 1.5, hr * 0.14, 1, 3, 1);
    const tp = tail.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) tp.setZ(i, tp.getZ(i) + (tp.getY(i) / (hr * 1.5)) * hr * 0.2);
    tail.rotateZ(0.25);
    tail.translate(hr * 0.5, scarfY - hr * 0.62, hr * 0.84);
    const g1 = ring.toNonIndexed();
    const g2 = tail.toNonIndexed();
    ring.dispose();
    tail.dispose();
    return merge([g1, g2]);
  });
  const scarf = new THREE.Mesh(sGeo, scarfMat(opts.scarf));
  scarf.castShadow = opts.shadows;
  body.add(scarf);

  // arms: pivots at the shoulders
  const tGeo = geo(`${kind}-twig`, () => twigGeometry(d.armLen, kind === 'king' ? 0.09 : kind === 'big' ? 0.05 : 0.032));
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(d.shoulderX, d.shoulderY, 0);
  armR.position.set(-d.shoulderX, d.shoulderY, 0);
  const twigL = new THREE.Mesh(tGeo, s.twig);
  const twigR = new THREE.Mesh(tGeo, s.twig);
  twigR.rotation.y = Math.PI; // points along -x
  armL.add(twigL);
  armR.add(twigR);
  body.add(armL, armR);
  armL.rotation.z = -0.55;
  armR.rotation.z = 0.55;
  // the snowball held up when about to throw (at the end of the right arm)
  const ballR = kind === 'king' ? 0.34 : kind === 'big' ? 0.22 : 0.15;
  const handBall = new THREE.Mesh(geo(`ball-${ballR}`, () => new THREE.SphereGeometry(ballR, 14, 10)), s.ball);
  handBall.position.set(-d.armLen * 1.02, 0, 0);
  handBall.visible = false;
  armR.add(handBall);

  // ---- head: ball, face, nose, hat ----
  const head = new THREE.Group();
  head.position.y = d.neckY;
  body.add(head);
  const hr = d.r[n - 1]!;
  const headMesh = new THREE.Mesh(geo(`${kind}-head-${seg}`, () => sphereAt(hr, 0, 0, 0, 1, seg)), bodyMat);
  headMesh.castShadow = opts.shadows;
  head.add(headMesh, new THREE.Mesh(geo(`${kind}-headhull`, () => sphereAt(hr * 1.055 + 0.012, 0, 0, 0, 1, 14)), s.outline));
  const face = geo(`${kind}-face`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const at = (yaw: number, pitch: number, size: number): THREE.BufferGeometry =>
      sphereAt(size, Math.sin(yaw) * Math.cos(pitch) * hr * 0.97, Math.sin(pitch) * hr * 0.97, Math.cos(yaw) * Math.cos(pitch) * hr * 0.97, 1, 8);
    parts.push(at(-0.36, 0.28, hr * 0.15), at(0.36, 0.28, hr * 0.15));
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.22;
      parts.push(at(a, -0.3 - Math.cos(a * 2.2) * 0.12 + 0.05, hr * 0.075));
    }
    return merge(parts);
  });
  head.add(new THREE.Mesh(face, s.coal));
  const noseGeo = geo(`${kind}-nose`, () => {
    const g = new THREE.ConeGeometry(hr * 0.17, hr * 1.25, 10);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, hr * 0.62);
    return g;
  });
  const nose = new THREE.Mesh(noseGeo, s.carrot);
  nose.position.set(0, hr * 0.02, hr * 0.62);
  nose.rotation.x = 0.1;
  nose.castShadow = opts.shadows;
  head.add(nose);

  const hat = new THREE.Group();
  hat.position.y = hr * 0.78;
  head.add(hat);
  if (opts.hatType === 'top') {
    hat.add(new THREE.Mesh(geo(`${kind}-tophat`, () => {
      const brim = new THREE.CylinderGeometry(hr * 1.08, hr * 1.08, hr * 0.12, 20);
      const crown = new THREE.CylinderGeometry(hr * 0.72, hr * 0.68, hr * 1.1, 20);
      crown.translate(0, hr * 0.58, 0);
      return merge([brim, crown]);
    }), s.topHat));
    const band = new THREE.Mesh(geo(`${kind}-band`, () => {
      const b = new THREE.CylinderGeometry(hr * 0.735, hr * 0.725, hr * 0.22, 20, 1, true);
      b.translate(0, hr * 0.24, 0);
      return b;
    }), colored(opts.hat));
    hat.add(band);
    hat.rotation.z = 0.12;
  } else if (opts.hatType === 'beanie') {
    hat.position.y = hr * 0.25;
    hat.add(new THREE.Mesh(geo(`${kind}-beanie`, () => {
      const cap = new THREE.SphereGeometry(hr * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      cap.scale(1, 1.12, 1);
      const rim = new THREE.TorusGeometry(hr * 1.0, hr * 0.17, 8, 22);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, hr * 0.05, 0);
      return merge([cap.toNonIndexed(), rim.toNonIndexed()]);
    }), colored(opts.hat)));
    const pom = new THREE.Mesh(geo(`${kind}-pom`, () => sphereAt(hr * 0.3, 0, hr * 1.22, 0, 1, 10)), s.ermine);
    hat.add(pom);
    hat.rotation.z = -0.15;
  } else if (opts.hatType === 'bucket') {
    hat.add(new THREE.Mesh(geo(`${kind}-bucket`, () => {
      const b = new THREE.CylinderGeometry(hr * 0.68, hr * 0.92, hr * 0.95, 18);
      b.translate(0, hr * 0.4, 0);
      return b;
    }), s.bucket));
    hat.rotation.set(0.15, 0, 0.2);
  } else {
    // the Snow King's crown
    hat.position.y = hr * 0.72;
    hat.add(new THREE.Mesh(geo('crown', () => {
      const parts: THREE.BufferGeometry[] = [];
      const ring = new THREE.CylinderGeometry(hr * 0.78, hr * 0.7, hr * 0.42, 24, 1, true);
      ring.translate(0, hr * 0.21, 0);
      parts.push(ring.toNonIndexed());
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = new THREE.ConeGeometry(hr * 0.14, hr * 0.45, 6);
        sp.translate(Math.sin(a) * hr * 0.76, hr * 0.62, Math.cos(a) * hr * 0.76);
        parts.push(sp.toNonIndexed());
        const tip = new THREE.SphereGeometry(hr * 0.07, 8, 6);
        tip.translate(Math.sin(a) * hr * 0.76, hr * 0.88, Math.cos(a) * hr * 0.76);
        parts.push(tip.toNonIndexed());
      }
      ring.dispose();
      return merge(parts);
    }), s.gold));
    const gems = [0xff3b6b, 0x3fd2ff, 0x5dff8a];
    gems.forEach((c, i) => {
      const a = (i - 1) * 0.7;
      const gem = new THREE.Mesh(geo('gem', () => new THREE.OctahedronGeometry(hr * 0.1, 0)), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      gem.position.set(Math.sin(a) * hr * 0.78, hr * 0.22, Math.cos(a) * hr * 0.78);
      hat.add(gem);
    });
    hat.rotation.z = 0.06;
  }
  hat.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = opts.shadows;
  });

  // ---- the king: cape, ermine collar, scepter, and the ice heart ----
  let heart: THREE.Mesh | undefined;
  let heartGlow: THREE.Sprite | undefined;
  if (kind === 'king') {
    const cape = new THREE.Mesh(geo('cape', () => {
      const c = new THREE.CylinderGeometry(d.r[1]! * 1.05, d.r[0]! * 1.18, d.y[1]! - 0.2, 24, 4, true, Math.PI * 0.55, Math.PI * 0.9);
      c.translate(0, (d.y[1]! - 0.2) / 2 + 0.35, -0.05);
      return c;
    }), s.cape);
    cape.rotation.y = Math.PI;
    body.add(cape);
    const collar = new THREE.Mesh(geo('collar', () => {
      const t = new THREE.TorusGeometry(d.r[1]! * 0.78, 0.2, 10, 28);
      t.rotateX(Math.PI / 2);
      t.translate(0, d.y[1]! + d.r[1]! * 0.62, 0);
      return t;
    }), s.ermine);
    body.add(collar);
    const scepter = new THREE.Group();
    const stick = new THREE.Mesh(geo('scepter', () => {
      const st = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8);
      st.translate(0, 0.6, 0);
      return st;
    }), s.gold);
    const star = new THREE.Mesh(geo('scepterstar', () => new THREE.OctahedronGeometry(0.34, 0)), s.heart);
    star.position.y = 2.35;
    scepter.add(stick, star);
    scepter.position.set(d.armLen * 0.95, 0, 0.1);
    armL.add(scepter);
    heart = new THREE.Mesh(geo('heart', () => heartShapeGeometry(0.56)), s.heart);
    const hy = d.y[1]! + 0.1;
    heart.position.set(0, hy, d.r[1]! * 0.98);
    body.add(heart);
    heartGlow = new THREE.Sprite(s.glow.clone());
    heartGlow.scale.setScalar(3);
    heartGlow.position.set(0, hy, d.r[1]! * 1.1);
    body.add(heartGlow);
  }

  // the warning bubble
  const bubble = new THREE.Sprite(s.bang);
  bubble.position.set(0, d.top + (kind === 'king' ? 1.4 : 0.55), 0);
  bubble.scale.setScalar(kind === 'king' ? 1.2 : 0.62);
  bubble.renderOrder = 20;
  bubble.visible = false;
  root.add(bubble);

  return { kind, root, body, head, armL, armR, handBall, nose, hat, bubble, heart, heartGlow, bodyMat, dims: d, scarfColor: opts.scarf, hatColor: opts.hat };
}

/** Free everything the snowmen share (call once when the game ends). */
export function disposeSnowmen(): void {
  if (!shared) return;
  const s = shared;
  for (const g of s.geos.values()) g.dispose();
  for (const m of [s.body, s.outline, s.coal, s.carrot, s.twig, s.ball, s.topHat, s.bucket, s.gold, s.cape, s.ermine, s.heart, s.bang, s.glow, ...s.colored.values(), ...s.scarves.values()]) m.dispose();
  for (const t of s.textures) t.dispose();
  shared = null;
}

/** The materials a model uses only for itself. */
export function disposeModel(m: SnowmanModel): void {
  if (m.bodyMat !== shared?.body) m.bodyMat.dispose();
  if (m.heartGlow) (m.heartGlow.material as THREE.Material).dispose();
  m.hat.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial && shared && mesh.material !== shared.heart) mesh.material.dispose();
  });
  m.root.removeFromParent();
}

/** The carrot geometry/material to throw around when a snowman goes poof. */
export function carrotParts(kind: Kind): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  if (!shared) return null;
  const g = shared.geos.get(`${kind}-nose`);
  return g ? { geo: g, mat: shared.carrot } : null;
}
