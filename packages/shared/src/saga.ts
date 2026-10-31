// Sagan om Världsträdet: dungeons for the family in the spirit of the big online adventure games.
// Pick a class (tank, healer or damage) with four spells; clear three dungeons in order, each a long
// map of monster packs, rest stones, a gate, a mid-boss and a boss whose big attacks are telegraphed;
// win loot in rarity colours. Völvan Sigrun in the city tells the saga, one chapter per dungeon.
// Data only: the rules live in sagasim.ts, the maps are built by sagamap.ts.
import type { Terrain } from './types.ts';

// ---------------------------------------------------------------------------
// Classes and spells
// ---------------------------------------------------------------------------

export type ClassId = 'vaktare' | 'helare' | 'krigare' | 'magiker';
export const CLASS_IDS: readonly ClassId[] = ['vaktare', 'helare', 'krigare', 'magiker'];
export const isClassId = (s: unknown): s is ClassId => typeof s === 'string' && (CLASS_IDS as readonly string[]).includes(s);
export type Role = 'tank' | 'healer' | 'dps';

export type SpellKind = 'melee' | 'bolt' | 'heal' | 'hot' | 'taunt' | 'bash' | 'wall' | 'revive' | 'charge' | 'whirl' | 'rage' | 'lance' | 'storm' | 'blink';

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  kind: SpellKind;
  /** Cooldown (ms). */
  cd: number;
  /** Reach in tiles from the caster (0: around the caster). */
  range: number;
  /** Damage, or healing (a heal over time: the whole amount). */
  power: number;
  /** Area in tiles. */
  radius?: number;
  /** How long it lasts (ms): stun, taunt, shield wall, rage, slow, heal over time. */
  ms?: number;
  /** Threat per point of damage (the tank's spells make more, so the monsters keep to the tank). */
  threat?: number;
  /** One line for the spell button and the class card. */
  text: string;
}

export const SPELLS: Record<string, SpellDef> = {
  // Väktare (tank)
  hugg: { id: 'hugg', name: 'Svärdshugg', icon: '🗡️', kind: 'melee', cd: 800, range: 1.8, power: 14, threat: 4, text: 'Ett hugg som får monstren att vilja slåss med dig.' },
  utmana: { id: 'utmana', name: 'Utmana!', icon: '📣', kind: 'taunt', cd: 8000, range: 0, power: 0, radius: 5, ms: 4000, text: 'Alla monster runt dig måste slåss med dig en stund.' },
  skoldslag: { id: 'skoldslag', name: 'Sköldslag', icon: '🛡️', kind: 'bash', cd: 6000, range: 1.8, power: 20, ms: 1500, threat: 4, text: 'Slår med skölden så monstret blir yrt. Avbryter bossens stora attacker!' },
  skoldmur: { id: 'skoldmur', name: 'Sköldmur', icon: '🧱', kind: 'wall', cd: 20000, range: 0, power: 60, ms: 6000, text: 'Du tar mycket mindre skada en stund och får lite hälsa tillbaka.' },
  // Helare (healer)
  lakerunan: { id: 'lakerunan', name: 'Läkerunan', icon: '💚', kind: 'heal', cd: 1500, range: 7, power: 32, text: 'Läker den som har ont, eller den du pekar på.' },
  ljuspil: { id: 'ljuspil', name: 'Ljuspil', icon: '✨', kind: 'bolt', cd: 1100, range: 7, power: 12, text: 'Skjuter en pil av ljus.' },
  lakekrets: { id: 'lakekrets', name: 'Läkekrets', icon: '🌿', kind: 'hot', cd: 12000, range: 0, power: 60, radius: 4, ms: 6000, text: 'En ring av runor läker alla nära dig en stund.' },
  vackupp: { id: 'vackupp', name: 'Väck upp!', icon: '🌅', kind: 'revive', cd: 15000, range: 4, power: 50, text: 'Väcker en kompis som har fallit.' },
  // Krigare (melee damage)
  yxhugg: { id: 'yxhugg', name: 'Yxhugg', icon: '🪓', kind: 'melee', cd: 900, range: 1.8, power: 20, text: 'Ett kraftigt hugg med yxan.' },
  stormsteg: { id: 'stormsteg', name: 'Stormsteg', icon: '💨', kind: 'charge', cd: 9000, range: 7, power: 14, ms: 1000, text: 'Rusar fram till monstret och gör det yrt.' },
  virvelvind: { id: 'virvelvind', name: 'Virvelvind', icon: '🌪️', kind: 'whirl', cd: 6000, range: 0, power: 16, radius: 2.2, text: 'Snurrar runt och träffar alla monster nära dig.' },
  raseri: { id: 'raseri', name: 'Bärsärkaraseri', icon: '🔥', kind: 'rage', cd: 24000, range: 0, power: 50, ms: 8000, text: 'Du slår hårdare, springer fortare och läker lite av varje hugg en stund.' },
  // Magiker (ranged damage)
  eldboll: { id: 'eldboll', name: 'Eldboll', icon: '☄️', kind: 'bolt', cd: 1300, range: 8, power: 24, text: 'Kastar en eldboll.' },
  isspjut: { id: 'isspjut', name: 'Isspjut', icon: '❄️', kind: 'lance', cd: 4000, range: 8, power: 14, ms: 3000, text: 'Ett spjut av is som gör monstret långsamt. Avbryter bossens stora attacker!' },
  askregn: { id: 'askregn', name: 'Åskregn', icon: '⚡', kind: 'storm', cd: 9000, range: 8, power: 28, radius: 2.4, text: 'Blixtar slår ner på ett ställe och träffar alla där.' },
  blink: { id: 'blink', name: 'Blink', icon: '🌀', kind: 'blink', cd: 10000, range: 4, power: 0, text: 'Hoppar några steg framåt. Bra för att komma undan.' },
};

