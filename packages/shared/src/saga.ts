// Sagan om Världsträdet: dungeons for the family in the spirit of the big online adventure games.
// Pick a class (tank, healer or damage) with four spells; clear three dungeons in order, each a long
// map of monster packs, rest stones, a gate, a mid-boss and a boss whose big attacks are telegraphed;
// win loot in rarity colours. Völvan Sigrun in the city tells the saga, one chapter per dungeon.
// Data only: the rules live in sagasim.ts, the maps are built by sagamap.ts.
import type { Outfit, PlayerState, Terrain } from './types.ts';

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
  // Act II, Lokes list. Helheim: a sheet ghost with a lantern, a two-headed hound, a bone spider that spits webs
  gengangare: { species: 'gengangare', name: 'Gengångare', hp: 190, dmg: 8, atkMs: 1600, reach: 1.4, speed: 2.4, aggro: 4.5 },
  helhund: { species: 'helhund', name: 'Helhund', hp: 150, dmg: 7, atkMs: 1200, reach: 1.3, speed: 3.6, aggro: 5 },
  benspindel: { species: 'benspindel', name: 'Benspindel', hp: 120, dmg: 6, atkMs: 2000, reach: 5, speed: 2.2, aggro: 6, slows: true },
  // Svartalfheims gruvor: a troll in a miner's helmet, a golden beetle, a golem of stone
  gruvtroll: { species: 'gruvtroll', name: 'Gruvtroll', hp: 230, dmg: 9, atkMs: 1700, reach: 1.5, speed: 2.3, aggro: 4.5 },
  guldbagge: { species: 'guldbagge', name: 'Guldbagge', hp: 90, dmg: 5, atkMs: 1100, reach: 1.2, speed: 3.6, aggro: 5 },
  stengolem: { species: 'stengolem', name: 'Stengolem', hp: 380, dmg: 13, atkMs: 2300, reach: 1.6, speed: 1.7, aggro: 4 },
  // Havsormens tempel: a skeleton in seaweed with a trident, a giant crab, a glowing jellyfish that floats
  sjodraug: { species: 'sjodraug', name: 'Sjödraug', hp: 200, dmg: 8, atkMs: 1600, reach: 1.4, speed: 2.4, aggro: 4.5 },
  jattekrabba: { species: 'jattekrabba', name: 'Jättekrabba', hp: 260, dmg: 10, atkMs: 1900, reach: 1.5, speed: 2, aggro: 4.5 },
  manet: { species: 'manet', name: 'Lysmanet', hp: 110, dmg: 6, atkMs: 2100, reach: 5, speed: 2, aggro: 6, slows: true },
  // Alvernas lund: a dark elf archer, a giant spider, a walking mushroom guard
  skuggalv: { species: 'skuggalv', name: 'Skuggalv', hp: 160, dmg: 8, atkMs: 1500, reach: 5, speed: 2.6, aggro: 6 },
  jattespindel: { species: 'jattespindel', name: 'Jättespindel', hp: 210, dmg: 9, atkMs: 1700, reach: 1.4, speed: 3, aggro: 5 },
  svampvakt: { species: 'svampvakt', name: 'Svampvakt', hp: 300, dmg: 11, atkMs: 2200, reach: 1.6, speed: 1.8, aggro: 4 },
  // Fenrisklyftan: a grey wolf (bigger than an isvarg), a frost troll's big cousin, a smaller giant with boulders
  ulv: { species: 'ulv', name: 'Ulv', hp: 170, dmg: 8, atkMs: 1200, reach: 1.3, speed: 3.8, aggro: 5.5 },
  rimtroll: { species: 'rimtroll', name: 'Rimtroll', hp: 320, dmg: 12, atkMs: 2000, reach: 1.5, speed: 2.1, aggro: 4.5 },
  bergsjatte: { species: 'bergsjatte', name: 'Bergsjätte', hp: 450, dmg: 15, atkMs: 2500, reach: 1.8, speed: 1.6, aggro: 4 },
  // the web that holds a webbed friend (like the ice block: break it to free them)
  spindelnat: { species: 'spindelnat', name: 'Spindelnät', hp: 60, dmg: 0, atkMs: 999999, reach: 0, speed: 0, aggro: 0 },
};

/** What holds a frozen (or webbed) friend: their fight record's `frozen` is one of these. */
export const BLOCK_SPECIES: ReadonlySet<string> = new Set(['isblock', 'spindelnat']);

