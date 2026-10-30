// The heads-up display, drawn with plain DOM over the 3D view: hearts, score, wave, streak, the
// handful of snowballs, the crosshair, banners, the Snow King's bar, snow splats on the "lens",
// floating points, edge arrows and the end tally. Everything is scoped under .snw-hud.

const CSS = `
.snw-hud{position:absolute;inset:0;pointer-events:none;overflow:hidden;color:#fff;user-select:none;-webkit-user-select:none;
  font-family:ui-rounded,'Nunito','Trebuchet MS',system-ui,sans-serif;--u:7px}
.snw-hud *{box-sizing:border-box}
.snw-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(30,20,70,.32) 100%)}
.snw-frost{position:absolute;inset:0;opacity:0;transition:opacity .4s;box-shadow:inset 0 0 calc(var(--u)*9) calc(var(--u)*3) rgba(205,225,255,.85);
  background:radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0) 58%,rgba(220,235,255,.45) 100%)}
.snw-flash{position:absolute;inset:0;background:#fff;opacity:0}
.snw-tl{position:absolute;top:calc(var(--u)*1.8);left:calc(var(--u)*2.2);display:flex;flex-direction:column;gap:calc(var(--u)*.9);align-items:flex-start}
.snw-hearts{display:flex;gap:calc(var(--u)*.45)}
.snw-heart{width:calc(var(--u)*4.6);height:calc(var(--u)*4.6);filter:drop-shadow(0 calc(var(--u)*.35) 0 rgba(40,20,70,.45));transition:transform .2s}
.snw-heart path{fill:#ff4f74;stroke:#fff;stroke-width:2}
.snw-heart.off path{fill:rgba(60,50,110,.55);stroke:rgba(255,255,255,.55)}
.snw-heart.blink{animation:snw-blink .18s steps(2) infinite}
@keyframes snw-blink{50%{opacity:.25}}
.snw-heart.pop{animation:snw-hpop .45s cubic-bezier(.2,1.8,.4,1)}
@keyframes snw-hpop{from{transform:scale(1.9)}to{transform:scale(1)}}
.snw-streak{display:flex;align-items:center;gap:calc(var(--u)*.6);padding:calc(var(--u)*.35) calc(var(--u)*1.3);border-radius:999px;
  background:rgba(40,30,90,.45);border:2px solid rgba(255,255,255,.55);font-weight:900;font-size:calc(var(--u)*2.5);opacity:0;transform:scale(.6);transition:opacity .2s,transform .25s cubic-bezier(.2,1.6,.4,1)}
.snw-streak.on{opacity:1;transform:scale(1)}
.snw-streak b{color:#ffe36a;font-size:calc(var(--u)*3)}
.snw-top{position:absolute;top:calc(var(--u)*1.2);left:50%;transform:translateX(-50%);text-align:center;line-height:1}
.snw-score{font-weight:900;font-size:calc(var(--u)*5.6);font-variant-numeric:tabular-nums;letter-spacing:.5px;
  text-shadow:0 calc(var(--u)*.4) 0 rgba(40,25,90,.55),0 0 calc(var(--u)*2) rgba(120,140,255,.6)}
.snw-score.bump{animation:snw-bump .25s ease-out}
@keyframes snw-bump{30%{transform:scale(1.14)}}
.snw-wave{margin-top:calc(var(--u)*.6);font-weight:800;font-size:calc(var(--u)*2.1);opacity:.92;text-shadow:0 2px 0 rgba(40,25,90,.5);letter-spacing:1px}
.snw-ammo{position:absolute;bottom:calc(var(--u)*2.6);left:50%;transform:translateX(-50%);display:flex;gap:calc(var(--u)*.7);align-items:center;
  padding:calc(var(--u)*.7) calc(var(--u)*1.2);border-radius:999px;background:rgba(40,30,90,.32)}
.snw-ball{width:calc(var(--u)*3.1);height:calc(var(--u)*3.1);border-radius:50%;
  background:radial-gradient(circle at 36% 30%,#fff 0,#eef2ff 45%,#b8c4f0 100%);box-shadow:0 calc(var(--u)*.3) 0 rgba(30,20,70,.4);transition:transform .15s,opacity .15s}
.snw-ball.e{opacity:.22;transform:scale(.62)}
.snw-ball.n{animation:snw-hpop .3s cubic-bezier(.2,1.8,.4,1)}
.snw-ammo.rapid .snw-ball{background:radial-gradient(circle at 36% 30%,#fff 0,#fff6c8 45%,#ffc93f 100%)}
.snw-ammo.giant{background:rgba(70,160,255,.45)}
.snw-power{position:absolute;bottom:calc(var(--u)*8.6);left:50%;transform:translateX(-50%) scale(.6);opacity:0;transition:opacity .2s,transform .25s cubic-bezier(.2,1.6,.4,1);
  font-weight:900;font-size:calc(var(--u)*2.6);text-align:center;text-shadow:0 2px 0 rgba(40,25,90,.6);white-space:nowrap}
.snw-power.on{opacity:1;transform:translateX(-50%) scale(1)}
.snw-power i{display:block;margin:calc(var(--u)*.5) auto 0;height:calc(var(--u)*.8);width:calc(var(--u)*18);border-radius:99px;background:rgba(255,255,255,.25);overflow:hidden}
.snw-power i b{display:block;height:100%;background:linear-gradient(90deg,#ffe36a,#ff9d2a);border-radius:99px}
.snw-cross{position:absolute;left:50%;top:50%;width:calc(var(--u)*6);height:calc(var(--u)*6);transform:translate(-50%,-50%);transition:transform .08s}
.snw-cross svg{width:100%;height:100%;overflow:visible}
.snw-cross .ring{fill:none;stroke:#fff;stroke-width:2.2;opacity:.9;transition:stroke .1s}
.snw-cross .dot{fill:#fff}
.snw-cross .tick{stroke:#fff;stroke-width:2.2;stroke-linecap:round}
.snw-cross.on .ring,.snw-cross.on .tick{stroke:#ff6f9e}
.snw-cross.on .dot{fill:#ff6f9e}
.snw-cross.on{transform:translate(-50%,-50%) scale(.82)}
.snw-cross .hm{stroke:#fff;stroke-width:3;stroke-linecap:round;opacity:0}
.snw-cross.hit .hm{animation:snw-hm .22s ease-out}
.snw-cross.kill .hm{stroke:#ffe36a;animation:snw-hm .32s ease-out}
@keyframes snw-hm{0%{opacity:1}100%{opacity:0}}
.snw-banner{position:absolute;top:23%;left:0;right:0;text-align:center;opacity:0}
.snw-banner h2{margin:0;font-size:calc(var(--u)*10);font-weight:900;line-height:1;letter-spacing:1px;
  text-shadow:0 calc(var(--u)*.6) 0 rgba(40,25,90,.6),0 0 calc(var(--u)*3) rgba(140,160,255,.9)}
.snw-banner p{margin:calc(var(--u)*1.2) 0 0;font-size:calc(var(--u)*3.2);font-weight:800;text-shadow:0 2px 0 rgba(40,25,90,.6)}
.snw-banner.boss h2{color:#bff4ff;text-shadow:0 calc(var(--u)*.6) 0 rgba(20,40,120,.7),0 0 calc(var(--u)*4) rgba(110,220,255,1)}
.snw-banner.gold h2{color:#ffe36a;text-shadow:0 calc(var(--u)*.6) 0 rgba(90,50,10,.6),0 0 calc(var(--u)*4) rgba(255,190,80,.9)}
.snw-bossbar{position:absolute;top:calc(var(--u)*11.5);left:50%;width:min(56%,calc(var(--u)*62));transform:translateX(-50%);opacity:0;transition:opacity .4s;text-align:center}
.snw-bossbar.on{opacity:1}
.snw-bossbar span{font-weight:900;font-size:calc(var(--u)*2.3);text-shadow:0 2px 0 rgba(20,40,120,.6);letter-spacing:1px}
.snw-bossbar i{display:block;margin-top:calc(var(--u)*.5);height:calc(var(--u)*1.7);border-radius:99px;background:rgba(30,30,80,.55);border:2px solid #fff;overflow:hidden}
.snw-bossbar i b{display:block;height:100%;width:100%;background:linear-gradient(90deg,#7fe8ff,#c9f6ff);transition:width .3s}
.snw-splats,.snw-pops,.snw-arrows{position:absolute;inset:0}
.snw-splat{position:absolute;transform:translate(-50%,-50%)}
.snw-pop{position:absolute;transform:translate(-50%,-50%);font-weight:900;font-size:calc(var(--u)*3);white-space:nowrap;
  text-shadow:0 calc(var(--u)*.3) 0 rgba(40,25,90,.65)}
.snw-pop.big{font-size:calc(var(--u)*4.2);color:#ffe36a}
.snw-pop.pink{color:#ff9cc2}
.snw-pop.blue{color:#bff4ff}
.snw-arrow{position:absolute;width:calc(var(--u)*5);height:calc(var(--u)*5);margin:calc(var(--u)*-2.5) 0 0 calc(var(--u)*-2.5);display:none}
.snw-arrow svg{width:100%;height:100%}
.snw-arrow.dmg path{fill:#ff6f9e}
.snw-arrow.item path{fill:#ffe36a}
.snw-arrow.foe path{fill:#ffffff}
.snw-arrow path{stroke:rgba(40,25,90,.7);stroke-width:2}
.snw-prompt{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);text-align:center;padding:calc(var(--u)*2) calc(var(--u)*3.4);
  border-radius:calc(var(--u)*2.4);background:rgba(40,30,95,.62);border:3px solid #5fb7ff;box-shadow:0 0 calc(var(--u)*3) rgba(95,183,255,.55);display:none}
.snw-prompt.on{display:block;animation:snw-float 1.6s ease-in-out infinite alternate}
.snw-prompt b{display:block;font-size:calc(var(--u)*4.2);font-weight:900}
.snw-prompt small{display:block;margin-top:calc(var(--u)*.8);font-size:calc(var(--u)*2.2);opacity:.9;font-weight:700}
@keyframes snw-float{from{transform:translate(-50%,-52%)}to{transform:translate(-50%,-48%)}}
.snw-hint{position:absolute;left:50%;top:64%;transform:translateX(-50%);font-weight:900;font-size:calc(var(--u)*3);opacity:0;transition:opacity .3s;
  text-shadow:0 2px 0 rgba(40,25,90,.7);white-space:nowrap}
.snw-hint.on{opacity:1}
.snw-tally{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:min(86%,calc(var(--u)*56));padding:calc(var(--u)*2.4) calc(var(--u)*3.4);
  border-radius:calc(var(--u)*2.4);background:rgba(40,30,95,.72);border:3px solid #5fb7ff;box-shadow:0 0 calc(var(--u)*4) rgba(95,183,255,.6);display:none}
.snw-tally.on{display:block}
.snw-tally h3{margin:0 0 calc(var(--u)*1.2);text-align:center;font-size:calc(var(--u)*4.6);font-weight:900;text-shadow:0 3px 0 rgba(20,15,60,.6)}
.snw-tally div{display:flex;justify-content:space-between;gap:calc(var(--u)*3);font-size:calc(var(--u)*2.8);font-weight:800;padding:calc(var(--u)*.35) 0;
  opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s}
.snw-tally div.on{opacity:1;transform:none}
.snw-tally div b{color:#ffe36a;font-variant-numeric:tabular-nums}
.snw-tally div.total{border-top:2px solid rgba(255,255,255,.4);margin-top:calc(var(--u)*.6);padding-top:calc(var(--u)*.9);font-size:calc(var(--u)*3.6)}
`;