export interface ClassDef {
  id: ClassId;
  name: string;
  role: Role;
  /** "Tank", "Helare", "Skada" on the class card. */
  roleName: string;
  emoji: string;
  /** Health in the dungeons. */
  hp: number;
  color: string;
  blurb: string;
  spells: [string, string, string, string];
  /** Clothes that come with the class (they go to the wardrobe and are put on). */
  outfit: { hat: string; shirt: string };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  vaktare: { id: 'vaktare', name: 'Väktare', role: 'tank', roleName: 'Tank', emoji: '🛡️', hp: 200, color: '#4f8fe8', blurb: 'Står längst fram med sköld och svärd och ser till att monstren slåss med dig, inte med dina vänner.', spells: ['hugg', 'utmana', 'skoldslag', 'skoldmur'], outfit: { hat: 'hat_vaktarhjalm', shirt: 'shirt_vaktarrustning' } },
  helare: { id: 'helare', name: 'Helare', role: 'healer', roleName: 'Helare', emoji: '🌿', hp: 120, color: '#5fd38d', blurb: 'Völvans runor läker dina vänner och väcker den som har fallit. Utan dig klarar sig ingen länge!', spells: ['lakerunan', 'ljuspil', 'lakekrets', 'vackupp'], outfit: { hat: 'hat_volvakrans', shirt: 'shirt_volvadrakt' } },
  krigare: { id: 'krigare', name: 'Krigare', role: 'dps', roleName: 'Skada', emoji: '🪓', hp: 150, color: '#e8613b', blurb: 'En bärsärk med yxa som rusar in och gör stor skada på nära håll.', spells: ['yxhugg', 'stormsteg', 'virvelvind', 'raseri'], outfit: { hat: 'hat_hornhjalm', shirt: 'shirt_bjornskinn' } },
  magiker: { id: 'magiker', name: 'Magiker', role: 'dps', roleName: 'Skada', emoji: '⚡', hp: 110, color: '#b06ef0', blurb: 'Runmagi på avstånd: eld, is och åska. Håll dig bakom tanken!', spells: ['eldboll', 'isspjut', 'askregn', 'blink'], outfit: { hat: 'hat_runhatt', shirt: 'shirt_runmantel' } },
};

/** Spells aimed at a monster, and at a friend (the rest work around the caster). */
export const ATTACK_KINDS: ReadonlySet<string> = new Set(['melee', 'bolt', 'lance', 'bash', 'charge', 'storm']);
export const FRIEND_KINDS: ReadonlySet<string> = new Set(['heal', 'revive']);

/** A class's everyday attack: its first spell aimed at a monster (the healer's light arrow). The use key swings it. */
export const attackSpellOf = (cls: ClassId): string => CLASSES[cls].spells.find((id) => ATTACK_KINDS.has(SPELLS[id]?.kind ?? '')) ?? CLASSES[cls].spells[0]!;

/** Small pause between any two spells, so mashing keys doesn't fire everything at once. */
export const GCD_MS = 400;
/** A fallen player gets up at the last rest stone after this long (unless a healer is quicker). */
export const DOWN_MS = 10_000;
/** Everyone fell: after this long the party gets up at the last rest stone and the monsters reset. */
export const WIPE_MS = 4_000;
/** Out of a fight for this long, health comes back by itself (much faster by a rest stone). */
export const CALM_MS = 5_000;
export const REST_RADIUS = 3;
/** A monster dragged this far from home gives up and walks back. */
export const LEASH_TILES = 22;

/** Monsters are a little slower than a player (4 tiles a second), so you can always run back to the healer. */
/** Monsters get tougher with more players (a boss's health is what one player meets); a lone kid is hit softer. */
export const mobHpScale = (party: number): number => 0.4 + 0.45 * Math.max(1, party);
export const bossHpScale = (party: number): number => (party <= 1 ? 0.6 : 0.3 + 0.7 * party);
/** A boss calls fewer helpers for a smaller party (at least one). */
export const addCount = (count: number, party: number): number => Math.max(1, Math.round((count * Math.min(4, Math.max(1, party))) / 4));
export const mobDmgScale = (party: number): number => (party <= 1 ? 0.4 : party === 2 ? 0.7 : party === 3 ? 0.9 : 1);

// ---------------------------------------------------------------------------
// Monsters and bosses
// ---------------------------------------------------------------------------

export interface SagaMobDef {
  species: string;
  name: string;
  hp: number;
  dmg: number;
  /** Time between attacks (ms). */
  atkMs: number;
  /** Attack reach in tiles; above 2.5 it shoots. */
  reach: number;
  /** Tiles per second. */
  speed: number;
  /** Notices players this close (tiles). */
  aggro: number;
  /** Ranged attacks that slow you down. */
  slows?: boolean;
}

export const SAGA_MOBS: Record<string, SagaMobDef> = {
  skelett: { species: 'skelett', name: 'Skelettkrigare', hp: 170, dmg: 7, atkMs: 1600, reach: 1.4, speed: 2.4, aggro: 4.5 },
  draugbage: { species: 'draugbage', name: 'Draugbågskytt', hp: 130, dmg: 6, atkMs: 2000, reach: 5, speed: 2.2, aggro: 6 },
  gravrotta: { species: 'gravrotta', name: 'Gravråtta', hp: 70, dmg: 4, atkMs: 1100, reach: 1.2, speed: 3.4, aggro: 4 },
  frosttroll: { species: 'frosttroll', name: 'Frosttroll', hp: 260, dmg: 10, atkMs: 1900, reach: 1.5, speed: 2.2, aggro: 4.5 },
  isvarg: { species: 'isvarg', name: 'Isvarg', hp: 140, dmg: 6, atkMs: 1200, reach: 1.3, speed: 3.6, aggro: 5 },
  isande: { species: 'isande', name: 'Isande', hp: 110, dmg: 6, atkMs: 2100, reach: 5, speed: 2, aggro: 6, slows: true },
  eldimp: { species: 'eldimp', name: 'Eldimp', hp: 95, dmg: 5, atkMs: 1100, reach: 1.2, speed: 3.6, aggro: 5 },
  lavagolem: { species: 'lavagolem', name: 'Lavagolem', hp: 360, dmg: 13, atkMs: 2200, reach: 1.6, speed: 1.8, aggro: 4 },
  eldhund: { species: 'eldhund', name: 'Eldhund', hp: 190, dmg: 8, atkMs: 1300, reach: 1.3, speed: 3.4, aggro: 5 },
  // the ice that holds a frozen friend (break it to free them)
  isblock: { species: 'isblock', name: 'Isblock', hp: 60, dmg: 0, atkMs: 999999, reach: 0, speed: 0, aggro: 0 },
};

/** A boss's big attacks. Every one is telegraphed on the ground (warn ms) before it lands. */
export type BossMove = 'cleave' | 'slam' | 'rain' | 'charge' | 'freeze' | 'pools' | 'nova' | 'summon';

export interface BossAbility {
  move: BossMove;
  name: string;
  /** Time between uses (ms) and the first use after the fight starts. */
  every: number;
  first: number;
  /** Warning time on the ground before it lands (ms). */
  warn: number;
  radius: number;
  /** Cone width in degrees (cleave). */
  arc?: number;
  dmg: number;
  /** Rain: extra circles besides one under each player. Summon: how many. */
  count?: number;
  /** Only from this phase on (0 = from the start). */
  phase?: number;
  /** Summon: which monster. */
  add?: string;
  /** Pools: how long the burning ground stays (ms), damage per second. */
  linger?: number;
  /** A tank's Sköldslag (any stun) during the warning cancels it. */
  interrupt?: boolean;
  /** For the dungeon journal: what it does and what to do. */
  text: string;
}