/** A boss's big attacks. Every one is telegraphed on the ground (warn ms) before it lands. */
export type BossMove = 'cleave' | 'slam' | 'rain' | 'charge' | 'freeze' | 'pools' | 'nova' | 'summon' | 'line' | 'pull' | 'mend';

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
  /** Mend: how much of its health the boss gets back (a fraction of max) unless it is interrupted. */
  heal?: number;
  /** Line: how wide the strip is (tiles); its length is `radius`. */
  width?: number;
  /** Freeze: what holds the friend ('isblock' when left out, 'spindelnat' for a web). */
  block?: string;
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
  // Act II, Lokes list
  garm: {
    species: 'garm',
    name: 'Garm',
    title: 'Hels hund',
    hp: 1900,
    dmg: 14,
    atkMs: 1800,
    reach: 1.9,
    speed: 2.6,
    phases: [0.5],
    phaseAdds: { species: 'helhund', count: 2 },
    moves: [
      { move: 'charge', name: 'Helbett', every: 9000, first: 5000, warn: 1400, radius: 1.8, dmg: 34, text: 'Garm tar sats och hoppar på någon av er med gapet öppet. Hoppa undan från cirkeln!' },
      { move: 'summon', name: 'Yla!', every: 14000, first: 7000, warn: 1500, radius: 0, count: 2, add: 'helhund', dmg: 0, text: 'Garm ylar och kallar på helhundarna. Ta hand om dem snabbt!' },
    ],
    yells: { pull: 'VOFF! VOFF! Ingen går förbi Garm!', phase: ['AOOOOO! Valpar, kom hit!'], kill: 'Voff!', death: 'Gnyy… ville bara… leka…', wipe: 'Voff voff! Garm vann!' },
    mini: true,
    lore: 'Garm är hunden som vaktar porten till Helheim. Han skäller på alla, men mest för att ingen vill leka med honom.',
  },
  hel: {
    species: 'hel',
    name: 'Hel',
    title: 'Dödsrikets drottning',
    hp: 3400,
    dmg: 16,
    atkMs: 2200,
    reach: 2.2,
    speed: 1.9,
    phases: [0.66, 0.33],
    phaseAdds: { species: 'gengangare', count: 2 },
    moves: [
      { move: 'pull', name: 'Dödens famn', every: 15000, first: 9000, warn: 2200, radius: 7, dmg: 20, text: 'Hel sträcker ut sina kalla händer och drar alla nära sig. Akta er, för sedan kommer Helskriket!' },
      { move: 'nova', name: 'Helskriket', every: 15000, first: 11500, warn: 2400, radius: 4, dmg: 44, interrupt: true, text: 'Hon skriker så det isar i hela salen. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring ut ur cirkeln!' },
      { move: 'rain', name: 'Gravkyla', every: 11000, first: 6000, warn: 1500, radius: 1.5, count: 2, dmg: 28, phase: 1, text: 'Kall dimma stiger upp ur golvet där ni står. Flytta på er!' },
    ],
    yells: { pull: 'Levande barn? Här nere? Jag får ju aldrig besök!', phase: ['Mina gengångare, vakna!', 'Pappa Loke lovade mig hela Midgård!'], kill: 'Välkommen till Helheim.', death: 'Ljuset… är så… varmt…', wipe: 'Helheim har gott om plats. Kom tillbaka när ni vill!' },
    lore: 'Hel är Lokes dotter och drottning över dödsriket. Ena halvan av henne är blek som snö och den andra mörk som natten, och Loke har lovat henne Midgård.',
  },
  jarnvakten: {
    species: 'jarnvakten',
    name: 'Järnväktaren',
    title: 'Dvärgarnas vakt',
    hp: 2100,
    dmg: 15,
    atkMs: 2000,
    reach: 1.8,
    speed: 1.8,
    phases: [0.5],
    phaseAdds: { species: 'guldbagge', count: 3 },
    moves: [
      { move: 'line', name: 'Ångstråle', every: 9000, first: 5000, warn: 1500, radius: 7, width: 1.6, dmg: 36, text: 'Het ånga sprutar ur hans mun i en lång rak stråle. Gå åt sidan!' },
      { move: 'slam', name: 'Järnstamp', every: 8000, first: 3500, warn: 1300, radius: 2.6, dmg: 30, text: 'Han stampar med järnfoten så golvet skakar. Spring ut ur cirkeln!' },
    ],
    yells: { pull: 'KLONK. INKRÄKTARE. UPPTÄCKTA.', phase: ['KLONK KLONK. SKICKAR. BAGGAR.'], kill: 'INKRÄKTARE. BORTA. KLONK.', death: 'Pys… pys… äntligen… vila…', wipe: 'VAKTEN. KLAR. KLONK.' },
    mini: true,
    lore: 'En väktare av järn och ånga som dvärgarna smidde för länge sedan. Han har glömt att dvärgarna flyttade härifrån för hundra år sedan.',
  },
  fafner: {
    species: 'fafner',
    name: 'Fafner',
    title: 'Guldets drake',
    hp: 3800,
    dmg: 17,
    atkMs: 2200,
    reach: 2.4,
    speed: 2,
    phases: [0.6, 0.3],
    phaseAdds: { species: 'guldbagge', count: 3 },
    moves: [
      { move: 'cleave', name: 'Drakeld', every: 9000, first: 5000, warn: 1400, radius: 4.6, arc: 90, dmg: 40, text: 'Han sprutar eld rakt fram. Ställ dig bakom eller bredvid honom!' },
      { move: 'pools', name: 'Smält guld', every: 12000, first: 8000, warn: 1200, radius: 1.5, dmg: 10, linger: 9000, text: 'Smält guld rinner ut på golvet och är hett länge. Stå inte i det!' },
      { move: 'mend', name: 'Guldsömn', every: 20000, first: 15000, warn: 3000, radius: 1, dmg: 0, heal: 0.12, phase: 1, interrupt: true, text: 'Han kryper ihop på sitt guld och sover sig frisk. Väck honom med Sköldslag, Stormsteg eller Isspjut!' },
    ],
    yells: { pull: 'MITT guld! Allt är MITT! Inte ett enda litet mynt får ni!', phase: ['Baggar! Skydda skatten!', 'Loke lovade mig allt guld i hela världen!'], kill: 'Ännu en sak till högen.', death: 'Mitt… fina… guld…', wipe: 'Ha! Guldet stannar hos mig.' },
    lore: 'Fafner var en dvärg som tyckte så mycket om guld att han blev en drake. Nu ligger han på sin skatt och vill aldrig någonsin dela med sig.',
  },
  blackis: {
    species: 'blackis',
    name: 'Bläckis',
    title: 'Tempelbläckfisken',
    hp: 2300,
    dmg: 15,
    atkMs: 1900,
    reach: 2,
    speed: 2.2,
    phases: [0.5],
    phaseAdds: { species: 'manet', count: 2 },
    moves: [
      { move: 'pools', name: 'Bläck', every: 10000, first: 5000, warn: 1100, radius: 1.6, dmg: 9, linger: 8000, text: 'Han sprutar svart bläck som ligger kvar på golvet. Stå inte i bläcket!' },
      { move: 'line', name: 'Tentakelsvep', every: 9000, first: 7000, warn: 1500, radius: 6, width: 1.8, dmg: 34, text: 'En lång tentakel slår ner i en rak linje. Gå åt sidan!' },
    ],
    yells: { pull: 'Blubb! Vem har spårat in sand i MITT fina tempel?', phase: ['Blubb blubb! Maneter, hjälp till!'], kill: 'Blubb!', death: 'Blubb… blubb… bluuubb…', wipe: 'Hihi! Åtta armar är bättre än två!' },
    mini: true,
    lore: 'En jättelik bläckfisk som håller rent i Havsormens tempel. Han blir väldigt arg när någon smutsar ner.',
  },
  jormungand: {
    species: 'jormungand',
    name: 'Jörmungandr',
    title: 'Midgårdsormen',
    hp: 4200,
    dmg: 18,
    atkMs: 2300,
    reach: 2.6,
    speed: 1.9,
    phases: [0.66, 0.33],
    phaseAdds: { species: 'sjodraug', count: 2 },
    moves: [
      { move: 'line', name: 'Svansslag', every: 8000, first: 4500, warn: 1500, radius: 8, width: 2, dmg: 42, text: 'Den väldiga svansen slår ner i en lång rak linje. Gå åt sidan!' },
      { move: 'pull', name: 'Malström', every: 16000, first: 10000, warn: 2200, radius: 7, dmg: 18, text: 'Vattnet virvlar och drar alla nära ormen till honom. Akta er, för sedan kommer Gifteld!' },
      { move: 'nova', name: 'Gifteld', every: 16000, first: 12500, warn: 2600, radius: 4.5, dmg: 44, interrupt: true, text: 'Ormen sprutar grönt gift runt sig. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring ut ur cirkeln!' },
      { move: 'rain', name: 'Störtvåg', every: 12000, first: 6000, warn: 1600, radius: 1.6, count: 3, dmg: 30, phase: 1, text: 'Vågor störtar ner från taket där ni står. Flytta på er!' },
    ],
    yells: { pull: 'Sssså. Små människor i mitt tempel. Vet ni att jag når runt hela Midgård?', phase: ['Sjödraugar, ssstig upp!', 'Sssnart släpper jag min svans, och då skakar hela världen!'], kill: 'Ssslurp.', death: 'Ssss… tillbaka… till havet…', wipe: 'Havet vinner alltid till sssist.' },
    lore: 'Jörmungandr är Midgårdsormen, Lokes son. Han är så lång att han ligger i havet runt hela världen och biter sig själv i svansen.',
  },
  spindeldrottning: {
    species: 'spindeldrottning',
    name: 'Spindeldrottningen',
    title: 'Lundens väverska',
    hp: 2500,
    dmg: 15,
    atkMs: 1900,
    reach: 1.9,
    speed: 2.5,
    phases: [0.5],
    phaseAdds: { species: 'jattespindel', count: 2 },
    moves: [
      { move: 'freeze', name: 'Spindelnät', block: 'spindelnat', every: 15000, first: 9000, warn: 900, radius: 1, dmg: 12, text: 'Hon spinner in någon i ett klibbigt nät. Slå sönder nätet för att rädda din vän!' },
      { move: 'rain', name: 'Giftdroppar', every: 10000, first: 5000, warn: 1400, radius: 1.4, count: 2, dmg: 28, text: 'Gröna droppar faller från taket där ni står. Flytta på er!' },
    ],
    yells: { pull: 'Ssså fina små flugor som har flugit in i min lund!', phase: ['Mina barn! Middagen är serverad!'], kill: 'Insnärjd!', death: 'Mitt… vackra… nät…', wipe: 'Sov gott i mitt nät, små flugor.' },
    mini: true,
    lore: 'En jättelik spindel som har spunnit nät över hela Alvernas lund. Näten är starka som rep och glittrar i månljuset.',
  },
  nattmara: {
    species: 'nattmara',
    name: 'Nattmaran',
    title: 'Drömmarnas skugga',
    hp: 4400,
    dmg: 18,
    atkMs: 2200,
    reach: 2.2,
    speed: 2.1,
    phases: [0.6, 0.3],
    phaseAdds: { species: 'skuggalv', count: 2 },
    moves: [
      { move: 'nova', name: 'Mardröm', every: 15000, first: 7000, warn: 2600, radius: 7, dmg: 46, interrupt: true, text: 'Hon fyller salen med en mardröm. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
      { move: 'pools', name: 'Skuggpölar', every: 11000, first: 5000, warn: 1200, radius: 1.5, dmg: 10, linger: 10000, text: 'Mörka pölar av skugga sprider sig på golvet. Stå inte i dem!' },
      { move: 'mend', name: 'Drömsömn', every: 22000, first: 16000, warn: 3000, radius: 1, dmg: 0, heal: 0.1, phase: 1, interrupt: true, text: 'Hon somnar och drömmer sig frisk. Väck henne med Sköldslag, Stormsteg eller Isspjut!' },
      { move: 'summon', name: 'Skuggor!', every: 18000, first: 4000, warn: 1500, radius: 0, count: 2, add: 'skuggalv', dmg: 0, phase: 2, text: 'Hon kallar fram skuggalver ur mörkret. Ta hand om dem snabbt!' },
    ],
    yells: { pull: 'Shhh… sov nu, små barn. Jag har så otäcka drömmar åt er!', phase: ['Vakna inte! Drömmen har bara börjat!', 'Skuggor, kom fram!'], kill: 'Sov så gott…', death: 'Nej… morgonen… kommer…', wipe: 'Sov gott! Hihihi…' },
    lore: 'Nattmaran smyger in i drömmar och gör dem otäcka. Loke har gett henne makten över Alvernas lund, och nu har ljusalverna slutat lysa.',
  },
  skoll: {
    species: 'skoll',
    name: 'Sköll',
    title: 'Solens jägare',
    hp: 2700,
    dmg: 18,
    atkMs: 1700,
    reach: 1.9,
    speed: 2.8,
    phases: [0.5],
    phaseAdds: { species: 'ulv', count: 2 },
    moves: [
      { move: 'charge', name: 'Språng', every: 8000, first: 4000, warn: 1300, radius: 1.8, dmg: 36, text: 'Sköll tar sats och hoppar på någon av er. Hoppa undan från cirkeln!' },
      { move: 'nova', name: 'Ylande', every: 14000, first: 9000, warn: 2400, radius: 6, dmg: 40, interrupt: true, text: 'Han ylar så att isen spricker. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Grrr! Jag jagar solen över himlen varje dag. Er hinner jag ikapp!', phase: ['Flocken! Till mig!'], kill: 'Fångad!', death: 'Solen… kom undan… igen…', wipe: 'Ingen springer ifrån Sköll!' },
    mini: true,
    lore: 'Sköll är vargen som jagar solen över himlen. Han är snabb som vinden, men han har aldrig hunnit ikapp henne.',
  },
  fenrisulven: {
    species: 'fenrisulven',
    name: 'Fenrisulven',
    title: 'Den bundne',
    hp: 4800,
    dmg: 22,
    atkMs: 2100,
    reach: 2.4,
    speed: 2.4,
    phases: [0.7, 0.4],
    phaseAdds: { species: 'ulv', count: 2 },
    moves: [
      { move: 'charge', name: 'Käftarna', every: 9000, first: 5000, warn: 1400, radius: 2, dmg: 48, text: 'Han hoppar fram med gapet på vid gavel. Hoppa undan från cirkeln!' },
      { move: 'cleave', name: 'Klorna', every: 9000, first: 8000, warn: 1300, radius: 4.2, arc: 100, dmg: 42, text: 'Han slår med klorna i en stor båge framför sig. Ställ dig bakom honom!' },
      { move: 'summon', name: 'Flocken!', every: 16000, first: 3000, warn: 1500, radius: 0, count: 2, add: 'ulv', dmg: 0, phase: 1, text: 'Han kallar på sin flock. Ta hand om ulvarna snabbt!' },
      { move: 'nova', name: 'Vinterylet', every: 15000, first: 5000, warn: 2800, radius: 8, dmg: 50, interrupt: true, phase: 2, text: 'Han ylar så att hela klyftan fryser. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Loke har slitit av mina band! Nu är jag FRI!', phase: ['Flocken! Jakten börjar!', 'Inga band i världen kan hålla mig nu!'], kill: 'AOOOOO!', death: 'Gleipner… igen? Nåja… den var ju… mjuk…', wipe: 'Ingen binder Fenrisulven!' },
    lore: 'Fenrisulven är Lokes jättelika varg. Gudarna band honom med Gleipner, ett band mjukt som silke, men Loke har släppt honom fri.',
  },
  lokesskugga: {
    species: 'lokesskugga',
    name: 'Lokes skugga',
    title: 'En lögn i mörkret',
    hp: 3000,
    dmg: 19,
    atkMs: 2000,
    reach: 2,
    speed: 2.3,
    phases: [0.5],
    phaseAdds: { species: 'skelett', count: 2 },
    moves: [
      { move: 'rain', name: 'Falska stjärnor', every: 10000, first: 5000, warn: 1500, radius: 1.5, count: 3, dmg: 34, text: 'Stjärnor som inte ens är riktiga faller ner där ni står. Flytta på er!' },
      { move: 'nova', name: 'Hånskratt', every: 15000, first: 9000, warn: 2400, radius: 6, dmg: 42, interrupt: true, text: 'Skuggan skrattar så det ekar. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
    ],
    yells: { pull: 'Buh! Trodde ni att jag var Loke? Fel! Jag är bara hans skugga. Hihi!', phase: ['Kom fram, gamla benrangel!'], kill: 'Hihi! Lurad!', death: 'Men… jag är ju bara… en skugga… puff!', wipe: 'Hahaha! Ni slogs mot en skugga och förlorade!' },
    mini: true,
    lore: 'En skugga som Loke har trollat fram av en lögn. Den härmar allt han gör, fast lite sämre.',
  },
  loke: {
    species: 'loke',
    name: 'Loke',
    title: 'Lögnernas fader',
    hp: 6000,
    dmg: 24,
    atkMs: 2200,
    reach: 2.2,
    speed: 2.3,
    phases: [0.8, 0.6, 0.4, 0.2],
    phaseAdds: { species: 'isvarg', count: 2 },
    // one move for every boss the family has beaten before, each from a later phase
    moves: [
      { move: 'cleave', name: 'Kungasvärdet', every: 9000, first: 5000, warn: 1300, radius: 3.6, arc: 100, dmg: 44, text: 'Han härmar Draugkungen och svingar ett svärd i en stor båge. Ställ dig bakom honom!' },
      { move: 'nova', name: 'Snöstorm', every: 16000, first: 6000, warn: 2600, radius: 8, dmg: 40, interrupt: true, phase: 1, text: 'Han härmar Rimtursen och kallar på en snöstorm. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring långt bort!' },
      { move: 'pools', name: 'Lavapölar', every: 12000, first: 8000, warn: 1200, radius: 1.6, dmg: 11, linger: 9000, phase: 2, text: 'Han härmar Surt, och lava väller upp under er. Flytta på er!' },
      { move: 'mend', name: 'Lokes list', every: 22000, first: 16000, warn: 3000, radius: 1, dmg: 0, heal: 0.08, interrupt: true, phase: 2, text: 'Han låtsas sova och läker sig i smyg. Avbryt med Sköldslag, Stormsteg eller Isspjut!' },
      { move: 'pull', name: 'Dödens famn', every: 15000, first: 9000, warn: 2200, radius: 7, dmg: 20, phase: 3, text: 'Han härmar Hel och drar alla nära sig. Akta er, för sedan kommer Helskriket!' },
      { move: 'nova', name: 'Helskriket', every: 15000, first: 11500, warn: 2400, radius: 4, dmg: 44, interrupt: true, phase: 3, text: 'Han skriker som Hel. Avbryt med Sköldslag, Stormsteg eller Isspjut, eller spring ut ur cirkeln!' },
      { move: 'line', name: 'Svansslag', every: 8000, first: 4500, warn: 1500, radius: 8, width: 2, dmg: 48, phase: 4, text: 'Han trollar fram Midgårdsormens svans, som slår ner i en lång rak linje. Gå åt sidan!' },
    ],
    yells: {
      pull: 'Ni trodde Surt var farlig? Han var bara min hantlangare! Välkomna till min lilla bro. Hihi!',
      phase: ['Brrr! Titta, nu är jag Rimtursen! Snöstorm!', 'Och nu är jag Surt! Akta tårna, det bränns!', 'Buuu! Jag är Hel! Kom hit och få en kram!', 'Sssså! Midgårdsormen har en svans. Nu har jag också en!'],
      kill: 'Hoppsan! Var det jag som gjorde så?',
      death: 'Ni… ni fuskade! Ingen besegrar Loke!… Nåja. Den här gången.',
      wipe: 'Hahaha! Ska vi ta det en gång till?',
    },
    lore: 'Loke är en gud som älskar spratt och lögner. Han släppte loss Draugkungen, Rimtursen och Surt, och nu vill han starta Ragnarök. Men han tycker lite för mycket om att visa upp sig.',
  },
};

// ---------------------------------------------------------------------------
// The dungeons
// ---------------------------------------------------------------------------

export type DungeonId = 'draug' | 'frost' | 'surt' | 'hel' | 'dvarg' | 'orm' | 'alv' | 'fenrir' | 'loke';
/** In the order the saga visits them (an arch's variant out in the world is the index here). */
export const DUNGEON_IDS: readonly DungeonId[] = ['draug', 'frost', 'surt', 'hel', 'dvarg', 'orm', 'alv', 'fenrir', 'loke'];
export const isDungeonId = (s: unknown): s is DungeonId => typeof s === 'string' && (DUNGEON_IDS as readonly string[]).includes(s);

/** A puzzle room has three plates on its floor; the way on towards the boss opens when they all light up. */
export type SagaRoomKind = 'start' | 'pack' | 'rest' | 'mini' | 'treasure' | 'boss' | 'puzzle';

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
  /** The monsters here are Loke's illusions: their animals get variant 1 (drawn ghostly and see-through). */
  illusions?: boolean;
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
  // Act II, Lokes list
  hel: {
    id: 'hel',
    name: 'Helheim',
    chapter: 5,
    intro: 'Allt är grått och stilla. Lyktor svävar i dimman, och någonstans långt ner skäller en hund. Hel väntar längst in.',
    portal: { area: 'a:-1,0', x: 30, y: 34 },
    floor: 'mud',
    bossFloor: 'crypt',
    wall: 3,
    ambient: [0.4, 0.55, 0.5],
    // a long way down: from the gate at the top, back and forth to Hel's hall at the very bottom
    rooms: [
      { x: 26, y: 3, w: 11, h: 9, kind: 'start' },
      { x: 4, y: 3, w: 14, h: 12, kind: 'pack', packs: [['gengangare', 'gengangare'], ['helhund', 'helhund']] },
      { x: 4, y: 22, w: 14, h: 11, kind: 'pack', packs: [['benspindel', 'gengangare', 'gengangare'], ['helhund', 'helhund', 'benspindel']] },
      { x: 24, y: 23, w: 8, h: 8, kind: 'rest' },
      { x: 40, y: 17, w: 15, h: 14, kind: 'mini' },
      { x: 44, y: 3, w: 11, h: 9, kind: 'treasure', packs: [['helhund', 'gengangare', 'benspindel']] },
      { x: 42, y: 37, w: 17, h: 10, kind: 'pack', packs: [['gengangare', 'gengangare', 'benspindel'], ['helhund', 'helhund', 'helhund']], gated: true },
      { x: 44, y: 51, w: 14, h: 10, kind: 'pack', packs: [['gengangare', 'benspindel', 'benspindel'], ['helhund', 'gengangare', 'gengangare']] },
      { x: 30, y: 52, w: 8, h: 8, kind: 'rest' },
      { x: 3, y: 38, w: 22, h: 22, kind: 'boss' },
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
      [8, 9],
    ],
    mini: 'garm',
    boss: 'hel',
    decor: ['saga_gravestone', 'saga_skullpile', 'saga_ghostlight', 'saga_deadtree'],
  },
  dvarg: {
    id: 'dvarg',
    name: 'Svartalfheims gruvor',
    chapter: 6,
    intro: 'Det knackar och klirrar i berget. Gruvlyktor lyser gult längs väggarna, och överallt glittrar det av guld.',
    portal: { area: 'a:2,0', x: 30, y: 30 },
    floor: 'gravel',
    bossFloor: 'floor_stone',
    wall: 4,
    ambient: [0.6, 0.5, 0.35],
    // two wings: down the left side of the mountain to the Iron Guard, then up the right one to the dragon's hoard
    rooms: [
      { x: 27, y: 3, w: 10, h: 9, kind: 'start' },
      { x: 4, y: 4, w: 15, h: 11, kind: 'pack', packs: [['gruvtroll', 'guldbagge', 'guldbagge'], ['gruvtroll', 'gruvtroll']] },
      { x: 4, y: 22, w: 14, h: 12, kind: 'pack', packs: [['stengolem', 'guldbagge'], ['guldbagge', 'guldbagge', 'guldbagge', 'gruvtroll']] },
      { x: 6, y: 42, w: 9, h: 8, kind: 'rest' },
      { x: 22, y: 45, w: 16, h: 15, kind: 'mini' },
      { x: 23, y: 25, w: 11, h: 9, kind: 'treasure', packs: [['gruvtroll', 'gruvtroll', 'guldbagge']] },
      { x: 45, y: 48, w: 15, h: 11, kind: 'pack', packs: [['stengolem', 'gruvtroll'], ['guldbagge', 'guldbagge', 'gruvtroll', 'gruvtroll']], gated: true },
      { x: 51, y: 36, w: 8, h: 7, kind: 'rest' },
      // three golden plates to press before the door to the hoard opens
      { x: 37, y: 26, w: 12, h: 11, kind: 'puzzle', packs: [['stengolem', 'guldbagge', 'guldbagge']] },
      { x: 41, y: 3, w: 20, h: 18, kind: 'boss' },
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
      [8, 9],
    ],
    mini: 'jarnvakten',
    boss: 'fafner',
    decor: ['saga_minecart', 'saga_goldpile', 'saga_dwarfstatue', 'saga_minelamp'],
  },
  orm: {
    id: 'orm',
    name: 'Havsormens tempel',
    chapter: 7,
    intro: 'Vatten droppar från taket och tången vajar fast det inte blåser. Långt in ringlar något stort, stort, stort.',
    portal: { area: 'a:-2,0', x: 30, y: 30 },
    floor: 'sand',
    bossFloor: 'floor_stone',
    wall: 5,
    ambient: [0.35, 0.55, 0.7],
    // a ring around a hub: round the temple's left side, into the octopus's hall in the middle, then out on the right
    rooms: [
      { x: 25, y: 51, w: 12, h: 9, kind: 'start' },
      { x: 4, y: 47, w: 14, h: 12, kind: 'pack', packs: [['sjodraug', 'sjodraug'], ['jattekrabba', 'manet']] },
      { x: 4, y: 26, w: 14, h: 12, kind: 'pack', packs: [['manet', 'manet', 'sjodraug'], ['jattekrabba', 'jattekrabba']] },
      { x: 5, y: 5, w: 9, h: 8, kind: 'rest' },
      { x: 20, y: 4, w: 16, h: 10, kind: 'pack', packs: [['sjodraug', 'sjodraug', 'manet'], ['jattekrabba', 'sjodraug', 'sjodraug']] },
      { x: 24, y: 22, w: 16, h: 16, kind: 'mini' },
      { x: 43, y: 4, w: 11, h: 9, kind: 'treasure', packs: [['jattekrabba', 'manet', 'manet']] },
      { x: 46, y: 20, w: 15, h: 12, kind: 'pack', packs: [['sjodraug', 'sjodraug', 'jattekrabba'], ['manet', 'manet', 'sjodraug', 'sjodraug']], gated: true },
      { x: 52, y: 35, w: 8, h: 6, kind: 'rest' },
      { x: 40, y: 43, w: 21, h: 17, kind: 'boss' },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [5, 7],
      [7, 8],
      [8, 9],
    ],
    mini: 'blackis',
    boss: 'jormungand',
    decor: ['saga_coral', 'saga_anchor', 'saga_seaweed', 'saga_pearl'],
  },
  alv: {
    id: 'alv',
    name: 'Alvernas lund',
    chapter: 8,
    intro: 'Svampar lyser lila i skymningen och spindelnät glittrar mellan träden. Det är vackert, men alldeles för tyst.',
    portal: { area: 'a:1,-1', x: 30, y: 30 },
    floor: 'moss',
    bossFloor: 'grass',
    wall: 6,
    ambient: [0.45, 0.4, 0.65],
    // a winding path: along the top of the grove, back through the middle, and along the bottom to the Night Mare
    rooms: [
      { x: 3, y: 4, w: 10, h: 9, kind: 'start' },
      { x: 18, y: 3, w: 14, h: 11, kind: 'pack', packs: [['skuggalv', 'jattespindel'], ['svampvakt', 'skuggalv']] },
      { x: 37, y: 3, w: 13, h: 11, kind: 'pack', packs: [['jattespindel', 'jattespindel', 'skuggalv'], ['svampvakt', 'svampvakt']] },
      { x: 53, y: 4, w: 8, h: 8, kind: 'rest' },
      { x: 45, y: 20, w: 15, h: 14, kind: 'mini' },
      { x: 50, y: 41, w: 10, h: 9, kind: 'treasure', packs: [['skuggalv', 'skuggalv', 'jattespindel']] },
      { x: 24, y: 21, w: 15, h: 11, kind: 'pack', packs: [['svampvakt', 'jattespindel', 'jattespindel'], ['skuggalv', 'skuggalv', 'svampvakt']], gated: true },
      // three rune plates among the mushrooms
      { x: 3, y: 20, w: 14, h: 13, kind: 'puzzle', packs: [['svampvakt', 'skuggalv', 'skuggalv']] },
      { x: 4, y: 40, w: 9, h: 8, kind: 'rest' },
      { x: 18, y: 39, w: 24, h: 21, kind: 'boss' },
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
      [8, 9],
    ],
    mini: 'spindeldrottning',
    boss: 'nattmara',
    decor: ['saga_glowshroom', 'saga_fairylight', 'saga_cobweb', 'saga_elfstatue'],
  },
  fenrir: {
    id: 'fenrir',
    name: 'Fenrisklyftan',
    chapter: 9,
    intro: 'Kall vind ylar genom klyftan. Tunga kedjor ligger slängda på isen, och de är alla sönderslitna.',
    portal: { area: 'a:0,-2', x: 12, y: 44 },
    floor: 'snow',
    bossFloor: 'stone',
    wall: 7,
    ambient: [0.55, 0.6, 0.75],
    // down into the chasm, back and forth, to the place where the wolf was once bound
    rooms: [
      { x: 4, y: 3, w: 11, h: 9, kind: 'start' },
      { x: 21, y: 3, w: 15, h: 11, kind: 'pack', packs: [['ulv', 'ulv'], ['rimtroll', 'ulv']] },
      { x: 44, y: 3, w: 16, h: 12, kind: 'pack', packs: [['ulv', 'ulv', 'ulv'], ['bergsjatte', 'rimtroll']] },
      { x: 50, y: 21, w: 9, h: 8, kind: 'rest' },
      { x: 26, y: 19, w: 16, h: 15, kind: 'mini' },
      { x: 4, y: 20, w: 11, h: 9, kind: 'treasure', packs: [['rimtroll', 'ulv', 'ulv']] },
      { x: 3, y: 36, w: 15, h: 11, kind: 'pack', packs: [['bergsjatte', 'ulv', 'ulv'], ['rimtroll', 'rimtroll']], gated: true },
      { x: 5, y: 52, w: 8, h: 8, kind: 'rest' },
      { x: 18, y: 48, w: 15, h: 12, kind: 'pack', packs: [['ulv', 'ulv', 'rimtroll'], ['bergsjatte', 'ulv']] },
      { x: 37, y: 38, w: 24, h: 22, kind: 'boss' },
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
      [8, 9],
    ],
    mini: 'skoll',
    boss: 'fenrisulven',
    decor: ['saga_chain', 'saga_icefang', 'saga_wolfstatue', 'saga_bonepile'],
  },
  loke: {
    id: 'loke',
    name: 'Bifrost',
    chapter: 10,
    intro: 'Regnbågsbron glittrar över stjärnhimlen. Allt ser lite för fint ut, och någon fnissar bakom er…',
    portal: { area: 'a:1,3', x: 30, y: 24 },
    floor: 'bifrost',
    bossFloor: 'bifrost',
    wall: 8,
    ambient: [0.7, 0.6, 0.85],
    // an arc like a rainbow: up the left side, over the top past Loke's shadow, through the hall of mirrors and down to Loke
    rooms: [
      { x: 3, y: 50, w: 11, h: 10, kind: 'start' },
      { x: 4, y: 33, w: 13, h: 11, kind: 'pack', packs: [['skelett', 'skelett', 'gengangare'], ['isvarg', 'isvarg']] },
      { x: 5, y: 15, w: 14, h: 11, kind: 'pack', packs: [['eldhund', 'eldhund'], ['gengangare', 'gengangare', 'skelett']] },
      { x: 6, y: 3, w: 8, h: 7, kind: 'rest' },
      { x: 22, y: 3, w: 15, h: 13, kind: 'mini' },
      { x: 24, y: 24, w: 11, h: 9, kind: 'treasure', packs: [['eldhund', 'eldhund', 'skelett']] },
      { x: 42, y: 3, w: 14, h: 11, kind: 'pack', packs: [['gengangare', 'gengangare', 'eldhund'], ['isvarg', 'isvarg', 'skelett']], gated: true },
      // the hall of mirrors: three plates, and only the real ones light up
      { x: 44, y: 19, w: 15, h: 12, kind: 'puzzle', packs: [['eldhund', 'gengangare', 'skelett']] },
      { x: 50, y: 35, w: 8, h: 6, kind: 'rest' },
      { x: 26, y: 43, w: 24, h: 17, kind: 'boss' },
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
      [8, 9],
    ],
    mini: 'lokesskugga',
    boss: 'loke',
    decor: ['saga_rainbowshard', 'saga_mirror', 'saga_starlamp', 'saga_runepillar'],
    illusions: true,
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
  // Act II, Lokes list
  garm: { coins: [40, 70], stars: 0, gear: [{ item: 'shirt_helrustning', weight: 2 }, { item: 'garmklo', weight: 2 }, { item: 'offhand_helskold', weight: 2 }, { item: 'healing_potion', weight: 4 }] },
  hel: {
    coins: [120, 180],
    stars: 1,
    gear: [{ item: 'helsvard', weight: 3 }, { item: 'garmklo', weight: 2 }, { item: 'hat_helhjalm', weight: 3 }, { item: 'shirt_helrustning', weight: 2 }, { item: 'amulet_helring', weight: 3 }, { item: 'offhand_helskold', weight: 2 }],
    rare: [{ item: 'pet_garmvalp', chance: 0.2 }],
  },
  jarnvakten: { coins: [45, 75], stars: 0, gear: [{ item: 'shirt_dvargbrynja', weight: 2 }, { item: 'gruvhacka', weight: 2 }, { item: 'offhand_dvargskold', weight: 2 }, { item: 'healing_potion', weight: 3 }, { item: 'styrkedryck', weight: 2 }] },
  fafner: {
    coins: [130, 200],
    stars: 1,
    gear: [{ item: 'fafnerstand', weight: 3 }, { item: 'gruvhacka', weight: 2 }, { item: 'hat_dvarghjalm', weight: 3 }, { item: 'shirt_dvargbrynja', weight: 2 }, { item: 'amulet_andvaranaut', weight: 3 }, { item: 'offhand_dvargskold', weight: 2 }, { item: 'offhand_runbok', weight: 2 }],
    rare: [{ item: 'pet_guldbagge', chance: 0.2 }],
  },
  blackis: { coins: [50, 80], stars: 0, gear: [{ item: 'shirt_fjallrustning', weight: 2 }, { item: 'korallspjut', weight: 1 }, { item: 'offhand_koger', weight: 2 }, { item: 'healing_potion', weight: 3 }, { item: 'styrkedryck', weight: 2 }] },
  jormungand: {
    coins: [140, 220],
    stars: 1,
    gear: [{ item: 'korallspjut', weight: 3 }, { item: 'stormbage', weight: 3 }, { item: 'hat_sjokrona', weight: 3 }, { item: 'shirt_fjallrustning', weight: 2 }, { item: 'offhand_perlemorskold', weight: 2 }, { item: 'amulet_perla', weight: 3 }],
    rare: [
      { item: 'pet_lysmanet', chance: 0.2 },
      { item: 'mount_havshast', chance: 0.12 },
    ],
  },
  spindeldrottning: { coins: [55, 85], stars: 0, gear: [{ item: 'shirt_alvmantel', weight: 2 }, { item: 'alvklinga', weight: 1 }, { item: 'offhand_alvlykta', weight: 1 }, { item: 'healing_potion', weight: 3 }, { item: 'styrkedryck', weight: 2 }] },
  nattmara: {
    coins: [150, 230],
    stars: 1,
    gear: [{ item: 'alvklinga', weight: 3 }, { item: 'manstav', weight: 3 }, { item: 'hat_alvkrona', weight: 3 }, { item: 'shirt_alvmantel', weight: 2 }, { item: 'offhand_alvlykta', weight: 2 }, { item: 'amulet_alvsten', weight: 3 }],
    rare: [
      { item: 'pet_alvljus', chance: 0.2 },
      { item: 'mount_jattehjort', chance: 0.12 },
    ],
  },
  skoll: { coins: [60, 90], stars: 0, gear: [{ item: 'shirt_ulvpals', weight: 2 }, { item: 'tyrsyxa', weight: 1 }, { item: 'offhand_tyrshandske', weight: 1 }, { item: 'healing_potion', weight: 3 }, { item: 'styrkedryck', weight: 2 }] },
  fenrisulven: {
    coins: [160, 250],
    stars: 1,
    gear: [{ item: 'fenristand', weight: 3 }, { item: 'tyrsyxa', weight: 3 }, { item: 'hat_ulvhuva', weight: 3 }, { item: 'shirt_ulvpals', weight: 2 }, { item: 'offhand_tyrshandske', weight: 2 }, { item: 'amulet_gleipnir', weight: 3 }],
    rare: [
      { item: 'pet_ulvvalp', chance: 0.22 },
      { item: 'mount_fenrisulv', chance: 0.12 },
    ],
  },
  lokesskugga: { coins: [70, 100], stars: 0, gear: [{ item: 'shirt_lokesmantel', weight: 1 }, { item: 'offhand_lokesmask', weight: 1 }, { item: 'bifrostbage', weight: 1 }, { item: 'healing_potion', weight: 3 }, { item: 'styrkedryck', weight: 3 }] },
  loke: {
    coins: [250, 400],
    stars: 3,
    gear: [{ item: 'lokesstav', weight: 3 }, { item: 'bifrostbage', weight: 3 }, { item: 'heimdallshorn', weight: 2 }, { item: 'hat_lokeshorn', weight: 3 }, { item: 'shirt_lokesmantel', weight: 2 }, { item: 'offhand_lokesmask', weight: 2 }, { item: 'amulet_brisingamen', weight: 3 }],
    rare: [{ item: 'mount_lokeshast', chance: 0.25 }],
  },
};

/** The treasure chest in each dungeon's side room. */
export const SAGA_TREASURE: Record<DungeonId, SagaLoot> = {
  draug: { coins: [25, 45], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'old_coin', weight: 3 }, { item: 'gold', weight: 2 }] },
  frost: { coins: [35, 60], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'crystal', weight: 3 }, { item: 'gem', weight: 1 }] },
  surt: { coins: [45, 80], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'fire_crystal', weight: 3 }, { item: 'obsidian', weight: 2 }] },
  hel: { coins: [50, 80], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'old_coin', weight: 3 }, { item: 'crystal', weight: 2 }, { item: 'styrkedryck', weight: 1 }] },
  dvarg: { coins: [55, 90], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'gold', weight: 3 }, { item: 'gem', weight: 2 }, { item: 'styrkedryck', weight: 2 }] },
  orm: { coins: [60, 95], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'pearl', weight: 3 }, { item: 'shell', weight: 2 }, { item: 'styrkedryck', weight: 2 }] },
  alv: { coins: [65, 100], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'fairy_dust', weight: 3 }, { item: 'glowshroom', weight: 2 }, { item: 'styrkedryck', weight: 2 }] },
  fenrir: { coins: [70, 110], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'crystal', weight: 3 }, { item: 'fur', weight: 2 }, { item: 'styrkedryck', weight: 2 }] },
  loke: { coins: [80, 130], stars: 0, gear: [{ item: 'healing_potion', weight: 3 }, { item: 'star_crystal', weight: 3 }, { item: 'gem', weight: 2 }, { item: 'styrkedryck', weight: 2 }] },
};

