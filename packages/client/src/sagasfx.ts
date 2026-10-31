// Sounds for Sagan om Världsträdet's dungeons, made in code like the game's other sounds: every spell, monsters'
// swipes and arrows, a boss winding up a big attack and landing it, a boss's shout, falling and getting up, and
// the fanfare of a treasure chest. Kept short and friendly: the players are small.
import { ensure, noise, tone } from './sound.ts';

/** Noise through a filter that sweeps from one pitch to another (whooshes, wind, fire). */
function sweep(dur: number, from: number, to: number, vol = 0.05, type: BiquadFilterType = 'bandpass', q = 1.2): void {
  const c = ensure();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

/** A tone that swells slowly instead of starting at once (a boss gathering power). */
function swell(freq: number, dur: number, to: number, vol = 0.05, type: OscillatorType = 'sine'): void {
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  g.gain.setValueAtTime(0.001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

const later = (ms: number, fn: () => void): void => void setTimeout(fn, ms);
const notes = (freqs: number[], step: number, dur: number, type: OscillatorType = 'triangle', vol = 0.05): void =>
  freqs.forEach((f, i) => later(i * step, () => tone(f, dur, type, vol)));

const slash = (pitch = 1): void => {
  sweep(0.12, 2500 * pitch, 700 * pitch, 0.07, 'highpass', 0.7);
  tone(260 * pitch, 0.08, 'square', 0.035, -120);
};
const thud = (): void => {
  tone(110, 0.14, 'square', 0.06, -50);
  noise(0.06, 0.06);
};
const boom = (big = 1): void => {
  noise(0.25 + big * 0.15, 0.07 + big * 0.04);
  tone(80, 0.3 + big * 0.1, 'triangle', 0.08, -40);
};

/** One sound per spell id the server sends (the classes' spells, the potion, monsters' and bosses' attacks). */
const SPELL_SOUNDS: Record<string, () => void> = {
  hugg: () => slash(1),
  utmana: () => {
    tone(220, 0.28, 'sawtooth', 0.045, 110);
    later(90, () => tone(330, 0.3, 'sawtooth', 0.035, 60));
  },
  skoldslag: () => {
    thud();
    later(40, () => tone(1250, 0.12, 'triangle', 0.04, -300));
  },
  skoldmur: () => {
    tone(196, 0.5, 'triangle', 0.06, 98);
    later(60, () => tone(392, 0.4, 'sine', 0.04));
  },
  lakerunan: () => notes([660, 880, 1100], 60, 0.18, 'sine', 0.045),
  ljuspil: () => tone(1100, 0.16, 'triangle', 0.045, 900),
  lakekrets: () => notes([523, 659, 784, 1047, 1319], 70, 0.22, 'sine', 0.04),
  vackupp: () => notes([392, 523, 659, 784, 1047], 90, 0.3, 'triangle', 0.05),
  yxhugg: () => {
    slash(0.7);
    later(50, thud);
  },
  stormsteg: () => {
    sweep(0.3, 400, 2400, 0.07);
    later(220, thud);
  },
  virvelvind: () => {
    for (let i = 0; i < 3; i++) later(i * 110, () => sweep(0.16, 900 + i * 400, 2600 + i * 300, 0.06));
  },
  raseri: () => {
    tone(110, 0.5, 'sawtooth', 0.055, -30);
    tone(165, 0.45, 'square', 0.03, -40);
    sweep(0.4, 300, 1200, 0.04, 'lowpass');
  },
  eldboll: () => {
    sweep(0.3, 300, 1500, 0.06, 'lowpass', 0.6);
    later(260, () => boom(0.3));
  },
  isspjut: () => {
    tone(2100, 0.12, 'triangle', 0.04, -900);
    later(140, () => notes([2637, 3136], 40, 0.1, 'sine', 0.03));
  },
  askregn: () => {
    noise(0.35, 0.09);
    tone(60, 0.5, 'square', 0.05, -20);
    for (let i = 0; i < 3; i++) later(80 + i * 90, () => sweep(0.08, 4000, 1500, 0.06, 'highpass'));
  },
  blink: () => {
    tone(600, 0.16, 'sine', 0.05, 1400);
    later(90, () => tone(1800, 0.14, 'triangle', 0.035, 600));
  },
  potion: () => {
    tone(320, 0.08, 'sine', 0.06, 200);
    later(110, () => tone(360, 0.08, 'sine', 0.06, 240));
    later(240, () => notes([784, 1047], 60, 0.12, 'sine', 0.035));
  },
  claw: () => {
    sweep(0.08, 1800, 600, 0.05, 'highpass');
    tone(180, 0.06, 'square', 0.03, -80);
  },
  mob_draugbage: () => tone(900, 0.08, 'sine', 0.04, 500),
  mob_isande: () => tone(1500, 0.18, 'sine', 0.04, -700),
  charge_land: () => {
    boom(0.6);
    sweep(0.3, 2000, 300, 0.05, 'lowpass');
  },
};

/** A boss gathering power before a big attack: a rising hum as long as the warning on the ground. */
export function bossWindup(move: string, ms: number): void {
  const dur = Math.max(0.4, Math.min(3, ms / 1000));
  if (move === 'line') {
    // steam (or a tail) building up: a hiss that gets louder and higher
    sweep(dur, 300, 2600, 0.045, 'highpass', 0.8);
    swell(90, dur, 180, 0.04, 'sawtooth');
    return;
  }
  if (move === 'pull') {
    // a whirlpool: a low hum and wind turning round and round
    swell(60, dur, 120, 0.05, 'triangle');
    for (let i = 0; i < 3; i++) later((i * dur * 1000) / 3, () => sweep(dur / 3, 1800, 300, 0.04, 'bandpass', 2));
    return;
  }
  if (move === 'mend') {
    // falling asleep on the gold: a soft lullaby, slowly
    notes([392, 330, 294, 262], (dur * 1000) / 5, 0.5, 'sine', 0.035);
    swell(196, dur, 262, 0.02, 'sine');
    return;
  }
  if (move === 'summon') {
    // a howl calling for help
    swell(220, dur * 0.7, 440, 0.045, 'sawtooth');
    later(dur * 700, () => tone(440, 0.4, 'triangle', 0.035, -180));
    return;
  }
  const base = move === 'nova' ? 70 : move === 'freeze' || move === 'rain' ? 220 : move === 'pools' ? 90 : 110;
  swell(base, dur, base * 2.2, 0.05, 'triangle');
  swell(base * 1.5, dur, base * 3, 0.025, 'sine');
}

/** A boss's big attack lands. */
export function bossLand(move: string): void {
  if (move === 'freeze' || move === 'rain') {
    notes([1760, 1319, 2093], 30, 0.12, 'triangle', 0.04);
    noise(0.15, 0.05);
  } else if (move === 'pools') {
    sweep(0.5, 200, 900, 0.07, 'lowpass', 0.7);
    boom(0.3);
  } else if (move === 'cleave') {
    slash(0.5);
    boom(0.5);
  } else if (move === 'line') {
    sweep(0.45, 3000, 400, 0.08, 'bandpass', 0.8);
    boom(0.6);
  } else if (move === 'pull') {
    // sucked in: a whoosh that falls, and a thump
    sweep(0.35, 2500, 200, 0.07, 'lowpass', 0.7);
    later(280, thud);
  } else if (move === 'mend') notes([523, 659, 784], 70, 0.3, 'sine', 0.04);
  else if (move === 'summon') {
    noise(0.2, 0.06);
    later(80, () => tone(660, 0.12, 'triangle', 0.035, 300));
  } else boom(move === 'nova' ? 1.4 : 1);
}

export const SAGA_SFX = {
  /** A spell or an attack, by the server's spell id (unknown ones are quiet). */
  spell(id: string): void {
    if (id.startsWith('land_')) bossLand(id.slice(5));
    else if (!id.startsWith('cast_')) SPELL_SOUNDS[id]?.();
  },
  /** You were hit. */
  hurt: () => tone(300, 0.09, 'square', 0.045, -120),
  /** A monster you hit hard. */
  crit: () => {
    thud();
    later(30, () => tone(1600, 0.08, 'triangle', 0.035, -500));
  },
  /** Dazed or interrupted. */
  stun: () => notes([1568, 1319, 1568], 50, 0.07, 'triangle', 0.03),
  kick: () => {
    thud();
    later(60, () => notes([784, 1175], 70, 0.15, 'triangle', 0.05));
  },
  /** A boss shouts. */
  yell: () => {
    tone(150, 0.4, 'sawtooth', 0.05, -60);
    later(60, () => tone(98, 0.5, 'square', 0.035, -25));
    sweep(0.45, 500, 200, 0.04, 'bandpass', 2);
  },
  /** Big words across the screen: a dungeon's name, a new chapter. */
  banner: () => {
    tone(196, 1.2, 'sine', 0.06);
    tone(294, 1, 'sine', 0.035);
    later(120, () => tone(392, 0.8, 'triangle', 0.025));
  },
  /** A boss beaten, a dungeon cleared, a chapter's reward: a fanfare with fireworks popping. */
  fanfare: (big: boolean) => {
    notes([392, 523, 659, 784], 110, 0.22, 'square', 0.035);
    later(460, () => {
      tone(1047, 0.7, 'triangle', 0.05);
      tone(784, 0.7, 'triangle', 0.035);
      tone(523, 0.7, 'sine', 0.035);
    });
    if (big)
      for (let i = 0; i < 4; i++)
        later(800 + i * 280, () => {
          sweep(0.25, 600, 3000, 0.03, 'bandpass', 3);
          later(240, () => noise(0.18, 0.05));
        });
  },
  /** Everyone fell: low and slow. */
  sombre: () => {
    notes([294, 277, 220], 380, 0.7, 'sine', 0.05);
    tone(73, 1.6, 'triangle', 0.05);
  },
  /** A rest stone lights up: soft and calm. */
  calm: () => notes([523, 784, 1047, 784], 180, 0.6, 'sine', 0.03),
  /** A rune plate lights up, or all of them do: a bright little chime. */
  chime: () => {
    notes([1047, 1319, 1568, 2093], 70, 0.45, 'sine', 0.04);
    later(320, () => tone(2637, 0.6, 'triangle', 0.02));
  },
  /** One rune plate lit. */
  plate: () => notes([784, 1175], 90, 0.35, 'sine', 0.04),
  /** Hero mode on (a short call to arms) or off. */
  hero: (on: boolean) => (on ? notes([392, 523, 784], 80, 0.18, 'square', 0.03) : notes([523, 392], 90, 0.18, 'triangle', 0.035)),
  /** Something marked on the ground near you. */
  warn: () => {
    tone(880, 0.06, 'square', 0.025);
    later(110, () => tone(880, 0.06, 'square', 0.025));
  },
  /** You fell, you are up again. */
  fall: () => notes([440, 370, 294, 220], 130, 0.22, 'triangle', 0.05),
  rise: () => notes([330, 440, 554, 660], 90, 0.2, 'triangle', 0.05),
  /** Picked a target. */
  target: () => tone(900, 0.035, 'triangle', 0.03),
  /** Smed-Stina's hammer on the anvil: a ring for each blow, one more for every forge level, then a bright chime. */
  anvil: (level: number) => {
    const blows = Math.max(1, Math.min(5, level));
    for (let i = 0; i < blows; i++)
      later(i * 170, () => {
        tone(1760 + i * 40, 0.25, 'triangle', 0.04, -200);
        tone(2637, 0.12, 'sine', 0.02);
        noise(0.04, 0.05);
      });
    later(blows * 170 + 80, () => notes([784, 1047, 1319], 70, 0.35, 'sine', 0.04));
  },
  /** The loot window: a chest of treasure, longer and shinier for something legendary. */
  loot: (best: number) => {
    notes([523, 659, 784, 1047], 80, 0.25, 'triangle', 0.05);
    if (best >= 3) later(380, () => notes([1319, 1568, 2093], 70, 0.35, 'sine', 0.04));
    if (best >= 4) later(650, () => notes([1047, 1319, 1568, 2093, 2637], 60, 0.6, 'triangle', 0.035));
  },
};
