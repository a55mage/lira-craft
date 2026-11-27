import type { Instrument } from '../types/music';
import { getChordMidiNotes, midiToFrequency, normalizeChordToAlpha, transposeChord } from './musicTheory';

export interface TimelineEvent {
  id: number;
  startBeat: number;
  durationBeats: number;
  midiNotes: number[];
  chord?: string; // Alpha transposed chord
  label?: string;
}

class WebAudioEngine {
  private ctx: AudioContext | null = null;

  getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playNote(midi: number, durationSec: number, instrument: Instrument, startTime?: number, gainScale = 0.25): void {
    const ctx = this.getContext();
    const now = startTime ?? ctx.currentTime;
    const freq = midiToFrequency(midi);
    const dur = Math.max(0.08, durationSec);

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    if (instrument === 'piano') {
      // Warm multi-harmonic piano tone
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2, now);

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.22, now);

      osc1.connect(masterGain);
      osc2.connect(g2);
      g2.connect(masterGain);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(gainScale, now + 0.012);
      masterGain.gain.exponentialRampToValueAtTime(gainScale * 0.4, now + dur * 0.45);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.15);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur + 0.18);
      osc2.stop(now + dur + 0.18);
    } else if (instrument === 'guitar') {
      // Plucked acoustic guitar with low-pass filter decay
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4000, freq * 6), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(350, freq * 1.4), now + dur * 0.8);

      osc.connect(filter);
      filter.connect(masterGain);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(gainScale * 0.9, now + 0.008);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.25);

      osc.start(now);
      osc.stop(now + dur + 0.28);
    } else {
      // Bright nylon ukulele pluck
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(5200, freq * 7), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 2), now + dur * 0.6);

      osc.connect(filter);
      filter.connect(masterGain);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(gainScale * 0.95, now + 0.006);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.18);

      osc.start(now);
      osc.stop(now + dur + 0.2);
    }
  }

  playChord(chordSymbol: string, instrument: Instrument, durationSec = 0.9, gainScale = 0.14): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const baseOctave = instrument === 'ukulele' ? 4 : 3;
    const midis = getChordMidiNotes(chordSymbol, baseOctave);
    const strumDelay = instrument === 'piano' ? 0.015 : 0.028;

    midis.forEach((m, idx) => {
      this.playNote(m, durationSec, instrument, now + idx * strumDelay, gainScale);
    });
  }

  playMetronomeClick(isAccent = false): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isAccent ? 1200 : 880, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isAccent ? 0.25 : 0.15, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playReferenceTone(frequency: number, durationSec = 1.4): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  }
}

export const audioEngine = new WebAudioEngine();

/**
 * Parses ABC notation into a beat-aligned sequence of TimelineEvents for both
 * Web Audio playback and the Simply Piano interactive visualizers.
 */
const ABC_BASE_MIDI: Record<string, number> = {
  C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71,
  c: 72, d: 74, e: 76, f: 77, g: 79, a: 81, b: 83,
};

export function parseAbcToTimeline(abc: string, transposeSemitones = 0): TimelineEvent[] {
  if (!abc.trim()) return [];

  const bodyLines = abc
    .split('\n')
    .filter((line) => !/^[A-Za-z]:/.test(line.trim()) && !line.trim().startsWith('%'));
  const body = bodyLines.join(' ');

  const events: TimelineEvent[] = [];
  let currentBeat = 0;
  let pendingChord: string | undefined;
  let idCounter = 0;

  // Match quoted chords OR notes/rests with optional accidentals, octave marks, and duration
  const tokenRe = /"([^"]+)"|(\^{1,2}|_{1,2}|=)?([A-Ga-gz])([,']*)(\d*\/?\d*)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(body)) !== null) {
    if (match[1]) {
      pendingChord = transposeChord(normalizeChordToAlpha(match[1]), transposeSemitones);
      continue;
    }

    const [, , accidental, letter, octaveMarks, durStr] = match;
    let duration = 1;
    if (durStr) {
      if (durStr.includes('/')) {
        const [numStr, denStr] = durStr.split('/');
        const num = numStr ? Number(numStr) : 1;
        const den = denStr ? Number(denStr) : 2;
        if (den > 0) duration = num / den;
      } else {
        duration = Number(durStr) || 1;
      }
    }

    if (letter === 'z') {
      currentBeat += duration;
      continue;
    }

    let midi = ABC_BASE_MIDI[letter] ?? 60;
    if (accidental === '^') midi += 1;
    else if (accidental === '^^') midi += 2;
    else if (accidental === '_') midi -= 1;
    else if (accidental === '__') midi -= 2;

    for (const ch of octaveMarks || '') {
      if (ch === ',') midi -= 12;
      else if (ch === "'") midi += 12;
    }

    midi += transposeSemitones;

    events.push({
      id: idCounter++,
      startBeat: currentBeat,
      durationBeats: duration,
      midiNotes: [midi],
      chord: pendingChord,
    });

    pendingChord = undefined;
    currentBeat += duration;
  }

  return events;
}

/**
 * Fallback timeline builder from ChordPro when no ABC notation is present.
 */
export function buildTimelineFromChordPro(lyricsChords: string, transposeSemitones = 0): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let beat = 0;
  let id = 0;

  for (const m of lyricsChords.matchAll(/\[([^\]]+)\]/g)) {
    const raw = normalizeChordToAlpha(m[1]);
    if (!/^[A-G][#b]?/.test(raw)) continue;
    const chord = transposeChord(raw, transposeSemitones);
    events.push({
      id: id++,
      startBeat: beat,
      durationBeats: 4,
      midiNotes: getChordMidiNotes(chord, 4),
      chord,
    });
    beat += 4;
  }

  return events;
}