/** Loot only found in the dungeons (registered as items in data.ts). */
export interface SagaItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  kind: 'weapon' | 'offhand' | 'amulet' | 'hat' | 'shirt' | 'pet' | 'mount' | 'potion' | 'decor' | 'quest' | 'material';
  /** Weapons: the farm tool it works as, and its glow (a colour, or 'rainbow' for one that shifts through them all). */
  tool?: 'sword' | 'axe' | 'hammer' | 'bow';
  glow?: string;
  /**
   * Gear: what it adds while equipped. power: a fraction more damage and healing; hp: health on top of the class's;
   * armor: a fraction of every hit taken away (all pieces together at most ARMOR_CAP).
   */
  stats?: { power?: number; hp?: number; armor?: number };
  /** Gear: the classes it suits best ("Passar: …"); it gives a little more power to them, but anyone may use it. */
  classes?: ClassId[];
  /** Clothes: drawing style and colour. */
  style?: string;
  color?: string;
  /** Pets and mounts: the animal it gives. */
  species?: string;
  /** A hero level's reward (LEVEL_REWARDS): handed out when the level is reached, never found in a chest. */
  levelReward?: number;
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
  // Act II: weapons from Lokes list (each suits some classes best, but anyone can use anything)
  { id: 'helsvard', name: 'Helsvärd', rarity: 'rare', kind: 'weapon', tool: 'sword', glow: '#9cffc8', classes: ['vaktare', 'krigare'], text: 'Ett blekt svärd som lyser som en lykta i dimman.' },
  { id: 'garmklo', name: 'Garms klo', rarity: 'rare', kind: 'weapon', tool: 'axe', glow: '#c8ff6a', classes: ['krigare'], text: 'En yxa formad som en stor hundklo. Voff!' },
  { id: 'gruvhacka', name: 'Dvärgarnas hacka', rarity: 'rare', kind: 'weapon', tool: 'hammer', glow: '#ffcf6a', classes: ['krigare', 'vaktare'], text: 'Den hittar guld alldeles av sig själv.' },
  { id: 'fafnerstand', name: 'Fafners tand', rarity: 'epic', kind: 'weapon', tool: 'sword', glow: '#ffd23f', classes: ['vaktare', 'krigare'], text: 'En draktand, vass som ett svärd och varm som en brasa.' },
  { id: 'korallspjut', name: 'Korallspjutet', rarity: 'epic', kind: 'weapon', tool: 'sword', glow: '#ff8a9a', classes: ['vaktare', 'krigare'], text: 'En treudd av rosa korall. Den luktar lite hav.' },
  { id: 'stormbage', name: 'Stormbågen', rarity: 'epic', kind: 'weapon', tool: 'bow', glow: '#7fd0ff', classes: ['magiker'], text: 'Pilarna susar som havsvinden.' },
  { id: 'alvklinga', name: 'Alvklingan', rarity: 'epic', kind: 'weapon', tool: 'sword', glow: '#d6a8ff', classes: ['krigare', 'vaktare'], text: 'Lätt som en fjäder och blank som månen.' },
  { id: 'manstav', name: 'Månstaven', rarity: 'epic', kind: 'weapon', tool: 'hammer', glow: '#e8d8ff', classes: ['helare', 'magiker'], text: 'En stav med en liten måne i toppen. Den lyser mest på natten.' },
  { id: 'fenristand', name: 'Fenristanden', rarity: 'legendary', kind: 'weapon', tool: 'sword', glow: '#cfe8ff', classes: ['vaktare', 'krigare'], text: 'Fenrisulvens tappade mjölktand. Den är större än du!' },
  { id: 'tyrsyxa', name: 'Tyrs yxa', rarity: 'legendary', kind: 'weapon', tool: 'axe', glow: '#ffe8a0', classes: ['krigare'], text: 'Guden Tyr var modigast av alla. Hans yxa är det också.' },
  { id: 'lokesstav', name: 'Lokes stav', rarity: 'legendary', kind: 'weapon', tool: 'hammer', glow: '#7affb0', classes: ['magiker', 'helare'], text: 'Den byter färg när ingen tittar.' },
  { id: 'bifrostbage', name: 'Bifrostbågen', rarity: 'legendary', kind: 'weapon', tool: 'bow', glow: '#ffb0f0', classes: ['magiker'], text: 'Varje pil lämnar en liten regnbåge efter sig.' },
  { id: 'heimdallshorn', name: 'Heimdalls horn', rarity: 'legendary', kind: 'weapon', tool: 'hammer', glow: 'rainbow', classes: ['helare'], text: 'När det blåses hörs det i alla nio världar.' },
  // offhands: a shield, a book or a quiver in the other hand
  { id: 'offhand_helskold', name: 'Helsköld', rarity: 'uncommon', kind: 'offhand', stats: { armor: 0.06 }, text: 'En rund sköld, kall som en vinternatt.' },
  { id: 'offhand_runbok', name: 'Runboken', rarity: 'rare', kind: 'offhand', stats: { power: 0.06 }, classes: ['helare', 'magiker'], text: 'Full av runor. Några av dem kittlar.' },
  { id: 'offhand_dvargskold', name: 'Dvärgsköld', rarity: 'rare', kind: 'offhand', stats: { armor: 0.1 }, classes: ['vaktare'], text: 'Smidd av dvärgar, så den håller för vad som helst.' },
  { id: 'offhand_koger', name: 'Snäckkogret', rarity: 'rare', kind: 'offhand', stats: { power: 0.06 }, classes: ['magiker', 'helare'], text: 'Ett koger av snäckskal som aldrig blir tomt.' },
  { id: 'offhand_perlemorskold', name: 'Pärlemorskölden', rarity: 'epic', kind: 'offhand', stats: { armor: 0.12, hp: 15 }, text: 'Den skimrar i alla regnbågens färger.' },
  { id: 'offhand_alvlykta', name: 'Alvlyktan', rarity: 'epic', kind: 'offhand', stats: { power: 0.08, hp: 10 }, text: 'En liten lykta med en alv inuti. Ibland vinkar hon.' },
  { id: 'offhand_tyrshandske', name: 'Tyrs handske', rarity: 'legendary', kind: 'offhand', stats: { armor: 0.14, power: 0.04 }, text: 'Guden Tyrs järnhandske. Den är lite för stor, men det gör inget.' },
  { id: 'offhand_lokesmask', name: 'Lokes mask', rarity: 'legendary', kind: 'offhand', stats: { power: 0.1, hp: 10 }, text: 'En mask som ler. Ibland blinkar den åt dig.' },
  // amulets
  { id: 'amulet_vegvisir', name: 'Vegvisir', rarity: 'uncommon', kind: 'amulet', stats: { hp: 10 }, text: 'En runa som visar vägen hem, var du än är.' },
  { id: 'amulet_helring', name: 'Hels ring', rarity: 'rare', kind: 'amulet', stats: { hp: 20 }, text: 'En ring av svart sten. Den är alltid lite kall.' },
  { id: 'amulet_andvaranaut', name: 'Andvaranaut', rarity: 'epic', kind: 'amulet', stats: { power: 0.08 }, text: 'Fafners ring. Den vill gärna ha mer guld.' },
  { id: 'amulet_perla', name: 'Havets pärla', rarity: 'epic', kind: 'amulet', stats: { hp: 25, armor: 0.04 }, text: 'Håll den mot örat, så hör du havet.' },
  { id: 'amulet_alvsten', name: 'Alvstenen', rarity: 'epic', kind: 'amulet', stats: { power: 0.06, hp: 15 }, text: 'En sten som lyser som en liten stjärna.' },
  { id: 'amulet_gleipnir', name: 'Gleipner', rarity: 'legendary', kind: 'amulet', stats: { armor: 0.1, hp: 20 }, text: 'Bandet som höll Fenrisulven, gjort av kattens steg och fiskens andetag.' },
  { id: 'amulet_brisingamen', name: 'Brisingamen', rarity: 'legendary', kind: 'amulet', stats: { power: 0.1, hp: 20 }, text: 'Gudinnan Frejas halsband. Det glittrar som tusen solar.' },
  // Act II clothes
  { id: 'hat_helhjalm', name: 'Helhjälm', rarity: 'rare', kind: 'hat', style: 'nasal', color: '#7f8f88', text: 'En gråblek hjälm från Helheim.' },
  { id: 'shirt_helrustning', name: 'Helrustning', rarity: 'rare', kind: 'shirt', style: 'chainmail', color: '#5f7068', text: 'Rustning som lyser svagt grönt i mörkret.' },
  { id: 'hat_dvarghjalm', name: 'Dvärghjälm', rarity: 'rare', kind: 'hat', style: 'nasal', color: '#c8a050', text: 'En stadig hjälm av mässing, smidd av dvärgar.' },
  { id: 'shirt_dvargbrynja', name: 'Dvärgbrynja', rarity: 'rare', kind: 'shirt', style: 'chainmail', color: '#d0a040', text: 'En brynja av små guldringar. Tung, men så fin!' },
  { id: 'hat_sjokrona', name: 'Sjökrona', rarity: 'epic', kind: 'hat', style: 'crown_sea', color: '#5fd0c8', text: 'En krona av korall och snäckor.' },
  { id: 'shirt_fjallrustning', name: 'Fjällrustning', rarity: 'epic', kind: 'shirt', style: 'tabard', color: '#3a9ab0', text: 'Rustning av glänsande fiskfjäll.' },
  { id: 'hat_alvkrona', name: 'Alvkrona', rarity: 'epic', kind: 'hat', style: 'elfcrown', color: '#d8c8ff', text: 'En smal krona av silver och månsken.' },
  { id: 'shirt_alvmantel', name: 'Alvmantel', rarity: 'epic', kind: 'shirt', style: 'cloak', color: '#7a5ac8', text: 'En mantel som glittrar som stjärnhimlen.' },
  { id: 'hat_ulvhuva', name: 'Ulvhuva', rarity: 'epic', kind: 'hat', style: 'wolfhood', color: '#9aa4b0', text: 'En varm luva med ulvöron.' },
  { id: 'shirt_ulvpals', name: 'Ulvpäls', rarity: 'epic', kind: 'shirt', style: 'bearpelt', color: '#a8b0bc', text: 'En grå päls som håller vintern borta.' },
  { id: 'hat_lokeshorn', name: 'Lokes horn', rarity: 'legendary', kind: 'hat', style: 'horns', color: '#3ac878', text: 'Två små gröna horn. Nu ser du lite busig ut.' },
  { id: 'shirt_lokesmantel', name: 'Lokes mantel', rarity: 'legendary', kind: 'shirt', style: 'cloak', color: '#2a8a58', text: 'En grön mantel som byter mönster när du snurrar.' },
  // Act II pets and mounts
  { id: 'pet_garmvalp', name: 'Garmvalp', rarity: 'epic', kind: 'pet', species: 'garmvalp', text: 'En liten helhundsvalp med två huvuden som båda vill bli klappade.' },
  { id: 'pet_guldbagge', name: 'Guldbagge', rarity: 'epic', kind: 'pet', species: 'guldbagge_tam', text: 'En liten guldbagge som surrar och glittrar.' },
  { id: 'pet_lysmanet', name: 'Lysmanet', rarity: 'epic', kind: 'pet', species: 'manet_tam', text: 'En liten manet som svävar efter dig och lyser som en nattlampa.' },
  { id: 'pet_alvljus', name: 'Alvljus', rarity: 'epic', kind: 'pet', species: 'alvljus_fe', text: 'En pytteliten ljusalv som fladdrar runt dig.' },
  { id: 'pet_ulvvalp', name: 'Ulvvalp', rarity: 'epic', kind: 'pet', species: 'ulvvalp', text: 'En grå ulvvalp som ylar när den är glad.' },
  { id: 'mount_havshast', name: 'Havshäst', rarity: 'legendary', kind: 'mount', species: 'havshast', text: 'En häst med fenor och en man av sjöskum.' },
  { id: 'mount_jattehjort', name: 'Jättehjort', rarity: 'legendary', kind: 'mount', species: 'jattehjort', text: 'En vit hjort med lysande horn, stor som en häst.' },
  { id: 'mount_fenrisulv', name: 'Vinterulven', rarity: 'legendary', kind: 'mount', species: 'fenrisulv_ridbar', text: 'En jättelik ulv som låter dig rida på ryggen. Snäll mot dig, i alla fall.' },
  { id: 'mount_lokeshast', name: 'Lokes föl', rarity: 'legendary', kind: 'mount', species: 'lokeshast', text: 'Ett åttabent föl, Sleipners lilla kusin. Det springer åt alla håll på en gång.' },
  // Act II: what the villagers ask for
  { id: 'glimmersten', name: 'Glimmersten', rarity: 'common', kind: 'quest', text: 'En sten som glittrar som guld. Smed-Stina vill ha den.' },
  { id: 'alvdagg', name: 'Alvdagg', rarity: 'common', kind: 'quest', text: 'Dagg från Alvernas lund som lyser i mörkret. Fru Lind vill ha den.' },
  { id: 'krabbklo', name: 'Krabbklo', rarity: 'common', kind: 'quest', text: 'En stor krabbklo. Pizza-Pino vill ha den.' },
  { id: 'ulvtand', name: 'Ulvtand', rarity: 'common', kind: 'quest', text: 'En tand från en ulv. Fiskar-Sven gör fiskekrokar av dem.' },
  { id: 'bifrostskarva', name: 'Bifrostskärva', rarity: 'common', kind: 'quest', text: 'En glittrande skärva av regnbågsbron. Lilla Elsa samlar på dem.' },
  // a drink that makes you stronger in a fight
  { id: 'styrkedryck', name: 'Styrkedryck', rarity: 'common', kind: 'potion', text: 'Dricks i en strid: du slår hårdare en liten stund.' },
  // Act II: the saga's rewards for home
  { id: 'hels_lykta', name: 'Hels lykta', rarity: 'epic', kind: 'decor', glow: '#9cffc8', text: 'En lykta från Helheim som lyser grönt och snällt.' },
  { id: 'dvargstaty', name: 'Dvärgstaty', rarity: 'epic', kind: 'decor', glow: '#ffcf6a', text: 'En liten dvärg av guld som vinkar.' },
  { id: 'ormtand', name: 'Ormtand', rarity: 'epic', kind: 'decor', glow: '#7fd0ff', text: 'En tand från Midgårdsormen, stor som en dörr.' },
  { id: 'alvlykta', name: 'Ljusalvernas lykta', rarity: 'epic', kind: 'decor', glow: '#d6a8ff', text: 'Ljusalvernas tack. Den lyser lila hela natten.' },
  { id: 'fenrislanka', name: 'Fenrislänken', rarity: 'legendary', kind: 'decor', glow: '#cfe8ff', text: 'En länk från kedjan som höll Fenrisulven.' },
  { id: 'bifrostbit', name: 'Bit av Bifrost', rarity: 'legendary', kind: 'decor', glow: 'rainbow', text: 'En bit av regnbågsbron som skimrar i alla färger.' },
  // Saga III: the hero levels' rewards (LEVEL_REWARDS), glowing clothes and legendary things that come with a level
  { id: 'shirt_vandrarmantel', name: 'Vandrarmanteln', rarity: 'uncommon', kind: 'shirt', style: 'cloak', color: '#3f6b3a', levelReward: 2, text: 'En grön mantel för den som har börjat sin vandring.' },
  { id: 'hat_glodkrans', name: 'Glödkransen', rarity: 'rare', kind: 'hat', style: 'circlet', color: '#ffb347', glow: '#ffb347', levelReward: 4, text: 'En krans som glöder som en brasa i mörkret.' },
  { id: 'pet_lyktfe', name: 'Lyktfén', rarity: 'rare', kind: 'pet', species: 'alvljus_fe', levelReward: 5, text: 'En liten fe med en lykta, som lyser upp vägen åt dig.' },
  { id: 'shirt_glodmantel', name: 'Glödmanteln', rarity: 'rare', kind: 'shirt', style: 'cloak', color: '#8a3a2a', glow: '#ff8a3a', levelReward: 6, text: 'En mantel med en kant som glöder som kol.' },
  { id: 'hat_stjarnkrona', name: 'Stjärnkronan', rarity: 'epic', kind: 'hat', style: 'crown', color: '#cfe6ff', glow: '#9ad8ff', levelReward: 8, text: 'En krona av stjärnljus. Den tindrar när du går.' },
  { id: 'amulet_hjaltemarke', name: 'Hjältemärket', rarity: 'epic', kind: 'amulet', stats: { hp: 10 }, levelReward: 9, text: 'Ett märke av silver som bara riktiga hjältar får bära.' },
  { id: 'shirt_stjarnmantel', name: 'Stjärnmanteln', rarity: 'epic', kind: 'shirt', style: 'cloak', color: '#2a2a5a', glow: '#b8a8ff', levelReward: 10, text: 'En mantel lika mörk som natthimlen, full av små lysande stjärnor.' },
  { id: 'hat_norrskenshjalm', name: 'Norrskenshjälmen', rarity: 'epic', kind: 'hat', style: 'valkyrie', color: '#dfeeff', glow: '#5fd38d', levelReward: 12, text: 'En vingad hjälm som skimrar grönt som norrskenet.' },
  { id: 'mount_ljushjort', name: 'Ljushjorten', rarity: 'legendary', kind: 'mount', species: 'ljushjort', levelReward: 15, text: 'En blekt vitblå hjort vars horn lyser som månsken.' },
  { id: 'shirt_eldmantel', name: 'Eldmanteln', rarity: 'legendary', kind: 'shirt', style: 'cloak', color: '#5a1a10', glow: '#ff6a3a', levelReward: 16, text: 'En mantel som fladdrar som lågor, men aldrig bränns.' },
  { id: 'hat_solkrona', name: 'Solkronan', rarity: 'legendary', kind: 'hat', style: 'crown', color: '#ffe27a', glow: '#ffe27a', levelReward: 18, text: 'En krona av guld som lyser som solen själv.' },
  { id: 'amulet_yggdrasil', name: 'Yggdrasils löv', rarity: 'legendary', kind: 'amulet', stats: { hp: 20 }, levelReward: 19, text: 'Ett löv från Världsträdet. Det är grönt året runt.' },
  { id: 'shirt_bifrostmantel', name: 'Bifrostmanteln', rarity: 'legendary', kind: 'shirt', style: 'cloak', color: '#f0f0ff', glow: 'rainbow', levelReward: 20, text: 'En mantel vävd av regnbågsbron. Den skimrar i alla färger.' },
  // Round 4, Smedjan: what Smed-Stina forges with, and the starter set she makes (once each per hero, FORGE_CRAFTS)
  { id: 'monsteressens', name: 'Monsteressens', rarity: 'uncommon', kind: 'material', glow: '#b06cff', text: 'En virvlande lila droppe som monstren i fängelsehålorna lämnar efter sig. Smed-Stina smider med den.' },
  { id: 'drakfjall', name: 'Drakfjäll', rarity: 'rare', kind: 'material', glow: '#ff8a3a', text: 'Ett rödgyllene fjäll från en mäktig boss. Det hårdaste Smed-Stina vet.' },
  { id: 'jarnsvard', name: 'Järnsvärd', rarity: 'uncommon', kind: 'weapon', tool: 'sword', glow: '#d8dee6', text: 'Ett stadigt svärd av järn, smitt av Smed-Stina.' },
  { id: 'jarnyxa', name: 'Järnyxa', rarity: 'uncommon', kind: 'weapon', tool: 'axe', glow: '#d8dee6', text: 'En yxa av järn som biter lika bra i ved som i monster.' },
  { id: 'ekstav', name: 'Ekstav', rarity: 'uncommon', kind: 'weapon', tool: 'hammer', glow: '#b9e08a', text: 'En stav av ek med guldbeslag. Den känns varm i handen.' },
  { id: 'jaktbage', name: 'Jaktbåge', rarity: 'uncommon', kind: 'weapon', tool: 'bow', glow: '#e8c890', text: 'En enkel båge av trä och snöre, men den skjuter rakt.' },
  { id: 'traskold', name: 'Träsköld', rarity: 'uncommon', kind: 'offhand', stats: { armor: 0.04 }, text: 'En rund sköld av trä med en kant av guld.' },
  { id: 'stenamulett', name: 'Stenamulett', rarity: 'uncommon', kind: 'amulet', stats: { hp: 8 }, text: 'En slät sten med en kristall i, på ett läderband.' },
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
  /**
   * A task out in the world (Act II), fought in hero mode: beat `count` roaming `target` monsters (they live in
   * biome `where`). Counted in SagaProgress.quests['field:<chapter index>']. A chapter is done when all its parts are.
   */
  field?: { target: string; count: number; where: string; text: string };
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
  // Act II, Lokes list
  {
    dungeon: null,
    title: 'Viskningar i mörkret',
    tell: [
      'Du är tillbaka! Jag har inte sovit gott. Om nätterna viskar Yggdrasils skott hemma hos er.',
      'I drömmen hörde jag ett skratt. Det var Loke, den listige! Det var han som släppte loss Draugkungen, Rimtursen och Surt.',
      'Nu vandrar hans tjänare runt i Midgård. Tryck på hjälteknappen (🧑‍🌾 → din klass) så bär du dina vapen och besvärjelser ute i världen.',
      'Jaga bort åtta vandrardraugar i skogen, så ska jag se vad mer drömmen vill säga.',
    ],
    done: ['Bra gjort! Skogen är lugn igen. Ta den här runan, Vegvisir. Den hjälper dig att hitta hem.', 'Men drömmen fortsätter… Loke har öppnat porten till Helheim.'],
    goal: 'Jaga bort 8 vandrardraugar i skogen (tryck på hjälteknappen först)',
    field: { target: 'vandrardraug', count: 8, where: 'skog', text: 'Jaga bort 8 vandrardraugar i skogen' },
    reward: { coins: 60, stars: 2, item: 'amulet_vegvisir' },
  },
  {
    dungeon: 'hel',
    title: 'Hels port',
    tell: [
      'Loke har en dotter som heter Hel. Hon är drottning i dödsriket Helheim, och porten dit ligger i träsket väster om gården.',
      'Mosspökar har krupit upp ur träsket. Jaga bort sex av dem, och gå sedan ner till Hel.',
      'Var inte rädda, Hel är inte så farlig som hon tror. Men akta er när hon drar er till sig!',
    ],
    done: ['Hel har gått tillbaka till sin tron och lovar att stanna där. Här är en lykta från Helheim.', 'Men Loke är inte klar. Jag hör hammarslag och dvärgsånger i mina drömmar…'],
    goal: 'Jaga bort 6 mosspökar i träsket och besegra Hel i Helheim (träsket väster om gården)',
    field: { target: 'mosspoke', count: 6, where: 'trask', text: 'Jaga bort 6 mosspökar i träsket väster om gården' },
    reward: { coins: 150, stars: 3, item: 'hels_lykta', title: 'Helfarare' },
  },
  {
    dungeon: 'dvarg',
    title: 'Dvärgarnas guld',
    tell: [
      'I bergen öster om byn ligger Svartalfheims gamla gruvor. Dvärgarna som bodde där flyttade för länge sedan.',
      'Nu har draken Fafner flyttat in, och Loke har lovat honom allt guld i världen. Till och med guldet i era fickor!',
      'Jaga först bort sex gruvtroll i bergen. I gruvan finns tre guldplattor: tryck på alla tre, så öppnas dörren till drakens skattkammare.',
    ],
    done: ['Fafner sover gott på en mycket mindre guldhög nu. Ta den här dvärgstatyn som tack!', 'Men vågorna har blivit så stora… Något väldigt långt rör sig i havet.'],
    goal: 'Jaga bort 6 gruvtroll i bergen och besegra Fafner i Svartalfheims gruvor (bergen öster om byn)',
    field: { target: 'gruvtroll', count: 6, where: 'berg', text: 'Jaga bort 6 gruvtroll i bergen öster om byn' },
    reward: { coins: 180, stars: 3, item: 'dvargstaty', title: 'Dvärgavän' },
  },
  {
    dungeon: 'orm',
    title: 'Havsormen',
    tell: [
      'Vid stranden långt i väster har ett gammalt tempel stigit upp ur havet.',
      'Där bor Jörmungandr, Midgårdsormen, Lokes son. Han är så lång att han ligger runt hela världen!',
      'Om han släpper sin svans skakar hela Midgård. Jaga bort sex sjödraugar på stranden, och gå sedan in i templet.',
    ],
    done: ['Ormen har bitit sig i svansen igen, och havet är lugnt. Här är en tand han tappade.', 'Men nu drömmer alla så otäckt… Det kommer från Alvernas lund.'],
    goal: 'Jaga bort 6 sjödraugar på stranden och besegra Jörmungandr i Havsormens tempel (stranden två kartor väster om gården)',
    field: { target: 'sjodraug', count: 6, where: 'strand', text: 'Jaga bort 6 sjödraugar på stranden två kartor väster om gården' },
    reward: { coins: 200, stars: 4, item: 'ormtand', title: 'Ormtämjare' },
  },
  {
    dungeon: 'alv',
    title: 'Skuggan över Alfheim',
    tell: [
      'Har du sovit dåligt på sistone? Det har alla. Det är Nattmaran!',
      'Hon har tagit över Alvernas lund i svampskogen nordost om gården, och ljusalverna har slutat lysa.',
      'Jaga bort sex skuggalver i svampskogen. Inne i lunden finns tre runplattor bland svamparna: tänd alla tre, så öppnas vägen.',
    ],
    done: ['Ljusalverna lyser igen, och i natt får alla sova gott. De skickar den här lyktan som tack.', 'Men nu ylar det i norr… Loke har släppt Fenrisulven fri!'],
    goal: 'Jaga bort 6 skuggalver i svampskogen och besegra Nattmaran i Alvernas lund (svampskogen nordost om gården)',
    field: { target: 'skuggalv', count: 6, where: 'svamp', text: 'Jaga bort 6 skuggalver i svampskogen nordost om gården' },
    reward: { coins: 220, stars: 4, item: 'alvlykta', title: 'Ljusbärare' },
  },
  {
    dungeon: 'fenrir',
    title: 'Fenrisulven',
    tell: [
      'Fenrisulven är Lokes största barn. Gudarna band honom med Gleipner, ett band som är mjukt som silke men starkare än järn.',
      'Nu har Loke slitit sönder bandet! Ulven bor i Fenrisklyftan, på isen två kartor norr om gården, en bit från Frostjättens borg.',
      'Jaga bort sex isvargar på isen först. Sedan får ni binda Fenrisulven igen. Ta med alla ni kan!',
    ],
    done: ['Fenrisulven är bunden igen, och han ser faktiskt ganska nöjd ut. Här är en länk från hans kedja.', 'Nu vet jag var Loke är. Han väntar på Bifrost, regnbågsbron vid rymdbasen.'],
    goal: 'Jaga bort 6 isvargar på isen och besegra Fenrisulven i Fenrisklyftan (isen två kartor norr om gården)',
    field: { target: 'isvarg', count: 6, where: 'is', text: 'Jaga bort 6 isvargar på isen två kartor norr om gården' },
    reward: { coins: 260, stars: 5, item: 'fenrislanka', title: 'Ulvbindare' },
  },
  {
    dungeon: 'loke',
    title: 'Ragnarök',
    tell: [
      'Nu gäller det. Loke vill starta Ragnarök, slutet på alla världar, och han börjar på Bifrost.',
      'Hans eldimpar springer runt vid vulkanen sydost om gården. Jaga bort sex av dem, och res sedan till rymdbasen söder om gården. Där går regnbågsbron upp mot himlen.',
      'Loke kan se ut som alla ni har besegrat. Men kom ihåg: det är bara lögner, och ni är riktiga hjältar!',
    ],
    done: [
      'Ni gjorde det! Världsträdet Yggdrasil är räddat igen, och Ragnarök får vänta!',
      'Ta den här biten av Bifrost. Den lyser i alla regnbågens färger, precis som ni.',
      'Och Loke? Han sitter bunden med ett starkt rep och fnissar för sig själv. Han är fast… tills nästa gång.',
    ],
    goal: 'Jaga bort 6 eldimpar vid vulkanen och besegra Loke på Bifrost (rymdbasen söder om gården)',
    field: { target: 'eldimp', count: 6, where: 'vulkan', text: 'Jaga bort 6 eldimpar vid vulkanen sydost om gården' },
    reward: { coins: 500, stars: 8, item: 'bifrostbit', title: 'Ragnaröks hjälte' },
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

/** Better weapons hit harder: the equipped one counts (in saves from before gear, the best one in the bag). */
export const RARITY_POWER: Record<Rarity, number> = { common: 1, uncommon: 1.05, rare: 1.1, epic: 1.2, legendary: 1.3 };

// ---------------------------------------------------------------------------
// Gear and hero levels (Act II): a weapon, an offhand and an amulet, and Hjältenivå 1–20
// ---------------------------------------------------------------------------

export type GearSlot = 'weapon' | 'offhand' | 'amulet';
export const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'offhand', 'amulet'];
export const isGearSlot = (s: unknown): s is GearSlot => typeof s === 'string' && (GEAR_SLOTS as readonly string[]).includes(s);
/** The slot a dungeon item is worn in (null: it is not gear). */
export const gearSlotOf = (itemId: string): GearSlot | null => {
  const k = sagaItem(itemId)?.kind;
  return k === 'weapon' || k === 'offhand' || k === 'amulet' ? k : null;
};