const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21.2s-7.6-4.6-9.7-9.4C.8 8.3 3 4.4 6.7 4.4c2.1 0 3.6 1.2 4.5 2.6.9-1.4 2.4-2.6 4.5-2.6 3.7 0 5.9 3.9 4.4 7.4-2.1 4.8-8.1 9.4-8.1 9.4z"/></svg>';
const CROSS =
  '<svg viewBox="-30 -30 60 60"><circle class="ring" r="9"/><circle class="dot" r="1.8"/>' +
  '<line class="tick" x1="0" y1="-15" x2="0" y2="-20"/><line class="tick" x1="0" y1="15" x2="0" y2="20"/><line class="tick" x1="-15" y1="0" x2="-20" y2="0"/><line class="tick" x1="15" y1="0" x2="20" y2="0"/>' +
  '<line class="hm" x1="-7" y1="-7" x2="-14" y2="-14"/><line class="hm" x1="7" y1="-7" x2="14" y2="-14"/><line class="hm" x1="-7" y1="7" x2="-14" y2="14"/><line class="hm" x1="7" y1="7" x2="14" y2="14"/></svg>';
const ARROW = '<svg viewBox="-20 -20 40 40"><path d="M14 0 L-8 -11 L-3 0 L-8 11 Z"/></svg>';

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function drawSplat(c: HTMLCanvasElement, size: number): void {
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;
  const r0 = size * 0.3;
  const blob = (): void => {
    g.beginPath();
    const n = 18;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = r0 * (0.78 + Math.random() * 0.5);
      pts.push([cx + Math.cos(a) * r, cx + Math.sin(a) * r]);
    }
    for (let i = 0; i <= n; i++) {
      const [x, y] = pts[i % n]!;
      const [px, py] = pts[(i + n - 1) % n]!;
      const mx = (x + px) / 2;
      const my = (y + py) / 2;
      if (i === 0) g.moveTo(mx, my);
      else g.quadraticCurveTo(px, py, mx, my);
    }
    g.closePath();
  };
  // a bluish rim so the white reads against the snow, then the white lump
  g.save();
  g.shadowColor = 'rgba(70,80,160,0.55)';
  g.shadowBlur = size * 0.04;
  g.fillStyle = '#ffffff';
  blob();
  g.fill();
  g.restore();
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r0 * (1.1 + Math.random() * 0.6);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, size * (0.012 + Math.random() * 0.03), 0, Math.PI * 2);
    g.fill();
  }
  // drips running down
  for (let i = 0; i < 4; i++) {
    const x = cx + (Math.random() - 0.5) * r0 * 1.3;
    const len = r0 * (0.6 + Math.random() * 0.9);
    const w = size * (0.03 + Math.random() * 0.025);
    g.beginPath();
    g.roundRect(x - w / 2, cx, w, len, w / 2);
    g.arc(x, cx + len, w * 0.75, 0, Math.PI * 2);
    g.fill();
  }
  // soft shading and grains of snow
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createRadialGradient(cx - r0 * 0.35, cx - r0 * 0.4, r0 * 0.1, cx, cx, r0 * 1.7);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(0.6, 'rgba(205,215,250,0.35)');
  sh.addColorStop(1, 'rgba(150,165,230,0.75)');
  g.fillStyle = sh;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(170,185,240,0.45)' : 'rgba(255,255,255,0.9)';
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r0 * 1.2;
    g.fillRect(cx + Math.cos(a) * d, cx + Math.sin(a) * d, size * 0.012, size * 0.012);
  }
}

