// Small helpers the minigames may use: a fixed-step game loop and canvases that fill the screen.

/** A fixed 60 Hz update with a render every animation frame. Starts running at once. */
export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  /** Seconds of play so far (paused time not counted). */
  time = 0;

  constructor(
    private update: (dt: number) => void,
    private render: (alpha: number) => void,
    private step = 1 / 60,
  ) {
    this.resume();
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.pause();
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    // a slow frame or a hidden tab must not fast-forward the game
    this.acc += Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let n = 0;
    while (this.acc >= this.step && n < 6) {
      this.update(this.step);
      this.time += this.step;
      this.acc -= this.step;
      n++;
    }
    this.render(this.acc / this.step);
  };
}

/**
 * A low-resolution canvas (w × h virtual pixels) scaled up by whole steps and centred, with sharp
 * pixels. Draw in virtual pixels with `g`.
 */
export function pixelCanvas(root: HTMLElement, w: number, h: number, background = '#000'): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; dispose: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  Object.assign(canvas.style, { position: 'absolute', imageRendering: 'pixelated', left: '50%', top: '50%' });
  root.style.background = background;
  root.append(canvas);
  const fit = (): void => {
    const r = root.getBoundingClientRect();
    const s = Math.max(1, Math.floor(Math.min(r.width / w, r.height / h) * (devicePixelRatio || 1)) / (devicePixelRatio || 1));
    canvas.style.width = `${w * s}px`;
    canvas.style.height = `${h * s}px`;
    canvas.style.transform = 'translate(-50%, -50%)';
  };
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return {
    canvas,
    g,
    dispose: () => {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/**
 * A canvas that fills the root at the given pixel ratio. `size()` gives the size in CSS pixels;
 * `g` is already scaled so you draw in CSS pixels.
 */
export function fullCanvas(root: HTMLElement, dpr: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; size: () => { w: number; h: number }; dispose: () => void } {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  root.append(canvas);
  const g = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  const fit = (): void => {
    const r = root.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();
  return {
    canvas,
    g,
    size: () => ({ w, h }),
    dispose: () => {
      ro.disconnect();
      canvas.remove();
    },
  };
}