/** Every hero level above the first gives this much more power and health (+28.5 % at level 20). */
export const LEVEL_BONUS = 0.015;
/** The most gear, class fit and levels together may multiply damage and healing by (the family plays together). */
export const POWER_CAP = 2.0;
/** All the gear's armor together takes away at most this much of a hit. */
export const ARMOR_CAP = 0.4;
/** A piece that suits your class gives this much more power. */
export const CLASS_FIT = 1.05;
/** The experience needed to be at each level (index = level - 1). */
export const XP_LEVELS: readonly number[] = [0, 60, 150, 280, 450, 660, 910, 1200, 1530, 1900, 2310, 2760, 3250, 3780, 4350, 4960, 5610, 6300, 7030, 7800];
export const MAX_LEVEL = XP_LEVELS.length;
/**
 * Experience for each thing a hero does. In a dungeon: a monster, a boss's helper, the mid-boss and the boss. Out in
 * the world (anyone, class or not, and everyone within 10 tiles shares it): a roaming monster, a bear, wolf or lynx,
 * a monster or the troll king in the farm's cave, a world boss. And a villager's quest and a chapter of the saga.
 */
export const SAGA_XP = { mob: 5, add: 2, mini: 40, boss: 100, quest: 30, chapter: 100, wild: 4, predator: 6, cave: 3, caveBoss: 30, worldBoss: 60 } as const;