export interface SagaBossDef {
  species: string;
  name: string;
  title: string;
  hp: number;
  dmg: number;
  atkMs: number;
  reach: number;
  speed: number;
  /** Health fractions where a new phase begins (a shout, maybe helpers). */
  phases: number[];
  /** Helpers called at each new phase. */
  phaseAdds?: { species: string; count: number };
  moves: BossAbility[];
  yells: { pull: string; phase: string[]; kill: string; death: string; wipe: string };
  /** A mid-boss opens the gate on the way on; the last boss ends the dungeon. */
  mini?: boolean;
  lore: string;
}

export const SAGA_BOSSES: Record<string, SagaBossDef> = {
  gravvaktare: {
    species: 'gravvaktare',
    name: 'Gravväktaren',
    title: 'Kryptans vakt',
    hp: 1100,
    dmg: 11,
    atkMs: 1800,
    reach: 1.8,
    speed: 2,
    phases: [0.5],
    phaseAdds: { species: 'gravrotta', count: 3 },
    moves: [{ move: 'slam', name: 'Gravslaget', every: 8000, first: 4000, warn: 1500, radius: 2.6, dmg: 28, text: 'Slår i marken så det skakar runt honom. Spring ut ur cirkeln!' }],
    yells: { pull: 'Ingen stör kungens sömn!', phase: ['Råttor! Till mig!'], kill: 'Vila i frid…', death: 'Kungen… kommer att… vakna…', wipe: 'Kryptan behåller sina gäster.' },
    mini: true,
    lore: 'En jättelik skelettkrigare som har vaktat kryptans port i tusen år.',
  },
  draugkung: {
    species: 'draugkung',
    name: 'Draugkungen Hrolf',
    title: 'Kryptans herre',
    hp: 2200,
    dmg: 12,
    atkMs: 2000,
    reach: 2,
    speed: 2.1,
    phases: [0.66, 0.33],
    phaseAdds: { species: 'skelett', count: 2 },
    moves: [
      { move: 'cleave', name: 'Kungasvärdet', every: 9000, first: 5000, warn: 1300, radius: 3.4, arc: 100, dmg: 34, text: 'Svingar svärdet i en stor båge framför sig. Ställ dig bakom honom!' },
      { move: 'rain', name: 'Gravfrost', every: 12000, first: 8000, warn: 1600, radius: 1.5, count: 2, dmg: 26, phase: 1, text: 'Frost kryper upp ur graven under er. Flytta på er!' },
      { move: 'nova', name: 'Draugropet', every: 16000, first: 14000, warn: 2600, radius: 7, dmg: 30, interrupt: true, text: 'Han samlar kraft till ett skrik som träffar alla nära. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Vem vågar väcka Draugkungen?!', phase: ['Mina krigare, res er!', 'Solrunan är MIN!'], kill: 'Ännu en till min krypta!', death: 'Solen… den lyser igen…', wipe: 'Kom tillbaka när ni har blivit modigare!' },
    lore: 'Hrolf var en girig hövding för länge sedan. Nu har han vaknat som en draug och stulit Solrunan, som håller vintern borta från Midgård.',
  },
  isbjorn: {
    species: 'isbjorn',
    name: 'Isbjörnen Kall',
    title: 'Borgens vaktbjörn',
    hp: 1500,
    dmg: 13,
    atkMs: 1900,
    reach: 1.8,
    speed: 2.6,
    phases: [0.5],
    phaseAdds: { species: 'isvarg', count: 2 },
    moves: [{ move: 'charge', name: 'Isrusning', every: 9000, first: 5000, warn: 1400, radius: 1.8, dmg: 30, text: 'Rusar mot någon av er och landar med en smäll. Hoppa undan från cirkeln!' }],
    yells: { pull: 'GRRRAAAH!', phase: ['AAAOOOOO!'], kill: 'Grrr…', death: 'Grr… mmm…', wipe: 'Grrrrr.' },
    mini: true,
    lore: 'Rimturs egen björn, stor som en lada och med päls av rimfrost.',
  },
  rimturs: {
    species: 'rimturs',
    name: 'Rimtursen',
    title: 'Frostjätten',
    hp: 2600,
    dmg: 14,
    atkMs: 2200,
    reach: 2.2,
    speed: 1.9,
    phases: [0.5],
    phaseAdds: { species: 'isande', count: 2 },
    moves: [
      { move: 'cleave', name: 'Frostandedräkt', every: 10000, first: 5000, warn: 1500, radius: 4.2, arc: 70, dmg: 34, text: 'Andas iskall luft rakt fram. Gå åt sidan!' },
      { move: 'rain', name: 'Istappar', every: 11000, first: 8000, warn: 1400, radius: 1.3, count: 3, dmg: 24, text: 'Istappar faller från taket där ni står. Flytta på er!' },
      { move: 'freeze', name: 'Isfängelse', every: 16000, first: 11000, warn: 800, radius: 1, dmg: 15, text: 'Fryser in någon i ett isblock. Slå sönder isen för att rädda din vän!' },
      { move: 'nova', name: 'Snöstorm', every: 15000, first: 6000, warn: 2600, radius: 8, dmg: 32, phase: 1, interrupt: true, text: 'Kallar på en snöstorm runt sig. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Små varma varelser i MIN borg? Ni ska bli istappar!', phase: ['Känn vinterns vrede!'], kill: 'Frys!', death: 'Våren… kommer… ändå…', wipe: 'Vintern vinner alltid.' },
    lore: 'Rimtursen är en frostjätte från Jötunheim. Han vill att det ska vara vinter för alltid, och har frusit alla källor i norr.',
  },
  smeden: {
    species: 'smeden',
    name: 'Smeden Glöd',
    title: 'Surts smed',
    hp: 1700,
    dmg: 14,
    atkMs: 2000,
    reach: 1.9,
    speed: 2,
    phases: [0.5],
    phaseAdds: { species: 'eldimp', count: 3 },
    moves: [
      { move: 'slam', name: 'Städslaget', every: 7000, first: 4000, warn: 1300, radius: 2.8, dmg: 30, text: 'Slår hammaren i städet så golvet sprakar. Spring ut ur cirkeln!' },
      { move: 'pools', name: 'Glödande slagg', every: 11000, first: 7000, warn: 1000, radius: 1.4, dmg: 8, linger: 8000, text: 'Kastar glödande slagg som brinner kvar på golvet. Stå inte i elden!' },
    ],
    yells: { pull: 'Ingen kommer in i Surts smedja!', phase: ['Imparna! Hjälp mig!'], kill: 'Mer kol till ugnen!', death: 'Elden… slocknar…', wipe: 'Ha! Härdat i elden!' },
    mini: true,
    lore: 'Surts smed, som har hamrat på det flammande svärdet i hundra år.',
  },
  surt: {
    species: 'surt',
    name: 'Surt',
    title: 'Eldjätten från Muspelheim',
    hp: 3200,
    dmg: 16,
    atkMs: 2200,
    reach: 2.4,
    speed: 2,
    phases: [0.7, 0.4],
    phaseAdds: { species: 'eldimp', count: 3 },
    moves: [
      { move: 'cleave', name: 'Eldsvärdet', every: 8000, first: 5000, warn: 1300, radius: 4.4, arc: 110, dmg: 40, text: 'Svingar det flammande svärdet i en stor båge. Ställ dig bakom honom!' },
      { move: 'pools', name: 'Lavapölar', every: 12000, first: 8000, warn: 1200, radius: 1.6, dmg: 10, linger: 10000, text: 'Lava väller upp under er och brinner kvar. Flytta på er!' },
      { move: 'nova', name: 'Muspels vrede', every: 14000, first: 4000, warn: 2800, radius: 7, dmg: 45, phase: 2, interrupt: true, text: 'Hela salen fylls av eld. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Med det här svärdet ska jag bränna Världsträdet!', phase: ['Muspelheims eld brinner i mig!', 'NI KAN INTE STOPPA MIG!'], kill: 'Aska till aska!', death: 'Världsträdet… lever…', wipe: 'Ingen kan stå emot elden!' },
    lore: 'Surt är eldjätten från Muspelheim. I sin smedja under vulkanen smider han ett svärd av eld för att bränna Yggdrasil, Världsträdet som håller ihop alla världar.',
  },
};

// ---------------------------------------------------------------------------
// The dungeons
// ---------------------------------------------------------------------------

export type DungeonId = 'draug' | 'frost' | 'surt';
export const DUNGEON_IDS: readonly DungeonId[] = ['draug', 'frost', 'surt'];
export const isDungeonId = (s: unknown): s is DungeonId => typeof s === 'string' && (DUNGEON_IDS as readonly string[]).includes(s);

export type SagaRoomKind = 'start' | 'pack' | 'rest' | 'mini' | 'treasure' | 'boss';

export interface SagaRoom {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SagaRoomKind;
  /** Monster groups in the room: each one fights together. */
  packs?: string[][];
  /** The way into this room is closed until the mid-boss falls. */
  gated?: boolean;
}

export interface SagaDungeonDef {
  id: DungeonId;
  name: string;
  chapter: number;
  /** Shown when you walk in. */
  intro: string;
  /** The entrance out in the world: the map and the tile of the portal's top-left corner. */
  portal: { area: string; x: number; y: number };
  floor: Terrain;
  /** Floor of the boss's hall. */
  bossFloor: Terrain;
  /** Wall look (saga_wall variant) and the colour of the light (for the client). */
  wall: number;
  ambient: [number, number, number];
  rooms: SagaRoom[];
  /** Corridors between rooms (room indices), carved three tiles wide. */
  links: [number, number][];
  mini: string;
  boss: string;
  /** Things to put around the rooms (object kinds). */
  decor: string[];
}

export const DUNGEONS: Record<DungeonId, SagaDungeonDef> = {
  draug: {
    id: 'draug',
    name: 'Draugkryptan',
    chapter: 1,
    intro: 'Det luktar gammal jord och kall sten. Någonstans långt in hörs ett skrapande… Draugkungen väntar.',
    portal: { area: 'a:-1,-1', x: 30, y: 26 },
    floor: 'crypt',
    bossFloor: 'floor_stone',
    wall: 0,
    ambient: [0.42, 0.45, 0.55],
    // a U: along the bottom to the right, up the right side, back along the top to the throne room
    rooms: [
      { x: 3, y: 49, w: 10, h: 10, kind: 'start' },
      { x: 18, y: 48, w: 12, h: 11, kind: 'pack', packs: [['skelett', 'skelett'], ['skelett', 'draugbage']] },
      { x: 35, y: 47, w: 13, h: 12, kind: 'pack', packs: [['gravrotta', 'gravrotta', 'gravrotta'], ['skelett', 'skelett', 'draugbage']] },
      { x: 53, y: 49, w: 8, h: 9, kind: 'rest' },
      { x: 49, y: 28, w: 13, h: 13, kind: 'mini' },
      { x: 34, y: 30, w: 9, h: 8, kind: 'treasure', packs: [['gravrotta', 'gravrotta', 'skelett']] },
      { x: 47, y: 12, w: 13, h: 10, kind: 'pack', packs: [['draugbage', 'draugbage', 'skelett'], ['skelett', 'skelett', 'gravrotta']], gated: true },
      { x: 33, y: 13, w: 8, h: 8, kind: 'rest' },
      { x: 4, y: 5, w: 22, h: 18, kind: 'boss' },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [4, 6],
      [6, 7],
      [7, 8],
    ],
    mini: 'gravvaktare',
    boss: 'draugkung',
    decor: ['saga_coffin', 'saga_bones', 'saga_candles', 'saga_urn'],
  },
  frost: {
    id: 'frost',
    name: 'Frostjättens borg',
    chapter: 2,
    intro: 'Isiga vindar viner genom salarna. Allt är täckt av rimfrost, och golvet är halt som en skridskobana.',
    portal: { area: 'a:0,-2', x: 30, y: 30 },
    floor: 'snow',
    bossFloor: 'ice',
    wall: 1,
    ambient: [0.55, 0.65, 0.85],
    // a climb: from the gate at the bottom, zigzagging up through the courtyards to the giant's hall
    rooms: [
      { x: 27, y: 52, w: 11, h: 9, kind: 'start' },
      { x: 6, y: 47, w: 14, h: 12, kind: 'pack', packs: [['isvarg', 'isvarg'], ['frosttroll', 'isande']] },
      { x: 6, y: 31, w: 13, h: 11, kind: 'pack', packs: [['isvarg', 'isvarg', 'isvarg'], ['frosttroll', 'frosttroll']] },
      { x: 25, y: 35, w: 9, h: 8, kind: 'rest' },
      { x: 41, y: 33, w: 15, h: 14, kind: 'mini' },
      { x: 52, y: 52, w: 9, h: 8, kind: 'treasure', packs: [['isande', 'isande', 'isvarg']] },
      { x: 43, y: 17, w: 14, h: 10, kind: 'pack', packs: [['frosttroll', 'isande', 'isande'], ['isvarg', 'isvarg', 'frosttroll']], gated: true },
      { x: 30, y: 19, w: 8, h: 7, kind: 'rest' },
      { x: 5, y: 3, w: 24, h: 20, kind: 'boss' },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [4, 6],
      [6, 7],
      [7, 8],
    ],
    mini: 'isbjorn',
    boss: 'rimturs',
    decor: ['saga_icecrystal', 'saga_frozenpillar', 'saga_icecrystal', 'saga_snowdrift'],
  },
  surt: {
    id: 'surt',
    name: 'Surts smedja',
    chapter: 3,
    intro: 'Värmen slår emot er som från en ugn. Hammarslag ekar i berget, och lavan lyser rött mellan stenarna.',
    portal: { area: 'a:2,2', x: 30, y: 33 },
    floor: 'ash',
    bossFloor: 'forge',
    wall: 2,
    ambient: [0.75, 0.42, 0.3],
    // a spiral inwards: round the edge of the mountain to the forge in its heart
    rooms: [
      { x: 3, y: 26, w: 10, h: 10, kind: 'start' },
      { x: 4, y: 45, w: 14, h: 12, kind: 'pack', packs: [['eldimp', 'eldimp', 'eldimp'], ['eldhund', 'eldhund']] },
      { x: 25, y: 48, w: 14, h: 11, kind: 'pack', packs: [['lavagolem', 'eldimp', 'eldimp'], ['eldhund', 'eldhund', 'eldimp']] },
      { x: 46, y: 50, w: 9, h: 8, kind: 'rest' },
      { x: 46, y: 28, w: 15, h: 14, kind: 'mini' },
      { x: 51, y: 5, w: 10, h: 9, kind: 'treasure', packs: [['eldhund', 'eldhund', 'eldimp']] },
      { x: 26, y: 4, w: 16, h: 10, kind: 'pack', packs: [['lavagolem', 'lavagolem'], ['eldimp', 'eldimp', 'eldimp', 'eldimp']], gated: true },
      { x: 9, y: 6, w: 9, h: 8, kind: 'rest' },
      { x: 20, y: 22, w: 22, h: 20, kind: 'boss' },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [4, 6],
      [6, 7],
      [7, 8],
    ],
    mini: 'smeden',
    boss: 'surt',
    decor: ['saga_anvil', 'saga_brazier', 'saga_lavacrack', 'saga_brazier'],
  },
};

export const sagaKey = (id: DungeonId): string => `saga:${id}`;
export const isSagaKey = (k: string | undefined): boolean => !!k && k.startsWith('saga:');
export const dungeonOfKey = (k: string): DungeonId | null => {
  const id = k.slice('saga:'.length);
  return isDungeonId(id) ? id : null;
};
/** The dungeon before this one (null for the first). */
export const previousDungeon = (id: DungeonId): DungeonId | null => DUNGEON_IDS[DUNGEON_IDS.indexOf(id) - 1] ?? null;

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITY_COLORS: Record<Rarity, string> = { common: '#ffffff', uncommon: '#1eff00', rare: '#0070dd', epic: '#a335ee', legendary: '#ff8000' };
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Vanlig', uncommon: 'Ovanlig', rare: 'Sällsynt', epic: 'Episk', legendary: 'Legendarisk' };

/** What a boss's chest gives each player (once a day per player). */
export interface SagaLoot {
  coins: [number, number];
  stars: number;
  /** One of these, by weight. */
  gear: { item: string; weight: number }[];
  /** A chance of something rare on top (a pet or a mount). */
  rare?: { item: string; chance: number }[];
}

export const SAGA_LOOT: Record<string, SagaLoot> = {
  gravvaktare: { coins: [20, 40], stars: 0, gear: [{ item: 'shirt_ringbrynja', weight: 3 }, { item: 'runsvard', weight: 2 }, { item: 'healing_potion', weight: 4 }] },
  draugkung: {
    coins: [60, 100],
    stars: 1,
    gear: [{ item: 'runsvard', weight: 3 }, { item: 'draugyxa', weight: 3 }, { item: 'volvastav', weight: 3 }, { item: 'hat_draugkrona', weight: 2 }, { item: 'shirt_ringbrynja', weight: 2 }],
    rare: [{ item: 'pet_hugin', chance: 0.25 }],
  },
  isbjorn: { coins: [30, 50], stars: 0, gear: [{ item: 'shirt_bjornfall', weight: 3 }, { item: 'isyxa', weight: 2 }, { item: 'healing_potion', weight: 4 }] },
  rimturs: {
    coins: [80, 140],
    stars: 1,
    gear: [{ item: 'frostbett', weight: 3 }, { item: 'isyxa', weight: 3 }, { item: 'ullrsbage', weight: 3 }, { item: 'hat_valkyria', weight: 3 }, { item: 'shirt_bjornfall', weight: 2 }],
    rare: [
      { item: 'pet_fenrisvalp', chance: 0.2 },
      { item: 'mount_sleipner', chance: 0.12 },
    ],
  },
  smeden: { coins: [40, 70], stars: 0, gear: [{ item: 'shirt_odenmantel', weight: 2 }, { item: 'mjolner', weight: 1 }, { item: 'healing_potion', weight: 4 }] },
  surt: {
    coins: [120, 200],
    stars: 2,
    gear: [{ item: 'surtsvard', weight: 3 }, { item: 'mjolner', weight: 3 }, { item: 'gungner', weight: 3 }, { item: 'hat_oden', weight: 3 }, { item: 'shirt_odenmantel', weight: 2 }],
    rare: [
      { item: 'mount_gullinbursti', chance: 0.15 },
      { item: 'mount_sleipner', chance: 0.1 },
    ],
  },
};

/** The treasure chest in each dungeon's side room. */
export const SAGA_TREASURE: Record<DungeonId, SagaLoot> = {
  draug: { coins: [25, 45], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'old_coin', weight: 3 }, { item: 'gold', weight: 2 }] },
  frost: { coins: [35, 60], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'crystal', weight: 3 }, { item: 'gem', weight: 1 }] },
  surt: { coins: [45, 80], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'fire_crystal', weight: 3 }, { item: 'obsidian', weight: 2 }] },
};

