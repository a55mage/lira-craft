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

const ROOT_SRC = '(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?';
const BASS_NOTE_SRC = '(?:[A-Ga-g]|Do|Re|Mi|Fa|Sol|La|Si|do|re|mi|fa|sol|la|si)[#b♯♭]?';

/**
 * Chord quality / extensions accepted after the root, e.g. "m7b5", "maj9", "7(b9)", "6/9",
 * "sus4", "add9", "°7", "ø", "+", "-7", "mMaj7", "7#11", "9sus4", "13".
 */
const QUALITY_SRC =
  '(?:maj|min|mMaj|mmaj|mi|m|M|dim|aug|ø|°|\\+|-)?' +
  '(?:6\\/9|69|\\d{1,2})?' +
  '(?:sus[24]?|add\\d{1,2}|maj\\d{1,2}|[b#♭♯]\\d{1,2}|no\\d|alt|' +
  '\\((?:[b#♭♯]?\\d{1,2}|add\\d{1,2}|sus\\d?)(?:\\s*,\\s*[b#♭♯]?\\d{1,2})*\\))*';

const QUALITY_RE = new RegExp(`^${QUALITY_SRC}$`);

/** Single source of truth for "is this token a chord symbol?" (Alpha or Latin roots). */
export const CHORD_SYMBOL_RE = new RegExp(`^${ROOT_SRC}${QUALITY_SRC}(?:\\/${ROOT_SRC})?$`, 'i');

export function isChordSymbol(token: string): boolean {
  return CHORD_SYMBOL_RE.test(token.trim());
}

const SLASH_BASS_RE = new RegExp(`^(.+)\\/(${BASS_NOTE_SRC})$`);

/** Splits "G7/B" into ["G7", "B"] but leaves "C6/9" intact. */
export function splitSlashChord(chord: string): [string, string | undefined] {
  const m = chord.match(SLASH_BASS_RE);
  return m ? [m[1], m[2]] : [chord, undefined];
}

function normalizeAccidental(acc: string): string {
  return acc.replace('♯', '#').replace('♭', 'b');
}

/**
 * Normalize a chord written in Latin (e.g. "Do#m7", "Sib", "Sol7/Si") or Alpha ("C#m7")
 * into canonical Alpha notation ("C#m7", "Bb", "G7/B").
 *
 * Alpha is tried first and only accepted when the rest is a valid chord quality, so
 * "Fadd9"/"Faug" stay F chords, while "Fa", "Fam", "Do7" are read as Latin.
 */
export function normalizeChordToAlpha(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const [main, bass] = splitSlashChord(trimmed);
  if (bass !== undefined) {
    return `${normalizeChordToAlpha(main)}/${normalizeChordToAlpha(bass)}`;
  }

  const alphaMatch = trimmed.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if (alphaMatch && QUALITY_RE.test(alphaMatch[3])) {
    return `${alphaMatch[1].toUpperCase()}${normalizeAccidental(alphaMatch[2])}${alphaMatch[3]}`;
  }

  const latinMatch = trimmed.match(/^(sol|do|re|mi|fa|la|si)([#b♯♭]?)(.*)$/i);
  if (latinMatch) {
    const root = LATIN_TO_ALPHA[latinMatch[1].toLowerCase()] ?? latinMatch[1];
    return `${root}${normalizeAccidental(latinMatch[2])}${latinMatch[3]}`;
  }

  if (alphaMatch) {
    return `${alphaMatch[1].toUpperCase()}${normalizeAccidental(alphaMatch[2])}${alphaMatch[3]}`;
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

// Conventional spelling of each key tonic by pitch class.
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const FLAT_MAJOR_CHROMAS = new Set([1, 3, 5, 8, 10]); // Db Eb F Ab Bb
const FLAT_MINOR_CHROMAS = new Set([0, 2, 3, 5, 7, 10]); // Cm Dm Ebm Fm Gm Bbm

function parseKey(key: string): { chroma: number; minor: boolean; rest: string } | null {
  const alpha = normalizeChordToAlpha(key);
  const m = alpha.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const chroma = Note.chroma(m[1]);
  if (chroma === undefined) return null;
  const rest = m[2];
  const minor = /^(m(?!aj)|min|aeo|dor|phr|loc)/i.test(rest.trim());
  return { chroma, minor, rest };
}

/** True when the given key (e.g. "F", "Bb", "Dm", "Gm") is conventionally written with flats. */
export function keyPrefersFlats(key: string): boolean {
  const parsed = parseKey(key);
  if (!parsed) return false;
  const accidental = normalizeChordToAlpha(key).charAt(1);
  if (accidental === 'b') return true;
  if (accidental === '#') return false;
  return parsed.minor ? FLAT_MINOR_CHROMAS.has(parsed.chroma) : FLAT_MAJOR_CHROMAS.has(parsed.chroma);
}

/** Transposes a key name using conventional key spellings (C +1 -> Db, A +1 -> Bb, Em +1 -> Fm). */
export function transposeKey(key: string, semitones: number): string {
  const parsed = parseKey(key);
  if (!parsed) return key;
  if (semitones === 0) return normalizeChordToAlpha(key);
  const next = (((parsed.chroma + semitones) % 12) + 12) % 12;
  const names = parsed.minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES;
  return `${names[next]}${parsed.rest}`;
}

/**
 * Transposes a chord. Pass `preferFlats` (usually from `keyPrefersFlats(targetKey)`) to spell
 * roots consistently with the destination key; otherwise a heuristic based on the source is used.
 */
export function transposeChord(chordSymbol: string, semitones: number, preferFlats?: boolean): string {
  const alpha = normalizeChordToAlpha(chordSymbol);
  if (semitones === 0) return alpha;

  const [main, bass] = splitSlashChord(alpha);
  if (bass !== undefined) {
    return `${transposeChord(main, semitones, preferFlats)}/${transposeChord(bass, semitones, preferFlats)}`;
  }

  const match = alpha.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return alpha;

  const [, root, quality] = match;
  const flats = preferFlats ?? (root.includes('b') || semitones < 0);
  const newRoot = transposePitchClass(root, semitones, flats);
  return `${newRoot}${quality}`;
}

export function formatChord(chordSymbol: string, notation: NotationSystem): string {
  const alpha = normalizeChordToAlpha(chordSymbol);
  if (notation === 'alpha') return alpha;

  const [main, bass] = splitSlashChord(alpha);
  if (bass !== undefined) {
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
  const alpha = splitSlashChord(normalizeChordToAlpha(chordSymbol))[0];
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
 * Rewrites quoted chord symbols inside ABC ("C", "Am7") in the requested notation.
 * Text annotations ("^Intro", "_text", "<x", ">x", "@x") are left untouched.
 * Transposition is done separately (see SheetMusicPanel, which uses abcjs.strTranspose).
 */
export function formatAbcChordSymbols(abc: string, notation: NotationSystem): string {
  if (!abc.trim() || notation === 'alpha') return abc;
  return abc
    .split('\n')
    .map((line) => {
      if (/^[A-Za-z]:/.test(line)) return line;
      return line.replace(/"([^"]+)"/g, (full, chord: string) => {
        if (/^[\^_<>@]/.test(chord) || !isChordSymbol(chord)) return full;
        return `"${formatChord(chord, notation)}"`;
      });
    })
    .join('\n');
}
