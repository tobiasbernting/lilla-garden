// Rallyvärlden's garage window, opened at the garage on the farm: your cars (buy, tune, repair, rename, sell),
// styling the car you drive with a live 3D preview, racing alone or with the family through the lobby, free
// roam, and the family's best times. Races and drives open in the arcade overlay (packages/arcade) with a
// RallyOptions; this window hides meanwhile and comes back when the game closes.
//
// Everything that costs kr is the server's to decide: the window shows prices from the shared formulas and
// sends one message per action. Until the server has made the player's garage (`me.garage` undefined) the
// window shows "Garaget öppnar…" and asks for nothing.
import { loadRallyPreview, openArcade, type ArcadeHandle, type RallyMode, type RallyNet, type RallyOptions, type RemoteRacer } from '@lilla-garden/arcade';
import {
  CAR_BODIES,
  CAR_BODY_DEFS,
  CAR_DECALS,
  CAR_DRIVERS,
  CAR_EXTRAS,
  CAR_FINISHES,
  CAR_HORNS,
  CAR_LIVERIES,
  CAR_NAME_MAX,
  CAR_PAINTS,
  CAR_PARTS,
  CAR_SMOKES,
  CAR_SPOILERS,
  CAR_WHEELS,
  DECAL_SLOTS,
  MAX_AI,
  MAX_CARS,
  MAX_LAPS,
  MAX_RACERS,
  PART_MAX_LEVEL,
  PART_PRICES,
  PLATE_MAX,
  RALLY_COURSES,
  RALLY_COURSE_DEFS,
  RALLY_DIFFICULTIES,
  RALLY_TIMES,
  RALLY_WEATHERS,
  ROAM_COINS_PER_DAY,
  ROAM_COIN_KR,
  STYLE_PRICES,
  carStars,
  defaultRules,
  emptyParts,
  newCar,
  raceMedal,
  racePrize,
  repairCost,
  sellPrice,
  type CarBody,
  type CarDecal,
  type CarExtra,
  type CarPart,
  type CarSnap,
  type CarStyle,
  type ClientMsg,
  type DecalSlot,
  type GarageCar,
  type GarageState,
  type PlayerState,
  type RaceResultLine,
  type RaceRules,
  type RallyCourse,
  type RoomInfo,
  type ServerMsg,
} from '@lilla-garden/shared';
import { net } from '../net.ts';
import { hushAmbience, isMuted, SFX, tone } from '../sound.ts';
import { bus, client, myPlayer, serverNow } from '../state.ts';
import { colorOf, isArcadeOpen } from './arcade.ts';
import { clear, h, onTap } from './dom.ts';
import './rally.css';

type CarPreview = ReturnType<Awaited<ReturnType<typeof loadRallyPreview>>['mountCarPreview']>;
type RallyMsg = Extract<ServerMsg, { t: 'race' | 'roam' }>;
type Tab = 'garage' | 'style' | 'race' | 'roam' | 'top';
type StyleGroup = 'paint' | 'stickers' | 'wheels' | 'extras' | 'driver';
type Medal = 'gold' | 'silver' | 'bronze' | null;

// ---------------------------------------------------------------------------
// Swedish strings (kept here until they move to sv.ts)
// ---------------------------------------------------------------------------

const S = {
  title: 'Rallyvärlden',
  opening: 'Garaget öppnar…',
  openingText: 'Mekanikern letar fram nycklarna. Vänta en liten stund!',
  tabs: { garage: '🔧 Garaget', style: '🎨 Stil', race: '🏁 Tävla', roam: '🌾 Åk fritt', top: '🏆 Topplista' } as Record<Tab, string>,
  yourCars: 'Dina bilar',
  drive: '🚗 Kör den här',
  driving: '✓ Du kör den här',
  repair: '🔧 Laga',
  repaired: '✨ Hel och fin',
  damage: 'Skador',
  rename: '✏️',
  renameTitle: 'Byt namn',
  sell: '💰 Sälj',
  sellAsk: 'Sälja {name} för {kr} kr?',
  sellYes: 'Ja, sälj',
  no: 'Nej',
  ok: 'OK',
  lastCar: 'Din enda bil kan inte säljas',
  tune: '🔩 Trimma {name}',
  level: 'Nivå {n}',
  max: 'Max ✓',
  buyTitle: '🛒 Köp en ny bil',
  buyAsk: 'Köpa för {kr} kr?',
  buyYes: 'Ja, köp!',
  free: 'Gratis',
  full: `Garaget är fullt ({max} bilar). Sälj en bil för att få plats.`,
  poor: 'För lite pengar',
  racesWins: '{races} lopp · {wins} vinster',
  styleOf: 'Stil för {name}',
  night: '🌙 Natt',
  day: '☀️ Dag',
  changes: 'Ändringar',
  nothing: 'Tryck på en färg eller sak för att prova',
  undo: '↩ Ångra',
  save: '💾 Spara',
  tooPoor: 'Du har inte råd',
  groups: { paint: '🎨 Färg', stickers: '⭐ Dekaler', wheels: '🛞 Hjul', extras: '✨ Extra', driver: '🐮 Förare' } as Record<StyleGroup, string>,
  paint: 'Lack',
  paint2: 'Andra färgen',
  finish: 'Yta',
  livery: 'Mönster',
  slot: { hood: 'Motorhuven', roof: 'Taket', doors: 'Dörrarna', back: 'Bak' } as Record<DecalSlot, string>,
  number: 'Nummer',
  wheels: 'Fälgar',
  rimColor: 'Fälgfärg',
  spoiler: 'Spoiler',
  extras: 'Tillbehör',
  horn: 'Tuta (tryck för att lyssna)',
  glow: 'Underglöd (syns i mörker)',
  noGlow: '🚫 Inget',
  smoke: 'Rök och turboflamma',
  driver: 'Vem kör?',
  plate: 'Registreringsskylt',
  platePh: 'ABC 123',
  solo: '🤖 Mot datorn',
  online: '👪 Med familjen',
  course: 'Bana',
  laps: 'Varv',
  dmgRule: 'Bucklor',
  aiRule: 'Datorbilar',
  diffRule: 'Svårighet',
  timeRule: 'Tid på dygnet',
  weatherRule: 'Väder',
  nitroRule: 'Nitro',
  pickupsRule: 'Turboplattor och lera',
  sameRule: 'Lika bilar för alla',
  on: 'På',
  off: 'Av',
  prizeUpTo: 'Vinst: upp till {kr} kr',
  start: '🏁 Starta loppet',
  timetrial: '⏱️ Tidskörning',
  timetrialText: 'Ensam på banan mot klockan',
  record: 'Ditt rekord: {time}',
  noRecord: 'Inget rekord än på {laps} varv',
  rooms: 'Lopp att gå med i',
  noRooms: 'Inga lopp just nu. Skapa ett så kan familjen gå med!',
  create: '➕ Skapa lopp',
  createGo: '✅ Skapa',
  back: '← Tillbaka',
  join: 'Gå med',
  full2: 'Fullt',
  racingNow: 'Kör just nu',
  hostOf: '{name}s lopp',
  members: 'Förare ({n}/{max})',
  ready: '✅ Redo',
  notReady: '⏳ Väntar',
  readyBtn: '✋ Jag är redo!',
  unreadyBtn: '✋ Inte redo',
  startRace: '🚦 Starta',
  waitAll: 'Alla måste vara redo',
  leave: '🚪 Lämna',
  host: '👑',
  hostRules: 'Den som skapade loppet väljer reglerna',
  raceOn: 'Loppet är igång…',
  results: '🏁 Resultat',
  dnf: 'Kom inte i mål',
  roamTitle: 'Åk runt på landet!',
  roamText: 'Kör var du vill runt gården. Hitta mynt, hoppa på hopp, sladda i sladdzonerna och krossa höbalar. Familjen som också är ute syns på vägarna.',
  roamCoins: '🪙 Mynt i dag: {n} av {max} ({kr} kr styck)',
  roamGo: '🚗💨 Ut och kör!',
  topTitle: 'Familjens bästa tider på {laps} varv',
  topEmpty: 'Ingen har kört här än',
  goToast: '🚦 Loppet börjar!',
  helpLine: 'I Garaget på gården köper och målar du rallybilar och trimmar dem. Kör mot datorn eller mot familjen, eller åk fritt på landet och leta mynt. Bucklor lagar du i garaget för kr.',
};

/** Sets CSS custom properties (a style object can't). */
const vars = <E extends HTMLElement>(el: E, v: Record<string, string>): E => {
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val);
  return el;
};

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