/** Loot only found in the dungeons (registered as items in data.ts). */
export interface SagaItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  kind: 'weapon' | 'hat' | 'shirt' | 'pet' | 'mount' | 'potion' | 'decor' | 'quest';
  /** Weapons: the farm tool it works as, and its glow. */
  tool?: 'sword' | 'axe' | 'hammer' | 'bow';
  glow?: string;
  /** Clothes: drawing style and colour. */
  style?: string;
  color?: string;
  /** Pets and mounts: the animal it gives. */
  species?: string;
  text: string;
}

export const SAGA_ITEMS: SagaItemDef[] = [
  // weapons: they glow, and work as the farm's tools too
  { id: 'runsvard', name: 'Runsvärd', rarity: 'rare', kind: 'weapon', tool: 'sword', glow: '#7fd8ff', text: 'Runorna på bladet lyser blått i mörkret.' },
  { id: 'draugyxa', name: 'Draugyxa', rarity: 'rare', kind: 'weapon', tool: 'axe', glow: '#9cff8a', text: 'En gammal stridsyxa som lyser spöklikt grön.' },
  { id: 'volvastav', name: 'Völvans stav', rarity: 'rare', kind: 'weapon', tool: 'hammer', glow: '#fff0a0', text: 'En stav med en lysande sten i toppen.' },
  { id: 'frostbett', name: 'Frostbett', rarity: 'epic', kind: 'weapon', tool: 'sword', glow: '#a8e8ff', text: 'Ett svärd av evig is som aldrig smälter.' },
  { id: 'isyxa', name: 'Isyxa', rarity: 'epic', kind: 'weapon', tool: 'axe', glow: '#bfe9ff', text: 'Hugger is lika lätt som trä.' },
  { id: 'ullrsbage', name: 'Ullrs båge', rarity: 'epic', kind: 'weapon', tool: 'bow', glow: '#d0f0ff', text: 'Vinterguden Ullrs båge, med strängar av norrsken.' },
  { id: 'surtsvard', name: 'Surts eldsvärd', rarity: 'legendary', kind: 'weapon', tool: 'sword', glow: '#ff9a3a', text: 'Eldjättens eget svärd. Det brinner, men aldrig i din hand.' },
  { id: 'mjolner', name: 'Mjölner', rarity: 'legendary', kind: 'weapon', tool: 'hammer', glow: '#9ad8ff', text: 'Tors hammare. Det knastrar av blixtar om den.' },
  { id: 'gungner', name: 'Gungner', rarity: 'legendary', kind: 'weapon', tool: 'sword', glow: '#ffe27a', text: 'Odens spjut, som alltid träffar.' },
  // Norse clothes
  { id: 'hat_draugkrona', name: 'Draugkrona', rarity: 'rare', kind: 'hat', style: 'draugcrown', color: '#a7b0a0', text: 'Draugkungens gamla krona.' },
  { id: 'shirt_ringbrynja', name: 'Ringbrynja', rarity: 'uncommon', kind: 'shirt', style: 'chainmail', color: '#9aa3ad', text: 'Tusen små järnringar.' },
  { id: 'hat_valkyria', name: 'Valkyriahjälm', rarity: 'epic', kind: 'hat', style: 'valkyrie', color: '#e0e6ee', text: 'En silverhjälm med vita vingar.' },
  { id: 'shirt_bjornfall', name: 'Björnfäll', rarity: 'rare', kind: 'shirt', style: 'bearpelt', color: '#e8eef4', text: 'En varm vit fäll från Isbjörnen Kall.' },
  { id: 'hat_oden', name: 'Odens hatt', rarity: 'legendary', kind: 'hat', style: 'wanderer', color: '#3a3f5a', text: 'Vandrarens bredbrättade hatt.' },
  { id: 'shirt_odenmantel', name: 'Odens mantel', rarity: 'epic', kind: 'shirt', style: 'cloak', color: '#2f3550', text: 'En mörkblå mantel med en korp på ryggen.' },
  // the classes' own clothes
  { id: 'hat_vaktarhjalm', name: 'Väktarhjälm', rarity: 'uncommon', kind: 'hat', style: 'nasal', color: '#b8c2cc', text: 'Väktarens hjälm med nässkydd.' },
  { id: 'shirt_vaktarrustning', name: 'Väktarrustning', rarity: 'uncommon', kind: 'shirt', style: 'tabard', color: '#4f8fe8', text: 'Rustning med en sköld på bröstet.' },
  { id: 'hat_volvakrans', name: 'Völvans krans', rarity: 'uncommon', kind: 'hat', style: 'circlet', color: '#e8d27a', text: 'En krans med små runor.' },
  { id: 'shirt_volvadrakt', name: 'Völvans dräkt', rarity: 'uncommon', kind: 'shirt', style: 'robe', color: '#5fd38d', text: 'En grön dräkt med läkande runor.' },
  { id: 'hat_hornhjalm', name: 'Hornhjälm', rarity: 'uncommon', kind: 'hat', style: 'viking', color: '#b0703a', text: 'Bärsärkens hjälm.' },
  { id: 'shirt_bjornskinn', name: 'Björnskinn', rarity: 'uncommon', kind: 'shirt', style: 'bearpelt', color: '#7a5a3a', text: 'Ett brunt björnskinn över axlarna.' },
  { id: 'hat_runhatt', name: 'Runhatt', rarity: 'uncommon', kind: 'hat', style: 'runehat', color: '#b06ef0', text: 'En spetsig hatt med lysande runor.' },
  { id: 'shirt_runmantel', name: 'Runmantel', rarity: 'uncommon', kind: 'shirt', style: 'robe', color: '#7a4fc0', text: 'En lila mantel full av runor.' },
  // animals only the dungeons give
  { id: 'pet_hugin', name: 'Hugin och Munin', rarity: 'epic', kind: 'pet', species: 'korp', text: 'Odens två korpar flyger med dig vart du går.' },
  { id: 'pet_fenrisvalp', name: 'Fenrisvalp', rarity: 'epic', kind: 'pet', species: 'fenrisvalp', text: 'En liten ulv med stora tassar. Snäll, för det mesta.' },
  { id: 'mount_sleipner', name: 'Sleipner', rarity: 'legendary', kind: 'mount', species: 'sleipner', text: 'Odens häst med åtta ben. Den snabbaste hästen i alla världar.' },
  { id: 'mount_gullinbursti', name: 'Gullinbursti', rarity: 'legendary', kind: 'mount', species: 'gullinbursti', text: 'Freys galt med borst av guld som lyser i mörkret.' },
  // things the villagers ask for (only drop while you have their quest)
  { id: 'draugjarn', name: 'Draugjärn', rarity: 'common', kind: 'quest', text: 'Rostigt järn från en skelettkrigare. Smed-Stina vill ha det.' },
  { id: 'frostros', name: 'Frostros', rarity: 'common', kind: 'quest', text: 'En ros av is som aldrig smälter. Fru Lind vill ha den.' },
  { id: 'glodkol', name: 'Glödkol', rarity: 'common', kind: 'quest', text: 'Kol som glöder fast det är kallt. Bagar-Bo vill ha det till ugnen.' },
  // a drink that heals you in a fight
  { id: 'healing_potion', name: 'Läkedryck', rarity: 'common', kind: 'potion', text: 'Dricks i en fängelsehåla: fyller på hälsan.' },
  // the saga's rewards for home
  { id: 'solruna', name: 'Solrunan', rarity: 'epic', kind: 'decor', glow: '#ffd23f', text: 'Runstenen som håller vintern borta. Den lyser som solen.' },
  { id: 'yggdrasil', name: 'Yggdrasils skott', rarity: 'legendary', kind: 'decor', glow: '#9cff8a', text: 'Ett litet skott av Världsträdet, som glittrar i mörkret.' },
];
export const sagaItem = (id: string): SagaItemDef | undefined => SAGA_ITEMS.find((i) => i.id === id);