/** What reaching a hero level gives: something to wear or keep (item), a title, and from level 10 a glow around you (aura). */
export interface LevelReward {
  item?: string;
  title?: string;
  aura?: 1 | 2;
}
/** Hero level rewards: looks, never power (the items are SAGA_ITEMS with `levelReward`). */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { item: 'shirt_vandrarmantel' },
  3: { title: 'Vandrare' },
  4: { item: 'hat_glodkrans' },
  5: { item: 'pet_lyktfe' },
  6: { item: 'shirt_glodmantel' },
  7: { title: 'Hjälte' },
  8: { item: 'hat_stjarnkrona' },
  9: { item: 'amulet_hjaltemarke' },
  10: { item: 'shirt_stjarnmantel', aura: 1 },
  12: { item: 'hat_norrskenshjalm' },
  13: { title: 'Stor hjälte' },
  15: { item: 'mount_ljushjort' },
  16: { item: 'shirt_eldmantel' },
  17: { title: 'Legend' },
  18: { item: 'hat_solkrona' },
  19: { item: 'amulet_yggdrasil' },
  20: { item: 'shirt_bifrostmantel', aura: 2, title: 'Midgårds väktare' },
};
/** The glow around a hero: none below level 10, a soft one from 10, a rainbow one at 20. */
export const auraOf = (level: number): 0 | 1 | 2 => (level >= 20 ? 2 : level >= 10 ? 1 : 0);

