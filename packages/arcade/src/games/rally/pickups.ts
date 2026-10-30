// The only pickups: boost pads on the road (a short shove forward) and mud puddles (slow and messy).
// Placed from a seed so every screen in a room agrees, never on the grid or in the first bend.
import * as THREE from 'three';
import { canvasTex } from './geo.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface Pickup {
  kind: 'boost' | 'mud';
  s: number;
  /** Offset from the centre line (left positive). */
  d: number;
  /** Seconds until it works again for the same car (per car, see `touch`). */
}

const PAD_LEN = 5;
const PAD_W = 3.2;
const MUD_R = 2.6;

export function placePickups(track: Track, seed: number): Pickup[] {
  const r = rng(seed ^ 0x51ed);
  const out: Pickup[] = [];
  const nBoost = 6;
  const nMud = 5;
  const L = track.length;
  // spread over the lap: one slot every L / n metres, nudged a little
  for (let k = 0; k < nBoost; k++) {
    const s = 80 + ((L - 140) * (k + 0.25 + r() * 0.5)) / nBoost;
    const hw = track.at(track.hw, s);
    out.push({ kind: 'boost', s, d: (r() - 0.5) * (hw - PAD_W) * 1.4 });
  }
  for (let k = 0; k < nMud; k++) {
    const s = 110 + ((L - 170) * (k + 0.3 + r() * 0.4)) / nMud;
    if (out.some((p) => Math.abs(track.wrapDist(p.s - s)) < 14)) continue;
    const hw = track.at(track.hw, s);
    out.push({ kind: 'mud', s, d: (r() - 0.5) * (hw - MUD_R) * 1.6 });
  }
  return out;
}

/** Which pickup (if any) a car at (s, d) is on. */
export function pickupAt(list: Pickup[], track: Track, s: number, d: number): Pickup | null {
  for (const p of list) {
    const ds = track.wrapDist(s - p.s);
    if (p.kind === 'boost' ? Math.abs(ds) < PAD_LEN / 2 && Math.abs(d - p.d) < PAD_W / 2 + 0.6 : ds * ds + (d - p.d) ** 2 < MUD_R * MUD_R) return p;
  }
  return null;
}

export interface PickupMeshes {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

export function buildPickups(track: Track, list: Pickup[]): PickupMeshes {
  const group = new THREE.Group();
  const padTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#1a5fd0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7fe3ff';
    g.lineWidth = 9;
    g.lineJoin = 'miter';
    for (const y0 of [28, 64, 100]) {
      g.beginPath();
      g.moveTo(10, y0 + 14);
      g.lineTo(w / 2, y0 - 10);
      g.lineTo(w - 10, y0 + 14);
      g.stroke();
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  });
  const mudTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(70,48,26,1)');
    gr.addColorStop(0.7, 'rgba(92,66,38,0.95)');
    gr.addColorStop(1, 'rgba(92,66,38,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = w * (0.42 + 0.06 * Math.sin(k * 2.7));
      g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
    }
    g.fill();
    g.fillStyle = 'rgba(160,140,110,0.35)';
    for (let k = 0; k < 5; k++) g.fillRect(30 + k * 14, 50 + (k % 2) * 16, 10, 3);
  });
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const mudMat = new THREE.MeshLambertMaterial({ map: mudTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const padGeo = new THREE.PlaneGeometry(PAD_W, PAD_LEN);
  padGeo.rotateX(-Math.PI / 2);
  const mudGeo = new THREE.PlaneGeometry(MUD_R * 2.2, MUD_R * 2.2);
  mudGeo.rotateX(-Math.PI / 2);
  for (const p of list) {
    const c = track.point(p.s, p.d);
    const m = new THREE.Mesh(p.kind === 'boost' ? padGeo : mudGeo, p.kind === 'boost' ? padMat : mudMat);
    m.position.set(c.x, c.y + 0.03, c.z);
    // the pad's chevrons point the way the cars go (the texture's top is +v, along −z of the plane)
    m.rotation.y = track.heading(p.s) + Math.PI;
    m.renderOrder = 1;
    group.add(m);
  }
  return {
    group,
    update(time) {
      // the pads pulse
      const k = 0.75 + 0.25 * Math.sin(time * 8);
      padMat.color.setRGB(k, k, k);
    },
    dispose() {
      padTex.dispose();
      mudTex.dispose();
      padMat.dispose();
      mudMat.dispose();
      padGeo.dispose();
      mudGeo.dispose();
    },
  };
}