// ---------------------------------------------------------------------------
// The saga: Völvan Sigrun's chapters
// ---------------------------------------------------------------------------

export interface SagaChapter {
  /** The dungeon to clear (null for the first chapter: pick a class). */
  dungeon: DungeonId | null;
  title: string;
  /** What Völvan says when she gives the chapter. */
  tell: string[];
  /** What she says when you come back with it done. */
  done: string[];
  /** One line for the quest tracker. */
  goal: string;
  reward: { coins: number; stars: number; item?: string; title?: string };
}

export const SAGA_CHAPTERS: SagaChapter[] = [
  {
    dungeon: null,
    title: 'Völvans dröm',
    tell: [
      'Välkommen, lilla vän. Jag har drömt oroliga drömmar.',
      'Världsträdet Yggdrasil, som håller ihop alla världar, är i fara. Tre onda väsen har vaknat.',
      'Men ingen hjälte går ensam. Välj först din väg vid Kämpastenen här bredvid mig: Väktare, Helare, Krigare eller Magiker.',
    ],
    done: ['Bra! Nu har du en väg att gå. Lyssna noga, för nu börjar sagan.'],
    goal: 'Välj klass vid Kämpastenen bredvid Völvan',
    reward: { coins: 20, stars: 1 },
  },
  {
    dungeon: 'draug',
    title: 'Solrunan',
    tell: [
      'Den förste är Draugkungen Hrolf. Han har vaknat i sin krypta i skogen nordväst om gården.',
      'Han har stulit Solrunan, som håller vintern borta från Midgård. Redan blir nätterna kallare…',
      'Gå till Draugkryptan och besegra honom. Ta med vänner om du kan, för kryptan är djup.',
    ],
    done: ['Solrunan! Känn så varm den är. Sommaren är räddad, tack vare dig.', 'Men jag ser mer i mina drömmar… is, och en jätte.'],
    goal: 'Besegra Draugkungen i Draugkryptan (skogen nordväst om gården)',
    reward: { coins: 100, stars: 2, item: 'solruna', title: 'Draugdödare' },
  },
  {
    dungeon: 'frost',
    title: 'Den eviga vintern',
    tell: [
      'Långt i norr, där isen aldrig smälter, står Frostjättens borg.',
      'Rimtursen har frusit alla källor och vill att det ska vara vinter för alltid.',
      'Solrunan har smält isporten, så nu kan du komma in. Akta dig för hans isfängelse, och hjälp varandra!',
    ],
    done: ['Källorna porlar igen! Rimtursen är besegrad.', 'Men nu brinner det i mina drömmar… Surt har vaknat.'],
    goal: 'Besegra Rimtursen i Frostjättens borg (isen två kartor norr om gården)',
    reward: { coins: 150, stars: 3, title: 'Frostbrytare' },
  },
  {
    dungeon: 'surt',
    title: 'Surts svärd',
    tell: [
      'Den värste av dem alla är Surt, eldjätten från Muspelheim.',
      'I vulkanen sydost om gården smider han ett svärd av eld. Med det vill han bränna Världsträdet!',
      'Det här blir ert svåraste äventyr. Gå tillsammans, och ge inte upp.',
    ],
    done: ['Ni gjorde det! Surt är besegrad och Världsträdet är räddat!', 'Ta det här skottet av Yggdrasil. Plantera det hemma, så minns alla vad ni gjorde.'],
    goal: 'Besegra Surt i Surts smedja (vulkanen sydost om gården)',
    reward: { coins: 300, stars: 5, item: 'yggdrasil', title: 'Världsträdets väktare' },
  },
];

