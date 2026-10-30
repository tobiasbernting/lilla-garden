// The garage preview on its own lab page, for trying looks by URL (and for screenshots):
// preview.html?body=monster&paint=%232f6fe0&livery=flames&decals=hood:cow,doors:number&extras=lightbar,flag
// &wheels=gold&spoiler=wing&glow=%2300ced1&driver=dog&plate=MORMOR&damage=80&night=1&yaw=2.4&spin=0&q=low
// `shot=1` hides the buttons.
import {
  CAR_BODIES,
  CAR_DECALS,
  CAR_EXTRAS,
  CAR_LIVERIES,
  isCarBody,
  newCar,
  type CarDecal,
  type CarDriver,
  type CarExtra,
  type CarFinish,
  type CarLivery,
  type CarSpoiler,
  type CarWheels,
  type DecalSlot,
  type GarageCar,
} from '@lilla-garden/shared';
import * as THREE from 'three';
import { carModel } from './games/rally/models.ts';
import { mountCarPreview, type CarPreview } from './games/rally/preview.ts';

let q = new URLSearchParams(location.search);
const str = (k: string): string | null => q.get(k);

function carFromQuery(): GarageCar {
  const body = str('body');
  const car = newCar(1, isCarBody(body) ? body : 'hatch', 'Labbet', str('paint') ?? undefined);
  const s = car.style;
  if (str('paint2')) s.paint2 = str('paint2')!;
  if (str('finish')) s.finish = str('finish') as CarFinish;
  if (str('livery')) s.livery = str('livery') as CarLivery;
  for (const part of (str('decals') ?? '').split(',').filter(Boolean)) {
    const [slot, d] = part.split(':');
    if (slot && d) s.decals[slot as DecalSlot] = d as CarDecal;
  }
  if (str('number')) s.number = Number(str('number'));
  if (str('wheels')) s.wheels = str('wheels') as CarWheels;
  if (str('rim')) s.rimColor = str('rim')!;
  if (str('spoiler')) s.spoiler = str('spoiler') as CarSpoiler;
  if (str('extras')) s.extras = str('extras')!.split(',').filter(Boolean) as CarExtra[];
  if (str('glow')) s.glow = str('glow');
  if (str('driver')) s.driver = str('driver') as CarDriver;
  if (str('plate')) s.plate = str('plate')!;
  car.damage = Number(str('damage') ?? 0);
  return car;
}

if (q.get('shot') === '1') document.body.classList.add('shot');
let car = carFromQuery();
const stage = document.getElementById('stage')!;
const mount = (): CarPreview => {
  const p = mountCarPreview(stage, car, {
    spin: q.get('spin') !== '0',
    yaw: q.has('yaw') ? Number(q.get('yaw')) : undefined,
    quality: q.get('q') === 'low' ? 'low' : 'high',
  });
  p.night(night);
  if (q.has('nitro')) p.model?.setNitro(Number(q.get('nitro')));
  return p;
};
let night = q.get('night') === '1';
let preview = mount();
const info = document.getElementById('info')!;
const describe = (): void => {
  info.textContent = `${car.body} · ${car.style.livery} · ${Object.values(car.style.decals).join(' ')} · ${car.style.extras.join(' ')} · skada ${car.damage}`;
};
describe();

// a few buttons to click through the options by hand
const bar = document.getElementById('bar')!;
const button = (label: string, fn: () => void): void => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    fn();
    preview.update(car);
    describe();
  };
  bar.append(b);
};
const cycle = <T>(list: readonly T[], cur: T): T => list[(list.indexOf(cur) + 1) % list.length]!;
const fresh = (): GarageCar => (car = structuredClone(car));
button('Kaross', () => (fresh().body = cycle(CAR_BODIES, car.body)));
button('Mönster', () => (fresh().style.livery = cycle(CAR_LIVERIES, car.style.livery)));
button('Dekal', () => (fresh().style.decals.hood = cycle(CAR_DECALS, car.style.decals.hood ?? 'strawberry')));
button('Extra', () => {
  const s = fresh().style;
  const next = cycle(CAR_EXTRAS, s.extras[s.extras.length - 1] ?? 'horsetail');
  s.extras = s.extras.length >= 4 ? [next] : [...s.extras, next];
});
button('Skada', () => (fresh().damage = (car.damage + 20) % 120));
button('Natt', () => preview.night((night = !night)));
button('Stäng', () => preview.dispose());
/** For the screenshot script: throw the preview away and mount a new one from a query string. */
function remount(qs: string): void {
  preview.dispose();
  q = new URLSearchParams(qs);
  car = carFromQuery();
  night = q.get('night') === '1';
  preview = mount();
  describe();
}
Object.assign(window, { remount, labCar: () => car, ready: true });

// ?tris=1: triangles per body with every extra bolted on, high and low quality (window.trisReport)
if (q.get('tris') === '1') {
  const tex = new THREE.Texture();
  const report: Record<string, string> = {};
  for (const body of CAR_BODIES)
    for (const quality of ['high', 'low'] as const) {
      const c = newCar(1, body, 'x');
      c.style.extras = [...CAR_EXTRAS];
      c.style.spoiler = 'wing';
      c.style.glow = '#00ced1';
      c.style.wheels = 'gold';
      const m = carModel({ body, style: c.style, shadowTex: tex, envMap: null, quality });
      let tris = 0;
      let meshes = 0;
      m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        const g = mesh.geometry;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      });
      report[`${body}/${quality}`] = `${tris} tris, ${meshes} meshes`;
      m.dispose();
    }
  Object.assign(window, { trisReport: report });
  console.log(JSON.stringify(report));
}
