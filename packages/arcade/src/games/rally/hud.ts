// The race HUD in plain HTML over the 3D view: position, lap and times, the standings, a minimap with
// dots, a speedometer with revs and gear, the start lights and big friendly messages.
import type { Track } from './track.ts';
import { clamp, fmtTime } from './util.ts';

const CSS = `
.rl-hud { position: absolute; inset: 0; pointer-events: none; color: #fff; z-index: 1; --s: 1;
  font-family: 'Nunito', 'Trebuchet MS', system-ui, sans-serif; }
.rl-hud * { box-sizing: border-box; }
.rl-panel { background: rgba(16, 20, 34, 0.5); border-radius: calc(14px * var(--s)); padding: calc(6px * var(--s)) calc(12px * var(--s));
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22); }
.rl-tl { position: absolute; left: max(calc(12px * var(--s)), env(safe-area-inset-left)); top: max(calc(10px * var(--s)), env(safe-area-inset-top));
  display: flex; flex-direction: column; gap: calc(6px * var(--s)); align-items: flex-start; }
.rl-pos { display: flex; align-items: baseline; gap: calc(4px * var(--s)); font-weight: 900; line-height: 1; }
.rl-pos b { font-size: calc(52px * var(--s)); text-shadow: 0 3px 0 rgba(0,0,0,0.35); }
.rl-pos i { font-style: normal; font-size: calc(22px * var(--s)); }
.rl-pos small { font-size: calc(16px * var(--s)); opacity: 0.85; margin-left: calc(4px * var(--s)); font-weight: 700; }
.rl-pos.first b { color: #ffd23f; }
.rl-lap { font-size: calc(19px * var(--s)); font-weight: 800; }
.rl-lap.last { color: #ffd23f; }
.rl-times { font-size: calc(14px * var(--s)); font-variant-numeric: tabular-nums; line-height: 1.45; }
.rl-times span { display: inline-block; width: calc(42px * var(--s)); opacity: 0.8; }
.rl-times b { font-weight: 800; }
.rl-board { list-style: none; margin: 0; padding: calc(5px * var(--s)) calc(10px * var(--s)); font-size: calc(13px * var(--s)); line-height: 1.5; }
.rl-board li { display: flex; align-items: center; gap: calc(6px * var(--s)); white-space: nowrap; }
.rl-board li.me { font-weight: 900; color: #ffe27a; }
.rl-board li.done { opacity: 0.75; }
.rl-dot { width: calc(10px * var(--s)); height: calc(10px * var(--s)); border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.8); flex: none; }
.rl-map { position: absolute; right: max(calc(12px * var(--s)), env(safe-area-inset-right)); top: calc(62px * var(--s));
  width: calc(156px * var(--s)); height: calc(156px * var(--s)); }
.rl-speedo { position: absolute; right: max(calc(16px * var(--s)), env(safe-area-inset-right)); bottom: max(calc(12px * var(--s)), env(safe-area-inset-bottom));
  width: calc(190px * var(--s)); height: calc(128px * var(--s)); }
.rl-hud.touch .rl-speedo { right: auto; left: 50%; transform: translateX(-50%); bottom: max(calc(4px * var(--s)), env(safe-area-inset-bottom)); }
.rl-msg { position: absolute; left: 50%; top: 27%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap;
  font-size: calc(78px * var(--s)); font-weight: 900; letter-spacing: 1px; opacity: 0;
  text-shadow: 0 0 calc(18px * var(--s)) rgba(255, 140, 40, 0.6), 0 calc(5px * var(--s)) 0 rgba(0, 0, 0, 0.45); }
.rl-msg.show { animation: rl-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.rl-msg.go { color: #5dff7a; }
.rl-msg.gold { color: #ffd23f; }
.rl-msg.small { font-size: calc(46px * var(--s)); }
.rl-msg.out { animation: rl-out 0.35s ease-in both; }
@keyframes rl-pop { from { transform: translate(-50%, -50%) scale(0.3); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
@keyframes rl-out { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(1.25); } }
.rl-sub { position: absolute; left: 50%; top: 37%; transform: translateX(-50%); text-align: center; max-width: 92%;
  font-size: calc(22px * var(--s)); font-weight: 800; text-shadow: 0 2px 0 rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; }
.rl-sub.show { opacity: 1; }
.rl-lights { position: absolute; left: 50%; top: calc(14px * var(--s)); transform: translateX(-50%); display: flex; gap: calc(12px * var(--s));
  padding: calc(10px * var(--s)) calc(16px * var(--s)); border-radius: calc(18px * var(--s)); background: rgba(14, 16, 22, 0.8);
  border: 2px solid rgba(255,255,255,0.25); opacity: 0; transition: opacity 0.3s; }
.rl-lights.show { opacity: 1; }
.rl-light { width: calc(40px * var(--s)); height: calc(40px * var(--s)); border-radius: 50%; background: #2c2c30; box-shadow: inset 0 3px 6px rgba(0,0,0,0.6); }
.rl-light.red { background: radial-gradient(circle at 40% 35%, #ff9a8a, #ff2a1a 55%, #a3100a); box-shadow: 0 0 calc(20px * var(--s)) #ff3020; }
.rl-light.green { background: radial-gradient(circle at 40% 35%, #b6ffc4, #2bff5c 55%, #0e9a2a); box-shadow: 0 0 calc(22px * var(--s)) #30ff60; }
.rl-wrong { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); padding: calc(8px * var(--s)) calc(20px * var(--s));
  border-radius: calc(16px * var(--s)); background: rgba(220, 40, 30, 0.85); font-size: calc(30px * var(--s)); font-weight: 900; display: none;
  animation: rl-blink 0.8s steps(2) infinite; }
.rl-wrong.show { display: block; }
@keyframes rl-blink { 50% { opacity: 0.55; } }
.rl-toast { position: absolute; left: 50%; top: 47%; transform: translateX(-50%); padding: calc(6px * var(--s)) calc(16px * var(--s));
  border-radius: 999px; background: rgba(16, 20, 34, 0.7); font-size: calc(17px * var(--s)); font-weight: 800; opacity: 0; transition: opacity 0.25s; }
.rl-toast.show { opacity: 1; }
.rl-veil { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 55%, rgba(20,8,0,0.35) 100%); }
.rl-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: linear-gradient(180deg, #f3c58e 0%, #e9a56b 40%, #6f9a4a 41%, #4f7d36 100%); font-size: calc(26px * var(--s)); font-weight: 900;
  text-shadow: 0 3px 0 rgba(0,0,0,0.35); transition: opacity 0.5s; }
.rl-loading .car { font-size: calc(64px * var(--s)); animation: rl-drive 0.6s ease-in-out infinite alternate; }
@keyframes rl-drive { from { transform: translateX(-30px) rotate(-3deg); } to { transform: translateX(30px) rotate(2deg); } }
.rl-loading .bar { width: min(60vw, 320px); height: 12px; border-radius: 6px; background: rgba(0,0,0,0.25); overflow: hidden; }
.rl-loading .bar i { display: block; height: 100%; width: 0; background: #ffd23f; transition: width 0.2s; }
`;