/** Völvan Sigrun, who tells the saga, stands by the Kämpastenen on the city square. */
export const VOLVA_ID = 'sigrun';
export const VOLVA_SPOT = { x: 46, y: 30 };
export const STONE_SPOT = { x: 47, y: 29 };

/** The way into a dungeon out in the world: a stone arch 3 tiles wide and 2 high, walked into from below. */
export const SAGA_PORTAL = { w: 3, h: 2 };
/** The tile in front of a dungeon's arch (where you come out again). */
export const portalFront = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x + 1, y: p.y + 2 });

/** Better weapons hit harder: the best one in the bag counts. */
export const RARITY_POWER: Record<Rarity, number> = { common: 1, uncommon: 1.05, rare: 1.1, epic: 1.2, legendary: 1.3 };

// ---------------------------------------------------------------------------
// The villagers' quests: two for each dungeon, once Völvan has told its chapter
// ---------------------------------------------------------------------------

export interface SagaQuest {
  id: string;
  npc: string;
  dungeon: DungeonId;
  title: string;
  tell: string[];
  done: string[];
  goal: string;
  /** Beat monsters of a species, or collect something they drop while you have the quest. */
  kind: 'kill' | 'collect';
  target: string;
  count: number;
  /** Collect quests: who drops it, and how often. */
  from?: string[];
  chance?: number;
  reward: { coins: number; stars: number; item?: string; count?: number };
}

