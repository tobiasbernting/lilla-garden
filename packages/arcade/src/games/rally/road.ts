// The road itself: asphalt and gravel strips, kerbs, verges, the start line and grid, the bridge,
// the fences along the run-off, the start gantry with its lights, and chevron boards in the bends.
import * as THREE from 'three';
import { Geo, blobTex, canvasTex, mat } from './geo.ts';
import { fencePiece, gantry, WHITE } from './models.ts';
import type { Terrain } from './terrain.ts';
import { Fence, Surf, type Track } from './track.ts';
import { rng } from './util.ts';

function asphaltTex(): THREE.CanvasTexture {
  return canvasTex(
    256,
    512,
    (g, w, h) => {
      const r = rng(5);
      g.fillStyle = '#6e6f73';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 9000; k++) {
        const v = 88 + Math.floor(r() * 42);
        g.fillStyle = `rgb(${v},${v},${v + 4})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
      }
      // patches and a darker band where the tyres run
      g.globalAlpha = 0.18;
      g.fillStyle = '#48494e';
      g.fillRect(w * 0.28, 0, w * 0.12, h);
      g.fillRect(w * 0.6, 0, w * 0.12, h);
      g.globalAlpha = 0.25;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = r() < 0.5 ? '#5d5e63' : '#7c7d81';
        g.fillRect(r() * w * 0.8, r() * h, 20 + r() * 50, 30 + r() * 80);
      }
      g.globalAlpha = 1;
      g.fillStyle = '#f2f1ea';
      g.fillRect(9, 0, 5, h);
      g.fillRect(w - 14, 0, 5, h);
    },
    true,
  );
}

function gravelTex(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, w, h) => {
      const r = rng(9);
      g.fillStyle = '#a38f69';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 7000; k++) {
        const t = r();
        g.fillStyle = t < 0.4 ? '#c2b089' : t < 0.75 ? '#857252' : '#958360';
        const s = 1 + r() * 2.2;
        g.fillRect(r() * w, r() * h, s, s);
      }
      // ruts
      g.globalAlpha = 0.22;
      g.fillStyle = '#6e5d42';
      g.fillRect(w * 0.26, 0, w * 0.1, h);
      g.fillRect(w * 0.64, 0, w * 0.1, h);
      // grassy edges
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(98,120,62,0.95)');
      gr.addColorStop(0.07, 'rgba(98,120,62,0.0)');
      gr.addColorStop(0.93, 'rgba(98,120,62,0.0)');
      gr.addColorStop(1, 'rgba(98,120,62,0.95)');
      g.globalAlpha = 1;
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
    true,
  );
}

function checkerTex(cols: number, rows: number): THREE.CanvasTexture {
  return canvasTex(cols * 16, rows * 16, (g) => {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        g.fillStyle = (x + y) % 2 ? '#111216' : '#f4f4f0';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
  });
}

export interface Road {
  group: THREE.Group;
  /** The four start lights (materials to switch on) and their glows. */
  lights: { mat: THREE.MeshBasicMaterial; glow: THREE.Sprite }[];
  setLights(n: number, green: boolean): void;
  /** Flags on the gantry to wave. */
  update(time: number): void;
  dispose(): void;
}

export function buildRoad(track: Track, terrain: Terrain, quality: 'high' | 'low', aniso: number): Road {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const t = track;
  const n = t.n;
  const L = (i: number): number => ((i % n) + n) % n;
  const shadows = quality === 'high';

  // ---- asphalt and gravel strips ----
  const strip = (surf: number): THREE.BufferGeometry => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let open = false;
    for (let k = 0; k <= n; k++) {
      const i = L(k);
      const prev = L(k - 1);
      const on = t.surf[i] === surf || (k > 0 && t.surf[prev] === surf);
      if (!on) {
        open = false;
        continue;
      }
      const lx = t.tz[i]!;
      const lz = -t.tx[i]!;
      const hw = t.hw[i]! + (surf === Surf.Gravel ? 0.6 : 0);
      const y = t.py[i]!;
      const v = (k * t.ds) / (surf === Surf.Gravel ? 9 : 12);
      const o = pos.length / 3;
      pos.push(t.px[i]! + lx * hw, y, t.pz[i]! + lz * hw, t.px[i]! - lx * hw, y, t.pz[i]! - lz * hw);
      uv.push(0, v, 1, v);
      if (open) idx.push(o - 2, o - 1, o, o - 1, o + 1, o);
      open = true;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const aTex = asphaltTex();
  aTex.anisotropy = aniso;
  const gTex = gravelTex();
  gTex.anisotropy = aniso;
  const asphalt = new THREE.Mesh(strip(Surf.Asphalt), new THREE.MeshLambertMaterial({ map: aTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const gravel = new THREE.Mesh(strip(Surf.Gravel), new THREE.MeshLambertMaterial({ map: gTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  for (const m of [asphalt, gravel]) {
    m.receiveShadow = shadows;
    group.add(m);
    disposables.push(m.geometry, m.material as THREE.Material);
  }
  disposables.push(aTex, gTex);

  // ---- verges (a dirt edge sloping down to the grass) and kerbs ----
  const vg: number[] = [];
  const vc: number[] = [];
  const kc: number[] = [];
  const kp: number[] = [];
  const cDirt = new THREE.Color('#857a55');
  const cGrass = new THREE.Color('#6b9a45');
  const cRed = new THREE.Color('#d6352b');
  const cWhite = new THREE.Color('#f4f2ec');
  const quad = (arr: number[], carr: number[], a: number[], b: number[], c: number[], d: number[], ca: THREE.Color, cb: THREE.Color): void => {
    arr.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const cc of [ca, ca, cb, ca, cb, cb]) carr.push(cc.r, cc.g, cc.b);
  };
  for (let k = 0; k < n; k++) {
    const i = k;
    const j = L(k + 1);
    if (t.bridge[i] && t.bridge[j]) continue;
    for (const sgn of [1, -1]) {
      const kerb = sgn > 0 ? t.kerbL : t.kerbR;
      const P = (ii: number, d: number, dy: number): number[] => [t.px[ii]! + t.tz[ii]! * d * sgn, t.py[ii]! + dy, t.pz[ii]! - t.tx[ii]! * d * sgn];
      const h0 = t.hw[i]!;
      const h1 = t.hw[j]!;
      const kerbed = kerb[i] && kerb[j];
      const in0 = kerbed ? h0 + 0.85 : h0;
      const in1 = kerbed ? h1 + 0.85 : h1;
      const a = P(i, in0, kerbed ? 0.05 : -0.005);
      const b = P(j, in1, kerbed ? 0.05 : -0.005);
      const c = P(j, h1 + 1.9, -0.3);
      const d = P(i, h0 + 1.9, -0.3);
      // wind each quad so it faces up
      if (sgn > 0) quad(vg, vc, a, d, c, b, cDirt, cGrass);
      else quad(vg, vc, a, b, c, d, cDirt, cGrass);
      if (kerbed) {
        // two stripes per sample, raised a little towards the outside
        for (let h = 0; h < 2; h++) {
          const f0 = h / 2;
          const f1 = (h + 1) / 2;
          const lerpP = (d0: number, d1: number, f: number, dy: number): number[] => {
            const pa = P(i, d0, dy);
            const pb = P(j, d1, dy);
            return [pa[0]! + (pb[0]! - pa[0]!) * f, pa[1]! + (pb[1]! - pa[1]!) * f, pa[2]! + (pb[2]! - pa[2]!) * f];
          };
          const cc = (k * 2 + h) % 2 ? cRed : cWhite;
          const q0 = lerpP(h0 - 0.55, h1 - 0.55, f0, 0.015);
          const q1 = lerpP(h0 - 0.55, h1 - 0.55, f1, 0.015);
          const q2 = lerpP(h0 + 0.85, h1 + 0.85, f1, 0.06);
          const q3 = lerpP(h0 + 0.85, h1 + 0.85, f0, 0.06);
          if (sgn > 0) quad(kp, kc, q0, q3, q2, q1, cc, cc);
          else quad(kp, kc, q0, q1, q2, q3, cc, cc);
        }
      }
    }
  }
  const mkColored = (p: number[], c: number[], offset: boolean): THREE.Mesh => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: offset, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = shadows;
    disposables.push(g, m);
    return mesh;
  };
  group.add(mkColored(vg, vc, false));
  group.add(mkColored(kp, kc, true));

  // ---- start line, grid boxes ----
  const chk = checkerTex(18, 2);
  const lineGeo = new THREE.PlaneGeometry(1, 1);
  lineGeo.rotateX(-Math.PI / 2);
  const lineMat = new THREE.MeshLambertMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const line = new THREE.Mesh(lineGeo, lineMat);
  const p0 = t.point(0, 0);
  line.position.set(p0.x, p0.y + 0.01, p0.z);
  line.rotation.y = t.heading(0) + Math.PI / 2;
  line.scale.set(t.hw[0]! * 2, 1, 1.8);
  line.receiveShadow = shadows;
  group.add(line);
  disposables.push(chk, lineGeo, lineMat);
  const gridG = new Geo();
  for (let k = 0; k < 6; k++) {
    const s = -11 - k * 9;
    const d = k % 2 ? -3.4 : 3.4;
    const c = t.point(s + 2.6, d);
    const hd = t.heading(s);
    const m = mat(c.x, c.y + 0.012, c.z, 0, hd, 0);
    const piece = new Geo();
    piece.box(2.4, 0.01, 0.22, WHITE, 0, 0, 0);
    piece.box(0.2, 0.01, 1.3, WHITE, 1.1, 0, -0.55);
    piece.box(0.2, 0.01, 1.3, WHITE, -1.1, 0, -0.55);
    gridG.addColored(piece.build(), m);
  }
  const gridGeo = gridG.build();
  const gridMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  group.add(new THREE.Mesh(gridGeo, gridMat));
  disposables.push(gridGeo, gridMat);

  // ---- the bridge: a deck with white fascias and stone piers ----
  const bg = new Geo();
  for (let i = 0; i < n; i++) {
    if (!t.bridge[i]) continue;
    const j = L(i + 1);
    if (!t.bridge[j]) continue;
    for (const sgn of [1, -1]) {
      const a = t.point(i * t.ds, sgn * (t.hw[i]! + 1.5));
      const b = t.point(j * t.ds, sgn * (t.hw[j]! + 1.5));
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const hd = Math.atan2(b.x - a.x, b.z - a.z);
      bg.box(0.5, 1.1, len + 0.05, '#e6e1d6', (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4, (a.z + b.z) / 2, 0, hd, 0);
    }
    const c = t.point((i + 0.5) * t.ds, 0);
    bg.box((t.hw[i]! + 1.5) * 2, 0.7, t.ds + 0.05, '#9a958b', c.x, c.y - 0.42, c.z, 0, t.heading(i * t.ds), 0);
  }
  // find the middle of the bridge run
  let first = -1;
  let count = 0;
  for (let i = 0; i < n; i++)
    if (t.bridge[i] && !t.bridge[L(i - 1)]) {
      first = i;
      break;
    }
  if (first >= 0) {
    while (t.bridge[L(first + count)]) count++;
    for (const off of [-0.32, 0.32]) {
      const s = (first + count / 2) * t.ds + off * count * t.ds;
      const hd = t.heading(s);
      for (const d of [-t.hw[0]! * 0.55, t.hw[0]! * 0.55]) {
        const p = t.point(s, d);
        const top = p.y - 0.7;
        const bottom = -1.6;
        bg.box(2.2, top - bottom, 1.6, '#8d8a82', p.x, (top + bottom) / 2, p.z, 0, hd, 0);
      }
    }
  }
  if (!bg.empty) {
    const geo = bg.build();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
    disposables.push(geo, m);
  }

  // ---- fences along both sides of the run-off ----
  const kinds = [Fence.Pole, Fence.Bales, Fence.Rail, Fence.Stone] as const;
  const placed = new Map<string, [number, number][]>();
  const near = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / 4);
    const cz = Math.floor(z / 4);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const list = placed.get(`${cx + a},${cz + b}`);
        if (list) for (const [px, pz] of list) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return true;
      }
    return false;
  };
  const remember = (x: number, z: number): void => {
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    let list = placed.get(key);
    if (!list) placed.set(key, (list = []));
    list.push([x, z]);
  };
  const mats: Map<number, THREE.Matrix4[]> = new Map(kinds.map((k) => [k, []]));
  const r = rng(77);
  for (const sgn of [1, -1]) {
    const wall = sgn > 0 ? t.wallL : t.wallR;
    const fence = sgn > 0 ? t.fenceL : t.fenceR;
    // the wall polyline
    const wx = new Float32Array(n);
    const wz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      wx[i] = t.px[i]! + t.tz[i]! * wall[i]! * sgn;
      wz[i] = t.pz[i]! - t.tx[i]! * wall[i]! * sgn;
    }
    let acc = 0;
    let nextAt = 0;
    for (let i = 0; i < n; i++) {
      const j = L(i + 1);
      const seg = Math.hypot(wx[j]! - wx[i]!, wz[j]! - wz[i]!);
      const kind = fence[i]!;
      const len = kind === Fence.Bales ? 2.4 : kind === Fence.Rail ? 2.0 : kind === Fence.Stone ? 2.6 : 3.0;
      while (nextAt <= acc + seg) {
        const f = seg > 1e-4 ? (nextAt - acc) / seg : 0;
        const x = wx[i]! + (wx[j]! - wx[i]!) * f;
        const z = wz[i]! + (wz[j]! - wz[i]!) * f;
        // fence direction from a wider stretch of the polyline (smooth in tight bends)
        const a = L(i - 2);
        const b = L(i + 3);
        const hd = Math.atan2(wx[b]! - wx[a]!, wz[b]! - wz[a]!);
        if (kind !== Fence.None && !near(x, z, len * 0.55)) {
          remember(x, z);
          const y = kind === Fence.Rail ? t.py[i]! : terrain.visual(x, z) - 0.05;
          const jitter = kind === Fence.Bales ? (r() - 0.5) * 0.12 : 0;
          mats.get(kind)!.push(mat(x, y, z, 0, hd + Math.PI / 2 + jitter, 0));
        }
        nextAt += len;
      }
      acc += seg;
    }
  }
  const fenceMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  disposables.push(fenceMat);
  for (const kind of kinds) {
    const list = mats.get(kind)!;
    if (!list.length) continue;
    const { geo } = fencePiece(kind);
    const im = new THREE.InstancedMesh(geo, fenceMat, list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = shadows && kind !== Fence.Pole;
    im.receiveShadow = shadows;
    group.add(im);
    disposables.push(geo);
  }

  // ---- chevron boards on the outside of the tight bends ----
  const chevTex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#d42f25';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 9;
    g.lineJoin = 'miter';
    for (const x0 of [30, 64, 98]) {
      g.beginPath();
      g.moveTo(x0 + 10, 12);
      g.lineTo(x0 - 10, h / 2);
      g.lineTo(x0 + 10, h - 12);
      g.stroke();
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  });
  const signGeoL = new THREE.PlaneGeometry(1.8, 0.9);
  const signGeoR = new THREE.PlaneGeometry(1.8, 0.9);
  const uvR = signGeoR.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uvR.count; k++) uvR.setX(k, 1 - uvR.getX(k));
  const signMat = new THREE.MeshLambertMaterial({ map: chevTex, side: THREE.DoubleSide });
  const postG = new Geo();
  const signsL: THREE.Matrix4[] = [];
  const signsR: THREE.Matrix4[] = [];
  let lastSign = -999;
  for (let i = 0; i < n; i++) {
    const k = t.curv[i]!;
    if (Math.abs(k) < 1 / 34 || i - lastSign < 5) continue;
    lastSign = i;
    // outside of the bend: right of the road when it turns left
    const sgn = k > 0 ? -1 : 1;
    const wall = sgn > 0 ? t.wallL[i]! : t.wallR[i]!;
    const p = t.point(i * t.ds, sgn * (wall + 1.6));
    const y = terrain.visual(p.x, p.z);
    const hd = t.heading(i * t.ds);
    // face the cars coming towards it, a bit turned in
    const m = mat(p.x, y + 1.7, p.z, 0, hd + Math.PI - sgn * 0.5, 0);
    (k > 0 ? signsL : signsR).push(m);
    postG.box(0.12, 1.7, 0.12, '#e8e8e8', p.x, y + 0.85, p.z);
  }
  for (const [geo, list] of [
    [signGeoL, signsL],
    [signGeoR, signsR],
  ] as const) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, signMat, list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    im.computeBoundingSphere();
    group.add(im);
  }
  disposables.push(chevTex, signGeoL, signGeoR, signMat);
  if (!postG.empty) {
    const pg = postG.build();
    const pm = new THREE.MeshLambertMaterial({ vertexColors: true });
    group.add(new THREE.Mesh(pg, pm));
    disposables.push(pg, pm);
  }

  // ---- the start gantry ----
  const span = (t.hw[0]! + 2.2) * 2;
  const gt = gantry(span);
  const gm = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gantryMesh = new THREE.Mesh(gt.frame, gm);
  gantryMesh.castShadow = shadows;
  const gGroup = new THREE.Group();
  gGroup.add(gantryMesh);
  gGroup.position.set(p0.x, p0.y, p0.z);
  gGroup.rotation.y = t.heading(0);
  group.add(gGroup);
  disposables.push(gt.frame, gm);
  // banner
  const banner = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#16304f';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < 6; x++)
      for (let y = 0; y < 6; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 16, y * 16, 16, 16);
        g.fillRect(w - 96 + x * 16, y * 16, 16, 16);
      }
    g.fillStyle = '#ffd23f';
    g.font = 'bold 60px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('START · MÅL', w / 2, h / 2 + 3);
  });
  const bannerGeo = new THREE.PlaneGeometry(span - 2.6, (span - 2.6) * (96 / 512));
  const bannerMat = new THREE.MeshLambertMaterial({ map: banner });
  for (const side of [0, 1]) {
    const b = new THREE.Mesh(bannerGeo, bannerMat);
    b.position.set(0, gt.bannerY + 2.75, side ? 0.3 : -0.3);
    b.rotation.y = side ? 0 : Math.PI;
    gGroup.add(b);
  }
  disposables.push(banner, bannerGeo, bannerMat);
  // lights
  const glowTex = blobTex(64, 0.1);
  const lightGeo = new THREE.CircleGeometry(0.4, 20);
  disposables.push(glowTex, lightGeo);
  const lights: Road['lights'] = [];
  for (const lp of gt.lightPos) {
    const m = new THREE.MeshBasicMaterial({ color: '#2a2a2a' });
    const disc = new THREE.Mesh(lightGeo, m);
    disc.position.copy(lp);
    disc.rotation.y = Math.PI;
    gGroup.add(disc);
    const gmat = new THREE.SpriteMaterial({ map: glowTex, color: '#ff3020', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const glow = new THREE.Sprite(gmat);
    glow.position.copy(lp).add(new THREE.Vector3(0, 0, -0.3));
    glow.scale.setScalar(3.2);
    gGroup.add(glow);
    lights.push({ mat: m, glow });
    disposables.push(m, gmat);
  }
  // flags on top of the towers
  const flagTex = checkerTex(6, 4);
  const flagGeo = new THREE.PlaneGeometry(1.6, 1.05, 8, 4);
  const flagMat = new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide });
  disposables.push(flagTex, flagGeo, flagMat);
  const flagBase = (flagGeo.getAttribute('position') as THREE.BufferAttribute).array.slice() as Float32Array;
  const flags: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), gm);
    pole.position.set((sx * span) / 2, 7.2 + 1.7 + 1.2, 0);
    gGroup.add(pole);
    disposables.push(pole.geometry);
    const f = new THREE.Mesh(flagGeo.clone(), flagMat);
    f.position.set(sx * (span / 2 + 0.8), 7.2 + 1.7 + 1.85, 0);
    f.rotation.y = sx > 0 ? 0 : Math.PI;
    gGroup.add(f);
    flags.push(f);
    disposables.push(f.geometry);
  }

  return {
    group,
    lights,
    setLights(k: number, green: boolean) {
      lights.forEach((l, i) => {
        const on = green || i < k;
        l.mat.color.set(on ? (green ? '#3dff6a' : '#ff2a1a') : '#2a2a2a');
        (l.glow.material as THREE.SpriteMaterial).color.set(green ? '#40ff70' : '#ff3020');
        (l.glow.material as THREE.SpriteMaterial).opacity = on ? 0.9 : 0;
      });
    },
    update(time: number) {
      for (let k = 0; k < flags.length; k++) {
        const pa = flags[k]!.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = pa.array as Float32Array;
        for (let v = 0; v < pa.count; v++) {
          const x = flagBase[v * 3]! + 0.8;
          arr[v * 3 + 2] = Math.sin(x * 3.2 - time * 7 + k) * 0.12 * x;
        }
        pa.needsUpdate = true;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
