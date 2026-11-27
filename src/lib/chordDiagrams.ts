import type { Instrument } from '../types/music';
import { normalizeChordToAlpha, splitSlashChord } from './musicTheory';

export interface FrettedDiagram {
  /** Array of frets from lowest string to highest string. -1 = muted (X), 0 = open (O) */
  frets: number[];
  /** Optional finger numbers (1-4) */
  fingers?: number[];
  /** Optional barre fret */
  barre?: number;
  /** Beginner tip */
  easyNote?: string;
}

// Guitar: E A D G B e (6 strings)
const GUITAR_CHORDS: Record<string, FrettedDiagram> = {
  C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  Cm: { frets: [-1, 3, 5, 5, 4, 3], barre: 3, easyNote: 'Versione facile: x-x-5-5-4-3' },
  C7: { frets: [-1, 3, 2, 3, 1, 0] },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0] },
  D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  D7: { frets: [-1, -1, 0, 2, 1, 2] },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0] },
  Em7: { frets: [0, 2, 0, 0, 0, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], barre: 1, easyNote: 'Facile senza barrè: x-x-3-2-1-1 (Fmaj7: x-x-3-2-1-0)' },
  Fm: { frets: [1, 3, 3, 1, 1, 1], barre: 1 },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0] },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], barre: 2, easyNote: 'Usa Capo 2 e suona Em!' },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  Gm: { frets: [3, 5, 5, 3, 3, 3], barre: 3 },
  G7: { frets: [3, 2, 0, 0, 0, 1] },
  A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  A7: { frets: [-1, 0, 2, 0, 2, 0] },
  Am7: { frets: [-1, 0, 2, 0, 1, 0] },
  B: { frets: [-1, 2, 4, 4, 4, 2], barre: 2 },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], barre: 2, easyNote: 'Facile senza barrè: x-x-4-4-3-2' },
  B7: { frets: [-1, 2, 1, 2, 0, 2] },
  Bb: { frets: [-1, 1, 3, 3, 3, 1], barre: 1 },
  'C#m': { frets: [-1, 4, 6, 6, 5, 4], barre: 4 },
};

// Ukulele: G C E A (4 strings)
const UKULELE_CHORDS: Record<string, FrettedDiagram> = {
  C: { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] },
  Cm: { frets: [0, 3, 3, 3] },
  C7: { frets: [0, 0, 0, 1] },
  Cmaj7: { frets: [0, 0, 0, 2] },
  D: { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0] },
  Dm: { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0] },
  D7: { frets: [2, 2, 2, 3] },
  Dm7: { frets: [2, 2, 1, 3] },
  E: { frets: [4, 4, 4, 2], easyNote: 'Alternativa facile: 1-4-0-2 (oppure trasponi in C!)' },
  Em: { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1] },
  E7: { frets: [1, 2, 0, 2] },
  Em7: { frets: [0, 2, 0, 2] },
  F: { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0] },
  Fm: { frets: [1, 0, 1, 3] },
  Fmaj7: { frets: [2, 4, 1, 3] },
  'F#m': { frets: [2, 1, 2, 0] },
  G: { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2] },
  Gm: { frets: [0, 2, 3, 1] },
  G7: { frets: [0, 2, 1, 2] },
  A: { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0] },
  Am: { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] },
  A7: { frets: [0, 1, 0, 0] },
  Am7: { frets: [0, 0, 0, 0], easyNote: 'Tutte le corde a vuoto!' },
  B: { frets: [4, 3, 2, 2], barre: 2 },
  Bm: { frets: [4, 2, 2, 2], barre: 2 },
  B7: { frets: [2, 3, 2, 2], barre: 2 },
  Bb: { frets: [3, 2, 1, 1], barre: 1 },
  'C#m': { frets: [6, 4, 4, 4], barre: 4 },
};

const ENHARMONIC_LOOKUP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  'A#': 'Bb',
};

export function getFrettedDiagram(chordSymbol: string, instrument: Exclude<Instrument, 'piano'>): FrettedDiagram | null {
  const clean = splitSlashChord(normalizeChordToAlpha(chordSymbol))[0];
  const map = instrument === 'guitar' ? GUITAR_CHORDS : UKULELE_CHORDS;

  if (map[clean]) return map[clean];

  // Try enharmonic root
  const m = clean.match(/^([A-G][#b]?)(.*)$/);
  if (m && ENHARMONIC_LOOKUP[m[1]]) {
    const alt = `${ENHARMONIC_LOOKUP[m[1]]}${m[2]}`;
    if (map[alt]) return map[alt];
  }

  // Fallback to base triad (e.g. Gsus4 -> G, Am9 -> Am)
  if (m) {
    const isMinor = m[2].startsWith('m') && !m[2].startsWith('maj');
    const simple = `${m[1]}${isMinor ? 'm' : ''}`;
    if (map[simple]) return map[simple];
  }

  return null;
}

export const STRING_LABELS: Record<Exclude<Instrument, 'piano'>, string[]> = {
  guitar: ['E', 'A', 'D', 'G', 'B', 'e'],
  ukulele: ['G', 'C', 'E', 'A'],
};