/** One line for the help screen's minigame topic (ui/menus.ts). */
export const RALLY_HELP_LINE = S.helpLine;

const BODY: Record<CarBody, { emoji: string; name: string; text: string }> = {
  hatch: { emoji: '🚗', name: 'Rallybilen', text: 'Snäll och lätt att köra' },
  buggy: { emoji: '🚙', name: 'Buggyn', text: 'Lätt och greppig, älskar grus' },
  pickup: { emoji: '🛻', name: 'Pickupen', text: 'Stark och tålig' },
  coupe: { emoji: '🏎️', name: 'Sportbilen', text: 'Snabbast av alla' },
  monster: { emoji: '🛞', name: 'Monstertrucken', text: 'Jättestor och nästan obucklig' },
};
const PART: Record<CarPart, { emoji: string; name: string; text: string }> = {
  engine: { emoji: '⚙️', name: 'Motor', text: 'Mer fart' },
  tyres: { emoji: '🛞', name: 'Däck', text: 'Bättre grepp' },
  suspension: { emoji: '🌀', name: 'Fjädring', text: 'Lättare att styra' },
  brakes: { emoji: '🛑', name: 'Bromsar', text: 'Stannar fortare' },
  turbo: { emoji: '🔥', name: 'Turbo', text: 'En nitro till per lopp' },
  armour: { emoji: '🛡️', name: 'Pansar', text: 'Tål mer smällar' },
};
const STARS: { k: keyof ReturnType<typeof carStars>; label: string }[] = [
  { k: 'speed', label: '⚡ Fart' },
  { k: 'grip', label: '🛞 Grepp' },
  { k: 'handling', label: '🎯 Styrning' },
  { k: 'tough', label: '🛡️ Tålighet' },
];
const COURSE: Record<RallyCourse, { name: string }> = {
  farm: { name: 'Gårdsbanan' },
  forest: { name: 'Skogsbanan' },
  ice: { name: 'Isbanan' },
  beach: { name: 'Strandbanan' },
  city: { name: 'Stadsbanan' },
};
const SURFACE: Record<string, string> = { asphalt: 'Asfalt', gravel: 'Grus', snow: 'Snö och is', sand: 'Sand' };
const DIFF: Record<string, string> = { easy: '🐢 Lätt', normal: '🐇 Lagom', hard: '🐆 Svår' };
const TIME: Record<string, string> = { day: '☀️ Dag', sunset: '🌅 Kväll', night: '🌙 Natt' };
const WEATHER: Record<string, string> = { clear: '☀️ Klart', rain: '🌧️ Regn' };
const FINISH: Record<string, string> = { gloss: '✨ Blank', matte: '🧱 Matt', metallic: '💎 Metallic' };
const LIVERY: Record<string, string> = {
  none: '🚫 Inget',
  stripe: '➖ Rand',
  stripes2: '🟰 Dubbelrand',
  flames: '🔥 Flammor',
  checker: '🏁 Rutigt',
  dots: '⚪ Prickar',
  zigzag: '〰️ Sicksack',
  stars: '⭐ Stjärnor',
  hearts: '💖 Hjärtan',
  camo: '🌿 Kamouflage',
  lightning: '⚡ Blixtar',
  rainbow: '🌈 Regnbåge',
};
const DECAL: Record<CarDecal, string> = {
  number: '#️⃣',
  star: '⭐',
  heart: '❤️',
  flame: '🔥',
  lightning: '⚡',
  flower: '🌸',
  rainbow: '🌈',
  paw: '🐾',
  cow: '🐮',
  hen: '🐔',
  pig: '🐷',
  sheep: '🐑',
  crown: '👑',
  smiley: '😊',
  flag: '🏁',
  strawberry: '🍓',
};
const WHEELS: Record<string, string> = { steel: '⚙️ Stål', sport: '🌟 Sport', offroad: '🪨 Terräng', star: '⭐ Stjärna', gold: '🥇 Guld' };
const SPOILER: Record<string, string> = { none: '🚫 Ingen', small: '▁ Liten', big: '▃ Stor', wing: '🪽 Vinge' };
const EXTRA: Record<CarExtra, string> = {
  roofrack: '🧳 Takräcke',
  lightbar: '💡 Ljusramp',
  flag: '🚩 Flagga',
  bullbar: '🦬 Frontbåge',
  exhaust2: '💨 Dubbla avgasrör',
  antenna: '📡 Antenn',
  sideskirts: '📏 Sidokjolar',
  snorkel: '🤿 Snorkel',
  antlers: '🦌 Älghorn',
  ears: '🐰 Öron',
  horsetail: '🐴 Hästsvans',
};
const HORN: Record<string, string> = { beep: '📯 Pip-pip', tune: '🎵 Melodi', cow: '🐮 Mu', duck: '🦆 Kvack', train: '🚂 Tåg', honk: '📢 Tuta' };
const DRIVER: Record<string, string> = { human: '🧑 Du', cow: '🐮 Ko', horse: '🐴 Häst', pig: '🐷 Gris', rooster: '🐓 Tupp', sheep: '🐑 Får', dog: '🐶 Hund', cat: '🐱 Katt' };
const SMOKE: Record<string, string> = { white: '☁️ Vit', rainbow: '🌈 Regnbåge', hearts: '💕 Hjärtan', hay: '🌾 Hö', pink: '🩷 Rosa', blue: '💙 Blå', gold: '💛 Guld' };
const MEDAL: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

/** 1:02,3 */
export function fmtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')},${t % 10}`;
}

/** Horn previews with the farm game's synthesiser (the race has the real ones). */
const HORN_SFX: Record<string, () => void> = {
  beep: () => {
    tone(620, 0.1, 'square', 0.06);
    setTimeout(() => tone(620, 0.12, 'square', 0.06), 150);
  },
  tune: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.05), i * 120)),
  cow: () => tone(190, 0.6, 'sawtooth', 0.06, -70),
  duck: () => {
    tone(760, 0.12, 'square', 0.05, -320);
    setTimeout(() => tone(740, 0.14, 'square', 0.05, -320), 170);
  },
  train: () => [311, 370, 466].forEach((f) => tone(f, 0.7, 'sawtooth', 0.035)),
  honk: () => SFX.honk(),
};

// ---------------------------------------------------------------------------
// Style changes and their price
// ---------------------------------------------------------------------------

const sortedExtras = (e: readonly CarExtra[]): string => [...e].sort().join(',');
const decalKey = (d: CarStyle['decals']): string => DECAL_SLOTS.map((s) => d[s] ?? '').join(',');

/** Is this style field the same in both? (decals per slot, extras in any order) */
function sameField(k: keyof CarStyle, a: CarStyle, b: Partial<CarStyle>): boolean {
  if (!(k in b)) return true;
  if (k === 'decals') return decalKey(a.decals) === decalKey(b.decals ?? {});
  if (k === 'extras') return sortedExtras(a.extras) === sortedExtras(b.extras ?? []);
  return a[k] === b[k];
}

/** Only the fields of `draft` that differ from the car's style (what goes to the server). */
function changedStyle(style: CarStyle, draft: Partial<CarStyle>): Partial<CarStyle> {
  const out: Partial<CarStyle> = {};
  for (const k of Object.keys(draft) as (keyof CarStyle)[]) if (!sameField(k, style, draft)) (out as Record<string, unknown>)[k] = draft[k];
  return out;
}

/**
 * What the changes cost, from STYLE_PRICES: each changed field its price, each sticker slot given a new sticker
 * `decal`, each extra bolted on `extra`, a new underglow colour `glow`. Taking things off is free.
 */
export function styleCost(style: CarStyle, changes: Partial<CarStyle>): number {
  let kr = 0;
  for (const k of Object.keys(changes) as (keyof CarStyle)[]) {
    if (k === 'decals') {
      const d = changes.decals ?? {};
      for (const s of DECAL_SLOTS) if (d[s] && d[s] !== style.decals[s]) kr += STYLE_PRICES.decal;
    } else if (k === 'extras') {
      for (const e of changes.extras ?? []) if (!style.extras.includes(e)) kr += STYLE_PRICES.extra;
    } else if (k === 'glow') {
      if (changes.glow) kr += STYLE_PRICES.glow;
    } else kr += STYLE_PRICES[k];
  }
  return kr;
}

const activeCar = (g: GarageState | undefined): GarageCar | undefined => (g ? (g.cars.find((c) => c.id === g.active) ?? g.cars[0]) : undefined);
const raceKey = (r: { course: RallyCourse; laps: number }): string => `${r.course}:${r.laps}`;

