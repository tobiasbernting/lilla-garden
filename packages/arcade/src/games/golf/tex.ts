// Every picture in Minigolfen is painted here on small canvases: felt, wood, grass, hay, water, the
// ball's stripe, the flag's number and the soft shadow blob.
import * as THREE from 'three';

/** A small deterministic random generator (so the felt looks the same every time). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat: boolean, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Light speckle noise around white, to be tinted by the material colour. */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, lo: number, hi: number, r: () => number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = lo + (hi - lo) * r();
    d[i] = d[i]! * (v / 255);
    d[i + 1] = d[i + 1]! * (v / 255);
    d[i + 2] = d[i + 2]! * (v / 255);
  }
  g.putImageData(img, 0, 0);
}

export function feltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(7);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 222, 255, r);
  // short fibres
  for (let i = 0; i < 1400; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const a = r() * Math.PI;
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,40,0,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
    g.stroke();
  }
  return finish(c, true);
}

export function grassTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(11);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // soft patches
  for (let i = 0; i < 40; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 10 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(40,80,0,0.13)' : 'rgba(255,255,200,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) g.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
  }
  // blades
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.strokeStyle = r() < 0.6 ? 'rgba(20,70,0,0.18)' : 'rgba(255,255,220,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 2, y - 2 - r() * 3);
    g.stroke();
  }
  return finish(c, true);
}

export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  const r = rng(3);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 26; i++) {
    const y = r() * 64;
    g.strokeStyle = `rgba(90,40,0,${0.08 + r() * 0.12})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
    g.stroke();
  }
  // knots
  for (let i = 0; i < 3; i++) {
    const x = r() * 256;
    const y = 10 + r() * 44;
    g.fillStyle = 'rgba(90,40,0,0.25)';
    g.beginPath();
    g.ellipse(x, y, 5, 2.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 256, 64, 225, 255, r);
  return finish(c, true);
}

export function hayTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(5);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    const x = r() * 128;
    const y = r() * 128;
    g.strokeStyle = r() < 0.5 ? 'rgba(150,90,0,0.25)' : 'rgba(255,255,230,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + r() * 8, y + (r() - 0.5) * 3);
    g.stroke();
  }
  return finish(c, true);
}

/** The flat end of a round bale: a rolled-up spiral. */
export function spiralTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f7d35c';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(160,100,10,0.55)';
  g.lineWidth = 2.5;
  g.beginPath();
  for (let a = 0; a < Math.PI * 12; a += 0.1) {
    const rr = (a / (Math.PI * 12)) * 60;
    const x = 64 + Math.cos(a) * rr;
    const y = 64 + Math.sin(a) * rr;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  return finish(c, false);
}

export function waterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(13);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const len = 10 + r() * 22;
    g.strokeStyle = `rgba(255,255,255,${0.4 + r() * 0.5})`;
    g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath();
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + len / 2, y + oy - 3, x + ox + len, y + oy);
      }
    }
    g.stroke();
  }
  // tint the background so the white lines read as sparkles on blue
  const img = g.getImageData(0, 0, 256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const w = d[i]! / 255;
    d[i] = 190 + 65 * w;
    d[i + 1] = 225 + 30 * w;
    d[i + 2] = 245 + 10 * w;
  }
  g.putImageData(img, 0, 0);
  return finish(c, true);
}

/** White hide with black patches, for the cows. */
export function cowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(17);
  g.fillStyle = '#fbfbf6';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2b2b2e';
  for (let i = 0; i < 7; i++) {
    const x = r() * 128;
    const y = r() * 128;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rad = 9 + r() * 10;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  return finish(c, false);
}

/** The ball: the player's colour with a white band, so you can see it roll. */
export function ballTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 27, 128, 10);
  // two little stars
  const star = (x: number, y: number, rad: number): void => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? rad * 0.45 : rad;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  star(32, 13, 7);
  star(96, 51, 7);
  return finish(c, false);
}

/** A soft round shadow. */
export function blobTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return finish(c, false, false);
}

/** The flag on the pin: a bright pennant with the hole's number. */
export function flagTexture(n: number, color: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 96);
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 128; i += 24) g.fillRect(i, 0, 12, 96);
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 6;
  g.font = 'bold 66px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText(String(n), 64, 52);
  g.fillText(String(n), 64, 52);
  return finish(c, false);
}

/** The wooden sign by the tee. */
export function signTexture(n: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 96);
  g.fillStyle = '#e9b46a';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = 'rgba(120,60,10,0.35)';
  g.lineWidth = 2;
  for (let y = 12; y < 96; y += 18) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y + 2);
    g.stroke();
  }
  g.strokeStyle = '#8a4f1c';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 90);
  g.fillStyle = '#5b2f0c';
  g.font = 'bold 60px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 52);
  return finish(c, false);
}

/** The merry-go-round's floor: candy wedges round the middle. */
export function carouselTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const cols = ['#ff7eb6', '#fff3c4', '#7fd8ff', '#fff3c4', '#ffd23f', '#fff3c4', '#b6f07a', '#fff3c4', '#c7a6ff', '#fff3c4', '#ff9f5a', '#fff3c4'];
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i]!;
    g.beginPath();
    g.moveTo(256, 256);
    g.arc(256, 256, 260, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(256, 256, 248, 0, Math.PI * 2);
  g.stroke();
  speckle(g, 512, 512, 232, 255, rng(23));
  return finish(c, false);
}

/** The island's earthy sides: layers of soil with a few pebbles. */
export function earthTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(29);
  const bands = ['#b07a45', '#9c6a3b', '#a8733f', '#8f5f34', '#b9854f', '#97653a'];
  let y = 0;
  let i = 0;
  while (y < 128) {
    const h = 10 + r() * 16;
    g.fillStyle = bands[i % bands.length]!;
    g.fillRect(0, y, 128, h + 1);
    y += h;
    i++;
  }
  for (let k = 0; k < 40; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(220,210,200,0.6)' : 'rgba(70,40,20,0.35)';
    g.beginPath();
    g.ellipse(r() * 128, r() * 128, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 128, 128, 225, 255, r);
  return finish(c, true);
}

/** A sky that fades from deep blue on top to a pale haze at the horizon. */
export function skyTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#4fb4f2');
  gr.addColorStop(0.45, '#8fd3fb');
  gr.addColorStop(0.62, '#d6f1ff');
  gr.addColorStop(0.72, '#e9f8ff');
  gr.addColorStop(1, '#bfe6fb');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  return finish(c, false);
}
