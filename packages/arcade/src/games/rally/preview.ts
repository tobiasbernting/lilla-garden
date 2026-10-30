// The garage's car preview: one car on a turntable in a given element, restyled live as the kid picks
// paint, stickers and parts. Loaded with import() through loadRallyPreview() in the package index so
// Three.js stays out of the farm game's first download. A small studio: a soft backdrop, a turntable
// with a contact shadow, a room reflection for the paint, and a night mode for the lights.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GarageCar } from '@lilla-garden/shared';
import { blobTex, canvasTex } from './geo.ts';
import { carModel, type CarModel } from './models.ts';

export interface CarPreview {
  /** Show another car (or the same one restyled); rebuilds only when the look changed. */
  update(car: GarageCar): void;
  /** Night view (underglow, lights) on or off. */
  night(on: boolean): void;
  /** The car on the turntable right now (for the lab: nitro flames, damage by hand). */
  readonly model: CarModel | null;
  dispose(): void;
}

export interface CarPreviewOpts {
  /** Spins slowly by itself; a drag turns it. */
  spin?: boolean;
  /** CSS background behind the studio (default: a soft gradient). */
  background?: string;
  /** Starting angle (rad); 0 shows the car's left side, π the right. */
  yaw?: number;
  quality?: 'high' | 'low';
}

const DAY_BG = 'radial-gradient(ellipse at 50% 38%, #fdfbf6 0%, #e9e4d8 55%, #c9c2b2 100%)';
const NIGHT_BG = 'radial-gradient(ellipse at 50% 40%, #2c3554 0%, #161b2e 60%, #0b0e18 100%)';

/** Mounts a preview that fills `root` (it watches its size). */
export function mountCarPreview(root: HTMLElement, car: GarageCar, opts: CarPreviewOpts = {}): CarPreview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' });
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const oldBg = root.style.background;
  root.style.background = opts.background ?? DAY_BG;
  root.append(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const hemi = new THREE.HemisphereLight('#f4f1ff', '#6a5a44', 1.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3dd', 2.2);
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -4;
  sc.right = sc.top = 4;
  sc.near = 1;
  sc.far = 20;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 0.9);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // the turntable: a soft-edged floor, a slowly turning disc with rings, and a contact shadow
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const floorGeo = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, color: '#e6dfcf', transparent: true, depthWrite: false });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.09;
  scene.add(floor);
  const discTex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#d8d2c4';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let r = 20; r < w / 2; r += 18) {
      g.lineWidth = r % 36 ? 1 : 2;
      g.beginPath();
      g.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillRect(w / 2 + Math.cos(a) * w * 0.47 - 2, w / 2 + Math.sin(a) * w * 0.47 - 2, 4, 4);
    }
  });
  const discGeo = new THREE.CylinderGeometry(3.4, 3.5, 0.08, 64, 1, true).translate(0, -0.04, 0);
  const topGeo = new THREE.CircleGeometry(3.4, 64).rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({ color: '#bdb6a6', roughness: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ map: discTex, roughness: 0.55, metalness: 0.05 });
  const disc = new THREE.Mesh(discGeo, discMat);
  const top = new THREE.Mesh(topGeo, topMat);
  top.receiveShadow = true;
  disc.add(top);
  scene.add(disc);
  const shadowTex = blobTex(64, 0.3);

  let model: CarModel | null = null;
  let lookKey = '';
  let damage = -1;
  let isNight = false;
  let yaw = opts.yaw ?? 0.7;
  let vel = 0;
  const target = new THREE.Vector3();
  let dist = 9;

  const frame = (): void => {
    const r = root.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole car in view in narrow panels too
    const fit = camera.aspect < 1.3 ? 1.3 / camera.aspect : 1;
    camera.position.set(0, target.y + dist * 0.36 * fit, dist * fit).add(new THREE.Vector3(target.x, 0, target.z));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };

  const clear = (): void => {
    if (!model) return;
    model.root.removeFromParent();
    model.shadow.removeFromParent();
    model.dispose();
    model = null;
  };

  const show = (c: GarageCar): void => {
    const k = JSON.stringify([c.body, c.style]);
    if (k !== lookKey || !model) {
      lookKey = k;
      clear();
      model = carModel({ body: c.body, style: c.style, shadowTex, envMap: env, quality: opts.quality ?? 'high' });
      model.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.castShadow) o.receiveShadow = false;
      });
      model.shadow.position.y = 0.005;
      model.setNight(isNight);
      scene.add(model.root, model.shadow);
      damage = -1;
      // frame the car: bigger bodies step the camera back
      const e = model.extent;
      target.set(0, e.top * 0.42, 0);
      dist = Math.max(e.front - e.back, e.halfW * 2.4, e.top * 2) * 2.15 + 0.5;
      frame();
    }
    if (c.damage !== damage) {
      damage = c.damage;
      model.setDamage(c.damage);
    }
  };
  show(car);

  const ro = new ResizeObserver(frame);
  ro.observe(root);
  frame();

  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  const down = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastT = performance.now();
    vel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const move = (e: PointerEvent): void => {
    if (!dragging) return;
    const now = performance.now();
    const d = (e.clientX - lastX) * 0.012;
    yaw += d;
    vel = d / Math.max(0.008, (now - lastT) / 1000);
    lastX = e.clientX;
    lastT = now;
  };
  const up = (): void => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let raf = 0;
  let last = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!dragging) {
      // a flick keeps turning and slows down; then the slow showroom spin takes over
      vel *= Math.exp(-dt * 3);
      yaw += vel * dt + (opts.spin !== false ? dt * 0.35 : 0);
    }
    disc.rotation.y = yaw;
    if (model) {
      model.root.rotation.y = yaw;
      model.shadow.rotation.y = yaw;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    update: show,
    get model() {
      return model;
    },
    night: (on) => {
      isNight = on;
      model?.setNight(on);
      if (!opts.background) root.style.background = on ? NIGHT_BG : DAY_BG;
      hemi.intensity = on ? 0.18 : 1.0;
      key.intensity = on ? 0.35 : 2.2;
      rim.intensity = on ? 0.5 : 0.9;
      scene.environmentIntensity = on ? 0.12 : 0.55;
      floorMat.color.set(on ? '#3a4366' : '#e6dfcf');
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      clear();
      for (const d of [shadowTex, floorTex, floorGeo, floorMat, discTex, discGeo, discMat, topGeo, topMat, env]) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      root.style.background = oldBg;
    },
  };
}
