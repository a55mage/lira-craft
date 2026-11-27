import { Chord, Note } from 'tonal';
import type { NotationSystem } from '../types/music';

const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ALPHA_TO_LATIN: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

const LATIN_TO_ALPHA: Record<string, string> = {
  do: 'C',
  re: 'D',
  mi: 'E',
  fa: 'F',
  sol: 'G',
  la: 'A',
  si: 'B',
};

/**
 * Normalize a chord written in Latin (e.g. "Do#m7", "Sib", "Sol7/Si") or Alpha ("C#m7")
 * into canonical Alpha notation ("C#m7", "Bb", "G7/B").
 */
export function normalizeChordToAlpha(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Handle slash chords like "Sol/Si" or "C/G"
  if (trimmed.includes('/')) {
    const [main, bass] = trimmed.split('/');
    return `${normalizeChordToAlpha(main)}/${normalizeChordToAlpha(bass)}`;
  }

  const latinMatch = trimmed.match(/^(sol|do|re|mi|fa|la|si)([#b♯♭]?)(.*)$/i);
  if (latinMatch) {
    const root = LATIN_TO_ALPHA[latinMatch[1].toLowerCase()] ?? latinMatch[1];
    const acc = latinMatch[2].replace('♯', '#').replace('♭', 'b');
    const rest = latinMatch[3];
    return `${root}${acc}${rest}`;
  }

  const alphaMatch = trimmed.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if (alphaMatch) {
    const root = alphaMatch[1].toUpperCase();
    const acc = alphaMatch[2].replace('♯', '#').replace('♭', 'b');
    const rest = alphaMatch[3];
    return `${root}${acc}${rest}`;
  }

  return trimmed;
}

export function transposePitchClass(noteName: string, semitones: number, preferFlats = false): string {
  const clean = noteName.trim();
  if (!clean || semitones === 0) return clean;
  const chroma = Note.chroma(clean);
  if (chroma === undefined) return clean;
  const next = ((chroma + semitones) % 12 + 12) % 12;
  return (preferFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP)[next];
}

export function transposeChord(chordSymbol: string, semitones: number): string {
  const alpha = normalizeChordToAlpha(chordSymbol);
  if (semitones === 0) return alpha;

  if (alpha.includes('/')) {
    const [main, bass] = alpha.split('/');
    return `${transposeChord(main, semitones)}/${transposeChord(bass, semitones)}`;
  }

  const match = alpha.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return alpha;

  const [, root, quality] = match;
  const preferFlats = root.includes('b') || semitones < 0;
  const newRoot = transposePitchClass(root, semitones, preferFlats);
  return `${newRoot}${quality}`;
}

export function formatChord(chordSymbol: string, notation: NotationSystem): string {
  const alpha = normalizeChordToAlpha(chordSymbol);
  if (notation === 'alpha') return alpha;

  if (alpha.includes('/')) {
    const [main, bass] = alpha.split('/');
    return `${formatChord(main, 'latin')}/${formatChord(bass, 'latin')}`;
  }

  const match = alpha.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) return alpha;

  const [, letter, acc, quality] = match;
  const latinRoot = ALPHA_TO_LATIN[letter] ?? letter;
  return `${latinRoot}${acc}${quality}`;
}

export function formatNoteName(noteWithOctave: string, notation: NotationSystem): string {
  const match = noteWithOctave.match(/^([A-G])([#b]?)(\d?)$/);
  if (!match) return noteWithOctave;
  const [, letter, acc, octave] = match;
  if (notation === 'alpha') return `${letter}${acc}${octave}`;
  return `${ALPHA_TO_LATIN[letter] ?? letter}${acc}${octave}`;
}

/**
 * Returns MIDI note numbers (around C4 = 60) for a chord symbol so we can play it or highlight piano keys.
 */
export function getChordMidiNotes(chordSymbol: string, baseOctave = 4): number[] {
  const alpha = normalizeChordToAlpha(chordSymbol).split('/')[0];
  const info = Chord.get(alpha);
  const notes = info.notes.length > 0 ? info.notes : [alpha.replace(/[^A-G#b]/g, '') || 'C'];

  const midis: number[] = [];
  let prevMidi = -1;

  for (const n of notes) {
    const chroma = Note.chroma(n);
    if (chroma === undefined) continue;
    let midi = (baseOctave + 1) * 12 + chroma;
    if (prevMidi !== -1 && midi <= prevMidi) {
      midi += 12;
    }
    midis.push(midi);
    prevMidi = midi;
  }

  return midis.length > 0 ? midis : [60, 64, 67];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number, notation: NotationSystem = 'alpha'): string {
  const name = Note.fromMidiSharps(midi) || 'C4';
  return formatNoteName(name, notation);
}

/**
 * Suggests the best capo position for guitar/ukulele to maximize easy open chords (C, G, D, A, E, Am, Em, Dm, F).
 */
const EASY_OPEN_CHORDS = new Set([
  'C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm', 'C7', 'G7', 'D7', 'A7', 'E7', 'Am7', 'Em7',
]);

export function suggestBestCapo(chords: string[]): { capo: number; easyCount: number; total: number; transposedChords: string[] } {
  const unique = Array.from(new Set(chords.map(normalizeChordToAlpha).filter(Boolean)));
  if (unique.length === 0) {
    return { capo: 0, easyCount: 0, total: 0, transposedChords: [] };
  }

  let best = { capo: 0, easyCount: -1, total: unique.length, transposedChords: unique };

  for (let capo = 0; capo <= 7; capo++) {
    const shifted = unique.map((c) => transposeChord(c, -capo));
    const easyCount = shifted.filter((c) => EASY_OPEN_CHORDS.has(c)).length;
    if (easyCount > best.easyCount) {
      best = { capo, easyCount, total: unique.length, transposedChords: shifted };
    }
  }

  return best;
}

/**
 * Transpose chord symbols embedded inside ABC notation ("C", "G7", etc.) and update K: header.
 */
export function transposeAbcChordsAndKey(abc: string, semitones: number, notation: NotationSystem): string {
  if (!abc.trim()) return abc;
  return abc
    .split('\n')
    .map((line) => {
      if (line.startsWith('K:')) {
        const keyVal = line.slice(2).trim();
        const transposedKey = transposeChord(keyVal, semitones);
        return `K:${transposedKey}`;
      }
      if (/^[A-Za-z]:/.test(line)) return line;
      // Replace quoted chord symbols like "C" or "Am7"
      return line.replace(/"([^"]+)"/g, (_match, chord) => {
        const transposed = transposeChord(chord, semitones);
        const formatted = formatChord(transposed, notation);
        return `"${formatted}"`;
      });
    })
    .join('\n');
}