export interface Racer {
  name: string;
  color: string;
  me: boolean;
  done: boolean;
  x: number;
  z: number;
}

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent.append(e);
  return e;
}

export class Hud {
  readonly root: HTMLElement;
  private style: HTMLStyleElement;
  private pos: HTMLElement;
  private lap: HTMLElement;
  private times: HTMLElement;
  private board: HTMLElement;
  private boardKey = '';
  private map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  private speedo: HTMLCanvasElement;
  private msgEl: HTMLElement;
  private sub: HTMLElement;
  private lightsEl: HTMLElement;
  private lightEls: HTMLElement[] = [];
  private wrong: HTMLElement;
  private toastEl: HTMLElement;
  private loading: HTMLElement | null;
  private loadBar: HTMLElement;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private scale = 1;
  private ro: ResizeObserver;
  private mapScale = 1;
  private mapOx = 0;
  private mapOz = 0;

  constructor(
    parent: HTMLElement,
    private track: Track,
    private dpr: number,
    touch: boolean,
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    parent.append(this.style);
    this.root = el('div', `rl-hud${touch ? ' touch' : ''}`, parent);
    el('div', 'rl-veil', this.root);
    const tl = el('div', 'rl-tl', this.root);
    const top = el('div', 'rl-panel', tl);
    this.pos = el('div', 'rl-pos', top);
    this.lap = el('div', 'rl-lap', top);
    this.times = el('div', 'rl-panel rl-times', tl);
    this.board = el('ul', 'rl-panel rl-board', tl);
    this.map = el('canvas', 'rl-map', this.root) as HTMLCanvasElement;
    this.speedo = el('canvas', 'rl-speedo', this.root) as HTMLCanvasElement;
    this.lightsEl = el('div', 'rl-lights', this.root);
    for (let k = 0; k < 4; k++) this.lightEls.push(el('div', 'rl-light', this.lightsEl));
    this.wrong = el('div', 'rl-wrong', this.root);
    this.wrong.textContent = '↺ Fel håll! Vänd!';
    this.msgEl = el('div', 'rl-msg', this.root);
    this.sub = el('div', 'rl-sub', this.root);
    this.toastEl = el('div', 'rl-toast', this.root);
    this.loading = el('div', 'rl-loading', this.root);
    el('div', 'car', this.loading).textContent = '🏎️';
    el('div', '', this.loading).textContent = 'Bygger banan…';
    this.loadBar = el('i', '', el('div', 'bar', this.loading));
    this.hideRace(true);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(parent);
    this.fit();
  }

