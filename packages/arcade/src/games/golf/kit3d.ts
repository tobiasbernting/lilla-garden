// Shared Three.js bits for Minigolfen: cached materials, geometries and textures (made once, freed
// once), and small helpers to place meshes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './tex.ts';

export interface MatOpts {
  rough?: number;
  metal?: number;
  map?: THREE.Texture | null;
  flat?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  depthWrite?: boolean;
  /** A name to tell apart materials that would otherwise share a key. */
  tag?: string;
}

export class Kit {
  readonly shadows: boolean;
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private textures: THREE.Texture[] = [];
  readonly tex: {
    felt: THREE.Texture;
    grass: THREE.Texture;
    wood: THREE.Texture;
    hay: THREE.Texture;
    spiral: THREE.Texture;
    water: THREE.Texture;
    cow: THREE.Texture;
    blob: THREE.Texture;
    carousel: THREE.Texture;
    sky: THREE.Texture;
    earth: THREE.Texture;
  };

  constructor(readonly quality: 'high' | 'low') {
    this.shadows = quality === 'high';
    this.tex = {
      felt: this.keep(T.feltTexture()),
      grass: this.keep(T.grassTexture()),
      wood: this.keep(T.woodTexture()),
      hay: this.keep(T.hayTexture()),
      spiral: this.keep(T.spiralTexture()),
      water: this.keep(T.waterTexture()),
      cow: this.keep(T.cowTexture()),
      blob: this.keep(T.blobTexture()),
      carousel: this.keep(T.carouselTexture()),
      sky: this.keep(T.skyTexture()),
      earth: this.keep(T.earthTexture()),
    };
  }

  keep<X extends THREE.Texture>(t: X): X {
    this.textures.push(t);
    return t;
  }

  /** A standard material, shared by everyone who asks for the same thing. */
  std(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
    const key = `std|${color}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.map?.uuid ?? ''}|${o.flat ? 1 : 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.transparent ? o.opacity : ''}|${o.side ?? ''}|${o.vertexColors ? 1 : 0}|${o.depthWrite ?? ''}|${o.tag ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: o.vertexColors ? '#ffffff' : color,
        roughness: o.rough ?? 0.8,
        metalness: o.metal ?? 0,
        map: o.map ?? null,
        flatShading: o.flat ?? false,
        emissive: o.emissive ?? '#000000',
        emissiveIntensity: o.emissiveIntensity ?? 1,
        transparent: o.transparent ?? false,
        opacity: o.opacity ?? 1,
        side: o.side ?? THREE.FrontSide,
        vertexColors: o.vertexColors ?? false,
        depthWrite: o.depthWrite ?? true,
      });
      if (o.vertexColors) m.color.set(color);
      this.mats.set(key, m);
    }
    return m;
  }

  basic(color: string, o: { transparent?: boolean; opacity?: number; map?: THREE.Texture; depthWrite?: boolean; tag?: string } = {}): THREE.MeshBasicMaterial {
    const key = `basic|${color}|${o.opacity ?? 1}|${o.map?.uuid ?? ''}|${o.depthWrite ?? ''}|${o.tag ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: o.transparent ?? false, opacity: o.opacity ?? 1, map: o.map ?? null, depthWrite: o.depthWrite ?? true });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Keep a material made elsewhere so it is freed with the rest. */
  own<M extends THREE.Material>(key: string, make: () => M): M {
    let m = this.mats.get(key) as M | undefined;
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  geo<G extends THREE.BufferGeometry>(key: string, make: () => G): G {
    let g = this.geos.get(key) as G | undefined;
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  // common shapes, all unit-sized (scale them)
  get sphere(): THREE.SphereGeometry {
    return this.geo('sphere', () => new THREE.SphereGeometry(1, 16, 12));
  }
  get lowSphere(): THREE.SphereGeometry {
    return this.geo('lowSphere', () => new THREE.SphereGeometry(1, 10, 7));
  }
  get box(): THREE.BoxGeometry {
    return this.geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  }
  get rbox(): RoundedBoxGeometry {
    return this.geo('rbox', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.18));
  }
  get cyl(): THREE.CylinderGeometry {
    return this.geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 14));
  }
  get cyl8(): THREE.CylinderGeometry {
    return this.geo('cyl8', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  }
  get cone(): THREE.ConeGeometry {
    return this.geo('cone', () => new THREE.ConeGeometry(1, 1, 12));
  }
  get ico(): THREE.IcosahedronGeometry {
    return this.geo('ico', () => new THREE.IcosahedronGeometry(1, 1));
  }
  get dodeca(): THREE.DodecahedronGeometry {
    return this.geo('dodeca', () => new THREE.DodecahedronGeometry(1, 0));
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const g of this.geos.values()) g.dispose();
    for (const t of this.textures) t.dispose();
    this.mats.clear();
    this.geos.clear();
    this.textures = [];
  }
}

export type V3 = [number, number, number];

/** A mesh placed, scaled and turned in one go. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], pos: V3 = [0, 0, 0], scale: V3 | number = 1, rot: V3 = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(scale[0], scale[1], scale[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

/** Let everything in this object cast (and receive) shadows when the quality allows. */
export function shade(kit: Kit, o: THREE.Object3D, cast = true, receive = false): void {
  if (!kit.shadows) return;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
}
