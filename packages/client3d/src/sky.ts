// Minecraft-style sky: flat colour fading into fog, a square sun and moon, blocky drifting clouds,
// stars at night and snowfall at Christmas.
import * as THREE from 'three';
import { DAY_LENGTH_MS } from '@lilla-garden/shared';
import { shared } from './material.ts';

const DAY = new THREE.Color(0x78a7ff);
const DAY_FOG = new THREE.Color(0xb8d2ff);
const DUSK = new THREE.Color(0xd8714a);
const NIGHT = new THREE.Color(0x0a0e24);
const NIGHT_FOG = new THREE.Color(0x0c1230);

function squareTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = 16): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export class Sky {
  readonly group = new THREE.Group();
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private clouds: THREE.Mesh;
  private cloudTex: THREE.Texture;
  private stars: THREE.Points;
  private snow: THREE.Points | null = null;
  readonly color = new THREE.Color();
  readonly fog = new THREE.Color();

  constructor() {
    const sunTex = squareTexture((ctx) => {
      ctx.fillStyle = '#fff7a8';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(5, 5, 6, 6);
    });
    const moonTex = squareTexture((ctx) => {
      ctx.fillStyle = '#d8dce8';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#b8bccb';
      for (const [x, y, s] of [
        [3, 3, 3],
        [9, 5, 2],
        [5, 10, 4],
        [11, 11, 2],
      ] as const)
        ctx.fillRect(x, y, s, s);
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    const bodyMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false });
    this.sun = new THREE.Mesh(plane, bodyMat(sunTex));
    this.sun.scale.setScalar(22);
    this.moon = new THREE.Mesh(plane, bodyMat(moonTex));
    this.moon.scale.setScalar(16);
    this.group.add(this.sun, this.moon);

    // clouds: a 64×64 noise map, each texel 6 blocks wide
    this.cloudTex = squareTexture((ctx) => {
      ctx.fillStyle = '#ffffff';
      let s = 12345;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(r() * 64);
        const y = Math.floor(r() * 64);
        ctx.fillRect(x, y, 2 + Math.floor(r() * 6), 1 + Math.floor(r() * 4));
      }
    }, 64);
    this.cloudTex.wrapS = THREE.RepeatWrapping;
    this.cloudTex.wrapT = THREE.RepeatWrapping;
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(384, 384), new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.group.add(this.clouds);

    const pts: number[] = [];
    for (let i = 0; i < 400; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      if (u < 0.05) continue;
      pts.push(rr * Math.cos(a) * 140, u * 140, rr * Math.sin(a) * 140);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.group.add(this.stars);
  }

  setSnow(on: boolean): void {
    if (on && !this.snow) {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = Math.random() * 20;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.group.add(this.snow);
    } else if (!on && this.snow) {
      this.group.remove(this.snow);
      this.snow.geometry.dispose();
      this.snow = null;
    }
  }

  /**
   * Updates colours and positions. `outdoor` false hides the sky (caves, the bath house).
   * Returns the daylight factor 0..1.
   */
  update(timeMs: number, cam: THREE.Camera, dt: number, outdoor: boolean, season: string): number {
    const f = (timeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
    // the 2D game's day: bright until 0.65, dusk to 0.8, night after
    let day: number;
    if (f < 0.04) day = 0.55 + (f / 0.04) * 0.45;
    else if (f < 0.65) day = 1;
    else if (f < 0.8) day = 1 - ((f - 0.65) / 0.15) * 0.7;
    else day = 0.3;
    const duskAmt = f > 0.6 && f < 0.82 ? Math.sin(((f - 0.6) / 0.22) * Math.PI) : f < 0.05 ? Math.sin((f / 0.05) * Math.PI) * 0.6 : 0;
    const night = season === 'halloween' ? new THREE.Color(0x1c0a30) : NIGHT;
    this.color.copy(night).lerp(DAY, Math.max(0, (day - 0.3) / 0.7)).lerp(DUSK, duskAmt * 0.55);
    this.fog.copy(NIGHT_FOG).lerp(DAY_FOG, Math.max(0, (day - 0.3) / 0.7)).lerp(DUSK, duskAmt * 0.45);
    shared.uSkyTint.value.setRGB(1, 1 - duskAmt * 0.15, 1 - duskAmt * 0.3);

    this.group.visible = outdoor;
    this.group.position.copy(cam.position);
    // sun from the east in the morning over the south to the west at dusk; the moon opposite
    const a = (f / 0.75) * Math.PI;
    const sx = Math.cos(a);
    const sy = Math.sin(a);
    this.sun.position.set(sx * 120, sy * 120, 25);
    this.sun.lookAt(cam.position);
    this.sun.visible = sy > -0.15;
    this.moon.position.set(-sx * 120, -sy * 120, -25);
    this.moon.lookAt(cam.position);
    this.moon.visible = -sy > -0.15;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 1.6);
    // clouds stay overhead and drift west
    this.clouds.position.set(0, 26 - cam.position.y, 0);
    const off = this.cloudTex.offset;
    off.x = (cam.position.x / 384 + performance.now() / 1000 / 400) % 1;
    off.y = (-cam.position.z / 384) % 1;
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.color.setScalar(0.35 + day * 0.65);

    if (this.snow) {
      const p = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1]! -= dt * (2 + (i % 7) * 0.2);
        arr[i]! += Math.sin(performance.now() / 900 + i) * dt * 0.3;
        if (arr[i + 1]! < -cam.position.y - 1) arr[i + 1] = 18 - cam.position.y + Math.random() * 2;
      }
      p.needsUpdate = true;
      this.snow.position.set(0, 0, 0);
    }
    return day;
  }
}