export const SAGA_QUESTS: SagaQuest[] = [
  {
    id: 'saga_skelett',
    npc: 'greta',
    dungeon: 'draug',
    title: 'Skrammel i skogen',
    tell: ['Om nätterna hör jag skrammel från skogen i nordväst. Ben som slår mot ben!', 'Det är skelettkrigarna från Draugkryptan. Kan du besegra åtta av dem, så jag kan sova igen?'],
    done: ['Tack, lilla hjälte! I natt ska jag sova som en stock.'],
    goal: 'Besegra 8 skelettkrigare i Draugkryptan',
    kind: 'kill',
    target: 'skelett',
    count: 8,
    reward: { coins: 40, stars: 1 },
  },
  {
    id: 'saga_jarn',
    npc: 'stina',
    dungeon: 'draug',
    title: 'Gammalt järn',
    tell: ['Draugarnas järn är det bästa som finns, hårdare än något jag kan smida själv.', 'Ta med fem bitar draugjärn från skelettkrigarna eller bågskyttarna, så får du läkedrycker av mig.'],
    done: ['Fem bitar! Här har du två läkedrycker. Drick dem när det blir knepigt.'],
    goal: 'Samla 5 draugjärn från skeletten i Draugkryptan',
    kind: 'collect',
    target: 'draugjarn',
    count: 5,
    from: ['skelett', 'draugbage'],
    chance: 0.6,
    reward: { coins: 50, stars: 1, item: 'healing_potion', count: 2 },
  },
  {
    id: 'saga_vargar',
    npc: 'sven',
    dungeon: 'frost',
    title: 'Vargarna vid isen',
    tell: ['Isvargarna från Frostjättens borg skrämmer fisken under isen.', 'Jaga bort sex av dem, så kan jag pimpla i lugn och ro.'],
    done: ['Nu nappar det igen! Här, för besväret.'],
    goal: 'Besegra 6 isvargar i Frostjättens borg',
    kind: 'kill',
    target: 'isvarg',
    count: 6,
    reward: { coins: 60, stars: 1 },
  },
  {
    id: 'saga_frostros',
    npc: 'lind',
    dungeon: 'frost',
    title: 'Frostrosen',
    tell: ['Har du hört talas om frostrosor? Rosor av is, som isandarna bär med sig.', 'Jag vill så gärna ha fyra stycken till min trädgård. De smälter aldrig!'],
    done: ['Åh, så vackra! De ska glittra i rabatten hela sommaren.'],
    goal: 'Samla 4 frostrosor från isandarna i Frostjättens borg',
    kind: 'collect',
    target: 'frostros',
    count: 4,
    from: ['isande'],
    chance: 0.7,
    reward: { coins: 70, stars: 2 },
  },
  {
    id: 'saga_kol',
    npc: 'bo',
    dungeon: 'surt',
    title: 'Kol till ugnen',
    tell: ['Eldimparna i Surts smedja bär på glödkol, kol som aldrig slocknar!', 'Med sex bitar kan jag baka bröd hela vintern utan ved.'],
    done: ['Känn så varmt! Nu blir det kanelbullar åt hela byn.'],
    goal: 'Samla 6 glödkol från eldimparna i Surts smedja',
    kind: 'collect',
    target: 'glodkol',
    count: 6,
    from: ['eldimp'],
    chance: 0.6,
    reward: { coins: 80, stars: 2 },
  },
  {
    id: 'saga_eldhund',
    npc: 'pino',
    dungeon: 'surt',
    title: 'Heta hundar',
    tell: ['Mamma mia! Eldhundarna från vulkanen har ätit upp all min ost!', 'Jaga bort fem av dem, så får du läkedrycker av mig. Och pizza!'],
    done: ['Grazie! Här har du tre läkedrycker.'],
    goal: 'Besegra 5 eldhundar i Surts smedja',
    kind: 'kill',
    target: 'eldhund',
    count: 5,
    reward: { coins: 90, stars: 2, item: 'healing_potion', count: 3 },
  },
];
export const sagaQuest = (id: string): SagaQuest | undefined => SAGA_QUESTS.find((q) => q.id === id);