// ---------------------------------------------------------------------------
// Dev only: ?rallyfake=1 fills the garage locally (two styled cars, rooms) to try the window without the server
// ---------------------------------------------------------------------------

const FAKE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('rallyfake');
let fakeGarage: GarageState | null = null;
let fakeRooms: RoomInfo[] = [];

function makeFake(): GarageState {
  const a = newCar(1, 'hatch', 'Blixten', '#e8412c');
  a.style = { ...a.style, livery: 'stripe', paint2: '#f4c20d', decals: { hood: 'number', doors: 'star' }, number: 7, wheels: 'sport', spoiler: 'small', extras: ['roofrack'], glow: '#18b7c9', driver: 'cow', plate: 'MU 123' };
  a.parts = { ...emptyParts(), engine: 1, tyres: 2, turbo: 1 };
  a.damage = 35;
  a.races = 6;
  a.wins = 2;
  const b = newCar(2, 'monster', 'Monstret', '#8a4fd8');
  b.style = { ...b.style, livery: 'flames', paint2: '#ff8a1f', finish: 'metallic', wheels: 'offroad', extras: ['lightbar', 'bullbar'], driver: 'pig', smoke: 'rainbow' };
  b.parts = { ...emptyParts(), armour: 3, engine: 2 };
  return { cars: [a, b], active: 1, nextId: 3, best: { 'farm:3': 189_400, 'forest:3': 201_800, 'ice:1': 57_300, 'city:3': 260_000 }, roamDay: client.day, roamCoins: 12 };
}

function fakeMember(id: string, name: string, body: CarBody, paint: string, ready: boolean): RoomInfo['members'][number] {
  return { id, name, car: newCar(1, body, name, paint), ready };
}

/** Puts the fake garage back on the player record (the server's player updates drop it). */
function applyFake(): void {
  const me = myPlayer();
  if (!FAKE || !me) return;
  if (!fakeGarage) {
    fakeGarage = makeFake();
    fakeRooms = [
      { id: 'r1', host: 'fake-mamma', hostName: 'Mamma', rules: { ...defaultRules(), course: 'forest' }, phase: 'lobby', members: [fakeMember('fake-mamma', 'Mamma', 'coupe', '#2f6fe0', true), fakeMember('fake-lisa', 'Lisa', 'buggy', '#f06ba8', false)], seed: 1 },
      { id: 'r2', host: 'fake-pappa', hostName: 'Pappa', rules: { ...defaultRules(), course: 'ice', laps: 2 }, phase: 'racing', members: [fakeMember('fake-pappa', 'Pappa', 'pickup', '#2fa84f', true)], seed: 2 },
    ];
  }
  me.garage = fakeGarage;
}