/** The level a hero with this much experience has (1–20). */
export const xpLevel = (xp: number): number => {
  let level = 1;
  while (level < MAX_LEVEL && xp >= XP_LEVELS[level]!) level++;
  return level;
};
/** A player's hero level (1 for anyone without experience yet). */
export const heroLevel = (prog: SagaProgress | undefined): number => xpLevel(prog?.xp ?? 0);
/** Experience at the start of this level and the next one (next is null at the top level). */
export const levelSpan = (xp: number): { level: number; from: number; next: number | null } => {
  const level = xpLevel(xp);
  return { level, from: XP_LEVELS[level - 1]!, next: XP_LEVELS[level] ?? null };
};

export interface GearStats {
  /** Damage and healing multiplier. */
  power: number;
  /** Health added to the class's. */
  hp: number;
  /** Fraction of every hit taken away (0..ARMOR_CAP). */
  armor: number;
}

/** The gear a player has on (in saves from before gear: the best weapon in the bag, as it used to work). */
export function gearOf(p: PlayerState): Partial<Record<GearSlot, string>> {
  if (p.saga?.gear) return p.saga.gear;
  let best: SagaItemDef | undefined;
  for (const s of p.inventory) {
    const d = s ? sagaItem(s.item) : undefined;
    if (d?.kind === 'weapon' && (!best || RARITY_POWER[d.rarity] > RARITY_POWER[best.rarity])) best = d;
  }
  return best ? { weapon: best.id } : {};
}

