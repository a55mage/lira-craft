import { getChordMidiNotes, isChordSymbol, normalizeChordToAlpha, transposeChord } from './musicTheory';

/**
 * Timing is always expressed in quarter-note beats, independent of the ABC `L:` unit.
 */
export interface TimelineEvent {
  id: number;
  startBeat: number;
  /** Written length (what the staff / guided player shows). */
  durationBeats: number;
  /** Sounding length: includes any notes tied to this one. */
  sustainBeats: number;
  midiNotes: number[];
  chord?: string; // Alpha transposed chord
  label?: string;
  /** Index of the matching `.abcjs-note` element in the rendered staff (written order). */
  noteIndex?: number;
  /** Continuation of a tie: shown, but not re-attacked and never waited on. */
  tied?: boolean;
}

export interface MeterInfo {
  /** Bar length in quarter-note beats (3/4 -> 3, 6/8 -> 3, 2/2 -> 4, 5/8 -> 2.5). */
  beatsPerBar: number;
  /** Metronome pulse in quarter-note beats (4/4 -> 1, 6/8 -> 1.5, 2/2 -> 2). */
  clickBeats: number;
  numerator: number;
  denominator: number;
}

export function parseMeter(timeSignature: string | null | undefined): MeterInfo {
  const raw = (timeSignature ?? '').trim();
  let num = 4;
  let den = 4;
  if (raw === 'C') {
    num = 4;
    den = 4;
  } else if (raw === 'C|') {
    num = 2;
    den = 2;
  } else {
    const m = raw.match(/^(\d+(?:\+\d+)*)\s*\/\s*(\d+)$/);
    if (m) {
      num = m[1].split('+').reduce((a, b) => a + Number(b), 0);
      den = Number(m[2]);
    }
  }
  if (!(num > 0) || !(den > 0)) {
    num = 4;
    den = 4;
  }
  const beatsPerBar = (num * 4) / den;
  const compound = den >= 8 && num % 3 === 0;
  const clickBeats = compound ? (3 * 4) / den : 4 / den;
  return { beatsPerBar, clickBeats, numerator: num, denominator: den };
}

