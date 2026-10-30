// The words and numbers over the diorama: which hole, par and strokes, big friendly banners, the
// power gauge by the ball, hints for little hands, "Muu!" bubbles and the scorecard between holes.

const CSS = `
.golf-hud { position:absolute; inset:0; pointer-events:none; font-family:'Nunito','Trebuchet MS',system-ui,sans-serif; color:#2b2340; user-select:none; -webkit-user-select:none; }
.golf-hud * { box-sizing:border-box; }
.golf-pill { position:absolute; display:flex; align-items:center; gap:10px; padding:6px 14px 6px 8px; border-radius:999px; background:rgba(255,255,255,0.92); box-shadow:0 3px 0 rgba(40,20,60,0.18), 0 6px 18px rgba(30,60,90,0.18); }
.golf-hole { top:max(10px, env(safe-area-inset-top)); left:max(10px, env(safe-area-inset-left)); }
.golf-num { width:46px; height:46px; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-weight:900; line-height:1; background:var(--c,#ff4f7b); box-shadow:inset 0 -4px 0 rgba(0,0,0,0.15); }
.golf-num b { font-size:22px; }
.golf-num small { font-size:10px; opacity:0.9; }
.golf-name { display:flex; flex-direction:column; line-height:1.1; }
.golf-name b { font-size:18px; font-weight:900; }
.golf-name span { font-size:13px; font-weight:800; color:#6b5f86; }
.golf-strokes { top:max(10px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%); padding:6px 14px; gap:8px; }
.golf-strokes .lbl { font-size:13px; font-weight:900; color:#6b5f86; text-transform:uppercase; letter-spacing:1px; }
.golf-strokes .val { font-size:22px; font-weight:900; min-width:16px; text-align:center; }
.golf-dots { display:flex; gap:4px; }
.golf-dots i { width:11px; height:11px; border-radius:50%; background:#e6e0f0; box-shadow:inset 0 -2px 0 rgba(0,0,0,0.08); transition:background 0.2s, transform 0.2s; }
.golf-dots i.on { background:var(--c,#ff4f7b); transform:scale(1.12); }
.golf-dots i.pen { background:#4fb8ee; }
.golf-total { top:calc(max(10px, env(safe-area-inset-top)) + 58px); left:max(10px, env(safe-area-inset-left)); padding:4px 12px; font-size:14px; font-weight:900; color:#4a3f63; gap:6px; }
.golf-total .rel { padding:1px 8px; border-radius:999px; color:#fff; background:#7c6cf0; }
.golf-banner { position:absolute; left:50%; top:24%; transform:translate(-50%,-50%); text-align:center; width:max-content; max-width:92%; opacity:0; transition:opacity 0.25s; }
.golf-banner.show { opacity:1; }
.golf-banner .small { display:inline-block; font-size:clamp(15px,2.6vw,22px); font-weight:900; color:#fff; padding:3px 14px; border-radius:999px; background:var(--c,#ff4f7b); box-shadow:0 3px 0 rgba(0,0,0,0.15); }
.golf-banner .big { display:block; margin-top:6px; font-size:clamp(34px,7.5vw,72px); font-weight:900; color:#fff; letter-spacing:1px; line-height:1.05; text-shadow:3px 0 0 var(--d), -3px 0 0 var(--d), 0 3px 0 var(--d), 0 -3px 0 var(--d), 2px 2px 0 var(--d), -2px 2px 0 var(--d), 2px -2px 0 var(--d), -2px -2px 0 var(--d), 0 7px 0 var(--d), 3px 6px 0 var(--d), -3px 6px 0 var(--d), 0 12px 20px rgba(0,0,0,0.3); }
.golf-banner .sub { display:block; margin-top:8px; font-size:clamp(15px,2.4vw,22px); font-weight:800; color:#2b2340; background:rgba(255,255,255,0.88); border-radius:14px; padding:4px 14px; width:max-content; margin-left:auto; margin-right:auto; }
.golf-banner.pop .big { animation:golf-pop 0.55s cubic-bezier(0.2,1.7,0.4,1) both; }
.golf-banner.rainbow .big { background:linear-gradient(90deg,#ff4f7b,#ffb020,#ffe14d,#4fd06a,#3fb6ff,#9b7bff); -webkit-background-clip:text; background-clip:text; color:transparent; text-shadow:none; filter:drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 5px 0 rgba(120,40,120,0.6)); }
@keyframes golf-pop { from { transform:scale(0.3) rotate(-6deg); opacity:0 } to { transform:scale(1) rotate(0); opacity:1 } }
.golf-power { position:absolute; width:20px; height:110px; margin:-55px 0 0 -10px; border-radius:12px; background:rgba(255,255,255,0.85); box-shadow:0 3px 10px rgba(0,0,0,0.2); padding:3px; display:none; }
.golf-power i { position:absolute; left:3px; right:3px; bottom:3px; border-radius:9px; background:linear-gradient(0deg,#3ddc84,#ffd23f 55%,#ff4f4f); }
.golf-power.show { display:block; }
.golf-hint { position:absolute; left:50%; bottom:max(18px, env(safe-area-inset-bottom)); transform:translateX(-50%); padding:8px 20px; border-radius:22px; background:rgba(255,255,255,0.92); font-size:clamp(14px,2.2vw,19px); font-weight:900; color:#3b2f57; box-shadow:0 3px 0 rgba(40,20,60,0.18); opacity:0; transition:opacity 0.3s; text-align:center; width:max-content; max-width:min(62%, 520px); }
.golf-hint small { display:block; font-size:0.72em; font-weight:800; color:#7a6e94; }
.golf-hint.show { opacity:1; }
.golf-hand { position:absolute; font-size:44px; display:none; filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3)); margin:-8px 0 0 -14px; }
.golf-hand.show { display:block; animation:golf-drag 1.8s ease-in-out infinite; }
@keyframes golf-drag { 0% { transform:translate(0,0); opacity:0 } 12% { opacity:1 } 55% { transform:translate(var(--hx,-20px), var(--hy,90px)); opacity:1 } 70% { transform:translate(var(--hx,-20px), var(--hy,90px)); opacity:0 } 100% { opacity:0 } }
.golf-bubble { position:absolute; padding:4px 12px; border-radius:16px; background:#fff; font-weight:900; font-size:18px; color:#3b2f57; transform:translate(-50%,-100%); box-shadow:0 3px 0 rgba(0,0,0,0.12); animation:golf-bub 1.3s ease-out both; white-space:nowrap; }
.golf-bubble::after { content:''; position:absolute; left:50%; bottom:-7px; margin-left:-7px; border:7px solid transparent; border-top-color:#fff; border-bottom:0; }
@keyframes golf-bub { 0% { transform:translate(-50%,-60%) scale(0.4); opacity:0 } 15% { transform:translate(-50%,-100%) scale(1.1); opacity:1 } 25% { transform:translate(-50%,-100%) scale(1) } 80% { opacity:1 } 100% { transform:translate(-50%,-150%); opacity:0 } }
.golf-float { position:absolute; font-weight:900; font-size:26px; color:#fff; transform:translate(-50%,-50%); text-shadow:0 3px 0 rgba(0,0,0,0.25); animation:golf-float 1.4s ease-out both; white-space:nowrap; }
@keyframes golf-float { 0% { transform:translate(-50%,-30%) scale(0.5); opacity:0 } 15% { transform:translate(-50%,-60%) scale(1.15); opacity:1 } 70% { opacity:1 } 100% { transform:translate(-50%,-160%); opacity:0 } }
.golf-card { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:12px; background:rgba(40,70,110,0.28); opacity:0; transition:opacity 0.3s; pointer-events:none; }
.golf-card.show { opacity:1; pointer-events:auto; }
.golf-sheet { width:min(620px,100%); max-height:100%; overflow:auto; background:#fffdf7; border-radius:22px; padding:14px 16px 12px; text-align:center; box-shadow:0 6px 0 rgba(40,20,60,0.2), 0 18px 40px rgba(20,40,80,0.35); border:4px solid var(--c,#ff4f7b); animation:golf-pop 0.45s cubic-bezier(0.2,1.5,0.4,1) both; }
.golf-sheet h2 { margin:0; font-size:clamp(20px,3.6vw,28px); font-weight:900; color:#2b2340; }
.golf-sheet .word { margin:2px 0 8px; font-size:clamp(22px,4.4vw,34px); font-weight:900; color:var(--c,#ff4f7b); }
.golf-table { width:100%; border-collapse:separate; border-spacing:3px; font-weight:900; font-size:clamp(12px,2.2vw,16px); }
.golf-table th { color:#6b5f86; font-size:0.85em; padding:2px 0; }
.golf-table td { background:#f1ecf8; border-radius:8px; padding:4px 0; min-width:26px; }
.golf-table td.lbl, .golf-table th.lbl { background:none; text-align:left; padding-left:4px; color:#6b5f86; }
.golf-table td.now { outline:3px solid var(--c,#ff4f7b); }
.golf-table td.under { background:#c9f3d4; color:#11733a; }
.golf-table td.even { background:#d8ecff; color:#1d5d9b; }
.golf-table td.over { background:#ffe2c8; color:#a4520c; }
.golf-table td.bad { background:#ffd3d3; color:#a42020; }
.golf-table td.hio { background:linear-gradient(135deg,#ffe14d,#ff9fd0); color:#7a1f5c; }
.golf-pts { display:flex; justify-content:center; gap:18px; margin:10px 0 2px; flex-wrap:wrap; }
.golf-pts div { font-weight:900; font-size:clamp(14px,2.4vw,18px); color:#6b5f86; }
.golf-pts b { display:block; font-size:clamp(22px,4.6vw,34px); color:#2b2340; }
.golf-pts .plus b { color:#14a050; }
.golf-next { margin-top:8px; font-size:clamp(13px,2.2vw,16px); font-weight:900; color:#fff; display:inline-block; padding:6px 16px; border-radius:999px; background:var(--c,#ff4f7b); animation:golf-pulse 1.2s ease-in-out infinite; }
@keyframes golf-pulse { 50% { transform:scale(1.06) } }
@media (max-height:430px) {
  .golf-num { width:38px; height:38px; } .golf-num b { font-size:18px; }
  .golf-name b { font-size:15px; } .golf-name span { font-size:11px; }
  .golf-total { top:calc(max(10px, env(safe-area-inset-top)) + 48px); font-size:12px; }
  .golf-sheet { padding:8px 10px; } .golf-pts { margin-top:4px; } .golf-banner { top:22%; }
}
`;

