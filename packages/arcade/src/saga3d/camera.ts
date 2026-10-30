// A third-person orbit camera like World of Warcraft's: it follows the player smoothly, you drag to look
// around and scroll or pinch to zoom, it never sits inside a wall, and when you walk it slowly swings round
// to look the way you are going.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const MIN_PITCH = 10 * DEG;
const MAX_PITCH = 70 * DEG;
const MIN_DIST = 2;
const MAX_DIST = 9;
/** Walls are this high, so a camera above it can look over them. */
const WALL_TOP = 1.7;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Heading the camera looks along (radians; 0 looks towards -z, like Three.js). */
  yaw = 0;
  /** How far the camera is raised above the player (radians above the floor), 10°–70°. */
  pitch = 32 * DEG;
  /** Wanted distance from the player (2–9). */
  distance = 6;
  /** When set (and nobody is dragging) the camera slowly swings to this heading: set it to the walking direction. */
  wantYaw: number | null = null;
  /** Is a finger or the mouse dragging the view right now? */
  dragging = false;

  private focus = new THREE.Vector3();
  private goal = new THREE.Vector3();
  private seen = false;
  /** The distance after wall-shortening: it shrinks fast and grows back slowly. */
  private eff = 6;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private offDragged = 0;
  private cleanup: (() => void)[] = [];

  constructor(camera: THREE.PerspectiveCamera, private el: HTMLElement) {
    this.camera = camera;
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      el.addEventListener(t, f, opts);
      this.cleanup.push(() => el.removeEventListener(t, f));
    };
    on('contextmenu', (e) => e.preventDefault());
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e));
    on('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  /** Unit vector in the XZ plane that points where the camera looks. */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  /** Unit vector in the XZ plane that points to the camera's right. */
  right(): { x: number; z: number } {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  /** Orbit by hand (the gamepad's right stick). */
  orbit(dyaw: number, dpitch: number): void {
    this.yaw = wrap(this.yaw + dyaw);
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dpitch));
  }

  zoom(factor: number): void {
    this.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, this.distance * factor));
  }

  /** Where the camera should look: the player's feet. The first call snaps, later ones are smoothed in update(). */
  follow(target: { x: number; y: number; z: number }): void {
    this.goal.set(target.x, target.y + 0.75, target.z);
    if (!this.seen) {
      this.focus.copy(this.goal);
      this.seen = true;
    }
  }

  /**
   * Moves the camera. `blocks(x, z)` says whether a spot hides the view (walls and the like); without it the
   * camera uses `isWalkable`, which also works but shortens the camera behind low furniture.
   */
  update(dt: number, isWalkable: (x: number, z: number) => boolean, blocks?: (x: number, z: number) => boolean): void {
    this.focus.lerp(this.goal, 1 - Math.exp(-dt * 9));
    if (this.wantYaw !== null && !this.dragging) this.yaw = wrap(this.yaw + wrap(this.wantYaw - this.yaw) * (1 - Math.exp(-dt * 0.9)));

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const dirX = Math.sin(this.yaw) * cp;
    const dirZ = Math.cos(this.yaw) * cp;
    const hit = blocks ?? ((x: number, z: number) => !isWalkable(x, z));
    // walk out along the line from the player to the camera and stop before the first wall
    let free = this.distance;
    for (let s = 0.5; s <= this.distance + 0.001; s += 0.25) {
      const y = this.focus.y + sp * s;
      if (y < WALL_TOP && hit(this.focus.x + dirX * s, this.focus.z + dirZ * s)) {
        free = Math.max(1.2, s - 0.45);
        break;
      }
    }
    this.eff = free < this.eff ? this.eff + (free - this.eff) * (1 - Math.exp(-dt * 18)) : this.eff + (free - this.eff) * (1 - Math.exp(-dt * 2.5));
    this.camera.position.set(this.focus.x + dirX * this.eff, this.focus.y + sp * this.eff, this.focus.z + dirZ * this.eff);
    this.camera.lookAt(this.focus.x, this.focus.y + 0.15, this.focus.z);
  }

  /** Stops listening (hot reload). */
  dispose(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }

  // ---- pointers ----

  private accepts(e: PointerEvent): boolean {
    if (e.pointerType === 'mouse') return e.button === 0 || e.button === 2;
    // a finger on the left half belongs to the walking stick
    const r = this.el.getBoundingClientRect();
    return e.clientX - r.left > r.width / 2;
  }

  private down(e: PointerEvent): void {
    if (!this.accepts(e)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone: nothing to capture
    }
    this.dragging = true;
    this.pinch = this.pointers.size === 2 ? this.pinchDistance() : 0;
    this.offDragged = 0;
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size >= 2) {
      const d = this.pinchDistance();
      if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d);
      this.pinch = d;
      return;
    }
    this.offDragged += Math.abs(dx) + Math.abs(dy);
    // dragging right turns the view left, so the world follows the finger; dragging down lifts the camera
    this.orbit(dx * 0.006, dy * 0.005);
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    this.pinch = 0;
    if (this.pointers.size === 0) this.dragging = false;
    else if (this.pointers.size === 1) this.pinch = 0;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Was the last drag only a tap (so the integrator can treat it as a click on a monster)? */
  get wasTap(): boolean {
    return this.offDragged < 8;
  }
}