/** What a player's gear and level give them in a fight (forged pieces count with their forge level). */
export function gearStats(p: PlayerState): GearStats {
  const gear = gearOf(p);
  const cls = p.saga?.cls;
  const weapon = gear.weapon ? sagaItem(gear.weapon) : undefined;
  let power = 0;
  let hp = 0;
  let armor = 0;
  let fits = false;
  for (const slot of GEAR_SLOTS) {
    const d = gear[slot] ? sagaItem(gear[slot]!) : undefined;
    if (!d) continue;
    const st = forgeStats(d.id, forgeLevel(p.saga, d.id));
    power += st.power;
    hp += st.hp;
    armor += st.armor;
    if (cls && d.classes?.includes(cls)) fits = true;
  }
  const lvl = 1 + LEVEL_BONUS * (heroLevel(p.saga) - 1);
  // capped, so a parent at level 20 in a legendary set is never much more than one and a half kids
  return { power: Math.min(POWER_CAP, (weapon ? RARITY_POWER[weapon.rarity] : 1) * (1 + power) * (fits ? CLASS_FIT : 1) * lvl), hp, armor: Math.min(ARMOR_CAP, armor) };
}

// ---------------------------------------------------------------------------
// Round 4: Smedjan. Smed-Stina in Köpingen forges a piece of gear up to +5 (per player and piece) and makes a
// starter set once for each hero. Materials come from the world, the landmarks and the dungeons' replays.
// ---------------------------------------------------------------------------

/** The highest forge level. */
export const FORGE_MAX = 5;
/** What forging one level up costs: materials, a choice of rare things (any mix of `anyOf.items`), and coins. */
export interface ForgeCost {
  items: [item: string, count: number][];
  anyOf?: { items: string[]; count: number };
  kr: number;
}
/** The cost of reaching each forge level (index = the level reached, 1..FORGE_MAX). */
export const FORGE_COSTS: Record<number, ForgeCost> = {
  1: { items: [['stone', 6], ['gold', 3]], kr: 40 },
  2: { items: [['crystal', 4], ['gold', 2]], kr: 80 },
  3: { items: [], anyOf: { items: ['fire_crystal', 'fairy_dust', 'frostros', 'alvdagg', 'obsidian', 'star_crystal'], count: 2 }, kr: 150 },
  4: { items: [['monsteressens', 4]], kr: 250 },
  5: { items: [['drakfjall', 2], ['monsteressens', 4]], kr: 400 },
};
/** The starter set Stina makes (each once per hero): coins and materials. */
export const FORGE_CRAFTS: Record<string, { items: [item: string, count: number][]; kr: number }> = {
  jarnsvard: { items: [['stone', 8], ['gold', 4]], kr: 60 },
  jarnyxa: { items: [['stone', 8], ['gold', 4]], kr: 60 },
  ekstav: { items: [['wood', 6], ['gold', 4]], kr: 60 },
  jaktbage: { items: [['wood', 6], ['fiber', 4], ['gold', 2]], kr: 60 },
  traskold: { items: [['wood', 8], ['gold', 2]], kr: 60 },
  stenamulett: { items: [['stone', 6], ['crystal', 1]], kr: 60 },
};
/** The smith who forges. */
export const SMITH_ID = 'stina';
/** Dungeon monsters (not a boss's helpers) leave a Monsteressens with this chance, in the bag of whoever beat them. */
export const ESSENS_CHANCE = 0.15;
/** A player's forge level of a piece (0: not forged). */
export const forgeLevel = (prog: SagaProgress | undefined, itemId: string): number => Math.max(0, Math.min(FORGE_MAX, prog?.forge?.[itemId] ?? 0));

/**
 * What a piece of gear adds at a forge level (its own stats, plus per level: a weapon +0.06 power; an offhand +0.02
 * armor if it has armor and +0.03 power if it has power; an amulet +8 health, and +0.02 power if it has power).
 * Pure: the forge window shows the before and after with it.
 */
