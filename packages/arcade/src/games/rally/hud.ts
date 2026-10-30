// The race HUD in plain HTML over the 3D view: position, lap and times, the standings, a minimap with
// dots, a speedometer with revs and gear, the start lights and big friendly messages. Rallyvärlden adds
// the damage bar, nitro charges, the drift meter and style points, name tags over the other cars, the
// result table, the free-roam counters and two little touch buttons (camera, home).
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
.rl-br { position: absolute; right: max(calc(16px * var(--s)), env(safe-area-inset-right)); bottom: calc(146px * var(--s));
  display: flex; flex-direction: column; align-items: flex-end; gap: calc(6px * var(--s)); }
.rl-hud.touch .rl-br { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(132px * var(--s)); align-items: center; }
.rl-chip { display: none; align-items: center; gap: calc(6px * var(--s)); font-weight: 900; font-size: calc(17px * var(--s)); }
.rl-chip.show { display: flex; }
.rl-meter { width: calc(110px * var(--s)); height: calc(12px * var(--s)); border-radius: 999px; background: rgba(255,255,255,0.18); overflow: hidden; }
.rl-meter i { display: block; height: 100%; width: 0; border-radius: 999px; background: #5fdc6a; }
.rl-nitro span { filter: grayscale(1) opacity(0.35); }
.rl-nitro span.on { filter: none; }
.rl-nitro span.burn { filter: drop-shadow(0 0 6px #ffb040); animation: rl-blink 0.3s steps(2) infinite; }
.rl-style b { color: #ffd23f; font-variant-numeric: tabular-nums; }
.rl-drift .rl-meter i { transition: background 0.2s; }
.rl-pop { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); font-size: calc(30px * var(--s)); font-weight: 900; white-space: nowrap;
  color: #ffd23f; text-shadow: 0 3px 0 rgba(0,0,0,0.45); animation: rl-rise 1.4s ease-out both; }
.rl-pop.coin { color: #ffe27a; }
.rl-pop.blue { color: #7fd6ff; }
@keyframes rl-rise { from { opacity: 0; transform: translate(-50%, 10px) scale(0.6); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  to { opacity: 0; transform: translate(-50%, -70px) scale(1); } }
.rl-tags { position: absolute; inset: 0; overflow: hidden; }
.rl-tag { position: absolute; left: 0; top: 0; padding: calc(2px * var(--s)) calc(8px * var(--s)); border-radius: 999px; white-space: nowrap;
  background: rgba(16, 20, 34, 0.6); font-size: calc(13px * var(--s)); font-weight: 800; transform: translate(-50%, -100%); display: none; }
.rl-tag i { display: inline-block; width: calc(8px * var(--s)); height: calc(8px * var(--s)); border-radius: 50%; margin-right: calc(4px * var(--s)); }
.rl-speed { position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.0) 0deg 7deg, rgba(255,255,255,0.22) 7.4deg 8deg);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 38%, #000 75%); mask: radial-gradient(circle at 50% 50%, transparent 38%, #000 75%); }
.rl-result { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: min(92%, calc(420px * var(--s)));
  background: rgba(16, 20, 34, 0.82); border-radius: calc(18px * var(--s)); padding: calc(14px * var(--s)) calc(18px * var(--s)); display: none; }
.rl-result.show { display: block; animation: rl-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.rl-result h3 { margin: 0 0 calc(8px * var(--s)); text-align: center; font-size: calc(24px * var(--s)); color: #ffd23f; }
.rl-result table { width: 100%; border-collapse: collapse; font-size: calc(16px * var(--s)); font-variant-numeric: tabular-nums; }
.rl-result td { padding: calc(3px * var(--s)) calc(6px * var(--s)); white-space: nowrap; }
.rl-result tr.me td { color: #ffe27a; font-weight: 900; }
.rl-result td.r { text-align: right; }
.rl-roam { display: none; font-size: calc(20px * var(--s)); font-weight: 900; line-height: 1.35; }
.rl-roam.show { display: block; }
.rl-btns { position: absolute; right: max(calc(12px * var(--s)), env(safe-area-inset-right)); top: calc(226px * var(--s)); display: flex; flex-direction: column; align-items: flex-end; gap: calc(8px * var(--s)); }
.rl-btn { pointer-events: auto; border: 2px solid rgba(255,255,255,0.5); background: rgba(16, 20, 34, 0.6); color: #fff; border-radius: 999px;
  font: 900 calc(16px * var(--s)) 'Nunito', system-ui, sans-serif; padding: calc(6px * var(--s)) calc(12px * var(--s)); display: none; cursor: pointer; }
.rl-btn.show { display: block; }
.rl-hint { position: absolute; left: 50%; bottom: max(calc(14px * var(--s)), env(safe-area-inset-bottom)); transform: translateX(-50%); font-size: calc(14px * var(--s));
  font-weight: 800; opacity: 0.8; text-shadow: 0 1px 0 rgba(0,0,0,0.5); display: none; }
.rl-hint.show { display: block; }
.rl-hud.touch .rl-hint { display: none; }
`;

/** One line of the result table. */
export interface ResultRow {
  name: string;
  me: boolean;
  time: number | null;
  place: number;
  prize?: number;
  medal?: 'gold' | 'silver' | 'bronze' | null;
}

const MEDAL: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

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
  private br: HTMLElement;
  private dmgChip: HTMLElement;
  private dmgBar: HTMLElement;
  private nitroChip: HTMLElement;
  private nitroKey = '';
  private driftChip: HTMLElement;
  private driftBar: HTMLElement;
  private styleChip: HTMLElement;
  private tagsEl: HTMLElement;
  private tagEls = new Map<string, HTMLElement>();
  private speedEl: HTMLElement;
  private resultEl: HTMLElement;
  private roamEl: HTMLElement;
  private hintEl: HTMLElement;
  private btns: HTMLElement;
  /** Touch buttons of the HUD's own: the camera and (free roam) home. */
  readonly camBtn: HTMLButtonElement;
  readonly homeBtn: HTMLButtonElement;
  private roamMode = false;

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
    this.speedEl = el('div', 'rl-speed', this.root);
    this.tagsEl = el('div', 'rl-tags', this.root);
    this.roamEl = el('div', 'rl-panel rl-roam', tl);
    this.br = el('div', 'rl-br', this.root);
    this.styleChip = el('div', 'rl-panel rl-chip rl-style', this.br);
    this.driftChip = el('div', 'rl-panel rl-chip rl-drift', this.br);
    el('span', '', this.driftChip).textContent = '🌀';
    this.driftBar = el('i', '', el('div', 'rl-meter', this.driftChip));
    this.nitroChip = el('div', 'rl-panel rl-chip rl-nitro', this.br);
    this.dmgChip = el('div', 'rl-panel rl-chip', this.br);
    el('span', '', this.dmgChip).textContent = '🔧';
    this.dmgBar = el('i', '', el('div', 'rl-meter', this.dmgChip));
    this.resultEl = el('div', 'rl-result', this.root);
    this.hintEl = el('div', 'rl-hint', this.root);
    this.btns = el('div', 'rl-btns', this.root);
    this.camBtn = el('button', 'rl-btn', this.btns) as HTMLButtonElement;
    this.camBtn.textContent = '🎥';
    this.homeBtn = el('button', 'rl-btn', this.btns) as HTMLButtonElement;
    this.homeBtn.textContent = '🏠 Hem till garaget';
    if (touch) this.camBtn.classList.add('show');
    for (const b of [this.camBtn, this.homeBtn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
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
    for (const e of [this.pos.parentElement!, this.times, this.board, this.map, this.speedo, this.br]) e.style.visibility = hide ? 'hidden' : 'visible';
    if (this.roamMode) for (const e of [this.pos.parentElement!, this.times, this.board]) e.style.display = 'none';
  }

  /** Free roam: the coin counter instead of the position, laps and standings. */
  roam(on: boolean, touch: boolean): void {
    this.roamMode = on;
    this.roamEl.classList.toggle('show', on);
    this.homeBtn.classList.toggle('show', on && touch);
    this.hint(on && !touch ? 'Enter: hem till garaget · R: tillbaka på vägen' : '');
  }

  setRoam(coins: number, total: number, stunt: number): void {
    const html = `🪙 <b>${coins}</b> / ${total}<br>⭐ <b>${stunt}</b>`;
    if (this.roamEl.innerHTML !== html) this.roamEl.innerHTML = html;
  }

  hint(text: string): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('show', !!text);
  }

  /** The damage bar (null hides it). */
  setDamage(d: number | null): void {
    this.dmgChip.classList.toggle('show', d !== null);
    if (d === null) return;
    this.dmgBar.style.width = `${Math.round(clamp(d, 0, 100))}%`;
    this.dmgBar.style.background = d < 35 ? '#5fdc6a' : d < 70 ? '#ffd23f' : '#ff5a3a';
  }

  /** Nitro charges left and whether one is burning (total 0 hides it). */
  setNitro(left: number, total: number, burning: boolean): void {
    const key = `${left}/${total}/${burning}`;
    if (key === this.nitroKey) return;
    this.nitroKey = key;
    this.nitroChip.classList.toggle('show', total > 0);
    let html = '';
    for (let k = 0; k < total; k++) html += `<span class="${k < left ? 'on' : burning && k === left ? 'burn' : ''}">🔥</span>`;
    this.nitroChip.innerHTML = html;
  }

  /** The drift meter: 0..1 charge and the tier colour (0 hides it). */
  setDrift(k: number, tier: number): void {
    this.driftChip.classList.toggle('show', k > 0);
    this.driftBar.style.width = `${Math.round(clamp(k, 0, 1) * 100)}%`;
    this.driftBar.style.background = ['#9aa0b0', '#4fb3ff', '#ff9a2a', '#c070ff'][tier] ?? '#9aa0b0';
  }

  setStyle(points: number): void {
    this.styleChip.classList.toggle('show', points > 0);
    const html = `✨ <b>${points}</b>`;
    if (this.styleChip.innerHTML !== html) this.styleChip.innerHTML = html;
  }

  /** A floating "+120" that rises and fades. */
  popup(text: string, cls = ''): void {
    const e = el('div', `rl-pop ${cls}`, this.root);
    e.textContent = text;
    setTimeout(() => e.remove(), 1500);
  }

  /** Speed lines round the edge (nitro): 0..1. */
  speedLines(k: number): void {
    this.speedEl.style.opacity = k.toFixed(2);
  }

  /** Name tags at screen positions (CSS pixels); the ones not listed are hidden. */
  tags(list: { id: string; name: string; color: string; x: number; y: number; alpha: number }[]): void {
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.id);
      let e = this.tagEls.get(t.id);
      if (!e) {
        e = el('div', 'rl-tag', this.tagsEl);
        e.innerHTML = `<i style="background:${t.color}"></i>${escape(t.name)}`;
        this.tagEls.set(t.id, e);
      }
      e.style.display = 'block';
      e.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%)`;
      e.style.opacity = t.alpha.toFixed(2);
    }
    for (const [id, e] of this.tagEls) if (!seen.has(id)) e.style.display = 'none';
  }

  /** The final placings (null hides the table). */
  results(title: string, rows: ResultRow[] | null): void {
    this.resultEl.classList.toggle('show', !!rows);
    if (!rows) return;
    const line = (r: ResultRow): string =>
      `<tr class="${r.me ? 'me' : ''}"><td>${r.place > 0 ? r.place + '.' : '–'}</td><td>${escape(r.name)}</td><td class="r">${r.time !== null ? fmtTime(r.time / 1000) : 'Ej i mål'}</td><td class="r">${r.prize !== undefined ? `+${r.prize} kr` : ''}</td><td>${r.medal ? MEDAL[r.medal] : ''}</td></tr>`;
    this.resultEl.innerHTML = `<h3>${escape(title)}</h3><table>${rows.map(line).join('')}</table>`;
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
    // gravel, snow, sand and ice stretches in their own colours
    const SURF_COL = ['', '#d8b878', '#ffffff', '#f2d98a', '#9ad6f5'];
    for (let surf = 1; surf < SURF_COL.length; surf++) {
      let a = -1;
      for (let i = 0; i <= t.n; i++) {
        const on = t.surf[i % t.n] === surf;
        if (on && a < 0) a = i;
        if ((!on || i === t.n) && a >= 0) {
          path(a, i);
          g.strokeStyle = SURF_COL[surf]!;
          g.stroke();
          a = -1;
        }
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

  /** Where the minimap is drawn (for a racer list that changes size). */
  resetBoard(): void {
    this.boardKey = '';
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
