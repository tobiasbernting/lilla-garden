// Golden hour: a gradient sky with a low warm sun and soft clouds, the sun and sky lights, haze, and a
// reflection map of the sky for the car paint and the water. The other courses and times of day pass
// their own SkyPreset (courses.ts): dusk, a bright beach day, an overcast winter, night with stars.
import * as THREE from 'three';
import type { SkyPreset } from './courses.ts';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunCol;
uniform vec3 uCloud;
uniform float uTime;
uniform float uCover;
uniform float uNight;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, uSun), 0.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, h));
  col = mix(col, uHaze, pow(sd, 3.0) * (1.0 - smoothstep(-0.05, 0.45, h)) * 0.85);
  col += uSunCol * pow(sd, 22.0) * 0.6;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.2 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.7);
    float cov = smoothstep(uCover, uCover + 0.28, c) * smoothstep(0.0, 0.2, h);
    vec3 cc = mix(uCloud, uSunCol * 1.15, pow(sd, 2.5) * 0.7);
    col = mix(col, cc, cov * 0.7);
  }
  col += uSunCol * pow(sd, 350.0) * 1.6;
  col += vec3(1.0, 0.86, 0.62) * smoothstep(0.99925, 0.99965, sd) * 4.0 * (1.0 - uNight);
  if (uNight > 0.0) {
    // the moon and the stars (hidden by the clouds)
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.99955, sd) * 2.2 * uNight;
    vec2 g = vec2(atan(d.x, d.z) * 160.0, d.y * 260.0);
    vec2 cell = floor(g);
    float st = hash(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
    float star = step(0.985, st) * smoothstep(0.5, 0.1, length(fract(g) - 0.5)) * smoothstep(0.02, 0.25, h);
    col += vec3(0.85, 0.9, 1.0) * star * tw * uNight * 1.4;
  }
  col = mix(col, uHorizon, smoothstep(0.0, -0.1, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Sky {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
  fog: THREE.FogExp2;
  env: THREE.Texture;
  /** Keep the sky round the camera and the sun's shadow box round the player. */
  update(time: number, camera: THREE.Camera, focus: THREE.Vector3): void;
  dispose(): void;
}

/** Rain: a grey, overcast version of a sky. */
export function rainy(p: SkyPreset): SkyPreset {
  const grey = (c: string, k: number): string => '#' + new THREE.Color(c).lerp(new THREE.Color('#7d8590'), k).getHexString();
  return {
    ...p,
    zenith: grey(p.zenith, 0.6),
    horizon: grey(p.horizon, 0.55),
    haze: grey(p.haze, 0.7),
    sunCol: grey(p.sunCol, 0.6),
    cloud: grey(p.cloud, 0.5),
    cover: 0.26,
    sunI: p.sunI * 0.45,
    hemiI: p.hemiI * 0.9,
    fog: p.fog * 1.9,
  };
}

const GOLDEN_DEFAULT: SkyPreset = {
  elev: 13,
  az: Math.atan2(-0.62, 0.78),
  zenith: '#4382d6',
  horizon: '#f4c99c',
  haze: '#ffa05a',
  sunCol: '#ffc274',
  cloud: '#f3dccb',
  cover: 0.5,
  sunLight: '#ffd09a',
  sunI: 2.7,
  hemiSky: '#b3cdf5',
  hemiGround: '#7a6b48',
  hemiI: 1.35,
  fog: 0.00062,
  night: 0,
  exposure: 1.02,
};

export function buildSky(renderer: THREE.WebGLRenderer, quality: 'high' | 'low', p: SkyPreset = GOLDEN_DEFAULT): Sky {
  const elev = THREE.MathUtils.degToRad(p.elev);
  const az = p.az;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
  const horizon = new THREE.Color(p.horizon);
  const uniforms = {
    uSun: { value: sunDir.clone() },
    uZenith: { value: new THREE.Color(p.zenith) },
    uHorizon: { value: horizon.clone() },
    uHaze: { value: new THREE.Color(p.haze) },
    uSunCol: { value: new THREE.Color(p.sunCol) },
    uCloud: { value: new THREE.Color(p.cloud) },
    uTime: { value: 0 },
    uCover: { value: p.cover },
    uNight: { value: p.night },
  };
  const geo = new THREE.SphereGeometry(100, 40, 20);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  // the sky as a reflection map
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(geo, mat);
  envSky.frustumCulled = false;
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(p.sunLight, p.sunI);
  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiI);
  const S = 75;
  if (quality === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -S;
    cam.right = S;
    cam.top = S;
    cam.bottom = -S;
    cam.near = 1;
    cam.far = 700;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 2.5;
  }
  const fog = new THREE.FogExp2(horizon.getHex(), p.fog);
  // a basis across the sun's rays, to snap the shadow box to whole texels (no shimmering)
  const right = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, sunDir).normalize();
  const texel = (2 * S) / 2048;
  const f = new THREE.Vector3();
  return {
    mesh,
    sun,
    hemi,
    sunDir,
    fog,
    env: envRT.texture,
    update(time, camera, focus) {
      uniforms.uTime.value = time;
      mesh.position.copy(camera.position);
      const a = Math.round(focus.dot(right) / texel) * texel;
      const b = Math.round(focus.dot(up) / texel) * texel;
      const c = focus.dot(sunDir);
      f.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(sunDir, c);
      sun.target.position.copy(f);
      sun.position.copy(f).addScaledVector(sunDir, 350);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      envRT.dispose();
      sun.dispose();
      hemi.dispose();
    },
  };
}