  private fit(): void {
    const r = this.root.getBoundingClientRect();
    const s = clamp(Math.min(r.width / 980, r.height / 620), 0.58, 1.25);
    this.scale = s;
    this.root.style.setProperty('--s', s.toFixed(3));
    // the board only when there is room
    this.board.style.display = r.height > 520 && r.width > 700 ? '' : 'none';
    const mw = Math.round(156 * s * this.dpr);
    this.map.width = mw;
    this.map.height = mw;
    this.mapBase = null;
    this.speedo.width = Math.round(190 * s * this.dpr);
    this.speedo.height = Math.round(128 * s * this.dpr);
  }

  progress(f: number): void {
    this.loadBar.style.width = `${Math.round(f * 100)}%`;
  }

  ready(): void {
    const l = this.loading;
    if (!l) return;
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 600);
    this.loading = null;
  }

  hideRace(hide: boolean): void {
    for (const e of [this.pos.parentElement!, this.times, this.board, this.map, this.speedo]) e.style.visibility = hide ? 'hidden' : 'visible';
  }

  setPosition(place: number, of: number, lap: number, laps: number): void {
    const suf = place === 1 || place === 2 ? 'a' : 'e';
    const html = `<b>${place}</b><i>:${suf}</i><small>av ${of}</small>`;
    if (this.pos.innerHTML !== html) this.pos.innerHTML = html;
    this.pos.classList.toggle('first', place === 1);
    const lt = lap > laps ? 'I mål!' : `Varv ${lap}/${laps}`;
    if (this.lap.textContent !== lt) this.lap.textContent = lt;
    this.lap.classList.toggle('last', lap === laps);
  }

  setTimes(total: number, lap: number, best: number): void {
    this.times.innerHTML = `<div><span>Tid</span><b>${fmtTime(total)}</b></div><div><span>Varv</span><b>${fmtTime(lap)}</b></div><div><span>Bäst</span><b>${best < Infinity ? fmtTime(best) : '–'}</b></div>`;
  }

  setBoard(order: Racer[]): void {
    const key = order.map((r) => r.name + (r.done ? '!' : '')).join('|');
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.board.innerHTML = order
      .map((r, i) => `<li class="${r.me ? 'me' : ''} ${r.done ? 'done' : ''}"><span>${i + 1}.</span><span class="rl-dot" style="background:${r.color}"></span>${escape(r.name)}${r.done ? ' 🏁' : ''}</li>`)
      .join('');
  }

  /** Draw the minimap with a dot per car. */
  drawMap(racers: Racer[], time: number): void {
    const c = this.map;
    const g = c.getContext('2d')!;
    const W = c.width;
    if (!this.mapBase) this.mapBase = this.buildMap(W);
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBase, 0, 0);
    const k = this.mapScale;
    for (const pass of [0, 1])
      for (const r of racers) {
        if ((pass === 1) !== r.me) continue;
        const x = (r.x - this.mapOx) * k;
        const y = (r.z - this.mapOz) * k;
        const rad = (r.me ? 6.5 + Math.sin(time * 6) * 0.8 : 4.6) * this.scale * this.dpr;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fillStyle = r.color;
        g.fill();
        g.lineWidth = (r.me ? 2.6 : 1.6) * this.dpr;
        g.strokeStyle = r.me ? '#ffffff' : 'rgba(0,0,0,0.7)';
        g.stroke();
      }
  }

  private buildMap(W: number): HTMLCanvasElement {
    const t = this.track;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = W;
    const g = cv.getContext('2d')!;
    const pad = W * 0.1;
    const span = Math.max(t.maxX - t.minX, t.maxZ - t.minZ);
    const k = (W - pad * 2) / span;
    this.mapScale = k;
    this.mapOx = (t.minX + t.maxX) / 2 - W / 2 / k;
    this.mapOz = (t.minZ + t.maxZ) / 2 - W / 2 / k;
    g.fillStyle = 'rgba(16, 20, 34, 0.45)';
    const r = W * 0.12;
    g.beginPath();
    g.roundRect(0, 0, W, W, r);
    g.fill();
    const path = (from: number, to: number): void => {
      g.beginPath();
      for (let i = from; i <= to; i++) {
        const j = i % t.n;
        const x = (t.px[j]! - this.mapOx) * k;
        const y = (t.pz[j]! - this.mapOz) * k;
        if (i === from) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    path(0, t.n);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = W * 0.06;
    g.stroke();
    g.strokeStyle = '#e9e6dd';
    g.lineWidth = W * 0.035;
    g.stroke();
    // the gravel stretch
    let a = -1;
    for (let i = 0; i <= t.n; i++) {
      const on = t.surf[i % t.n] === 1;
      if (on && a < 0) a = i;
      if ((!on || i === t.n) && a >= 0) {
        path(a, i);
        g.strokeStyle = '#d8b878';
        g.stroke();
        a = -1;
      }
    }
    // the start line
    const sx = (t.px[0]! - this.mapOx) * k;
    const sy = (t.pz[0]! - this.mapOz) * k;
    g.save();
    g.translate(sx, sy);
    g.rotate(Math.atan2(t.tz[0]!, t.tx[0]!));
    g.fillStyle = '#111';
    g.fillRect(-W * 0.012, -W * 0.04, W * 0.024, W * 0.08);
    g.fillStyle = '#fff';
    g.fillRect(-W * 0.012, -W * 0.04, W * 0.012, W * 0.02);
    g.fillRect(0, -W * 0.02, W * 0.012, W * 0.02);
    g.fillRect(-W * 0.012, 0, W * 0.012, W * 0.02);
    g.fillRect(0, W * 0.02, W * 0.012, W * 0.02);
    g.restore();
    return cv;
  }

  /** The speedometer: a rev arc, km/h and the gear. */
  drawSpeedo(kmh: number, rpm: number, gear: number, maxRpm: number): void {
    const c = this.speedo;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.86;
    const R = Math.min(W * 0.46, H * 0.8);
    const a0 = Math.PI * 1.08;
    const a1 = Math.PI * 1.92;
    g.lineCap = 'round';
    // backing
    g.beginPath();
    g.arc(cx, cy, R * 1.08, Math.PI, 0);
    g.closePath();
    g.fillStyle = 'rgba(16, 20, 34, 0.5)';
    g.fill();
    // rev arc
    g.lineWidth = R * 0.13;
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.arc(cx, cy, R * 0.88, a0, a1);
    g.stroke();
    const f = clamp(rpm / (maxRpm + 500), 0, 1);
    const red = clamp((maxRpm - 900) / (maxRpm + 500), 0, 1);
    g.strokeStyle = f > red ? '#ff4433' : f > red * 0.85 ? '#ffd23f' : '#ffffff';
    g.beginPath();
    g.arc(cx, cy, R * 0.88, a0, a0 + (a1 - a0) * f);
    g.stroke();
    // red zone ticks
    g.lineWidth = R * 0.04;
    g.strokeStyle = '#ff4433';
    g.beginPath();
    g.arc(cx, cy, R * 1.0, a0 + (a1 - a0) * red, a1);
    g.stroke();
    // numbers
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `900 ${Math.round(R * 0.62)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowOffsetY = 2 * this.dpr;
    g.fillText(String(Math.round(kmh)), cx - R * 0.08, cy - R * 0.12);
    g.shadowColor = 'transparent';
    g.font = `800 ${Math.round(R * 0.17)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText('km/h', cx - R * 0.08, cy + R * 0.06);
    g.globalAlpha = 1;
    // gear bubble
    const gx = cx + R * 0.62;
    const gy = cy - R * 0.3;
    g.beginPath();
    g.arc(gx, gy, R * 0.2, 0, Math.PI * 2);
    g.fillStyle = gear < 0 ? '#ff7a2a' : '#ffd23f';
    g.fill();
    g.fillStyle = '#16141f';
    g.font = `900 ${Math.round(R * 0.26)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(gear < 0 ? 'R' : String(gear), gx, gy + R * 0.01);
  }

  lights(n: number, green: boolean, show: boolean): void {
    this.lightsEl.classList.toggle('show', show);
    this.lightEls.forEach((l, i) => {
      l.className = `rl-light${green ? ' green' : i < n ? ' red' : ''}`;
    });
  }

  /** A big message for `ms` milliseconds (0 = until replaced). */
  msg(text: string, ms = 1400, cls = ''): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    const e = this.msgEl;
    e.textContent = text;
    e.className = 'rl-msg';
    void e.offsetWidth;
    e.className = `rl-msg show ${cls}`;
    if (ms > 0)
      this.msgTimer = setTimeout(() => {
        e.className = `rl-msg out ${cls}`;
      }, ms);
  }

  subtitle(text: string): void {
    if (text) this.sub.textContent = text;
    this.sub.classList.toggle('show', !!text);
  }

  wrongWay(on: boolean): void {
    this.wrong.classList.toggle('show', on);
  }

  toast(text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1300);
  }

  destroy(): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.ro.disconnect();
    this.root.remove();
    this.style.remove();
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
