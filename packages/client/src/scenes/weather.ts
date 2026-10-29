// 2D game: weather on screen. Rain, storms with lightning, snow, hail, wind with blowing leaves,
// fog, grey clouds and a rainbow when the sun comes out after rain. Everything is a screen overlay
// (scroll factor 0) under the night tint, so evenings darken the weather too.
import Phaser from 'phaser';
import type { WeatherKind } from '@lilla-garden/shared';
import { R } from '../art/style.ts';
import { SFX, setAmbience } from '../sound.ts';

const S = 1 / R;

/** How the sky is tinted for each kind of weather (colour, strength). */
const SHADE: Record<WeatherKind, [number, number]> = {
  sun: [0x000000, 0],
  cloudy: [0x4a5260, 0.16],
  rain: [0x34445a, 0.26],
  storm: [0x1c2434, 0.42],
  snow: [0xe8eef6, 0.14],
  hail: [0x50606e, 0.22],
  wind: [0x8a8070, 0.06],
  fog: [0xe6eaee, 0.42],
};

/** Draws a small texture at R× resolution. */
function makeTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = w * R;
  c.height = h * R;
  const g = c.getContext('2d')!;
  g.scale(R, R);
  draw(g);
  scene.textures.addCanvas(key, c);
  return key;
}

export class WeatherView {
  private shade: Phaser.GameObjects.Rectangle;
  private flash: Phaser.GameObjects.Rectangle;
  private rainbow: Phaser.GameObjects.Graphics;
  private emitters: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  /** undefined until the first update, so a new scene always sets the sound. */
  private kind: WeatherKind | null | undefined = undefined;
  private shadeColor = new Phaser.Display.Color(0, 0, 0);
  private shadeAlpha = 0;
  private nextBolt = 0;
  private rainbowUntil = 0;

