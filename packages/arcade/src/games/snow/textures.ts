// Every picture in the game is drawn here with a 2D canvas (no image files).
import * as THREE from 'three';
import { rng } from './util.ts';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A soft white radial glow (for halos, light pools and sparkles). */
export function glowTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/** A soft dark blob for shadows under flying snowballs and pickups. */
export function blobTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(40,40,90,0.55)');
    gr.addColorStop(0.55, 'rgba(40,40,90,0.25)');
    gr.addColorStop(1, 'rgba(40,40,90,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A white snow splat with lumpy edges (for walls and the ground). */
export function splatTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const r = rng(7);
    g.fillStyle = '#ffffff';
    g.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 34 + r() * 18;
      const x = 64 + Math.cos(a) * rr;
      const y = 64 + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = 44 + r() * 14;
      g.beginPath();
      g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + r() * 6, 0, Math.PI * 2);
      g.fill();
    }
    // a soft shade in the middle so it reads as a lump of snow
    const gr = g.createRadialGradient(56, 56, 4, 64, 64, 50);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(200,210,255,0.35)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Soft cloud banks for the horizon. */
export function cloudTexture(seed: number): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    const r = rng(seed);
    for (let i = 0; i < 26; i++) {
      const x = 30 + r() * 196;
      const y = 60 + (r() - 0.5) * 30 * (1 - Math.abs(x - 128) / 128);
      const rad = 18 + r() * 34 * (1 - Math.abs(x - 128) / 170);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 128);
    }
  });
}

/** The moon: a pale disc with soft grey seas. */
export function moonTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const r = rng(11);
    g.save();
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.clip();
    const base = g.createRadialGradient(110, 108, 10, 128, 128, 124);
    base.addColorStop(0, '#fffaf0');
    base.addColorStop(0.75, '#fff3dc');
    base.addColorStop(1, '#f6dcc4');
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    const seas: [number, number, number][] = [
      [92, 90, 34],
      [150, 82, 26],
      [130, 150, 40],
      [84, 158, 22],
      [170, 140, 18],
    ];
    for (const [x, y, rad] of seas) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(214,196,200,0.55)');
      gr.addColorStop(1, 'rgba(214,196,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 14; i++) {
      const x = 40 + r() * 176;
      const y = 40 + r() * 176;
      const rad = 3 + r() * 7;
      g.strokeStyle = 'rgba(205,188,196,0.45)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  });
}

/** The warning bubble over a snowman about to throw. */
export function bangTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#ff4f7a';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 58, 44, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(50, 96);
    g.lineTo(64, 122);
    g.lineTo(76, 96);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.fillStyle = '#ff4f7a';
    g.font = 'bold 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 64, 62);
  });
}

/** Faint vertical boards for the red cottages. */
export function boardsTexture(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(x, 0, 3, 256);
      g.fillStyle = 'rgba(255,255,255,0.0)';
    }
    const r = rng(3);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 10 + r() * 40);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Knitted stripes for scarves and the mitten cuff: white with a coloured band. */
export function stripeTexture(a: string, b: string): THREE.CanvasTexture {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = b;
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 7);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < 64; x += 4) for (let y = 0; y < 64; y += 4) if ((x + y) % 8 === 0) g.fillRect(x, y, 2, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
