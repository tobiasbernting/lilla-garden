// Materials with a soft, fluffy look: cheap Lambert shading plus a pastel rim light, and a snow
// ground that glitters close to the player.
import * as THREE from 'three';

export interface Fluffy extends THREE.MeshLambertMaterial {
  userData: { rim: THREE.Color; rimStrength: { value: number }; flash: { value: number } };
}

/** Lambert with a coloured fresnel rim (the dusk light wrapping round snow) and a white hit flash. */
export function fluffy(color: THREE.ColorRepresentation, rim: THREE.ColorRepresentation = 0xffd0e8, rimStrength = 0.35, params: THREE.MeshLambertMaterialParameters = {}): Fluffy {
  const m = new THREE.MeshLambertMaterial({ color, ...params }) as Fluffy;
  const rimColor = new THREE.Color(rim);
  const strength = { value: rimStrength };
  const flash = { value: 0 };
  m.userData = { rim: rimColor, rimStrength: strength, flash };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rimColor };
    shader.uniforms.uRimStrength = strength;
    shader.uniforms.uFlash = flash;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimStrength;\nuniform float uFlash;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
          outgoingLight += uRim * fr * uRimStrength;
          outgoingLight = mix(outgoingLight, vec3(1.0, 0.98, 1.0), uFlash);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'snow-fluffy';
  return m;
}

/** The snow ground: soft vertex-coloured Lambert with tiny glints near the camera. */
export function snowGround(): THREE.MeshLambertMaterial & { userData: { time: { value: number } } } {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { time: { value: number } } };
  const time = { value: 0 };
  m.userData = { time };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        // soft wind-blown ripples in the snow, fading with distance
        float dd = length(vViewPosition);
        vec2 q = vWPos.xz;
        float rip = sin(q.x * 0.9 + sin(q.y * 0.35) * 2.0) * 0.5 + 0.5;
        float rip2 = sin(q.y * 1.7 + q.x * 0.4 + sin(q.x * 0.5) * 1.5) * 0.5 + 0.5;
        float k = mix(rip * 0.6 + rip2 * 0.4, 0.5, smoothstep(10.0, 40.0, dd));
        diffuseColor.rgb *= 0.95 + 0.08 * k;
      }`,
    );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float dist = length(vViewPosition);
          vec2 g = vWPos.xz * 5.0;
          vec2 cell = floor(g);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 f = fract(g) - 0.5 - (vec2(fract(h * 13.7), fract(h * 71.3)) - 0.5) * 0.6;
          vec3 vd = normalize(vViewPosition);
          float tw = fract(h * 91.7 + (vd.x * 3.1 + vd.y * 5.3) * 2.0 + uTime * 0.15);
          float s = step(0.965, h) * smoothstep(0.55, 1.0, tw) * smoothstep(0.11, 0.0, length(f));
          s *= smoothstep(22.0, 4.0, dist);
          outgoingLight += vec3(1.0, 0.96, 1.0) * s * 0.9;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'snow-ground';
  return m;
}
