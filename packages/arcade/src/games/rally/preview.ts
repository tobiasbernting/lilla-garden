// The garage's car preview: one car on a turntable in a given element, restyled live as the kid picks
// paint, stickers and parts. Loaded with import() through loadRallyPreview() in the package index so
// Three.js stays out of the farm game's first download.
import * as THREE from 'three';
import type { GarageCar } from '@lilla-garden/shared';
import { blobTex } from './geo.ts';
import { carModel, type CarModel } from './models.ts';

export interface CarPreview {
  /** Show another car (or the same one restyled). */
  update(car: GarageCar): void;
  /** Night view (underglow, lights) on or off. */
  night(on: boolean): void;
  dispose(): void;
}

export interface CarPreviewOpts {
  /** Spins slowly by itself; a drag turns it. */
  spin?: boolean;
  background?: string;
}

/** Mounts a preview that fills `root` (watch it with a ResizeObserver). */
export function mountCarPreview(root: HTMLElement, car: GarageCar, opts: CarPreviewOpts = {}): CarPreview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  root.append(canvas);
  if (opts.background) root.style.background = opts.background;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(5.5, 2.6, 6);
  camera.lookAt(0, 0.6, 0);
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#5a4a30', 1.1));
  const sun = new THREE.DirectionalLight('#fff3dd', 1.6);
  sun.position.set(4, 7, 3);
  scene.add(sun);
  const shadowTex = blobTex(64, 0.3);
  let model: CarModel | null = null;
  let yaw = 0.6;
  const show = (c: GarageCar): void => {
    model?.root.removeFromParent();
    model?.shadow.removeFromParent();
    model?.dispose();
    model = carModel({ body: c.body, style: c.style, shadowTex, envMap: null, quality: 'high' });
    model.setDamage(c.damage);
    scene.add(model.root, model.shadow);
  };
  show(car);
  const fit = (): void => {
    const r = root.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const stop = (): void => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (opts.spin !== false && !dragging) yaw += dt * 0.5;
    if (model) {
      model.root.rotation.y = yaw;
      model.shadow.rotation.y = yaw;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return {
    update: show,
    night: (on) => model?.setNight(on),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      model?.dispose();
      shadowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
