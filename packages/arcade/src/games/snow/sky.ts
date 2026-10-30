// The blue-hour sky: a pastel gradient dome (pink belt over the village, peach afterglow behind the
// player), the first stars, a big rising moon and soft cloud banks. Painted straight in sRGB so the
// horizon matches the fog exactly.
import * as THREE from 'three';
import { cloudTexture, glowTexture, moonTexture } from './textures.ts';
import { rng } from './util.ts';

export const MOON_DIR = new THREE.Vector3(-0.28, 0.3, -1).normalize();
/** Where the sun went down: behind the player, just under the horizon. */
export const SUNSET_DIR = new THREE.Vector3(0.35, -0.06, 1).normalize();
/** The fog and the very horizon (sRGB). */
export const FOG_HEX = 0xc6b7dc;

const srgb = (hex: number): THREE.Vector3 => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith, uUpper, uMid, uBelt, uShadow, uGlow, uGlowHigh, uFog, uMoonDir, uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec2 hz = normalize(d.xz + 1e-5);
  float sun = dot(hz, normalize(uSunDir.xz)) * 0.5 + 0.5; // 1 toward the afterglow
  float hp = max(h, 0.0);
  vec3 col = mix(uMid, uUpper, smoothstep(0.12, 0.45, hp));
  col = mix(col, uZenith, smoothstep(0.42, 0.95, hp));
  // the band over the horizon: pink belt on the moon side, peach glow behind
  vec3 band = mix(uBelt, mix(uGlowHigh, uGlow, smoothstep(0.55, 1.0, sun)), smoothstep(0.35, 0.85, sun));
  float bandW = mix(0.16, 0.24, sun);
  col = mix(col, band, exp(-hp / bandW) * 0.92);
  // the earth's blue shadow hugging the horizon on the moon side
  float es = (1.0 - smoothstep(0.2, 0.6, sun)) * exp(-hp / 0.035);
  col = mix(col, uShadow, es * 0.7);
  // melt into the fog at the very horizon and below
  col = mix(col, uFog, exp(-hp / 0.022) * 0.85);
  col = mix(col, uFog, smoothstep(0.0, -0.05, h));
  // a soft moon glow in the air
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(1.0, 0.92, 0.86) * (pow(md, 90.0) * 0.32 + pow(md, 12.0) * 0.07);
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPx;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
  float tw = 0.65 + 0.35 * sin(uTime * (1.3 + aPhase * 2.1) + aPhase * 40.0);
  vec3 d = normalize(position);
  vA = smoothstep(0.12, 0.45, d.y) * tw;
  gl_PointSize = aSize * uPx;
}`;

const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  a = a * a * vA;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a, a);
}`;

const MOON_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  gl_FragColor = vec4(c.rgb, c.a);
}`;

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}`;

export interface Sky {
  group: THREE.Group;
  update(t: number, cam: THREE.Camera, pxScale: number): void;
}

export function createSky(low: boolean): Sky {
  const group = new THREE.Group();
  group.name = 'sky';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uZenith: { value: srgb(0x1f2a66) },
        uUpper: { value: srgb(0x3f4f9e) },
        uMid: { value: srgb(0x8187cc) },
        uBelt: { value: srgb(0xeaa6c8) },
        uShadow: { value: srgb(0xa9a4d8) },
        uGlow: { value: srgb(0xffc4a2) },
        uGlowHigh: { value: srgb(0xf4a9c0) },
        uFog: { value: srgb(FOG_HEX) },
        uMoonDir: { value: MOON_DIR.clone() },
        uSunDir: { value: SUNSET_DIR.clone() },
      },
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // ---- stars ----
  const r = rng(5);
  const n = low ? 220 : 420;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // more stars high up and away from the afterglow
    let d: THREE.Vector3;
    do {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      d = new THREE.Vector3(Math.cos(a) * s, Math.abs(u), Math.sin(a) * s);
    } while (d.y < 0.12 || (d.dot(SUNSET_DIR) > 0.2 && d.y < 0.5 && r() < 0.8));
    pos.set([d.x * 420, d.y * 420, d.z * 420], i * 3);
    const big = r() < 0.04;
    size[i] = big ? 3.2 + r() * 1.4 : 1.1 + r() * 1.3;
    phase[i] = r();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
  });
  const stars = new THREE.Points(sg, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);

  // ---- moon and its halo ----
  const glow = glowTexture();
  const moonDist = 400;
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: glow, color: 0xffe2d6, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
  );
  halo.scale.setScalar(190);
  halo.position.copy(MOON_DIR).multiplyScalar(moonDist + 5);
  halo.renderOrder = -8;
  group.add(halo);
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: MOON_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: { uMap: { value: moonTexture() } },
    }),
  );
  moon.scale.setScalar(50);
  moon.position.copy(MOON_DIR).multiplyScalar(moonDist);
  moon.renderOrder = -7;
  group.add(moon);

  // ---- cloud banks low over the horizon ----
  const clouds: THREE.Mesh[] = [];
  const cloudDefs: [number, number, number, number, number][] = [
    // azimuth (deg, 0 = ahead/-z, + right), elevation (deg), width, height, tint
    [-58, 5.5, 190, 44, 0xf2c0d6],
    [-22, 3.2, 150, 30, 0xe9b7d6],
    [24, 6.0, 210, 46, 0xf6c7d4],
    [62, 4.0, 170, 36, 0xf3bfcf],
    [118, 5.0, 230, 52, 0xffd2bf],
    [168, 3.5, 200, 40, 0xffcfb8],
    [-128, 6.5, 220, 48, 0xf7c4c8],
  ];
  cloudDefs.forEach(([az, el, w, h, tint], i) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: cloudTexture(20 + i), color: tint, transparent: true, opacity: 0.62, depthWrite: false, fog: false, toneMapped: false }),
    );
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    const d = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
    m.position.copy(d).multiplyScalar(380);
    m.scale.set(w, h, 1);
    m.rotation.set(0, -a, 0);
    m.renderOrder = -6;
    m.name = 'cloud';
    m.userData.az = a;
    m.userData.el = e;
    clouds.push(m);
    group.add(m);
  });

  const tmp = new THREE.Vector3();
  return {
    group,
    update(t, cam, pxScale) {
      group.position.copy(cam.position);
      starMat.uniforms.uTime!.value = t;
      starMat.uniforms.uPx!.value = pxScale;
      moon.quaternion.copy(cam.quaternion);
      halo.quaternion.copy(cam.quaternion);
      // the clouds drift very slowly to the right
      for (const c of clouds) {
        const a = (c.userData.az as number) + t * 0.0015;
        const e = c.userData.el as number;
        tmp.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(380);
        c.position.copy(tmp);
        c.rotation.set(0, -a, 0);
      }
    },
  };
}