// ---------------------------------------------------------------------------
// State: each player's saga (saved), and a dungeon while someone is in it (not saved)
// ---------------------------------------------------------------------------

/** A player's saga: their class, where they are in Völvan's story, cleared dungeons, quests and titles. */
export interface SagaProgress {
  cls?: ClassId;
  /** The chapter Völvan is on (index in SAGA_CHAPTERS), and whether she has told it yet. */
  chapter: number;
  heard: boolean;
  cleared: DungeonId[];
  titles: string[];
  /** The villagers' quests in progress (id -> how far), and the ones handed in. */
  quests: Record<string, number>;
  done: string[];
  /** Dungeon loot this player has had: pets, mounts, clothes and weapons come once each while there are new ones. */
  found: string[];
}

export const newSagaProgress = (): SagaProgress => ({ chapter: 0, heard: false, cleared: [], titles: [], quests: {}, done: [], found: [] });

/** A monster in a dungeon and its fight (the animal record has where it is and how it looks). */
export interface SagaMob {
  id: number;
  species: string;
  kind: 'mob' | 'mini' | 'boss' | 'add' | 'ice';
  hp: number;
  max: number;
  /** Where it stands until someone comes near (px). */
  home: { x: number; y: number };
  /** Its group in SagaInstance.packs (-1: on its own). */
  pack: number;
  state: 'idle' | 'fight' | 'home';
  /** How much it wants to fight each player; it goes for the one at the top. */
  threat: Record<string, number>;
  target?: string;
  tauntBy?: string;
  tauntUntil?: number;
  stunUntil?: number;
  slowUntil?: number;
  atkAt: number;
  /** An ice block: the player frozen inside, and when it melts by itself. */
  holds?: string;
  meltAt?: number;
  /** Bosses: the phase, when each move is ready, the move being cast. */
  phase?: number;
  next?: number[];
  cast?: { move: number; at: number; zones: string[] };
  pulledAt?: number;
}

export interface SagaPack {
  members: number[];
  dead: boolean;
}

/** A player in a dungeon. */
export interface SagaFighter {
  cls: ClassId;
  hp: number;
  max: number;
  /** When each spell is ready again, and the short pause after any spell. */
  cd: Record<string, number>;
  gcd: number;
  /** Fell (time); gets up at the last rest stone after DOWN_MS unless a healer is quicker. */
  down?: number;
  /** Until when: shield wall, berserk rage, slowed. */
  wall?: number;
  rage?: number;
  slow?: number;
  /** The healing ring: until when, and how much a second. */
  hot?: { until: number; per: number };
  /** Frozen in an ice block (its id): no walking or spells until it breaks. */
  frozen?: number;
  /** Last time they hit or were hit (health comes back by itself after CALM_MS). */
  fightAt: number;
  /** The monster they last attacked: spells without a target go for it. */
  target?: number;
  potionAt?: number;
}

/** A boss's attack on its way down (shown on the ground), or burning ground that stays a while. */
export interface SagaZone {
  id: string;
  shape: 'circle' | 'cone';
  /** Centre (cones: the tip) in px, radius in tiles, cone direction (radians) and width (degrees). */
  x: number;
  y: number;
  r: number;
  dir?: number;
  arc?: number;
  /** When it lands (server ms); burning ground lasts until `until` and hurts `dmg` a second. */
  at: number;
  until?: number;
  dmg: number;
  /** The boss that made it. */
  by: number;
}

/** A dungeon while the family is in it. Rebuilt from scratch when nobody has been inside for a while. */
export interface SagaInstance {
  id: DungeonId;
  /** Tiles: where you arrive, the way out, the rest stones in order, the gate after the mid-boss. */
  start: { x: number; y: number };
  exit: { x: number; y: number };
  rests: { x: number; y: number }[];
  /** The last rest stone someone has reached (-1: none yet; you get up at the start). */
  checkpoint: number;
  gate: { x: number; y: number }[];
  gateOpen: boolean;
  packs: SagaPack[];
  mobs: Record<number, SagaMob>;
  fighters: Record<string, SagaFighter>;
  zones: SagaZone[];
  /** Animal ids of the mid-boss and the boss. */
  mini: number;
  boss: number;
  miniDown: boolean;
  bossDown: boolean;
  /** Chests: object id -> the players who have opened it. */
  looted: Record<number, string[]>;
  /** Everyone has fallen: the party gets up at the last rest stone at this time. */
  wipeAt?: number;
  /** When the last player left (the dungeon starts over after SAGA_RESET_MS). */
  emptySince?: number;
  seq: number;
}

/** Nobody inside for this long: the dungeon starts over (monsters back, chests closed). */
export const SAGA_RESET_MS = 3 * 60_000;
