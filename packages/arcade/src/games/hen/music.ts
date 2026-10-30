// Hilda's tunes, written as steps (one token per eighth note): a note like 'C5' or 'F#4', '-' holds the
// note before, '.' is a rest; '|' is just a bar line. Drums: k kick, s snare, h hat, o open hat, j bell.

export interface Song {
  bpm: number;
  /** Steps per beat (2 = eighths). */
  spb: number;
  lead: string;
  bass: string;
  drums?: string;
  leadDuty: number;
  bassDuty: number;
  leadVol?: number;
  bassVol?: number;
  transpose?: number;
  /** Delay the off-beat steps by this much of a step, for a lilt. */
  swing?: number;
}

// "Hildas visa": the sunny main tune (C major)
const A_LEAD = `
E5 . G5 . C6 - G5 E5 | F5 . A5 . C6 - A5 F5 | D5 . G5 . B5 - A5 G5 | E5 - C5 - C5 . . . |
E5 . G5 . C6 - G5 E5 | F5 . A5 . C6 - D6 C6 | B5 . G5 . F5 . D5 . | C5 - - - . . G4 . |
A4 . C5 . E5 - D5 C5 | F5 . E5 . D5 - C5 A4 | D5 . F5 . A5 - G5 F5 | G5 - - . B4 . D5 . |
E5 . G5 . C6 - G5 E5 | F5 . A5 . C6 - D6 E6 | D6 - B5 - G5 . A5 B5 | C6 - - - C5 . . . |`;
const A_BASS = `
C3 . C4 . G3 . C4 . | F2 . F3 . C3 . F3 . | G2 . G3 . D3 . G3 . | C3 . C4 . G3 . C4 . |
C3 . C4 . G3 . C4 . | F2 . F3 . C3 . F3 . | G2 . G3 . F3 . G3 . | C3 . C4 . G3 . C4 . |
A2 . A3 . E3 . A3 . | F2 . F3 . C3 . F3 . | D3 . D4 . A3 . D4 . | G2 . G3 . D3 . G3 . |
C3 . C4 . G3 . C4 . | F2 . F3 . C3 . F3 . | G2 . G3 . D3 . G3 . | C3 . G2 . C3 . . . |`;
const A_DRUMS = `
k . h . s . h . | k . h . s . h . | k . h . s . h . | k . h k s . s s |
k . h . s . h . | k . h . s . h . | k . h . s . h . | k . h k s . s s |
k . h . s . h . | k . h . s . h . | k . h . s . h . | k . h k s . s s |
k . h . s . h . | k . h . s . h . | k . h . s . h . | k . h k s s s s |`;

// "Skogspromenad": a folksy walk through the trees (A dorian)
const B_LEAD = `
A4 . C5 E5 A5 - G5 E5 | F#5 . E5 D5 E5 - . . | A4 . C5 E5 A5 - B5 C6 | B5 A5 F#5 . A5 - . . |
G5 . E5 . C5 . E5 G5 | D6 - B5 . G5 . B5 . | A5 . E5 . C5 . B4 A4 | G#4 - B4 - E5 - . . |
A4 . C5 E5 A5 - G5 E5 | F#5 . E5 D5 E5 - . . | A4 . C5 E5 A5 - B5 C6 | D6 C6 B5 . A5 - . . |
A5 . F5 . C5 . F5 A5 | B5 . G5 . D5 . G5 B5 | G#5 - E5 - B4 - D5 - | C5 - A4 - - - . . |`;
const B_BASS = `
A2 . A3 . E3 . A3 . | D3 . A3 . D3 . F#3 . | A2 . A3 . E3 . A3 . | D3 . A3 . D3 . F#3 . |
C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . A3 . E3 . A3 . | E2 . B2 . E3 . G#3 . |
A2 . A3 . E3 . A3 . | D3 . A3 . D3 . F#3 . | A2 . A3 . E3 . A3 . | D3 . A3 . D3 . F#3 . |
F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | E2 . B2 . E3 . G#3 . | A2 . E3 . A2 . . . |`;
const B_DRUMS = `
k . h h s . h . | k . h h s . h . | k . h h s . h . | k . h h s s s . |
k . h h s . h . | k . h h s . h . | k . h h s . h . | k . h h s s s s |
k . h h s . h . | k . h h s . h . | k . h h s . h . | k . h h s s s . |
k . h h s . h . | k . h h s . h . | k . h h s . h . | k . s . k . . . |`;

// "Ladudansen": a hoedown in the hay (F major)
const C_LEAD = `
C5 C5 A4 C5 F5 . F5 G5 | A5 . G5 F5 G5 . C5 . | E5 E5 C5 E5 G5 . G5 A5 | Bb5 . A5 G5 A5 . . . |
C6 . A5 . F5 . A5 . | Bb5 . G5 . D5 . G5 . | A5 G5 F5 E5 D5 C5 Bb4 G4 | F4 . A4 . F4 . . . |
C5 C5 A4 C5 F5 . F5 G5 | A5 . G5 F5 G5 . C5 . | E5 E5 C5 E5 G5 . G5 A5 | Bb5 . A5 G5 A5 . . . |
D6 . Bb5 . F5 . Bb5 . | C6 . A5 . F5 . A5 . | G5 . A5 . Bb5 . E5 . | F5 - - . F4 . . . |`;
const C_BASS = `
F2 . C3 . F2 . C3 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | C3 . G2 . C3 . G2 . |
F2 . C3 . F2 . C3 . | Bb2 . F2 . Bb2 . F2 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . . . |
F2 . C3 . F2 . C3 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | C3 . G2 . C3 . G2 . |
Bb2 . F2 . Bb2 . F2 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . . . |`;
const C_DRUMS = `
k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k s s s |
k h s h k h s h | k h s h k h s h | k h s h k h s h | k . s . k . . . |
k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k s s s |
k h s h k h s h | k h s h k h s h | k h s h k h s h | k . s . k . s s |`;

