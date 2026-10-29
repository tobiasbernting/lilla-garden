// One shader for everything: texture × baked shade/AO (vertex colour) × Minecraft-style sky and block light, plus fog.
import * as THREE from 'three';

/** Values shared by every material; the game updates them once per frame. */
export const shared = {
  uDaylight: { value: 1 },
  uSkyTint: { value: new THREE.Color(1, 1, 1) },
  uBlockTint: { value: new THREE.Color(1, 0.82, 0.55) },
  uFogColor: { value: new THREE.Color(0x9cc4ff) },
  uFogNear: { value: 30 },
  uFogFar: { value: 60 },
  uMinLight: { value: 0.1 },
  uTime: { value: 0 },
  /** A soft light around the local player at night, so little ones are never lost in the dark. */
  uLanternPos: { value: new THREE.Vector3() },
  uLantern: { value: 0 },
};

const vertex = /* glsl */ `
attribute vec2 light;
attribute vec3 color;
uniform vec2 uUvOffset;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vFogDepth;
varying vec3 vWorld;
void main() {
  vUv = uv + uUvOffset;
  vColor = color;
  vLight = light;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform sampler2D map;
uniform float uDaylight;
uniform vec3 uSkyTint;
uniform vec3 uBlockTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uMinLight;
uniform float uAlpha;
uniform float uCutout;
uniform vec2 uActorLight;
uniform float uUseActorLight;
uniform vec3 uTint;
uniform float uFlash;
uniform vec3 uLanternPos;
uniform float uLantern;
uniform float uGlow;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vFogDepth;
float curve(float l) { return pow(0.8, 15.0 * (1.0 - l)); }
void main() {
  vec4 t = texture2D(map, vUv);
  if (uCutout > 0.5 && t.a < 0.5) discard;
  vec2 L = mix(vLight, uActorLight, uUseActorLight);
  vec3 sky = uSkyTint * (curve(L.x) * uDaylight);
  vec3 block = uBlockTint * curve(L.y) * step(0.01, L.y);
  float lantern = uLantern * clamp(1.0 - distance(vWorld, uLanternPos) / 7.0, 0.0, 1.0);
  vec3 light = max(max(max(max(sky, block), uBlockTint * lantern), vec3(uMinLight)), vec3(uGlow));
  vec3 col = t.rgb * vColor * uTint * light;
  col = mix(col, vec3(1.0, 0.25, 0.2), uFlash);
  float f = smoothstep(uFogNear, uFogFar, vFogDepth);
  gl_FragColor = vec4(mix(col, uFogColor, f), t.a * uAlpha);
}
`;

export interface MatOpts {
  transparent?: boolean;
  alpha?: number;
  cutout?: boolean;
  side?: THREE.Side;
  /** Use one light value for the whole mesh (actors); set via `setActorLight`. */
  actor?: boolean;
  depthWrite?: boolean;
  /** Shines by itself, whatever the light around it (lava). */
  glow?: boolean;
}

export function makeMaterial(map: THREE.Texture, opts: MatOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...shared,
      map: { value: map },
      uAlpha: { value: opts.alpha ?? 1 },
      uCutout: { value: opts.cutout === false ? 0 : 1 },
      uActorLight: { value: new THREE.Vector2(1, 0) },
      uUseActorLight: { value: opts.actor ? 1 : 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uFlash: { value: 0 },
      uUvOffset: { value: new THREE.Vector2() },
      uGlow: { value: opts.glow ? 1 : 0 },
    },
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? !opts.transparent,
    side: opts.side ?? THREE.FrontSide,
  });
}

/** Light for a whole actor mesh: sky and block light 0..1. */
export function setActorLight(m: THREE.ShaderMaterial, sky: number, block: number): void {
  const v = m.uniforms.uActorLight!.value as THREE.Vector2;
  if (v.x !== sky || v.y !== block) {
    v.set(sky, block);
    m.uniformsNeedUpdate = true;
  }
}

/** Clones a material but keeps the shared (per-frame) uniforms shared. */
export function cloneMaterial(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
  const c = m.clone();
  for (const [k, u] of Object.entries(shared)) c.uniforms[k] = u;
  c.uniforms.map!.value = m.uniforms.map!.value;
  return c;
}
