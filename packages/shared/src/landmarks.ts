// Upptäcktsboken: the wild maps' landmarks. Every wild biome has two kinds of strange old place (the space base and
// the moon one each), drawn as objects `lm_<id>`. The first time a player touches a kind they have found it: a
// star, a banner with its lore and a small cache of forge materials and coins. This file is only the table (the
// painters place them, explore.ts has the rules), so the item and object tables can read it without a cycle.
import type { Biome } from './biomes.ts';

export interface LandmarkDef {
  id: string;
  biome: Biome;
  /** The name in "Du hittade {name}!" (definite form). */
  name: string;
  /** One line about the place, shown on the banner and again on every later touch. */
  lore: string;
  /** What the first visit gives: forge materials (more precious the further from home the biome lies) and coins. */
  cache: [item: string, count: number][];
  coins: number;
  /** Footprint width (3 unless said); every landmark is 3 tiles high. */
  w?: number;
  /** Glows at night. */
  light?: boolean;
}

const L = (id: string, biome: Biome, name: string, lore: string, cache: [string, number][], coins: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({
  id,
  biome,
  name,
  lore,
  cache,
  coins,
  ...extra,
});

/** Every landmark, by id (its object kind is `lm_<id>`). */
export const LANDMARKS: Record<string, LandmarkDef> = Object.fromEntries(
  [
    // close to home: stone and gold for the forge's first step
    L('stencirkel', 'skog', 'Stencirkeln', 'Uråldriga stenar i en ring kring ett platt altare. Förr möttes folket här på midsommarnatten.', [['stone', 3], ['gold', 2]], 15),
    L('jatteek', 'skog', 'Jätteeken', 'En ek så gammal att den har blivit ihålig. Någon har hängt lyktor därinne.', [['stone', 3], ['gold', 2]], 15, { light: true }),
    L('vardkase', 'ang', 'Vårdkasen', 'Ett stentorn med en eldskål i toppen. Förr tändes den när fiender var på väg.', [['stone', 3], ['gold', 2]], 15),
    L('blomsterlabyrint', 'ang', 'Blomsterlabyrinten', 'En låg häck av blommor som slingrar sig i en irrgång. Hittar du vägen in till mitten?', [['stone', 3], ['gold', 2]], 15, { w: 4 }),
    // the ring around home: crystal, obsidian and gold
    L('frusetskepp', 'is', 'Det frusna skeppet', 'Ett vikingaskepp som frös fast i isen för länge sedan. Drakhuvudet pekar fortfarande mot himlen.', [['crystal', 2], ['gold', 1]], 25),
    L('jatteskelett', 'is', 'Frostjättens ben', 'Revben och en skalle stor som ett hus sticker upp ur snön. Vem var han?', [['crystal', 2], ['gold', 1]], 25, { w: 4 }),
    L('dvargport', 'berg', 'Dvärgporten', 'En stendörr full av dvärgarnas runor. Den är låst, men lyktorna bredvid lyser än.', [['crystal', 2], ['gold', 2]], 25, { light: true }),
    L('ornnaste', 'berg', 'Örnboet', 'Högst upp på klippan har en jättelik örn byggt sitt bo. Den håller ett öga på dig.', [['crystal', 2], ['gold', 1]], 25),
    L('klocktorn', 'strand', 'Det sjunkna klocktornet', 'Bara toppen sticker upp ur sanden. När det blåser klingar den gröna klockan.', [['crystal', 2], ['gold', 1]], 25),
    L('valskelett', 'strand', 'Valskelettet', 'Skelettet av en val, så stort att du kan gå under revbenen.', [['obsidian', 2], ['gold', 1]], 25, { w: 4 }),
    L('mossaltare', 'trask', 'Mossaltaret', 'Ett gammalt altare mitt i mossen. Tre irrbloss dansar runt det varje natt.', [['fairy_dust', 1], ['crystal', 1]], 25, { light: true }),
    L('gamlabron', 'trask', 'Den gamla bron', 'En bro av gamla plankor som tar slut mitt i mossen. Vart ledde den en gång?', [['crystal', 2], ['gold', 1]], 25),
    L('svampring', 'svamp', 'Svampringen', 'En ring av jättesvampar som lyser svagt i mörkret. Här dansar älvorna.', [['fairy_dust', 1], ['crystal', 1]], 25, { light: true }),
    L('lykttrad', 'svamp', 'Lyktträdet', 'Ett träd fullt av lysande lyktor. Ingen vet vem som tänder dem varje kväll.', [['crystal', 2], ['gold', 1]], 25, { light: true }),
    L('dinobo', 'dino', 'Dinoboet', 'Ett bo med jättelika ägg. Ett av dem har spruckit, men ungen syns inte till!', [['obsidian', 2], ['gold', 1]], 25),
    L('tjargrop', 'dino', 'Tjärgropen', 'En bubblande grop av svart tjära. Gamla ben sticker upp ur den.', [['obsidian', 2], ['gold', 1]], 25),
    // far out: fire crystals, fairy dust and star crystals for the third step
    L('oas', 'oken', 'Oasen', 'Ett vattenhål med två palmer och ett tält. En trött vandrare vilar här ibland.', [['fire_crystal', 1], ['gold', 2]], 40),
    L('sandjatte', 'oken', 'Sandjätten', 'Ett jättelikt stenhuvud som vinden har slipat i tusen år.', [['fire_crystal', 1], ['crystal', 1]], 40),
    L('apkungenstron', 'djungel', 'Apkungens tron', 'En tron av sten, full av lianer. En apa sitter på den som om den vore kung.', [['fairy_dust', 1], ['gold', 2]], 40),
    L('vattenfall', 'djungel', 'Vattenfallet', 'Ett litet vattenfall som porlar ner i en klar damm. Vattnet är alldeles kallt.', [['fairy_dust', 1], ['crystal', 1]], 40),
    L('eldbrunn', 'vulkan', 'Eldbrunnen', 'En krater som puffar eld ur jorden. Varm och skön att stå bredvid!', [['fire_crystal', 2], ['obsidian', 1]], 40, { light: true }),
    L('forstenadjatte', 'vulkan', 'Den förstenade jätten', 'En jätte som blev till sten när solen gick upp. Han sitter kvar på knä.', [['fire_crystal', 1], ['obsidian', 2]], 40),
    L('glasstorn', 'godis', 'Glasstornet', 'Ett torn byggt av en jättelik glasstrut. Det smälter aldrig, hur varmt det än blir.', [['fairy_dust', 2], ['gold', 1]], 40),
    L('chokladfontan', 'godis', 'Chokladfontänen', 'En fontän där varm choklad porlar dag och natt.', [['fairy_dust', 1], ['fire_crystal', 1]], 40),
    L('satellit', 'rymdbas', 'Satelliten', 'En satellit som har störtat från rymden. Lampan på den blinkar fortfarande.', [['star_crystal', 1], ['crystal', 1]], 50, { light: true }),
    L('manporten', 'mane', 'Månporten', 'En uråldrig båge av månsten med ett svagt stjärnsken. Vem byggde den?', [['star_crystal', 2]], 60, { light: true }),
  ].map((d) => [d.id, d]),
);

/** Every landmark id, in table order (the client's checklist goes by this). */
export const LANDMARK_IDS: readonly string[] = Object.keys(LANDMARKS);
/** The object kind of a landmark, and back. */
export const landmarkKind = (id: string): string => `lm_${id}`;
export const landmarkOfKind = (kind: string): string | null => (kind.startsWith('lm_') && LANDMARKS[kind.slice(3)] ? kind.slice(3) : null);
/** The landmarks of a biome (two for a wild biome, one for the space base and the moon, none elsewhere). */
export const landmarksOf = (biome: string | undefined): LandmarkDef[] => Object.values(LANDMARKS).filter((d) => d.biome === biome);
/** What `prog.seen` holds for a landmark seen on a map: `<area>:<id>` (the area key may itself contain colons). */
export const seenKey = (area: string, id: string): string => `${area}:${id}`;
export const parseSeenKey = (k: string): { area: string; id: string } | null => {
  const i = k.lastIndexOf(':');
  return i > 0 ? { area: k.slice(0, i), id: k.slice(i + 1) } : null;
};
/** How close (tiles) a player must come to a landmark for it to count as seen. */
export const LANDMARK_SEEN_TILES = 12;
