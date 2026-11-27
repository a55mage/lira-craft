import type { Instrument } from '../types/music';
import { getChordMidiNotes, midiToFrequency } from './musicTheory';

export type { TimelineEvent, MeterInfo } from './abcTimeline';
export { parseAbcToTimeline, buildTimelineFromChordPro, getAbcMeter, parseMeter } from './abcTimeline';

class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private master: AudioNode | null = null;

  /** Shared output bus with a gentle compressor so stacked notes + chords never clip. */
  getMaster(): AudioNode {
    const ctx = this.getContext();
    if (!this.master) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-14, ctx.currentTime);
      comp.knee.setValueAtTime(12, ctx.currentTime);
      comp.ratio.setValueAtTime(4, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.2, ctx.currentTime);
      comp.connect(ctx.destination);
      this.master = comp;
    }
    return this.master;
  }

  /**
   * Creates a disposable gain bus for one playback session: disconnecting it silences every
   * note already scheduled ahead of time (used on pause/stop/seek).
   */
  createBus(): GainNode {
    const ctx = this.getContext();
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(1, ctx.currentTime);
    bus.connect(this.getMaster());
    return bus;
  }

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

  playNote(
    midi: number,
    durationSec: number,
    instrument: Instrument,
    startTime?: number,
    gainScale = 0.25,
    destination?: AudioNode
  ): void {
    const ctx = this.getContext();
    const now = Math.max(ctx.currentTime, startTime ?? ctx.currentTime);
    const freq = midiToFrequency(midi);
    const dur = Math.max(0.08, durationSec);

    const masterGain = ctx.createGain();
    masterGain.connect(destination ?? this.getMaster());

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

  playChord(
    chordSymbol: string,
    instrument: Instrument,
    durationSec = 0.9,
    gainScale = 0.14,
    startTime?: number,
    destination?: AudioNode
  ): void {
    const ctx = this.getContext();
    const now = Math.max(ctx.currentTime, startTime ?? ctx.currentTime);
    const baseOctave = instrument === 'ukulele' ? 4 : 3;
    const midis = getChordMidiNotes(chordSymbol, baseOctave);
    const strumDelay = instrument === 'piano' ? 0.015 : 0.028;

    midis.forEach((m, idx) => {
      this.playNote(m, durationSec, instrument, now + idx * strumDelay, gainScale, destination);
    });
  }

  playMetronomeClick(isAccent = false, startTime?: number, destination?: AudioNode): void {
    const ctx = this.getContext();
    const now = Math.max(ctx.currentTime, startTime ?? ctx.currentTime);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isAccent ? 1200 : 880, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isAccent ? 0.25 : 0.15, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain);
    gain.connect(destination ?? this.getMaster());
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