export interface CardRow {
  par: number;
  strokes: number | null;
  hio?: boolean;
}

export interface CardData {
  title: string;
  word: string;
  rows: CardRow[];
  now: number;
  holePoints: number;
  total: number;
  next: string;
  color: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A darker shade of a colour, for outlines. */
function darker(hex: string, k = 0.55): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(60,30,80,0.8)';
  const n = parseInt(m[1]!, 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export class Hud {
  root = el('div', 'golf-hud');
  private style = el('style');
  private hole = el('div', 'golf-pill golf-hole');
  private num = el('div', 'golf-num');
  private name = el('div', 'golf-name');
  private strokes = el('div', 'golf-pill golf-strokes');
  private sVal = el('span', 'val', '0');
  private dots = el('div', 'golf-dots');
  private total = el('div', 'golf-pill golf-total');
  private banner = el('div', 'golf-banner');
  private bannerT: number | null = null;
  private power = el('div', 'golf-power');
  private powerFill = el('i');
  private hintEl = el('div', 'golf-hint');
  private hand = el('div', 'golf-hand', '👆');
  private card = el('div', 'golf-card');
  private timers = new Set<number>();

  constructor(parent: HTMLElement) {
    this.style.textContent = CSS;
    this.root.append(this.style);
    this.hole.append(this.num, this.name);
    this.strokes.append(el('span', 'lbl', 'Slag'), this.sVal, this.dots);
    for (let i = 0; i < 8; i++) this.dots.append(el('i'));
    this.power.append(this.powerFill);
    this.root.append(this.hole, this.strokes, this.total, this.banner, this.power, this.hand, this.hintEl, this.card);
    parent.append(this.root);
  }

  setHole(n: number, of: number, name: string, par: number, color: string): void {
    this.root.style.setProperty('--c', color);
    this.num.replaceChildren(el('b', undefined, String(n)), el('small', undefined, `av ${of}`));
    this.name.replaceChildren(el('b', undefined, name), el('span', undefined, `Par ${par}`));
  }

  setStrokes(s: number, penalties: number, max: number): void {
    this.sVal.textContent = String(s);
    const ds = this.dots.children;
    for (let i = 0; i < max; i++) {
      const d = ds[i] as HTMLElement | undefined;
      if (!d) continue;
      d.className = i < s ? (i >= s - penalties ? 'on pen' : 'on') : '';
    }
  }

  setTotal(strokes: number, parSoFar: number, points: number): void {
    const rel = strokes - parSoFar;
    const relEl = el('span', 'rel', rel === 0 ? '±0' : rel > 0 ? `+${rel}` : String(rel));
    relEl.style.background = rel < 0 ? '#2fbf6a' : rel === 0 ? '#3f9bea' : '#ff8a3d';
    this.total.replaceChildren(el('span', undefined, `Totalt ${strokes} slag`), relEl, el('span', undefined, `· ${points.toLocaleString('sv-SE')} p`));
  }

  /** A big message: a small chip on top, a big word, a line below. */
  show(small: string | null, big: string, sub: string | null, o: { color?: string; dark?: string; ms?: number; rainbow?: boolean } = {}): void {
    const b = this.banner;
    b.replaceChildren();
    b.style.setProperty('--c', o.color ?? '#ff4f7b');
    b.style.setProperty('--d', o.dark ?? darker(o.color ?? '#ff4f7b'));
    if (small) b.append(el('span', 'small', small));
    b.append(el('span', 'big', big));
    if (sub) b.append(el('span', 'sub', sub));
    b.className = `golf-banner show pop${o.rainbow ? ' rainbow' : ''}`;
    if (this.bannerT !== null) {
      clearTimeout(this.bannerT);
      this.timers.delete(this.bannerT);
    }
    const ms = o.ms ?? 1800;
    if (ms > 0) {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        this.bannerT = null;
        this.banner.classList.remove('show');
      }, ms);
      this.bannerT = id;
      this.timers.add(id);
    }
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
  }