export function forgeStats(itemId: string, level: number): GearStats {
  const d = sagaItem(itemId);
  const base = d?.stats ?? {};
  const st: GearStats = { power: base.power ?? 0, hp: base.hp ?? 0, armor: base.armor ?? 0 };
  const n = Math.max(0, Math.min(FORGE_MAX, Math.floor(level)));
  if (!d || !n) return st;
  if (d.kind === 'weapon') st.power += 0.06 * n;
  else if (d.kind === 'offhand') {
    if (base.armor) st.armor += 0.02 * n;
    if (base.power) st.power += 0.03 * n;
  } else if (d.kind === 'amulet') {
    st.hp += 8 * n;
    if (base.power) st.power += 0.02 * n;
  }
  return st;
}

/** A fighter's full health: the class's, the gear's on top, and a little more for every level. */
export const fighterMax = (p: PlayerState, cls: ClassId): number => Math.round((CLASSES[cls].hp + gearStats(p).hp) * (1 + LEVEL_BONUS * (heroLevel(p.saga) - 1)));

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
  // Act II, Lokes list
  {
    id: 'saga_gengangare',
    npc: 'elsa',
    dungeon: 'hel',
    title: 'Spöken under sängen',
    tell: ['Jag har sett ett spöke! Ett vitt lakan med en lykta, som svävade förbi mitt fönster!', 'Det kom från Helheim. Kan du jaga bort åtta gengångare, så jag vågar släcka lampan?'],
    done: ['Nu är det bara min nalle under sängen. Tack, du är modigast i hela världen!'],
    goal: 'Besegra 8 gengångare i Helheim',
    kind: 'kill',
    target: 'gengangare',
    count: 8,
    reward: { coins: 100, stars: 2 },
  },
  {
    id: 'saga_helhund',
    npc: 'greta',
    dungeon: 'hel',
    title: 'Hundarna i dimman',
    tell: ['Hönsen vill inte värpa längre. Om nätterna ylar helhundarna nere i träsket.', 'Jaga bort sex av dem, lilla vän, så får hönsen sova i lugn och ro.'],
    done: ['Tack! I morse låg det tolv ägg i redet. Här, ta några läkedrycker också.'],
    goal: 'Besegra 6 helhundar i Helheim',
    kind: 'kill',
    target: 'helhund',
    count: 6,
    reward: { coins: 100, stars: 2, item: 'healing_potion', count: 3 },
  },
  {
    id: 'saga_glimmer',
    npc: 'stina',
    dungeon: 'dvarg',
    title: 'Glimmer till smedjan',
    tell: ['Gruvtrollen bär på glimmersten, den finaste sten en smed kan önska sig!', 'Ta med sex stycken, från trollen i gruvan eller ute i bergen, så smider jag något fint.'],
    done: ['Så de glittrar! Här har du styrkedrycker, de gör dig stark som en dvärg.'],
    goal: 'Samla 6 glimmerstenar från gruvtrollen',
    kind: 'collect',
    target: 'glimmersten',
    count: 6,
    from: ['gruvtroll'],
    chance: 0.6,
    reward: { coins: 110, stars: 2, item: 'styrkedryck', count: 2 },
  },
  {
    id: 'saga_guldbagge',
    npc: 'bo',
    dungeon: 'dvarg',
    title: 'Baggar i mjölet',
    tell: ['Någon har varit i mitt mjöl! Det är fullt av små gula fotspår.', 'Det är guldbaggarna från gruvan. De älskar vetemjöl! Jaga bort åtta av dem, är du snäll.'],
    done: ['Mjölet är rent igen. I morgon bakar jag guldgula bullar, och du får den första!'],
    goal: 'Besegra 8 guldbaggar i Svartalfheims gruvor',
    kind: 'kill',
    target: 'guldbagge',
    count: 8,
    reward: { coins: 110, stars: 2 },
  },
  {
    id: 'saga_krabbklo',
    npc: 'pino',
    dungeon: 'orm',
    title: 'Pizza frutti di mare',
    tell: ['Mamma mia! Jag vill göra en havspizza, men alla krabbor är för små.', 'Jättekrabborna i Havsormens tempel har stora klor. Ta med fem, så bjuder jag på pizza!'],
    done: ['Perfetto! Det här blir världens godaste pizza. Här har du läkedrycker också.'],
    goal: 'Samla 5 krabbklor från jättekrabborna i Havsormens tempel',
    kind: 'collect',
    target: 'krabbklo',
    count: 5,
    from: ['jattekrabba'],
    chance: 0.6,
    reward: { coins: 120, stars: 2, item: 'healing_potion', count: 3 },
  },
  {
    id: 'saga_sjodraug',
    npc: 'sven',
    dungeon: 'orm',
    title: 'Tång på kroken',
    tell: ['Varje gång jag kastar ut kroken fastnar den i en sjödraug!', 'Jaga bort åtta av dem, så jag kan fiska fisk i stället för skelett.'],
    done: ['Nu nappar det igen, och inte ett enda ben! Här, för besväret.'],
    goal: 'Besegra 8 sjödraugar i Havsormens tempel',
    kind: 'kill',
    target: 'sjodraug',
    count: 8,
    reward: { coins: 120, stars: 2 },
  },
  {
    id: 'saga_alvdagg',
    npc: 'lind',
    dungeon: 'alv',
    title: 'Dagg som lyser',
    tell: ['I Alvernas lund finns dagg som lyser i mörkret. Skuggalverna har tagit allt!', 'Om du hämtar fem droppar alvdagg, kan mina rosor lysa på natten.'],
    done: ['Titta, de lyser redan! Min trädgård blir den finaste i hela byn.'],
    goal: 'Samla 5 alvdagg från skuggalverna',
    kind: 'collect',
    target: 'alvdagg',
    count: 5,
    from: ['skuggalv'],
    chance: 0.6,
    reward: { coins: 130, stars: 3 },
  },
  {
    id: 'saga_spindlar',
    npc: 'greta',
    dungeon: 'alv',
    title: 'Trassligt garn',
    tell: ['Jag stickar en tröja åt dig, men någon har trasslat in allt mitt garn i spindelnät!', 'Det är jättespindlarna från Alvernas lund. Jaga bort sex av dem, så kan jag sticka färdigt.'],
    done: ['Nu går stickorna fort igen. Här, ta styrkedryckerna. Och tröjan blir klar till jul!'],
    goal: 'Besegra 6 jättespindlar i Alvernas lund',
    kind: 'kill',
    target: 'jattespindel',
    count: 6,
    reward: { coins: 130, stars: 3, item: 'styrkedryck', count: 2 },
  },
  {
    id: 'saga_ulvtand',
    npc: 'sven',
    dungeon: 'fenrir',
    title: 'Krokar av tänder',
    tell: ['Vet du vad som gör de bästa fiskekrokarna? Ulvtänder!', 'Ulvarna i Fenrisklyftan tappar dem när de slåss. Ta med fem, så får du en del av fångsten.'],
    done: ['Tack! Med de här krokarna får jag kanske upp en guldfisk.'],
    goal: 'Samla 5 ulvtänder från ulvarna i Fenrisklyftan',
    kind: 'collect',
    target: 'ulvtand',
    count: 5,
    from: ['ulv'],
    chance: 0.6,
    reward: { coins: 140, stars: 3, item: 'healing_potion', count: 3 },
  },
  {
    id: 'saga_rimtroll',
    npc: 'stina',
    dungeon: 'fenrir',
    title: 'Frusen ässja',
    tell: ['Min ässja har frusit till is! Det är rimtrollen som andas på den om nätterna.', 'Jaga bort fem rimtroll i Fenrisklyftan, så får elden brinna igen.'],
    done: ['Elden sprakar igen! Här har du styrkedrycker, varma från ugnen.'],
    goal: 'Besegra 5 rimtroll i Fenrisklyftan',
    kind: 'kill',
    target: 'rimtroll',
    count: 5,
    reward: { coins: 140, stars: 3, item: 'styrkedryck', count: 3 },
  },
  {
    id: 'saga_bifrost',
    npc: 'elsa',
    dungeon: 'loke',
    title: 'Regnbågsbitar',
    tell: ['Jag samlar på fina saker! Nu vill jag ha bitar av en riktig regnbåge.', 'Lokes trollerier tappar bifrostskärvor när de går sönder. Ta med fem, snälla snälla!'],
    done: ['Åh! Nu har jag en hel regnbåge i min låda. Du är bäst!'],
    goal: 'Samla 5 bifrostskärvor från Lokes trollerier',
    kind: 'collect',
    target: 'bifrostskarva',
    count: 5,
    from: ['skelett', 'isvarg', 'eldhund', 'gengangare'],
    chance: 0.4,
    reward: { coins: 150, stars: 3 },
  },
  {
    id: 'saga_salt',
    npc: 'bo',
    dungeon: 'loke',
    title: 'Salt i bullarna',
    tell: ['Någon har bytt allt mitt socker mot salt! Bullarna smakar havsvatten.', 'Det luktar Loke lång väg. Hans skugga smyger runt på Bifrost. Besegra den, så slutar busfröt.'],
    done: ['Sockret är tillbaka! Lokes skugga hade gömt det i en strumpa. Här, ta en bulle. Den är söt nu.'],
    goal: 'Besegra Lokes skugga på Bifrost',
    kind: 'kill',
    target: 'lokesskugga',
    count: 1,
    reward: { coins: 150, stars: 3, item: 'healing_potion', count: 3 },
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
  /** What the hero wears in a fight (item ids, taken out of the bag while equipped). Missing in saves from before Act II. */
  gear?: Partial<Record<GearSlot, string>>;
  /** Walking the world as the class: spells on the keys, the weapon drawn, the hero outfit on. */
  hero?: boolean;
  /** The clothes swapped in and out by the hero switch (the hero outfit starts as the class's own). */
  farmOutfit?: Outfit;
  heroOutfit?: Outfit;
  /** Hero experience, and the level it gives (Hjältenivå 1–20, see XP_LEVELS). Anyone can have it, class or not. */
  xp?: number;
  level?: number;
  /** Upptäcktsboken: the landmarks found (ids), and the ones seen on a map (`<area>:<id>`, see seenKey). */
  discovered?: string[];
  seen?: string[];
  /** Smedjan: each piece's forge level (item id -> 1..FORGE_MAX). */
  forge?: Record<string, number>;
  /** The game day each boss's (or mid-boss's) full chest was last taken (species -> day); later the same day: the replay chest. */
  chestDay?: Record<string, number>;
}

/** The family's best time through a dungeon: from the first one in to the boss's fall, who was there, and when. */
export interface SagaBest {
  ms: number;
  names: string[];
  day: number;
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
  /** A strength potion: more power until then. */
  strong?: number;
}

/** A boss's attack on its way down (shown on the ground), or burning ground that stays a while. */
export interface SagaZone {
  id: string;
  shape: 'circle' | 'cone' | 'line';
  /**
   * Centre (cones and lines: where they start, at the boss) in px; radius in tiles (a line: its length); the
   * direction (radians) of a cone or a line; a cone's width (degrees) and a line's width (tiles).
   */
  x: number;
  y: number;
  r: number;
  dir?: number;
  arc?: number;
  w?: number;
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
  /** A puzzle room's plates (tiles; lit when someone has stood on them), the gate they open, and whether it is open. */
  plates: { x: number; y: number; lit: boolean }[];
  puzzleGate: { x: number; y: number }[];
  puzzleOpen: boolean;
  /** Everyone has fallen: the party gets up at the last rest stone at this time. */
  wipeAt?: number;
  /** When the last player left (the dungeon starts over after SAGA_RESET_MS). */
  emptySince?: number;
  /** When the first fighter came into this (fresh) instance: the clock of the family's best time. */
  startedAt?: number;
  seq: number;
}

/** Nobody inside for this long: the dungeon starts over (monsters back, chests closed). */
export const SAGA_RESET_MS = 3 * 60_000;