/** Returns the first `M:` header of an ABC tune, if any. */
export function getAbcMeter(abc: string): string | null {
  const m = abc.match(/^\s*M:\s*([^\n%]+)/m);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Key signatures
// ---------------------------------------------------------------------------

const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const MODE_OFFSET: Record<string, number> = {
  '': 0, maj: 0, ion: 0, mix: -1, dor: -2, m: -3, min: -3, aeo: -3, phr: -4, loc: -5, lyd: 1,
};

type KeyAccidentals = Record<string, number>;

export function parseKeySignature(value: string): KeyAccidentals {
  const result: KeyAccidentals = {};
  // Drop clef=, middle=, transpose= ... modifiers
  const v = value.replace(/\b[a-z]+=\S+/gi, '').trim();
  if (!v || /^(none|HP|Hp)\b/.test(v)) return result;

  const m = v.match(/^([A-G])([#b]?)\s*([A-Za-z]*)(.*)$/);
  let explicit = v;
  if (m) {
    const [, letter, acc, modeRaw, rest] = m;
    const modeWord = modeRaw.toLowerCase();
    const mode = modeWord === 'm' ? 'm' : modeWord.slice(0, 3);
    const fifths =
      LETTER_FIFTHS[letter] + (acc === '#' ? 7 : acc === 'b' ? -7 : 0) + (MODE_OFFSET[mode] ?? 0);
    if (fifths > 0) {
      SHARP_ORDER.slice(0, Math.min(7, fifths)).forEach((l) => (result[l] = 1));
    } else if (fifths < 0) {
      FLAT_ORDER.slice(0, Math.min(7, -fifths)).forEach((l) => (result[l] = -1));
    }
    explicit = rest;
  }

  // Explicit accidentals, e.g. "K:D ^g _b =c"
  for (const am of explicit.matchAll(/(\^\^|\^|__|_|=)([A-Ga-g])/g)) {
    const amount = am[1] === '^' ? 1 : am[1] === '^^' ? 2 : am[1] === '_' ? -1 : am[1] === '__' ? -2 : 0;
    result[am[2].toUpperCase()] = amount;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tokenizer -> written items
// ---------------------------------------------------------------------------

const ABC_BASE_MIDI: Record<string, number> = {
  C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71,
};

type Item =
  | {
      kind: 'note';
      midis: number[]; // empty = rest
      units: number; // in quarter beats (already scaled by L)
      chord?: string;
      noteIndex?: number;
      tie: boolean;
      multiRestBars?: number;
    }
  | { kind: 'bar'; repeatStart: boolean; repeatEnd: boolean; double: boolean }
  | { kind: 'ending'; nums: number[] };

function parseFraction(value: string): number | null {
  const m = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? n / d : null;
}

function defaultUnitFor(meter: string | null): number {
  if (!meter) return 1 / 8;
  const info = parseMeter(meter);
  return info.numerator / info.denominator < 0.75 ? 1 / 16 : 1 / 8;
}

/** Reads an ABC length suffix ("2", "/", "//", "3/2", "/4") as a multiplier of L. */
function readLength(src: string, pos: number): { mult: number; end: number } {
  const m = src.slice(pos).match(/^(\d*)(\/*)(\d*)/);
  if (!m || m[0] === '') return { mult: 1, end: pos };
  const num = m[1] ? Number(m[1]) : 1;
  let den = 1;
  if (m[2]) {
    den = m[3] ? Number(m[3]) : Math.pow(2, m[2].length);
  }
  return { mult: den > 0 ? num / den : 1, end: pos + m[0].length };
}

function tokenizeAbc(abc: string): { items: Item[]; meter: string | null } {
  const items: Item[] = [];
  const lines = abc.replace(/\r\n?/g, '\n').split('\n');

  let meter: string | null = null;
  let unit: number | null = null; // L as fraction of a whole note
  let keyAcc: KeyAccidentals = {};
  let barAcc = new Map<number, number>(); // natural midi -> semitone offset for this bar
  let noteIndex = 0;
  let pendingChord: string | undefined;
  let tuplet: { remaining: number; factor: number } | null = null;
  let broken: number | null = null; // multiplier to apply to next note

  const unitBeats = () => (unit ?? defaultUnitFor(meter)) * 4;

  const applyField = (field: string, value: string) => {
    if (field === 'M') {
      meter = value.trim();
    } else if (field === 'L') {
      const f = parseFraction(value);
      if (f) unit = f;
    } else if (field === 'K') {
      keyAcc = parseKeySignature(value);
      barAcc = new Map();
    }
  };

  const lastNote = (): Extract<Item, { kind: 'note' }> | undefined => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'note') return it;
      if (it.kind === 'bar') return undefined;
    }
    return undefined;
  };

  const pushNote = (midis: number[], mult: number, extra: { multiRestBars?: number } = {}) => {
    let units = mult * unitBeats();
    if (broken !== null) {
      units *= broken;
      broken = null;
    }
    if (tuplet) {
      units *= tuplet.factor;
      tuplet.remaining--;
      if (tuplet.remaining <= 0) tuplet = null;
    }
    const isRest = midis.length === 0;
    items.push({
      kind: 'note',
      midis,
      units,
      chord: pendingChord,
      noteIndex: isRest ? undefined : noteIndex++,
      tie: false,
      ...extra,
    });
    pendingChord = undefined;
  };

  /** Reads one pitch (accidental + letter + octave marks) starting at pos. */
  const readPitch = (src: string, pos: number): { midi: number; end: number } | null => {
    const m = src.slice(pos).match(/^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)/);
    if (!m) return null;
    const [whole, acc, letter, octaves] = m;
    let natural = ABC_BASE_MIDI[letter.toUpperCase()] + (letter === letter.toLowerCase() ? 12 : 0);
    for (const ch of octaves) natural += ch === ',' ? -12 : 12;

    let offset: number;
    if (acc) {
      offset = acc === '^' ? 1 : acc === '^^' ? 2 : acc === '_' ? -1 : acc === '__' ? -2 : 0;
      barAcc.set(natural, offset);
    } else if (barAcc.has(natural)) {
      offset = barAcc.get(natural)!;
    } else {
      offset = keyAcc[letter.toUpperCase()] ?? 0;
    }
    return { midi: natural + offset, end: pos + whole.length };
  };

  for (const rawLine of lines) {
    // Header / field line (but not a body line such as "A:|")
    const headerMatch = rawLine.match(/^\s*([A-Za-z]):(?![|:])(.*)$/);
    if (headerMatch) {
      applyField(headerMatch[1], headerMatch[2].replace(/%.*$/, ''));
      continue;
    }
    const line = rawLine.replace(/(^|[^\\])%.*$/, '$1');
    let i = 0;
    while (i < line.length) {
      const ch = line[i];

      // Chord symbol or annotation
      if (ch === '"') {
        const close = line.indexOf('"', i + 1);
        if (close === -1) break;
        const content = line.slice(i + 1, close).trim();
        if (!/^[\^_<>@]/.test(content) && isChordSymbol(content)) {
          pendingChord = normalizeChordToAlpha(content);
        }
        i = close + 1;
        continue;
      }

      // Decorations !trill! / +fermata+
      if (ch === '!' || ch === '+') {
        const close = line.indexOf(ch, i + 1);
        i = close === -1 ? i + 1 : close + 1;
        continue;
      }

      // Grace notes {g}: drawn attached to the next note, not played in our timeline
      if (ch === '{') {
        const close = line.indexOf('}', i + 1);
        i = close === -1 ? line.length : close + 1;
        continue;
      }

      if (ch === '[') {
        // Inline field [K:D] [L:1/8] [M:3/4]
        const field = line.slice(i).match(/^\[([A-Za-z]):([^\]]*)\]/);
        if (field) {
          applyField(field[1], field[2]);
          i += field[0].length;
          continue;
        }
        // Ending [1 or [1,2
        const ending = line.slice(i).match(/^\[(\d+(?:[,-]\d+)*)/);
        if (ending) {
          items.push({ kind: 'ending', nums: expandEndingNums(ending[1]) });
          i += ending[0].length;
          continue;
        }
        // Thick-thin bar [|
        if (line[i + 1] === '|') {
          const bar = readBar(line, i);
          items.push(bar.item);
          barAcc = new Map();
          if (bar.ending) items.push({ kind: 'ending', nums: bar.ending });
          i = bar.end;
          continue;
        }
        // Chord [CEG]2
        const close = line.indexOf(']', i + 1);
        if (close === -1) {
          i++;
          continue;
        }
        const inner = line.slice(i + 1, close);
        const midis: number[] = [];
        let firstMult = 1;
        let j = 0;
        let innerTie = false;
        while (j < inner.length) {
          const p = readPitch(inner, j);
          if (!p) {
            if (inner[j] === '-') innerTie = true;
            j++;
            continue;
          }
          const len = readLength(inner, p.end);
          if (midis.length === 0) firstMult = len.mult;
          midis.push(p.midi);
          j = len.end;
        }
        const outer = readLength(line, close + 1);
        i = outer.end;
        if (midis.length > 0) {
          pushNote(Array.from(new Set(midis)).sort((a, b) => a - b), firstMult * outer.mult);
          if (innerTie) (items[items.length - 1] as Extract<Item, { kind: 'note' }>).tie = true;
        }
        continue;
      }

      if (ch === '|' || (ch === ':' && (line[i + 1] === '|' || line[i + 1] === ':'))) {
        const bar = readBar(line, i);
        items.push(bar.item);
        barAcc = new Map();
        if (bar.ending) items.push({ kind: 'ending', nums: bar.ending });
        i = bar.end;
        continue;
      }

      // Tuplet (3 or (p:q:r ; otherwise a slur
      if (ch === '(') {
        const t = line.slice(i).match(/^\((\d+)(?::(\d*))?(?::(\d*))?/);
        if (t) {
          const p = Number(t[1]);
          const info = parseMeter(meter);
          const compound = info.denominator >= 8 && info.numerator % 3 === 0;
          const defaultQ: Record<number, number> = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };
          const q = t[2] ? Number(t[2]) : defaultQ[p] ?? (compound ? 3 : 2);
          const r = t[3] ? Number(t[3]) : p;
          if (p > 0 && q > 0) tuplet = { remaining: r, factor: q / p };
          i += t[0].length;
        } else {
          i++;
        }
        continue;
      }

      // Tie to the previous note
      if (ch === '-') {
        const prev = lastNote();
        if (prev && prev.midis.length > 0) prev.tie = true;
        i++;
        continue;
      }

      // Broken rhythm A>B, A>>B, A<B
      if (ch === '>' || ch === '<') {
        let count = 0;
        while (line[i + count] === ch) count++;
        const prev = lastNote();
        const shorter = Math.pow(0.5, count);
        const longer = 2 - shorter;
        if (prev) {
          prev.units *= ch === '>' ? longer : shorter;
          broken = ch === '>' ? shorter : longer;
        }
        i += count;
        continue;
      }

      // Rests z / x, multi-bar rests Z / X
      if (ch === 'z' || ch === 'x') {
        const len = readLength(line, i + 1);
        pushNote([], len.mult);
        i = len.end;
        continue;
      }
      if (ch === 'Z' || ch === 'X') {
        const m = line.slice(i + 1).match(/^\d*/);
        const bars = m && m[0] ? Number(m[0]) : 1;
        const barBeats = parseMeter(meter).beatsPerBar;
        // Units are already in beats, so express as a multiplier of L
        pushNote([], (bars * barBeats) / unitBeats(), { multiRestBars: bars });
        i += 1 + (m ? m[0].length : 0);
        continue;
      }

      // Note
      const pitch = readPitch(line, i);
      if (pitch) {
        const len = readLength(line, pitch.end);
        pushNote([pitch.midi], len.mult);
        i = len.end;
        continue;
      }

      i++;
    }
  }

  return { items, meter };
}

function expandEndingNums(spec: string): number[] {
  const nums: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (b && b >= a) for (let n = a; n <= b; n++) nums.push(n);
    else if (a) nums.push(a);
  }
  return nums;
}

function readBar(line: string, start: number): { item: Item; end: number; ending?: number[] } {
  const m = line.slice(start).match(/^[|:\[\]]+/);
  let token = m ? m[0] : line[start];
  // Don't swallow a following "[1" ending or "[K:" field into the bar token
  const bracketIdx = token.indexOf('[', 1);
  if (bracketIdx > 0) token = token.slice(0, bracketIdx);
  let end = start + token.length;
  const repeatEnd = token.startsWith(':');
  const repeatStart = token.endsWith(':');
  const double = /\|\||\|\]|\[\|/.test(token);
  let ending: number[] | undefined;
  const num = line.slice(end).match(/^(\d+(?:[,-]\d+)*)/);
  if (num && !token.endsWith(']')) {
    ending = expandEndingNums(num[1]);
    end += num[0].length;
  }
  return { item: { kind: 'bar', repeatStart, repeatEnd, double }, end, ending };
}

// ---------------------------------------------------------------------------
// Repeat expansion
// ---------------------------------------------------------------------------

function expandRepeats(items: Item[]): Extract<Item, { kind: 'note' }>[] {
  const out: Extract<Item, { kind: 'note' }>[] = [];
  let repeatStart = 0;
  let pass = 1;
  let skipping = false;
  let inEnding = false;
  const taken = new Set<number>();
  let guard = 0;

  for (let pos = 0; pos < items.length; pos++) {
    if (++guard > 20000) break;
    const it = items[pos];

    if (it.kind === 'note') {
      if (!skipping) out.push(it);
      continue;
    }

    if (it.kind === 'ending') {
      inEnding = true;
      skipping = !it.nums.includes(pass);
      continue;
    }

    // Bar line
    if (it.repeatEnd) {
      if (skipping) {
        // End of an ending we are not taking on this pass
        skipping = false;
        inEnding = false;
      } else if (!taken.has(pos)) {
        taken.add(pos);
        pass++;
        inEnding = false;
        pos = repeatStart - 1;
        continue;
      } else {
        inEnding = false;
        pass = 1;
      }
    } else if (it.double && inEnding) {
      inEnding = false;
      skipping = false;
      pass = 1;
    }

    if (it.repeatStart) {
      repeatStart = pos + 1;
      pass = 1;
      skipping = false;
      inEnding = false;
    } else if (it.double && !inEnding) {
      // A double bar closes a section: later :| repeat back to here
      repeatStart = pos + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses ABC notation into a beat-aligned sequence of TimelineEvents for both
 * Web Audio playback and the guided player. Supports L:, M:, K: (incl. modes and
 * inline fields), bar-scoped accidentals, chords [CEG], ties, broken rhythm (> <),
 * tuplets, rests (z x Z), repeats |: :| and 1st/2nd endings.
 */
export function parseAbcToTimeline(abc: string, transposeSemitones = 0, preferFlats?: boolean): TimelineEvent[] {
  if (!abc.trim()) return [];

  const { items } = tokenizeAbc(abc);
  const played = expandRepeats(items);

  const events: TimelineEvent[] = [];
  let beat = 0;
  let id = 0;
  let tieHead: TimelineEvent | null = null;

  for (const it of played) {
    const midis = it.midis.map((m) => m + transposeSemitones);
    const chord = it.chord ? transposeChord(it.chord, transposeSemitones, preferFlats) : undefined;

    if (midis.length === 0) {
      tieHead = null;
      if (chord) {
        events.push({
          id: id++,
          startBeat: beat,
          durationBeats: it.units,
          sustainBeats: it.units,
          midiNotes: [],
          chord,
        });
      }
      beat += it.units;
      continue;
    }

    const continuesTie =
      tieHead !== null &&
      tieHead.midiNotes.length === midis.length &&
      tieHead.midiNotes.every((m, k) => m === midis[k]);

    const ev: TimelineEvent = {
      id: id++,
      startBeat: beat,
      durationBeats: it.units,
      sustainBeats: it.units,
      midiNotes: midis,
      chord,
      noteIndex: it.noteIndex,
    };

    if (continuesTie && tieHead) {
      ev.tied = true;
      tieHead.sustainBeats += it.units;
      if (!it.tie) tieHead = null;
    } else {
      tieHead = it.tie ? ev : null;
    }

    events.push(ev);
    beat += it.units;
  }

  return events;
}

/**
 * Fallback timeline builder from ChordPro when no ABC notation is present: one chord per bar.
 */
export function buildTimelineFromChordPro(
  lyricsChords: string,
  transposeSemitones = 0,
  beatsPerBar = 4,
  preferFlats?: boolean
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let beat = 0;
  let id = 0;

  for (const m of lyricsChords.matchAll(/\[([^\]]+)\]/g)) {
    if (!isChordSymbol(m[1])) continue;
    const chord = transposeChord(normalizeChordToAlpha(m[1]), transposeSemitones, preferFlats);
    events.push({
      id: id++,
      startBeat: beat,
      durationBeats: beatsPerBar,
      sustainBeats: beatsPerBar,
      midiNotes: getChordMidiNotes(chord, 4),
      chord,
    });
    beat += beatsPerBar;
  }

  return events;
}