  /** The gauge beside the ball (screen position in CSS pixels). */
  setPower(show: boolean, p = 0, x = 0, y = 0): void {
    this.power.classList.toggle('show', show);
    if (!show) return;
    this.power.style.left = `${x}px`;
    this.power.style.top = `${y}px`;
    this.powerFill.style.height = `${Math.round(p * 104)}px`;
  }

  hint(text: string | null, small: string | null = null): void {
    if (text) {
      this.hintEl.replaceChildren(document.createTextNode(text));
      if (small) this.hintEl.append(el('small', undefined, small));
    }
    this.hintEl.classList.toggle('show', !!text);
  }

  /** The little pointing hand that shows how to pull back from the ball. */
  showHand(show: boolean, x = 0, y = 0, dx = 0, dy = 90): void {
    this.hand.classList.toggle('show', show);
    if (!show) return;
    this.hand.style.left = `${x}px`;
    this.hand.style.top = `${y}px`;
    this.hand.style.setProperty('--hx', `${dx}px`);
    this.hand.style.setProperty('--hy', `${dy}px`);
  }

  bubble(text: string, x: number, y: number): void {
    const b = el('div', 'golf-bubble', text);
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    this.root.append(b);
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      b.remove();
    }, 1400);
    this.timers.add(id);
  }

  float(text: string, x: number, y: number, color = '#ffd23f'): void {
    const b = el('div', 'golf-float', text);
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.color = color;
    this.root.append(b);
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      b.remove();
    }, 1500);
    this.timers.add(id);
  }

  showCard(d: CardData): void {
    const sheet = el('div', 'golf-sheet');
    sheet.style.setProperty('--c', d.color);
    sheet.append(el('h2', undefined, d.title));
    if (d.word) sheet.append(el('div', 'word', d.word));
    const t = el('table', 'golf-table');
    const head = el('tr');
    head.append(el('th', 'lbl', 'Bana'));
    d.rows.forEach((_, i) => head.append(el('th', undefined, String(i + 1))));
    head.append(el('th', undefined, 'Tot'));
    const parRow = el('tr');
    parRow.append(el('td', 'lbl', 'Par'));
    const sRow = el('tr');
    sRow.append(el('td', 'lbl', 'Slag'));
    let ps = 0;
    let ss = 0;
    d.rows.forEach((r, i) => {
      parRow.append(el('td', undefined, String(r.par)));
      ps += r.par;
      const c = el('td', undefined, r.strokes === null ? '·' : String(r.strokes));
      if (r.strokes !== null) {
        ss += r.strokes;
        const diff = r.strokes - r.par;
        c.className = r.hio ? 'hio' : diff < 0 ? 'under' : diff === 0 ? 'even' : diff === 1 ? 'over' : 'bad';
      }
      if (i === d.now) c.classList.add('now');
      sRow.append(c);
    });
    parRow.append(el('td', undefined, String(ps)));
    sRow.append(el('td', undefined, String(ss)));
    t.append(head, parRow, sRow);
    sheet.append(t);
    const pts = el('div', 'golf-pts');
    const a = el('div', 'plus');
    a.append(document.createTextNode('Banan'), el('b', undefined, `+${d.holePoints.toLocaleString('sv-SE')}`));
    const b = el('div');
    b.append(document.createTextNode('Poäng'), el('b', undefined, d.total.toLocaleString('sv-SE')));
    pts.append(a, b);
    sheet.append(pts);
    sheet.append(el('div', 'golf-next', d.next));
    this.card.replaceChildren(sheet);
    this.card.classList.add('show');
  }

  hideCard(): void {
    this.card.classList.remove('show');
  }

  get cardEl(): HTMLElement {
    return this.card;
  }

  destroy(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.root.remove();
  }
}