/** The fake server: garage actions change the fake garage, the lobby answers with fake rooms. */
function fakeSend(msg: ClientMsg, emit: (m: RallyMsg) => void): void {
  const me = myPlayer();
  const g = fakeGarage;
  if (!me || !g) return;
  if (msg.t !== 'race' || msg.a !== 'snap') console.info('[rally fake] sent', JSON.stringify(msg));
  const car = 'car' in msg && typeof msg.car === 'number' ? g.cars.find((c) => c.id === msg.car) : undefined;
  if (msg.t === 'garage') {
    if (msg.a === 'select' && car) g.active = car.id;
    else if (msg.a === 'buyCar' && me.coins >= CAR_BODY_DEFS[msg.body].price && g.cars.length < MAX_CARS) {
      me.coins -= CAR_BODY_DEFS[msg.body].price;
      g.cars.push(newCar(g.nextId++, msg.body, BODY[msg.body].name));
    } else if (msg.a === 'style' && car) {
      me.coins -= styleCost(car.style, msg.style);
      car.style = { ...car.style, ...msg.style };
    } else if (msg.a === 'repair' && car) {
      me.coins -= repairCost(car);
      car.damage = 0;
    } else if (msg.a === 'rename' && car) car.name = msg.name.slice(0, CAR_NAME_MAX);
    else if (msg.a === 'sell' && car && g.cars.length > 1) {
      me.coins += sellPrice(car);
      g.cars = g.cars.filter((c) => c !== car);
      if (g.active === car.id) g.active = g.cars[0]!.id;
    } else if (msg.a === 'part' && car) {
      const lv = car.parts[msg.part];
      if (lv < PART_MAX_LEVEL) {
        me.coins -= PART_PRICES[msg.part][lv]!;
        car.parts[msg.part] = lv + 1;
      }
    }
    bus.emit('me', undefined);
    return;
  }
  if (msg.t !== 'race') return;
  const mine = (): RoomInfo | undefined => fakeRooms.find((r) => r.members.some((m) => m.id === client.me));
  const meMember = (): RoomInfo['members'][number] => ({ id: client.me, name: me.name, car: activeCar(g)!, ready: false });
  if (msg.a === 'rooms') emit({ t: 'race', ev: 'rooms', rooms: fakeRooms });
  else if (msg.a === 'create') {
    const r: RoomInfo = { id: `r${fakeRooms.length + 1}`, host: client.me, hostName: me.name, rules: msg.rules, phase: 'lobby', members: [meMember(), fakeMember('fake-lisa', 'Lisa', 'buggy', '#f06ba8', true)], seed: 7 };
    fakeRooms.push(r);
    emit({ t: 'race', ev: 'room', room: r });
  } else if (msg.a === 'join') {
    const r = fakeRooms.find((x) => x.id === msg.room);
    if (r) {
      r.members.push(meMember());
      emit({ t: 'race', ev: 'room', room: r });
    }
  } else if (msg.a === 'leave') {
    const r = mine();
    if (r) r.members = r.members.filter((m) => m.id !== client.me);
    fakeRooms = fakeRooms.filter((x) => x.members.length > 0 && x.members.some((m) => !m.id.startsWith('fake-') || x.host !== client.me));
    emit({ t: 'race', ev: 'room', room: null });
  } else if (msg.a === 'ready' || msg.a === 'rules') {
    const r = mine();
    if (!r) return;
    if (msg.a === 'ready') r.members.find((m) => m.id === client.me)!.ready = msg.ready;
    else r.rules = msg.rules;
    emit({ t: 'race', ev: 'room', room: r });
  } else if (msg.a === 'start') {
    const r = mine();
    if (!r) return;
    r.phase = 'countdown';
    r.startAt = serverNow() + 5000;
    emit({ t: 'race', ev: 'go', room: r });
  }
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

/** What is going on in the game the garage opened (to report it when it closes). */
interface Run {
  mode: RallyMode;
  rules: RaceRules;
  room?: string;
  /** I crossed the line (online) or the game reported the end (solo, roam). */
  finished: boolean;
  reported: boolean;
  damage: number;
}

type Fn<A extends unknown[]> = (...a: A) => void;

export class RallyUi {
  /** Called when the window opens or closes (the farm stops reading keys and taps meanwhile). */
  onChange: (open: boolean) => void = () => {};

  private modal: HTMLElement | null = null;
  private tab: Tab = 'garage';
  private group: StyleGroup = 'paint';
  /** Stil: changes not saved yet, for the car `draftCar`. */
  private draft: Partial<CarStyle> = {};
  private draftCar = -1;
  private preview: CarPreview | null = null;
  private previewHost: HTMLElement | null = null;
  private previewShown = '';
  private previewToken = 0;
  private previewFailed = false;
  private night = false;
  /** Bits of the style tab updated in place (typing the plate must not redraw the window). */
  private saveBar: HTMLElement | null = null;
  private raceView: 'solo' | 'online' = 'solo';
  private soloRules = defaultRules();
  private newRules = defaultRules();
  private creating = false;
  private rooms: RoomInfo[] = [];
  private room: RoomInfo | null = null;
  private result: { room: string; results: RaceResultLine[] } | null = null;
  private roomsTimer = 0;
  private roamRules: RaceRules = { ...defaultRules(), course: 'farm', ai: 0, laps: 1 };
  private topLaps = 3;
  private renaming: number | null = null;
  private renameText = '';
  private selling: number | null = null;
  private buying: CarBody | null = null;
  private game: ArcadeHandle | null = null;
  private run: Run | null = null;
  /** Free roam: the last list of other drivers (it can come before the game is listening). */
  private roamPeers: RemoteRacer[] | null = null;
  private l = {
    snaps: new Set<Fn<[string, CarSnap[]]>>(),
    finish: new Set<Fn<[string, number]>>(),
    result: new Set<Fn<[RaceResultLine[]]>>(),
    left: new Set<Fn<[string]>>(),
    roamSnap: new Set<Fn<[string, CarSnap]>>(),
    roamPeers: new Set<Fn<[RemoteRacer[]]>>(),
  };

  constructor(
    private ui: HTMLElement,
    /** A race or a drive opened or closed: the farm view pauses meanwhile. */
    private onGame: (open: boolean) => void,
  ) {
    bus.on('open', (c) => {
      if (c.ui === 'rally') this.open();
    });
    bus.on('me', () => {
      applyFake();
      // not while typing a name or a plate (the box would lose its cursor); the next tap redraws
      if (this.modal && !(document.activeElement instanceof HTMLInputElement && this.modal.contains(document.activeElement))) this.render();
    });
    bus.on('welcome', () => applyFake());
    bus.on('player', (id) => {
      if (this.modal && this.tab === 'top' && id !== client.me) this.render();
    });
    bus.on('rally', (m) => this.fromServer(m));
    bus.on('connection', (s) => {
      if (s === 'open') return;
      this.close();
      this.room = null;
    });
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__rallyOpen = (tab?: Tab, sub?: string) => {
        if (tab) this.tab = tab;
        if (sub === 'online' || sub === 'solo') this.raceView = sub;
        if (sub && tab === 'style') this.group = sub as StyleGroup;
        bus.emit('open', { t: 'open', to: client.me, ui: 'rally' });
        if (this.modal) this.render();
      };
    }
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  /** Keys while the window is open: Escape closes it, nothing reaches the farm. */
  key(e: KeyboardEvent): boolean {
    if (!this.modal) return false;
    if (e.key === 'Escape') this.close();
    return true;
  }

  open(tab?: Tab): void {
    if (this.game || isArcadeOpen()) return;
    if (!myPlayer()) return;
    applyFake();
    if (tab) this.tab = tab;
    if (!this.modal) {
      this.modal = h('div', { class: 'modal rl-modal' });
      this.modal.addEventListener('pointerdown', (e) => {
        if (e.target === this.modal) this.close();
      });
      this.ui.append(this.modal);
      this.onChange(true);
    }
    this.render();
  }

  close(): void {
    if (!this.modal) return;
    this.disposePreview();
    this.stopPolling();
    this.renaming = null;
    this.selling = null;
    this.buying = null;
    this.modal.remove();
    this.modal = null;
    this.onChange(false);
  }

  private send(msg: ClientMsg): void {
    if (FAKE && fakeGarage) fakeSend(msg, (m) => setTimeout(() => this.fromServer(m), 60));
    else net.send(msg);
  }

  // ---- the server ----

  private fromServer(m: RallyMsg): void {
    if (m.t === 'roam') {
      if (m.ev === 'peers') {
        const peers = m.peers.filter((p) => p.id !== client.me);
        this.roamPeers = peers;
        this.l.roamPeers.forEach((f) => f(peers));
      } else if (m.ev === 'snap') {
        if (m.from !== client.me) this.l.roamSnap.forEach((f) => f(m.from, m.snap));
      } else this.l.left.forEach((f) => f(m.id));
      return;
    }
    switch (m.ev) {
      case 'rooms':
        this.rooms = m.rooms;
        if (this.modal && this.tab === 'race' && this.raceView === 'online' && !this.room) this.render();
        break;
      case 'room': {
        const before = this.room;
        this.room = m.room;
        if (m.room) this.creating = false;
        // someone gone from the room in the middle of a race: their car leaves the track
        if (before && m.room && before.id === m.room.id && this.run?.room === m.room.id) {
          for (const old of before.members) {
            const now = m.room.members.find((x) => x.id === old.id);
            if (old.id !== client.me && (!now || (now.finish === null && old.finish !== null))) this.l.left.forEach((f) => f(old.id));
          }
        }
        if (this.modal && this.tab === 'race') this.render();
        break;
      }
      case 'go':
        this.room = m.room;
        if (!this.game && m.room.members.some((x) => x.id === client.me)) {
          this.launch('race', m.room.rules, m.room);
          bus.emit('toast', S.goToast);
        }
        break;
      case 'snap':
        if (m.from !== client.me) this.l.snaps.forEach((f) => f(m.from, m.snaps));
        break;
      case 'finish':
        if (m.from !== client.me) this.l.finish.forEach((f) => f(m.from, m.time));
        break;
      case 'result':
        this.result = { room: m.room, results: m.results };
        this.l.result.forEach((f) => f(m.results));
        if (this.modal && this.tab === 'race') this.render();
        break;
    }
  }

  /** The lobby's list, asked for when the tab shows and every 5 s while it does. */
  private syncPolling(): void {
    const want = !!this.modal && this.tab === 'race' && this.raceView === 'online' && !this.room && !!myPlayer()?.garage;
    if (want && !this.roomsTimer) {
      this.send({ t: 'race', a: 'rooms' });
      this.roomsTimer = window.setInterval(() => this.send({ t: 'race', a: 'rooms' }), 5000);
    } else if (!want) this.stopPolling();
  }

  private stopPolling(): void {
    if (this.roomsTimer) clearInterval(this.roomsTimer);
    this.roomsTimer = 0;
  }

  // ---- racing ----

  private rallyNet(): RallyNet {
    const add = <A extends unknown[]>(set: Set<Fn<A>>, cb: Fn<A>): (() => void) => {
      set.add(cb);
      return () => set.delete(cb);
    };
    return {
      sendSnaps: (snaps) => {
        const mine = snaps.find((s) => s.id === client.me);
        if (mine && this.run) this.run.damage = mine.dm;
        this.send({ t: 'race', a: 'snap', snaps });
      },
      onSnaps: (cb) => add(this.l.snaps, cb),
      onFinish: (cb) => add(this.l.finish, cb),
      sendFinish: (time, damage, id, name) => {
        // the host's computer cars over the line: only for the server's result
        if (id !== undefined) {
          this.send({ t: 'race', a: 'finish', time, damage, id, name });
          return;
        }
        if (this.run) {
          this.run.finished = true;
          this.run.damage = damage;
        }
        this.send({ t: 'race', a: 'finish', time, damage });
      },
      onResult: (cb) => add(this.l.result, cb),
      onLeft: (cb) => add(this.l.left, cb),
      onRoamSnap: (cb) => add(this.l.roamSnap, cb),
      onRoamPeers: (cb) => {
        // the answer to 'enter' usually comes while the game is still loading
        if (this.roamPeers) cb(this.roamPeers);
        return add(this.l.roamPeers, cb);
      },
      sendRoamSnap: (snap) => {
        if (this.run) this.run.damage = snap.dm;
        this.send({ t: 'roam', a: 'snap', snap });
      },
      serverNow,
    };
  }

  /** Opens the 3D game for a race, a time trial or a drive; the window comes back when it closes. */
  private launch(mode: RallyMode, rules: RaceRules, room?: RoomInfo): void {
    const me = myPlayer();
    const g = me?.garage;
    const car = activeCar(g);
    if (!me || !g || !car || this.game || isArcadeOpen()) return;
    const back: Tab = mode === 'roam' ? 'roam' : 'race';
    this.close();
    for (const s of Object.values(this.l)) s.clear();
    this.roamPeers = null;
    const run: Run = { mode, rules, room: room?.id, finished: false, reported: false, damage: car.damage };
    this.run = run;
    const options: RallyOptions = {
      mode,
      rules,
      car,
      room,
      me: client.me,
      host: room ? room.host === client.me : undefined,
      net: this.rallyNet(),
      best: g.best[raceKey(rules)],
      roamCoinsLeft: Math.max(0, ROAM_COINS_PER_DAY - (g.roamDay === client.day ? g.roamCoins : 0)),
      onDone: (r) => {
        if (run.reported) return;
        run.reported = true;
        run.finished = true;
        run.damage = r.damage;
        // online races report through the net (finish, then done when the card closes)
        if (run.room) return;
        if (mode === 'roam') this.send({ t: 'roam', a: 'leave', coins: r.coins, damage: r.damage });
        else if (mode === 'timetrial') this.send({ t: 'race', a: 'solo', rules: { ...rules, ai: 0 }, place: 1, n: 1, time: r.time, damage: r.damage });
        else this.send({ t: 'race', a: 'solo', rules, place: r.place, n: r.n, time: r.time, damage: r.damage });
      },
    };
    this.game = openArcade({
      where: 'rally',
      games: ['rally'],
      start: 'rally',
      autostart: true,
      player: { name: me.name, color: colorOf(me) },
      options,
      muted: isMuted,
      scores: () => [],
      best: () => 0,
      onClose: () => {
        this.game = null;
        this.run = null;
        for (const s of Object.values(this.l)) s.clear();
        hushAmbience(false);
        this.onGame(false);
        if (run.room) {
          // over the line: save the car's dents; left before the end: out of the race
          if (run.finished || this.result?.room === run.room) this.send({ t: 'race', a: 'done', damage: run.damage });
          else this.send({ t: 'race', a: 'leave' });
        } else if (mode === 'roam' && !run.reported) this.send({ t: 'roam', a: 'leave', coins: 0, damage: run.damage });
        this.open(back);
      },
    });
    hushAmbience(true);
    this.onGame(true);
  }

  // ---- drawing ----

  private render(): void {
    const modal = this.modal;
    const me = myPlayer();
    if (!modal || !me) return;
    // redrawing keeps where each list was scrolled to
    const scroll = new Map<string, number>();
    modal.querySelectorAll<HTMLElement>('[data-scroll]').forEach((e) => scroll.set(e.dataset.scroll!, e.scrollTop));
    clear(modal);
    this.saveBar = null;
    if (this.tab !== 'style') this.disposePreview();
    const g = me.garage;
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const tabs = h('div', { class: 'tabs rl-tabs' });
    for (const t of Object.keys(S.tabs) as Tab[]) {
      const b = h('button', { class: t === this.tab ? 'on' : '' }, S.tabs[t]);
      onTap(b, () => {
        if (this.tab === t) return;
        this.tab = t;
        this.renaming = this.selling = null;
        this.buying = null;
        this.render();
      });
      tabs.append(b);
    }
    const panel = h(
      'div',
      { class: `panel rl-panel tab-${this.tab}` },
      h('h2', null, h('span', { class: 'rl-flag' }, '🏁'), S.title, tabs, h('span', { class: 'spacer' }), h('div', { class: 'chip rl-kr' }, h('span', { class: 'coins' }, `${me.coins} kr`)), closeBtn),
    );
    const main = h('div', { class: 'rl-main' });
    panel.append(main);
    if (!g && this.tab !== 'top') main.append(h('div', { class: 'rl-opening' }, h('div', { class: 'rl-big' }, '🔧'), h('h3', null, S.opening), h('p', null, S.openingText)));
    else if (this.tab === 'garage') this.renderGarage(main, me, g!);
    else if (this.tab === 'style') this.renderStyle(main, me, g!);
    else if (this.tab === 'race') this.renderRace(main, g!);
    else if (this.tab === 'roam') this.renderRoam(main, g!);
    else this.renderTop(main);
    modal.append(panel);
    modal.querySelectorAll<HTMLElement>('[data-scroll]').forEach((e) => {
      const y = scroll.get(e.dataset.scroll!);
      if (y) e.scrollTop = y;
    });
    if (this.renaming !== null) modal.querySelector<HTMLInputElement>('.rl-rename input')?.focus();
    this.syncPolling();
  }

  /** A scrolling column (the controller's right stick and a finger scroll it). */
  private scroller(key: string, ...kids: (HTMLElement | null)[]): HTMLElement {
    return h('div', { class: 'body rl-scroll', 'data-scroll': key }, ...kids);
  }

  private btn(label: string | Node, fn: () => void, cls = '', disabled = false, title?: string): HTMLButtonElement {
    const b = h('button', { class: cls, disabled, title }, label);
    onTap(b, () => {
      if (!b.disabled) fn();
    });
    return b;
  }

  // ---- Garaget ----

  private renderGarage(main: HTMLElement, me: PlayerState, g: GarageState): void {
    const active = activeCar(g)!;
    const cars = h('div', { class: 'rl-cars' });
    for (const car of g.cars) cars.append(this.carCard(car, car.id === active.id, me, g));
    const tune = h('div', { class: 'rl-parts' });
    for (const p of CAR_PARTS) {
      const lv = active.parts[p] ?? 0;
      const price = lv < PART_MAX_LEVEL ? PART_PRICES[p][lv]! : 0;
      const pips = h('span', { class: 'rl-pips' }, ...Array.from({ length: PART_MAX_LEVEL }, (_, i) => h('i', { class: i < lv ? 'on' : '' })));
      const buy =
        lv >= PART_MAX_LEVEL
          ? h('span', { class: 'rl-max' }, S.max)
          : this.btn(`${fill(S.level, { n: lv + 1 })} · ${price} kr`, () => this.send({ t: 'garage', a: 'part', car: active.id, part: p }), 'rl-buy', me.coins < price, me.coins < price ? S.poor : undefined);
      tune.append(h('div', { class: 'rl-part' }, h('span', { class: 'rl-em' }, PART[p].emoji), h('div', { class: 'rl-col' }, h('b', null, PART[p].name), h('small', null, PART[p].text)), pips, buy));
    }
    const shop = h('div', { class: 'rl-shop' });
    const full = g.cars.length >= MAX_CARS;
    for (const body of CAR_BODIES) {
      const def = CAR_BODY_DEFS[body];
      const poor = me.coins < def.price;
      const asking = this.buying === body;
      const tile = h('div', { class: `rl-body${asking ? ' ask' : ''}${poor || full ? ' dim' : ''}` }, h('span', { class: 'rl-em big' }, BODY[body].emoji), h('b', null, BODY[body].name), h('small', null, BODY[body].text));
      if (asking)
        tile.append(
          h('small', { class: 'rl-ask' }, fill(S.buyAsk, { kr: def.price })),
          h(
            'div',
            { class: 'rl-row' },
            this.btn(S.buyYes, () => {
              this.buying = null;
              this.send({ t: 'garage', a: 'buyCar', body });
            }),
            this.btn(S.no, () => {
              this.buying = null;
              this.render();
            }, 'alt'),
          ),
        );
      else
        tile.append(
          this.btn(def.price ? `${def.price} kr` : S.free, () => {
            this.buying = body;
            this.render();
          }, 'rl-buy', poor || full, poor ? S.poor : undefined),
        );
      shop.append(tile);
    }
    main.append(
      this.scroller(
        'garage',
        h('h3', null, `🚗 ${S.yourCars} (${g.cars.length}/${MAX_CARS})`),
        cars,
        h('h3', null, fill(S.tune, { name: active.name })),
        tune,
        h('h3', null, S.buyTitle),
        full ? h('p', { class: 'rl-note' }, fill(S.full, { max: MAX_CARS })) : null,
        shop,
      ),
    );
  }

  private carCard(car: GarageCar, on: boolean, me: PlayerState, g: GarageState): HTMLElement {
    const st = carStars(car);
    const stars = h('div', { class: 'rl-stars' });
    for (const s of STARS) stars.append(h('span', { class: 'lbl' }, s.label), h('span', { class: 'st' }, h('b', null, '★'.repeat(st[s.k])), '★'.repeat(5 - st[s.k])));
    const dmg = Math.round(car.damage);
    const bar = h('div', { class: 'rl-dmg' }, h('i', { style: { width: `${dmg}%`, background: dmg > 66 ? '#e8473a' : dmg > 33 ? '#f2a33a' : '#f2d33a' } }), h('span', null, dmg > 0 ? `${S.damage} ${dmg} %` : S.repaired));
    const cost = repairCost(car);
    const card = h(
      'div',
      { class: `rl-car${on ? ' on' : ''}` },
      h('div', { class: 'rl-car-top' }, h('span', { class: 'rl-swatch', style: { background: car.style.paint, borderColor: car.style.paint2 } }, BODY[car.body].emoji), h('div', { class: 'rl-col' }, h('b', { class: 'rl-name' }, car.name), h('small', null, `${BODY[car.body].name} · ${fill(S.racesWins, { races: car.races, wins: car.wins })}`))),
      stars,
      bar,
    );
    if (this.renaming === car.id) {
      const input = h('input', { type: 'text', maxlength: String(CAR_NAME_MAX), value: this.renameText, autocomplete: 'off', placeholder: car.name });
      const ok = (): void => {
        const name = input.value.trim().slice(0, CAR_NAME_MAX);
        this.renaming = null;
        if (name && name !== car.name) this.send({ t: 'garage', a: 'rename', car: car.id, name });
        this.render();
      };
      input.addEventListener('input', () => (this.renameText = input.value));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') ok();
        if (e.key === 'Escape') {
          this.renaming = null;
          this.render();
        }
      });
      card.append(h('div', { class: 'rl-rename' }, input, this.btn(S.ok, ok), this.btn('✕', () => ((this.renaming = null), this.render()), 'alt')));
    } else if (this.selling === car.id) {
      card.append(
        h('small', { class: 'rl-ask' }, fill(S.sellAsk, { name: car.name, kr: sellPrice(car) })),
        h(
          'div',
          { class: 'rl-row' },
          this.btn(S.sellYes, () => {
            this.selling = null;
            this.send({ t: 'garage', a: 'sell', car: car.id });
          }, 'danger'),
          this.btn(S.no, () => ((this.selling = null), this.render()), 'alt'),
        ),
      );
    } else {
      card.append(
        on ? h('div', { class: 'rl-driving' }, S.driving) : this.btn(S.drive, () => this.send({ t: 'garage', a: 'select', car: car.id }), 'rl-drive'),
        h(
          'div',
          { class: 'rl-row' },
          this.btn(cost ? `${S.repair} · ${cost} kr` : S.repair, () => this.send({ t: 'garage', a: 'repair', car: car.id }), 'rl-fix', cost === 0 || me.coins < cost, cost && me.coins < cost ? S.poor : undefined),
          this.btn(S.rename, () => {
            this.renaming = car.id;
            this.renameText = car.name;
            this.selling = null;
            this.render();
          }, 'alt', false, S.renameTitle),
          this.btn(S.sell, () => {
            this.selling = car.id;
            this.renaming = null;
            this.render();
          }, 'alt', g.cars.length <= 1, g.cars.length <= 1 ? S.lastCar : undefined),
        ),
      );
    }
    return card;
  }

  // ---- Stil ----

  /** The active car with the changes not saved yet. */
  private styled(car: GarageCar): GarageCar {
    return { ...car, style: { ...car.style, ...this.draft } };
  }

  private set<K extends keyof CarStyle>(k: K, v: CarStyle[K]): void {
    this.draft = { ...this.draft, [k]: v };
    this.render();
  }

  private renderStyle(main: HTMLElement, me: PlayerState, g: GarageState): void {
    const car = activeCar(g)!;
    if (this.draftCar !== car.id) {
      this.draftCar = car.id;
      this.draft = {};
    }
    const look = this.styled(car);
    const s = look.style;
    // the preview: mounted once, moved into each redraw
    if (!this.previewHost) {
      this.previewHost = h('div', { class: 'rl-canvas' });
      this.previewShown = '';
      this.previewFailed = false;
      void this.mountPreview();
    }
    this.showInPreview(look);
    const nightBtn = this.btn(this.night ? S.day : S.night, () => {
      this.night = !this.night;
      this.preview?.night(this.night);
      this.render();
    }, 'rl-night alt');
    const left = h(
      'div',
      { class: `rl-left${this.night ? ' night' : ''}` },
      this.previewHost,
      this.previewFailed || !this.preview ? h('div', { class: 'rl-fallback' }, h('span', { class: 'rl-big', style: { color: s.paint } }, this.previewFailed ? BODY[car.body].emoji : '⏳')) : null,
      h('div', { class: 'rl-left-top' }, h('b', null, car.name), nightBtn),
    );
    // the options, a few groups at a time
    const groups = h('div', { class: 'tabs rl-groups' });
    for (const gr of Object.keys(S.groups) as StyleGroup[]) {
      const b = this.btn(S.groups[gr], () => {
        this.group = gr;
        this.render();
      }, gr === this.group ? 'on' : '');
      groups.append(b);
    }
    const opts = this.scroller(`style-${this.group}`);
    if (this.group === 'paint') {
      opts.append(
        this.section(S.paint, STYLE_PRICES.paint, this.swatches(s.paint, (c) => this.set('paint', c))),
        this.section(S.paint2, STYLE_PRICES.paint2, this.swatches(s.paint2, (c) => this.set('paint2', c))),
        this.section(S.finish, STYLE_PRICES.finish, this.choices(CAR_FINISHES, s.finish, FINISH, (v) => this.set('finish', v))),
        this.section(S.livery, STYLE_PRICES.livery, this.choices(CAR_LIVERIES, s.livery, LIVERY, (v) => this.set('livery', v))),
      );
    } else if (this.group === 'stickers') {
      for (const slot of DECAL_SLOTS) {
        const row = h('div', { class: 'rl-decals' });
        const pick = (d: CarDecal | null): void => {
          const decals = { ...s.decals };
          if (d) decals[slot] = d;
          else delete decals[slot];
          this.set('decals', decals);
        };
        row.append(this.btn('🚫', () => pick(null), `rl-dec${s.decals[slot] ? '' : ' on'}`));
        for (const d of CAR_DECALS) row.append(this.btn(DECAL[d], () => pick(d), `rl-dec${s.decals[slot] === d ? ' on' : ''}`));
        opts.append(this.section(S.slot[slot], STYLE_PRICES.decal, row));
      }
      const num = h(
        'div',
        { class: 'rl-number' },
        this.btn('−', () => this.set('number', s.number <= 1 ? 99 : s.number - 1), 'alt big'),
        h('span', { class: 'rl-num' }, String(s.number)),
        this.btn('+', () => this.set('number', s.number >= 99 ? 1 : s.number + 1), 'alt big'),
      );
      opts.append(this.section(S.number, 0, num));
    } else if (this.group === 'wheels') {
      opts.append(
        this.section(S.wheels, STYLE_PRICES.wheels, this.choices(CAR_WHEELS, s.wheels, WHEELS, (v) => this.set('wheels', v))),
        this.section(S.rimColor, STYLE_PRICES.rimColor, this.swatches(s.rimColor, (c) => this.set('rimColor', c))),
        this.section(S.spoiler, STYLE_PRICES.spoiler, this.choices(CAR_SPOILERS, s.spoiler, SPOILER, (v) => this.set('spoiler', v))),
      );
    } else if (this.group === 'extras') {
      const extras = h('div', { class: 'rl-choices' });
      for (const e of CAR_EXTRAS) {
        const has = s.extras.includes(e);
        extras.append(this.btn(EXTRA[e], () => this.set('extras', has ? s.extras.filter((x) => x !== e) : [...s.extras, e]), `rl-ch${has ? ' on' : ''}`));
      }
      const glow = this.swatches(s.glow ?? '', (c) => this.set('glow', c));
      glow.prepend(this.btn(S.noGlow, () => this.set('glow', null), `rl-ch${s.glow ? '' : ' on'}`));
      opts.append(
        this.section(S.extras, STYLE_PRICES.extra, extras),
        this.section(
          S.horn,
          STYLE_PRICES.horn,
          this.choices(CAR_HORNS, s.horn, HORN, (v) => {
            HORN_SFX[v]?.();
            this.set('horn', v);
          }),
        ),
        this.section(S.glow, STYLE_PRICES.glow, glow),
        this.section(S.smoke, STYLE_PRICES.smoke, this.choices(CAR_SMOKES, s.smoke, SMOKE, (v) => this.set('smoke', v))),
      );
    } else {
      const plate = h('input', { type: 'text', maxlength: String(PLATE_MAX), value: s.plate, placeholder: S.platePh, autocomplete: 'off', class: 'rl-plate' });
      plate.addEventListener('input', () => {
        this.draft = { ...this.draft, plate: plate.value.slice(0, PLATE_MAX) };
        this.showInPreview(this.styled(car));
        this.fillSaveBar(car, me);
      });
      plate.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') plate.blur();
      });
      opts.append(this.section(S.driver, 0, this.choices(CAR_DRIVERS, s.driver, DRIVER, (v) => this.set('driver', v))), this.section(S.plate, 0, plate));
    }
    this.saveBar = h('div', { class: 'rl-save' });
    this.fillSaveBar(car, me);
    main.append(h('div', { class: 'rl-style' }, left, h('div', { class: 'rl-right' }, groups, opts, this.saveBar)));
  }

  /** The price of the changes and the Spara / Ångra buttons. */
  private fillSaveBar(car: GarageCar, me: PlayerState): void {
    const bar = this.saveBar;
    if (!bar) return;
    clear(bar);
    const changes = changedStyle(car.style, this.draft);
    const n = Object.keys(changes).length;
    const kr = styleCost(car.style, changes);
    const poor = kr > me.coins;
    bar.append(
      h('span', { class: `rl-price${poor ? ' poor' : ''}` }, n ? `${S.changes}: ${kr} kr` : S.nothing),
      this.btn(S.undo, () => {
        this.draft = {};
        this.render();
      }, 'alt', !n),
      this.btn(n && kr ? `${S.save} · ${kr} kr` : S.save, () => {
        this.send({ t: 'garage', a: 'style', car: car.id, style: changes });
        // the server's toast says what it cost (or that it could not be afforded)
        this.draft = {};
        SFX.sparkle();
        this.render();
      }, 'rl-savebtn', !n || poor, poor ? S.tooPoor : undefined),
    );
  }

  private section(title: string, price: number, content: HTMLElement): HTMLElement {
    return h('div', { class: 'rl-sec' }, h('div', { class: 'rl-sec-h' }, title, price ? h('small', null, `${price} kr`) : null), content);
  }

  private swatches(on: string, pick: (c: string) => void): HTMLElement {
    const row = h('div', { class: 'rl-swatches' });
    for (const c of CAR_PAINTS) row.append(this.btn('', () => pick(c), `rl-sw${c === on ? ' on' : ''}`, false, c));
    row.querySelectorAll<HTMLElement>('.rl-sw').forEach((b, i) => (b.style.background = CAR_PAINTS[i]!));
    return row;
  }

  private choices<T extends string>(list: readonly T[], on: T, names: Record<string, string>, pick: (v: T) => void): HTMLElement {
    const row = h('div', { class: 'rl-choices' });
    for (const v of list) row.append(this.btn(names[v] ?? v, () => pick(v), `rl-ch${v === on ? ' on' : ''}`));
    return row;
  }

  private async mountPreview(): Promise<void> {
    const token = ++this.previewToken;
    try {
      const { mountCarPreview } = await loadRallyPreview();
      const host = this.previewHost;
      const car = activeCar(myPlayer()?.garage);
      if (token !== this.previewToken || !host || !car) return;
      const look = this.styled(car);
      this.preview = mountCarPreview(host, look, { spin: true });
      this.previewShown = JSON.stringify(look);
      if (this.night) this.preview.night(true);
    } catch (err) {
      console.error(err);
      if (token !== this.previewToken) return;
      this.previewFailed = true;
    }
    if (this.modal && this.tab === 'style') this.render();
  }

  /** Restyles the preview when the car changed (each redraw would otherwise build the model again). */
  private showInPreview(car: GarageCar): void {
    const key = JSON.stringify(car);
    if (!this.preview || key === this.previewShown) return;
    this.previewShown = key;
    try {
      this.preview.update(car);
      if (this.night) this.preview.night(true);
    } catch (err) {
      console.error(err);
    }
  }

  private disposePreview(): void {
    this.previewToken++;
    try {
      this.preview?.dispose();
    } catch (err) {
      console.error(err);
    }
    this.preview = null;
    this.previewHost = null;
    this.previewShown = '';
  }

  // ---- Tävla ----

  private renderRace(main: HTMLElement, g: GarageState): void {
    const sw = h(
      'div',
      { class: 'rl-switch' },
      this.btn(S.solo, () => {
        this.raceView = 'solo';
        this.render();
      }, this.raceView === 'solo' ? 'on' : 'alt'),
      this.btn(S.online, () => {
        this.raceView = 'online';
        this.render();
      }, this.raceView === 'online' ? 'on' : 'alt'),
    );
    main.append(sw);
    if (this.raceView === 'solo') {
      const r = this.soloRules;
      const best = g.best[raceKey(r)];
      const medal: Medal = best ? raceMedal(r.course, r.laps, best) : null;
      const go = h(
        'div',
        { class: 'rl-go' },
        h('span', { class: 'rl-rec' }, best ? fill(S.record, { time: `${fmtTime(best)} ${medal ? MEDAL[medal] : ''}` }) : fill(S.noRecord, { laps: r.laps })),
        h('span', { class: 'rl-prize' }, fill(S.prizeUpTo, { kr: racePrize(r, 1, r.ai + 1) })),
        this.btn(S.timetrial, () => this.launch('timetrial', { ...r, ai: 0 }), 'alt', false, S.timetrialText),
        this.btn(S.start, () => this.launch('race', r), 'rl-start'),
      );
      main.append(this.scroller('solo', this.rulesForm(r, (n) => ((this.soloRules = n), this.render()), false)), go);
      return;
    }
    if (this.room) return this.renderRoom(main, this.room);
    if (this.creating) {
      const r = this.newRules;
      main.append(
        this.scroller('create', this.rulesForm(r, (n) => ((this.newRules = n), this.render()), true)),
        h(
          'div',
          { class: 'rl-go' },
          h('span', { class: 'rl-prize' }, fill(S.prizeUpTo, { kr: racePrize(r, 1, r.ai + 2) })),
          this.btn(S.back, () => ((this.creating = false), this.render()), 'alt'),
          this.btn(S.createGo, () => this.send({ t: 'race', a: 'create', rules: r }), 'rl-start'),
        ),
      );
      return;
    }
    const list = h('div', { class: 'rl-rooms' });
    for (const room of this.rooms) {
      const c = RALLY_COURSE_DEFS[room.rules.course];
      const open = room.phase === 'lobby' && room.members.length < MAX_RACERS;
      const what = `${COURSE[room.rules.course].name} · ${room.rules.laps} ${S.laps.toLowerCase()} · ${room.members.map((m) => m.name).join(', ')}`;
      const row = h(
        'div',
        { class: 'rl-room' },
        h('span', { class: 'rl-em big' }, c.emoji),
        h('div', { class: 'rl-col' }, h('b', null, fill(S.hostOf, { name: room.hostName })), h('small', null, what)),
        h('span', { class: 'rl-count' }, `👤 ${room.members.length}/${MAX_RACERS}`),
        open ? this.btn(S.join, () => this.send({ t: 'race', a: 'join', room: room.id }), 'rl-join') : h('span', { class: 'rl-tag' }, room.phase === 'lobby' ? S.full2 : S.racingNow),
      );
      list.append(vars(row, { '--c': c.color }));
    }
    if (!this.rooms.length) list.append(h('p', { class: 'rl-note' }, S.noRooms));
    main.append(
      this.scroller('rooms', h('h3', null, S.rooms), list),
      h(
        'div',
        { class: 'rl-go' },
        this.btn(S.create, () => {
          this.creating = true;
          this.newRules = { ...this.soloRules };
          this.render();
        }, 'rl-start'),
      ),
    );
  }

  private renderRoom(main: HTMLElement, room: RoomInfo): void {
    const host = room.host === client.me;
    const mine = room.members.find((m) => m.id === client.me);
    const lobby = room.phase === 'lobby';
    const c = RALLY_COURSE_DEFS[room.rules.course];
    const members = h('div', { class: 'rl-members' });
    for (const m of room.members)
      members.append(
        h(
          'div',
          { class: `rl-member${m.id === client.me ? ' me' : ''}` },
          h('span', { class: 'rl-swatch small', style: { background: m.car.style.paint, borderColor: m.car.style.paint2 } }, BODY[m.car.body].emoji),
          h('div', { class: 'rl-col' }, h('b', null, `${m.id === room.host ? S.host + ' ' : ''}${m.name}`), h('small', null, m.car.name)),
          h('span', { class: `rl-ready${m.ready ? ' on' : ''}` }, m.ready ? S.ready : S.notReady),
        ),
      );
    const res = this.result?.room === room.id ? this.resultTable(this.result.results) : null;
    const rules = host && lobby ? this.rulesForm(room.rules, (n) => this.send({ t: 'race', a: 'rules', rules: n }), true) : this.rulesSummary(room.rules);
    const allReady = room.members.length > 0 && room.members.every((m) => m.ready);
    const left = h('div', { class: 'rl-roomside' }, h('h3', null, `${c.emoji} ${fill(S.hostOf, { name: room.hostName })}`), h('div', { class: 'rl-sub' }, fill(S.members, { n: room.members.length, max: MAX_RACERS })), members);
    const right = this.scroller('room', res, h('h3', null, `📋 ${S.course}`), host ? null : h('p', { class: 'rl-note' }, S.hostRules), rules);
    const bar = h(
      'div',
      { class: 'rl-go' },
      room.phase === 'countdown' || room.phase === 'racing' ? h('span', { class: 'rl-rec' }, S.raceOn) : null,
      this.btn(S.leave, () => this.send({ t: 'race', a: 'leave' }), 'alt'),
      lobby && mine ? this.btn(mine.ready ? S.unreadyBtn : S.readyBtn, () => this.send({ t: 'race', a: 'ready', ready: !mine.ready }), mine.ready ? 'alt' : '') : null,
      host && lobby ? this.btn(S.startRace, () => this.send({ t: 'race', a: 'start' }), 'rl-start', !allReady, allReady ? undefined : S.waitAll) : null,
    );
    main.append(vars(h('div', { class: 'rl-roomview' }, left, right), { '--c': c.color }), bar);
  }

  private resultTable(results: RaceResultLine[]): HTMLElement {
    const t = h('div', { class: 'rl-results' }, h('h3', null, S.results));
    for (const r of [...results].sort((a, b) => a.place - b.place))
      t.append(
        h(
          'div',
          { class: `rl-res${r.id === client.me ? ' me' : ''}` },
          h('span', { class: 'pl' }, r.time === null ? '–' : `${r.place}.`),
          h('span', { class: 'nm' }, r.name),
          h('span', { class: 'tm' }, r.time === null ? S.dnf : fmtTime(r.time)),
          h('span', { class: 'md' }, r.medal ? MEDAL[r.medal] : ''),
          h('span', { class: 'kr' }, `+${r.prize} kr`),
        ),
      );
    return t;
  }

  /** The rules as cards and toggles; `online` adds "same cars". */
  private rulesForm(r: RaceRules, change: (r: RaceRules) => void, online: boolean): HTMLElement {
    const set = <K extends keyof RaceRules>(k: K, v: RaceRules[K]): void => change({ ...r, [k]: v });
    const courses = h('div', { class: 'rl-courses' });
    for (const id of RALLY_COURSES) {
      const d = RALLY_COURSE_DEFS[id];
      const b = this.btn(h('span', null, h('span', { class: 'rl-em big' }, d.emoji), h('b', null, COURSE[id].name), h('small', null, SURFACE[d.surface])), () => set('course', id), `rl-course${r.course === id ? ' on' : ''}`);
      b.style.setProperty('--c', d.color);
      courses.append(b);
    }
    const seg = <T extends string | number>(list: readonly T[], on: T, label: (v: T) => string, pick: (v: T) => void): HTMLElement =>
      h('div', { class: 'rl-seg' }, ...list.map((v) => this.btn(label(v), () => pick(v), v === on ? 'on' : 'alt')));
    const toggle = (on: boolean, pick: (v: boolean) => void): HTMLElement => seg([true, false].map(String), String(on), (v) => (v === 'true' ? `✅ ${S.on}` : `⬜ ${S.off}`), (v) => pick(v === 'true'));
    const laps = Array.from({ length: MAX_LAPS }, (_, i) => i + 1);
    const ais = Array.from({ length: MAX_AI + 1 }, (_, i) => i);
    const row = (label: string, el: HTMLElement): HTMLElement => h('div', { class: 'rl-rule' }, h('span', { class: 'lbl' }, label), el);
    return h(
      'div',
      { class: 'rl-form' },
      courses,
      h(
        'div',
        { class: 'rl-rules' },
        row(`🔁 ${S.laps}`, seg(laps, r.laps, String, (v) => set('laps', v))),
        row(`🤖 ${S.aiRule}`, seg(ais, r.ai, String, (v) => set('ai', v))),
        row(`🎚️ ${S.diffRule}`, seg(RALLY_DIFFICULTIES, r.difficulty, (v) => DIFF[v]!, (v) => set('difficulty', v))),
        row(`🕒 ${S.timeRule}`, seg(RALLY_TIMES, r.time, (v) => TIME[v]!, (v) => set('time', v))),
        row(`🌦️ ${S.weatherRule}`, seg(RALLY_WEATHERS, r.weather, (v) => WEATHER[v]!, (v) => set('weather', v))),
        row(`💥 ${S.dmgRule}`, toggle(r.damage, (v) => set('damage', v))),
        row(`🔥 ${S.nitroRule}`, toggle(r.nitro, (v) => set('nitro', v))),
        row(`⚡ ${S.pickupsRule}`, toggle(r.pickups, (v) => set('pickups', v))),
        online ? row(`⚖️ ${S.sameRule}`, toggle(r.sameCars, (v) => set('sameCars', v))) : null,
      ),
    );
  }

  private rulesSummary(r: RaceRules): HTMLElement {
    const d = RALLY_COURSE_DEFS[r.course];
    const chip = (t: string): HTMLElement => h('span', { class: 'rl-pill' }, t);
    return h(
      'div',
      { class: 'rl-summary' },
      chip(`${d.emoji} ${COURSE[r.course].name}`),
      chip(`🔁 ${r.laps} ${S.laps.toLowerCase()}`),
      chip(`🤖 ${r.ai}`),
      chip(DIFF[r.difficulty]!),
      chip(TIME[r.time]!),
      chip(WEATHER[r.weather]!),
      chip(`💥 ${S.dmgRule}: ${r.damage ? S.on : S.off}`),
      chip(`🔥 ${S.nitroRule}: ${r.nitro ? S.on : S.off}`),
      chip(`⚡ ${r.pickups ? S.on : S.off}`),
      r.sameCars ? chip(`⚖️ ${S.sameRule}`) : null,
    );
  }

  // ---- Åk fritt ----

  private renderRoam(main: HTMLElement, g: GarageState): void {
    const coins = g.roamDay === client.day ? g.roamCoins : 0;
    const r = this.roamRules;
    const seg = <T extends string>(list: readonly T[], on: T, names: Record<string, string>, pick: (v: T) => void): HTMLElement =>
      h('div', { class: 'rl-seg' }, ...list.map((v) => this.btn(names[v] ?? v, () => pick(v), v === on ? 'on' : 'alt')));
    const car = activeCar(g)!;
    main.append(
      h(
        'div',
        { class: 'rl-roam' },
        h('div', { class: 'rl-big' }, '🌾🚗💨'),
        h('h3', null, S.roamTitle),
        h('p', null, S.roamText),
        h('p', { class: 'rl-pill' }, fill(S.roamCoins, { n: coins, max: ROAM_COINS_PER_DAY, kr: ROAM_COIN_KR })),
        h('div', { class: 'rl-row' }, seg(RALLY_TIMES, r.time, TIME, (v) => ((this.roamRules = { ...r, time: v }), this.render())), seg(RALLY_WEATHERS, r.weather, WEATHER, (v) => ((this.roamRules = { ...r, weather: v }), this.render()))),
        h('p', { class: 'rl-note' }, `${BODY[car.body].emoji} ${car.name}`),
        this.btn(S.roamGo, () => {
          this.send({ t: 'roam', a: 'enter' });
          this.launch('roam', r);
        }, 'rl-start huge'),
      ),
    );
  }

  // ---- Topplista ----

  private renderTop(main: HTMLElement): void {
    const players: { id: string; name: string; best: Record<string, number> }[] = Object.values(client.world?.players ?? {}).map((p) => ({ id: p.id, name: p.name, best: p.garage?.best ?? {} }));
    if (FAKE) players.push({ id: 'fake-mamma', name: 'Mamma', best: { 'farm:3': 182_000, 'forest:3': 230_000, 'beach:3': 199_000 } }, { id: 'fake-lisa', name: 'Lisa', best: { 'farm:3': 240_000, 'city:3': 214_000 } });
    const laps = h('div', { class: 'rl-seg' }, ...Array.from({ length: MAX_LAPS }, (_, i) => i + 1).map((n) => this.btn(String(n), () => ((this.topLaps = n), this.render()), n === this.topLaps ? 'on' : 'alt')));
    const grid = h('div', { class: 'rl-tops' });
    for (const id of RALLY_COURSES) {
      const d = RALLY_COURSE_DEFS[id];
      const key = raceKey({ course: id, laps: this.topLaps });
      const lines = players.filter((p) => (p.best[key] ?? 0) > 0).sort((a, b) => a.best[key]! - b.best[key]!);
      const card = vars(h('div', { class: 'rl-top' }, h('div', { class: 'rl-top-h' }, h('span', { class: 'rl-em' }, d.emoji), COURSE[id].name)), { '--c': d.color });
      lines.slice(0, 6).forEach((p, i) => {
        const t = p.best[key]!;
        const m = raceMedal(id, this.topLaps, t);
        card.append(h('div', { class: `rl-res${p.id === client.me ? ' me' : ''}` }, h('span', { class: 'pl' }, `${i + 1}.`), h('span', { class: 'nm' }, p.name), h('span', { class: 'tm' }, fmtTime(t)), h('span', { class: 'md' }, m ? MEDAL[m] : '')));
      });
      if (!lines.length) card.append(h('p', { class: 'rl-note' }, S.topEmpty));
      grid.append(card);
    }
    main.append(h('div', { class: 'rl-go top' }, h('b', null, fill(S.topTitle, { laps: this.topLaps })), h('span', { class: 'lbl' }, `🔁 ${S.laps}`), laps), this.scroller('top', grid));
  }
}

/** Builds the garage window; `onOpen` pauses the farm view while a race or a drive is open over it. */
export function initRally(ui: HTMLElement, onOpen: (open: boolean) => void): RallyUi {
  return new RallyUi(ui, onOpen);
}