export class Hud {
  readonly el: HTMLElement;
  private style: HTMLStyleElement;
  private heartsEl: HTMLElement;
  private hearts: HTMLElement[] = [];
  private scoreEl: HTMLElement;
  private waveEl: HTMLElement;
  private streakEl: HTMLElement;
  private ammoEl: HTMLElement;
  private balls: HTMLElement[] = [];
  private powerEl: HTMLElement;
  private crossEl: HTMLElement;
  private bannerEl: HTMLElement;
  private bossEl: HTMLElement;
  private splatsEl: HTMLElement;
  private popsEl: HTMLElement;
  private arrowsEl: HTMLElement;
  private arrows: HTMLElement[] = [];
  private frostEl: HTMLElement;
  private flashEl: HTMLElement;
  private promptEl: HTMLElement;
  private hintEl: HTMLElement;
  private tallyEl: HTMLElement;
  private shownScore = 0;
  private targetScore = 0;
  private lastAmmo = -1;
  private bannerAnim: Animation | null = null;
  private hintT = 0;
  private w = 1;
  private h = 1;
  private anims = new Set<Animation>();

  constructor(root: HTMLElement) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    this.el = el('div', 'snw-hud');
    this.el.append(this.style);
    this.el.append(el('div', 'snw-vig'));
    this.frostEl = el('div', 'snw-frost');
    this.splatsEl = el('div', 'snw-splats');
    this.flashEl = el('div', 'snw-flash');
    const tl = el('div', 'snw-tl');
    this.heartsEl = el('div', 'snw-hearts');
    this.streakEl = el('div', 'snw-streak');
    tl.append(this.heartsEl, this.streakEl);
    const top = el('div', 'snw-top');
    this.scoreEl = el('div', 'snw-score', '0');
    this.waveEl = el('div', 'snw-wave');
    top.append(this.scoreEl, this.waveEl);
    this.ammoEl = el('div', 'snw-ammo');
    this.powerEl = el('div', 'snw-power');
    this.crossEl = el('div', 'snw-cross', CROSS);
    this.bannerEl = el('div', 'snw-banner');
    this.bossEl = el('div', 'snw-bossbar', '<span>👑 Snökungen</span><i><b></b></i>');
    this.popsEl = el('div', 'snw-pops');
    this.arrowsEl = el('div', 'snw-arrows');
    this.promptEl = el('div', 'snw-prompt');
    this.hintEl = el('div', 'snw-hint');
    this.tallyEl = el('div', 'snw-tally');
    this.el.append(this.frostEl, this.arrowsEl, this.popsEl, tl, top, this.ammoEl, this.powerEl, this.crossEl, this.bossEl, this.bannerEl, this.hintEl, this.splatsEl, this.flashEl, this.promptEl, this.tallyEl);
    root.append(this.el);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const u = Math.max(4.2, Math.min(9.5, Math.min(w, h) / 100 * 0.92 + 1.2));
    this.el.style.setProperty('--u', `${u.toFixed(2)}px`);
  }

  private play(e: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions, remove = false): Animation | null {
    if (typeof e.animate !== 'function') {
      if (remove) e.remove();
      return null;
    }
    const a = e.animate(frames, opts);
    this.anims.add(a);
    a.onfinish = () => {
      this.anims.delete(a);
      if (remove) e.remove();
    };
    return a;
  }

  /** Freeze or continue every running HUD animation (for pause). */
  setPaused(p: boolean): void {
    for (const a of this.anims) {
      if (p) a.pause();
      else a.play();
    }
  }

  // ---- hearts ----
  setHearts(n: number, max: number): void {
    while (this.hearts.length < max) {
      const hEl = el('div', 'snw-heart', HEART);
      this.hearts.push(hEl);
      this.heartsEl.append(hEl);
    }
    this.hearts.forEach((h, i) => {
      h.classList.toggle('off', i >= n);
      h.style.display = i < max ? '' : 'none';
    });
  }
  heartPop(i: number): void {
    const h = this.hearts[i];
    if (!h) return;
    h.classList.remove('pop');
    void h.offsetWidth;
    h.classList.add('pop');
  }
  blinkHearts(on: boolean): void {
    for (const h of this.hearts) h.classList.toggle('blink', on && !h.classList.contains('off'));
  }

  // ---- score, wave, streak ----
  setScore(n: number, bump = true): void {
    if (n > this.targetScore && bump) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
    this.targetScore = n;
  }
  setWave(text: string): void {
    this.waveEl.textContent = text;
  }
  setStreak(n: number, mult: number): void {
    if (n < 3) {
      this.streakEl.classList.remove('on');
      return;
    }
    this.streakEl.innerHTML = `❄️ ${n} i rad <b>×${mult % 1 ? mult.toFixed(1).replace('.', ',') : mult}</b>`;
    this.streakEl.classList.add('on');
  }

  // ---- ammo and power ups ----
  setAmmo(n: number, max: number, mode: 'normal' | 'rapid' | 'giant'): void {
    while (this.balls.length < max) {
      const b = el('div', 'snw-ball');
      this.balls.push(b);
      this.ammoEl.append(b);
    }
    this.ammoEl.classList.toggle('rapid', mode === 'rapid');
    this.ammoEl.classList.toggle('giant', mode === 'giant');
    this.balls.forEach((b, i) => {
      const full = mode === 'rapid' || i < n;
      const was = !b.classList.contains('e');
      b.classList.toggle('e', !full);
      if (full && !was && this.lastAmmo >= 0) {
        b.classList.remove('n');
        void b.offsetWidth;
        b.classList.add('n');
      }
      b.style.display = i < max ? '' : 'none';
    });
    this.lastAmmo = n;
  }
  setPower(text: string | null, frac = 1): void {
    if (!text) {
      this.powerEl.classList.remove('on');
      return;
    }
    if (this.powerEl.dataset.t !== text) {
      this.powerEl.dataset.t = text;
      this.powerEl.innerHTML = `${text}<i><b></b></i>`;
    }
    const bar = this.powerEl.querySelector('b');
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.powerEl.classList.add('on');
  }

  // ---- crosshair ----
  setCross(onTarget: boolean, visible = true): void {
    this.crossEl.classList.toggle('on', onTarget);
    this.crossEl.style.display = visible ? '' : 'none';
  }
  hitMarker(kill: boolean): void {
    this.crossEl.classList.remove('hit', 'kill');
    void this.crossEl.offsetWidth;
    this.crossEl.classList.add(kill ? 'kill' : 'hit');
  }

  // ---- banners and hints ----
  banner(title: string, sub = '', dur = 2.2, style: '' | 'boss' | 'gold' = ''): void {
    this.bannerEl.className = `snw-banner ${style}`;
    this.bannerEl.innerHTML = `<h2></h2>${sub ? '<p></p>' : ''}`;
    this.bannerEl.querySelector('h2')!.textContent = title;
    if (sub) this.bannerEl.querySelector('p')!.textContent = sub;
    this.bannerAnim?.cancel();
    this.bannerAnim = this.play(
      this.bannerEl,
      [
        { opacity: 0, transform: 'translateY(-30px) scale(1.5)' },
        { opacity: 1, transform: 'translateY(0) scale(0.95)', offset: 0.12 },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.82 },
        { opacity: 0, transform: 'translateY(16px) scale(0.96)' },
      ],
      { duration: dur * 1000, easing: 'ease-out', fill: 'forwards' },
    );
  }
  hint(text: string, dur = 2): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = dur;
  }

  bossBar(show: boolean, frac = 1): void {
    this.bossEl.classList.toggle('on', show);
    const b = this.bossEl.querySelector('b');
    if (b) b.style.width = `${Math.max(0, frac) * 100}%`;
  }

  // ---- getting hit ----
  splat(): void {
    const size = Math.round(Math.min(this.w, this.h) * (0.32 + Math.random() * 0.14));
    const c = document.createElement('canvas');
    c.className = 'snw-splat';
    drawSplat(c, size);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    c.style.left = `${30 + Math.random() * 40}%`;
    c.style.top = `${30 + Math.random() * 34}%`;
    this.splatsEl.append(c);
    this.play(
      c,
      [
        { opacity: 0.0, transform: 'translate(-50%,-50%) scale(0.3)' },
        { opacity: 0.97, transform: 'translate(-50%,-50%) scale(1.06)', offset: 0.05 },
        { opacity: 0.95, transform: 'translate(-50%,-50%) scale(1)', offset: 0.1 },
        { opacity: 0.85, transform: 'translate(-50%,-44%) scale(1)', offset: 0.55 },
        { opacity: 0, transform: 'translate(-50%,-30%) scale(1.02)' },
      ],
      { duration: 2300, easing: 'ease-in', fill: 'forwards' },
      true,
    );
  }
  flash(alpha = 0.6, ms = 260): void {
    this.play(this.flashEl, [{ opacity: alpha }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }
  frost(level: number): void {
    this.frostEl.style.opacity = String(Math.max(0, Math.min(1, level)));
  }

  // ---- floating text ----
  popup(x: number, y: number, text: string, cls = ''): void {
    const p = el('div', `snw-pop ${cls}`);
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.popsEl.append(p);
    this.play(
      p,
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)' },
        { opacity: 1, transform: 'translate(-50%,-90%) scale(1.15)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%,-140%) scale(1)', offset: 0.6 },
        { opacity: 0, transform: 'translate(-50%,-210%) scale(0.95)' },
      ],
      { duration: 950, easing: 'ease-out', fill: 'forwards' },
      true,
    );
  }

  /** Arrows round the screen edge: angle 0 = up, clockwise; kind colours it. */
  setArrows(list: { angle: number; kind: 'dmg' | 'item' | 'foe' }[]): void {
    while (this.arrows.length < list.length) {
      const a = el('div', 'snw-arrow', ARROW);
      this.arrows.push(a);
      this.arrowsEl.append(a);
    }
    const rx = this.w * 0.42;
    const ry = this.h * 0.38;
    this.arrows.forEach((a, i) => {
      const it = list[i];
      if (!it) {
        a.style.display = 'none';
        return;
      }
      a.style.display = 'block';
      a.className = `snw-arrow ${it.kind}`;
      const x = this.w / 2 + Math.sin(it.angle) * rx;
      const y = this.h / 2 - Math.cos(it.angle) * ry;
      a.style.left = `${x}px`;
      a.style.top = `${y}px`;
      a.style.transform = `rotate(${it.angle - Math.PI / 2}rad)`;
    });
  }

  // ---- start prompt and the end ----
  prompt(text: string | null, sub = ''): void {
    if (!text) {
      this.promptEl.classList.remove('on');
      return;
    }
    this.promptEl.innerHTML = '<b></b><small></small>';
    this.promptEl.querySelector('b')!.textContent = text;
    this.promptEl.querySelector('small')!.textContent = sub;
    this.promptEl.classList.add('on');
  }

  tally(title: string, lines: [string, string][], total: string): void {
    this.tallyEl.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = title;
    this.tallyEl.append(h);
    const rows: HTMLElement[] = [];
    for (const [a, b] of [...lines, ['Totalt', total] as [string, string]]) {
      const r = document.createElement('div');
      const sa = document.createElement('span');
      sa.textContent = a;
      const sb = document.createElement('b');
      sb.textContent = b;
      r.append(sa, sb);
      rows.push(r);
      this.tallyEl.append(r);
    }
    rows[rows.length - 1]!.classList.add('total');
    this.tallyEl.classList.add('on');
    this.setCross(false, false);
    rows.forEach((r, i) => {
      // revealed one by one by the game's clock (see revealTally)
      r.dataset.i = String(i);
    });
  }
  revealTally(n: number): void {
    this.tallyEl.querySelectorAll('div').forEach((d, i) => d.classList.toggle('on', i < n));
  }
  /** The run is over: the shell's result card takes over. */
  hideAll(): void {
    this.el.style.display = 'none';
  }

  update(dt: number): void {
    // count the score up
    if (this.shownScore !== this.targetScore) {
      const d = this.targetScore - this.shownScore;
      this.shownScore += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 10)));
      if (Math.abs(this.targetScore - this.shownScore) < 1) this.shownScore = this.targetScore;
      this.scoreEl.textContent = Math.round(this.shownScore).toLocaleString('sv-SE');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('on');
    }
  }

  dispose(): void {
    for (const a of this.anims) a.cancel();
    this.anims.clear();
    this.el.remove();
  }
}
