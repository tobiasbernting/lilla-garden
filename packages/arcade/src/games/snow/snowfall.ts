// Gently falling snow: a box of flakes that wraps round the camera, moved entirely on the GPU.
import * as THREE from 'three';
import { rng } from './util.ts';

export interface Snowfall {
  points: THREE.Points;
  update(t: number, cam: THREE.Vector3, pxScale: number): void;
}

export function createSnowfall(count: number): Snowfall {
  const r = rng(99);
  const S = 46;
  const H = 22;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([r() * S, r() * H, r() * S], i * 3);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uScale: { value: 400 },
      uBox: { value: new THREE.Vector3(S, H, S) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform vec3 uCam; uniform float uScale; uniform vec3 uBox;
      varying float vA;
      void main(){
        vec3 p = position;
        float sp = 0.55 + aSeed * 0.75;
        p.y -= uTime * sp;
        p.x += sin(uTime * (0.35 + aSeed * 0.6) + aSeed * 30.0) * 0.7 + uTime * 0.35;
        p.z += cos(uTime * (0.3 + aSeed * 0.5) + aSeed * 17.0) * 0.5;
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        vA = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(14.0, 22.0, d));
        gl_PointSize = clamp((0.045 + aSeed * 0.05) * uScale / d, 1.0, 26.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, r) * vA * 0.9;
        gl_FragColor = vec4(vec3(0.98, 0.97, 1.0), a);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return {
    points,
    update(t, cam, pxScale) {
      mat.uniforms.uTime!.value = t;
      mat.uniforms.uCam!.value.copy(cam);
      mat.uniforms.uScale!.value = pxScale;
    },
  };
}