  constructor(
    private scene: Phaser.Scene,
    private ox: number,
    private oy: number,
    private w: number,
    private h: number,
  ) {
    makeTexture(scene, 'wx-rain', 1, 6, (g) => {
      g.fillStyle = 'rgba(190,215,255,0.85)';
      g.fillRect(0, 0, 1, 6);
    });
    makeTexture(scene, 'wx-drop', 4, 2, (g) => {
      g.strokeStyle = 'rgba(210,230,255,0.9)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(2, 1, 1.6, 0.7, 0, 0, Math.PI * 2);
      g.stroke();
    });
    makeTexture(scene, 'wx-snow', 2, 2, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 2, 2);
    });
    makeTexture(scene, 'wx-hail', 3, 3, (g) => {
      g.fillStyle = '#5a7890';
      g.fillRect(0, 1, 3, 1);
      g.fillRect(1, 0, 1, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(1, 1, 1, 1);
    });
    makeTexture(scene, 'wx-leaf', 4, 3, (g) => {
      g.fillStyle = '#e0902a';
      g.fillRect(0, 1, 3, 1);
      g.fillRect(1, 0, 2, 3);
      g.fillStyle = '#7a4a1a';
      g.fillRect(3, 1, 1, 1);
    });
    makeTexture(scene, 'wx-leaf2', 4, 3, (g) => {
      g.fillStyle = '#9ccf4a';
      g.fillRect(0, 1, 3, 1);
      g.fillRect(1, 0, 2, 3);
      g.fillStyle = '#4a7a1a';
      g.fillRect(3, 1, 1, 1);
    });
    makeTexture(scene, 'wx-gust', 24, 1, (g) => {
      const r = g.createLinearGradient(0, 0, 24, 0);
      r.addColorStop(0, 'rgba(255,255,255,0)');
      r.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 24, 1);
    });
    makeTexture(scene, 'wx-fog', 32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 2, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,0.55)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 32, 32);
    });

    this.shade = scene.add.rectangle(ox, oy, w, h, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(9380);
    this.rainbow = scene.add.graphics().setScrollFactor(0).setDepth(9385).setAlpha(0);
    this.drawRainbow();
    this.flash = scene.add.rectangle(ox, oy, w, h, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setDepth(9600);

    const area = { x: { min: 0, max: w + 60 }, y: -6 };
    this.emitters.rain = this.emit('wx-rain', { ...area, speedY: { min: 230, max: 270 }, speedX: -40, rotate: 9, lifespan: 900, frequency: 6, quantity: 2 });
    this.emitters.splash = this.emit('wx-drop', { x: { min: 0, max: w }, y: { min: 0, max: h }, scale: { start: 0.5 * S, end: 1.6 * S }, alpha: { start: 0.7, end: 0 }, lifespan: 320, frequency: 30 });
    this.emitters.snow = this.emit('wx-snow', { x: { min: -20, max: w + 20 }, y: -4, speedY: { min: 12, max: 28 }, speedX: { min: -10, max: 6 }, alpha: { start: 1, end: 0.7 }, scale: { min: 0.6 * S, max: 1.4 * S }, lifespan: 9000, frequency: 16 });
    this.emitters.hail = this.emit('wx-hail', { ...area, speedY: { min: 280, max: 330 }, speedX: -20, lifespan: 700, frequency: 8, quantity: 2 });
    this.emitters.bounce = this.emit('wx-hail', { x: { min: 0, max: w }, y: { min: 10, max: h }, speedY: { min: -55, max: -30 }, speedX: { min: -20, max: 20 }, gravityY: 280, lifespan: 420, frequency: 12 });
    const leaf = { x: -8, y: { min: -10, max: h }, speedX: { min: 120, max: 190 }, speedY: { min: -15, max: 30 }, rotate: { start: 0, end: 720 }, lifespan: 2800, frequency: 70 };
    this.emitters.leaves = this.emit('wx-leaf', leaf);
    this.emitters.leaves2 = this.emit('wx-leaf2', { ...leaf, frequency: 90 });
    this.emitters.gusts = this.emit('wx-gust', { x: -24, y: { min: 0, max: h }, speedX: { min: 260, max: 340 }, alpha: { start: 0.8, end: 0 }, lifespan: 1300, frequency: 45 });
    // cloud shadows drifting over the ground
    this.emitters.shadows = this.emit('wx-fog', { x: { min: -120, max: w * 0.6 }, y: { min: -40, max: h }, speedX: { min: 6, max: 12 }, speedY: { min: 1, max: 4 }, scale: { min: 5 * S, max: 8 * S }, tint: 0x1a2030, alpha: { start: 0, end: 0.35, ease: 'Sine.easeInOut' }, lifespan: 14000, frequency: 900 });
    this.emitters.fog = this.emit('wx-fog', { x: { min: -40, max: w }, y: { min: -20, max: h }, speedX: { min: 3, max: 9 }, scale: { min: 3 * S, max: 5 * S }, alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' }, lifespan: 9000, frequency: 260 });
  }

  private emit(texture: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Phaser.GameObjects.Particles.ParticleEmitter {
    const e = this.scene.add.particles(this.ox, this.oy, texture, { scale: S, ...config, emitting: false });
    e.setScrollFactor(0).setDepth(9390);
    return e;
  }

  private drawRainbow(): void {
    const g = this.rainbow;
    const colors = [0xff4040, 0xff9a30, 0xffe040, 0x50d050, 0x40a0ff, 0x7050e0];
    const cx = this.ox + this.w * 0.68;
    const cy = this.oy + this.h * 0.95;
    colors.forEach((c, i) => {
      g.lineStyle(3, c, 1);
      g.beginPath();
      g.arc(cx, cy, 120 - i * 3, Math.PI * 1.05, Math.PI * 1.95);
      g.strokePath();
    });
  }

  /**
   * Called every frame. `kind` is the weather where the player is (null indoors, in the cave and the
   * bath house); `prev` and `ageMs` (how long this weather has lasted) drive the rainbow.
   */
  update(dtMs: number, kind: WeatherKind | null, prev: WeatherKind | undefined, ageMs: number): void {
    if (kind !== this.kind) {
      this.kind = kind;
      const on = (name: string, v: boolean) => {
        const e = this.emitters[name]!;
        if (v && !e.emitting) e.start();
        else if (!v && e.emitting) e.stop();
      };
      const wet = kind === 'rain' || kind === 'storm';
      on('rain', wet);
      on('splash', wet);
      on('snow', kind === 'snow');
      on('hail', kind === 'hail');
      on('bounce', kind === 'hail');
      on('leaves', kind === 'wind' || kind === 'storm');
      on('leaves2', kind === 'wind');
      on('gusts', kind === 'wind');
      on('shadows', kind === 'cloudy' || kind === 'wind');
      on('fog', kind === 'fog');
      // storms pour harder and slant in the wind
      const rain = this.emitters.rain!;
      rain.frequency = kind === 'storm' ? 3 : 6;
      rain.speedX = kind === 'storm' ? -90 : -40;
      rain.particleRotate = kind === 'storm' ? 20 : 9;
      this.nextBolt = performance.now() + 3000 + Math.random() * 4000;
      setAmbience(kind);
      if (kind === 'sun' && (prev === 'rain' || prev === 'storm') && ageMs < 30_000) this.rainbowUntil = performance.now() + 45_000;
    }
    // ease the sky tint towards the weather's
    const [color, alpha] = SHADE[kind ?? 'sun'];
    const target = Phaser.Display.Color.ValueToColor(color);
    const k = Math.min(1, dtMs / 1500);
    this.shadeColor.setTo(
      Math.round(this.shadeColor.red + (target.red - this.shadeColor.red) * k),
      Math.round(this.shadeColor.green + (target.green - this.shadeColor.green) * k),
      Math.round(this.shadeColor.blue + (target.blue - this.shadeColor.blue) * k),
    );
    this.shadeAlpha += (alpha - this.shadeAlpha) * k;
    this.shade.setFillStyle(this.shadeColor.color, this.shadeAlpha);
    // lightning: a double flash, then the rumble
    const now = performance.now();
    if (kind === 'storm' && now >= this.nextBolt) {
      this.nextBolt = now + 5000 + Math.random() * 9000;
      this.scene.tweens.killTweensOf(this.flash);
      this.flash.setAlpha(0.65);
      this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 120, yoyo: false, onComplete: () => {
        this.flash.setAlpha(0.45);
        this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 320 });
      } });
      setTimeout(() => SFX.thunder(), 500 + Math.random() * 1200);
    }
    // the rainbow fades in, stays a while and fades away
    const left = this.rainbowUntil - now;
    const rainbow = kind === 'sun' && left > 0 ? Math.min(1, left / 5000, (45_000 - left) / 4000) * 0.4 : 0;
    this.rainbow.setAlpha(this.rainbow.alpha + (rainbow - this.rainbow.alpha) * k);
  }

  destroy(): void {
    setAmbience(null);
    for (const e of Object.values(this.emitters)) e.destroy();
    this.shade.destroy();
    this.flash.destroy();
    this.rainbow.destroy();
  }
}