// "Månvisan": a lullaby for the night farm (G major, six eighths a bar)
const D_LEAD = `
B4 - - D5 - B4 | G4 - - E4 - - | E5 - - D5 - C5 | B4 - - A4 - - |
B4 - - D5 - G5 | F#5 - - E5 - - | E5 - D5 C5 - A4 | B4 - - A4 - - |
D5 - - B4 - G4 | E5 - - C5 - E5 | C5 - - A4 - C5 | D5 - - - - - |
B4 - - D5 - G5 | E5 - - G5 - E5 | D5 - C5 B4 - A4 | G4 - - - - - |`;
const D_BASS = `
G2 - - D3 - - | E2 - - B2 - - | C3 - - G2 - - | D3 - - A2 - - |
G2 - - D3 - - | E2 - - B2 - - | C3 - - G2 - - | D3 - - A2 - - |
G2 - - D3 - - | C3 - - G2 - - | A2 - - E3 - - | D3 - - A2 - - |
G2 - - D3 - - | C3 - - G2 - - | D3 - - A2 - - | G2 - - D3 - - |`;
const D_DRUMS = `
k . . j . . | k . . j . . | k . . j . . | k . . j . h |
k . . j . . | k . . j . . | k . . j . . | k . . j . h |
k . . j . . | k . . j . . | k . . j . . | k . . j . h |
k . . j . . | k . . j . . | k . . j . . | k . . . . . |`;

export const SONGS: Song[] = [
  { bpm: 132, spb: 2, lead: A_LEAD, bass: A_BASS, drums: A_DRUMS, leadDuty: 0.25, bassDuty: 0.5 },
  { bpm: 122, spb: 2, lead: B_LEAD, bass: B_BASS, drums: B_DRUMS, leadDuty: 0.25, bassDuty: 0.5, swing: 0.18 },
  { bpm: 150, spb: 2, lead: C_LEAD, bass: C_BASS, drums: C_DRUMS, leadDuty: 0.125, bassDuty: 0.5, leadVol: 0.055, bassVol: 0.055 },
  // the roofs: the main tune again, higher and quicker, with a thin reedy lead
  { bpm: 146, spb: 2, lead: A_LEAD, bass: A_BASS, drums: C_DRUMS.replace(/k h s h k s s s/g, 'k h s h k h s h'), leadDuty: 0.125, bassDuty: 0.5, transpose: 2, leadVol: 0.065 },
  // winter: the forest walk, slower, with sleigh bells
  { bpm: 108, spb: 2, lead: B_LEAD, bass: B_BASS, drums: B_DRUMS.replace(/h/g, 'j'), leadDuty: 0.5, bassDuty: 0.25, transpose: 3, leadVol: 0.055, swing: 0.12 },
  { bpm: 100, spb: 2, lead: D_LEAD, bass: D_BASS, drums: D_DRUMS, leadDuty: 0.125, bassDuty: 0.5, leadVol: 0.07, bassVol: 0.06 },
];

export const JINGLES = {
  start: {
    bpm: 172,
    spb: 2,
    lead: 'G4 C5 E5 G5 - E5 G5 - C6 - - -',
    bass: 'C3 . . . . . G2 . C3 - - -',
    drums: 'k . . . . . k . k . . .',
    leadDuty: 0.25,
    bassDuty: 0.5,
  },
  clear: {
    bpm: 150,
    spb: 2,
    lead: 'E5 G5 C6 . G5 C6 E6 - D6 - B5 - C6 - - - . .',
    bass: 'C3 . G3 . E3 . C3 . G2 - - - C3 - - - . .',
    drums: 'k . . . s . . . k . s . k . . . . .',
    leadDuty: 0.25,
    bassDuty: 0.5,
  },
  over: {
    bpm: 110,
    spb: 2,
    lead: 'E5 - D5 - C5 - A4 - B4 - G4 - C5 - - - . .',
    bass: 'C3 - - - F2 - - - G2 - - - C3 - - - . .',
    leadDuty: 0.5,
    bassDuty: 0.5,
  },
  final: {
    bpm: 150,
    spb: 2,
    lead: 'C5 E5 G5 C6 - G5 C6 - E6 - D6 C6 B5 - G5 - A5 B5 C6 - E6 - D6 - C6 - - - - - . . . .',
    bass: 'C3 . G3 . C3 . G3 . F2 . C3 . G2 . D3 . F2 . G2 . A2 . B2 . C3 - - - - - . . . .',
    drums: 'k . h . s . h . k . h . s . h . k . h . s . h . k . . . s s s s . . . .',
    leadDuty: 0.25,
    bassDuty: 0.5,
  },
} satisfies Record<string, Song>;
