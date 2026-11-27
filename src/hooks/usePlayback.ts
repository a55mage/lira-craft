import { useCallback, useEffect, useRef, useState } from 'react';
import type { Instrument } from '../types/music';
import { audioEngine, type MeterInfo, type TimelineEvent } from '../lib/audioEngine';

/**
 * Sample-accurate playback scheduler.
 *
 * The AudioContext clock is the single source of truth: notes, chords and metronome clicks are
 * scheduled ~150 ms ahead at exact audio times ("lookahead" pattern), so timing no longer
 * depends on animation frames, survives background tabs (the tick runs in a Worker) and
 * never double-triggers under React StrictMode (no side effects inside state updaters).
 */

const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 25;
const EPS = 1e-6;

export interface PlaybackLoop {
  enabled: boolean;
  startBeat: number;
  endBeat: number;
}

export interface UsePlaybackOptions {
  timeline: TimelineEvent[];
  totalBeats: number;
  bpm: number;
  meter: MeterInfo;
  instrument: Instrument;
  metronomeOn: boolean;
  countInOn: boolean;
  loop: PlaybackLoop;
  /** Wait Mode: hold on each note until the user plays it. */
  waitActive: boolean;
}

interface Segment {
  ctxTime: number; // audio time at which `beat` is reached
  beat: number;
}

interface EngineState {
  playing: boolean;
  segments: Segment[]; // future loop jumps are queued here
  cursorBeat: number; // everything before this beat (in the last segment) is scheduled
  nextIdx: number;
  nextClickBeat: number;
  hold: { event: TimelineEvent; ctxTime: number } | null;
  waiting: TimelineEvent | null;
  endAt: number | null;
  bus: GainNode | null;
  countInUntil: number;
  countInClickSec: number;
}

function createTicker(onTick: () => void): () => void {
  try {
    const src = `let id=setInterval(()=>postMessage(0),${TICK_MS});onmessage=()=>{clearInterval(id);close();};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, TICK_MS);
    return () => window.clearInterval(id);
  }
}

function firstIndexAtOrAfter(timeline: TimelineEvent[], beat: number): number {
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].startBeat < beat - EPS) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function needsUser(ev: TimelineEvent): boolean {
  return ev.midiNotes.length > 0 && !ev.tied;
}

export function usePlayback(options: UsePlaybackOptions) {
  const opts = useRef(options);
  opts.current = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeatState] = useState(0);
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [waitingEventId, setWaitingEventId] = useState<number | null>(null);

  const pausedBeat = useRef(0);
  const satisfied = useRef<Set<number>>(new Set());
  const engine = useRef<EngineState>({
    playing: false,
    segments: [],
    cursorBeat: 0,
    nextIdx: 0,
    nextClickBeat: 0,
    hold: null,
    waiting: null,
    endAt: null,
    bus: null,
    countInUntil: 0,
    countInClickSec: 0,
  });

  const spb = () => 60 / Math.max(1, opts.current.bpm);

  const beatAt = (time: number): number => {
    const segs = engine.current.segments;
    let seg = segs[0];
    for (const s of segs) {
      if (s.ctxTime <= time + EPS) seg = s;
      else break;
    }
    if (!seg) return pausedBeat.current;
    return seg.beat + Math.max(0, time - seg.ctxTime) / spb();
  };

  const gridCeil = (beat: number) => {
    const step = opts.current.meter.clickBeats;
    return Math.ceil(beat / step - EPS) * step;
  };

  const silence = () => {
    const e = engine.current;
    if (e.bus) {
      try {
        e.bus.disconnect();
      } catch {
        // already disconnected
      }
      e.bus = null;
    }
  };

  /** Restarts the schedule from `beat` at audio time `ctxTime` (cancels anything queued). */
  const anchor = (beat: number, ctxTime: number) => {
    const e = engine.current;
    silence();
    e.bus = audioEngine.createBus();
    e.segments = [{ ctxTime, beat }];
    e.cursorBeat = beat;
    e.nextIdx = firstIndexAtOrAfter(opts.current.timeline, beat);
    e.nextClickBeat = gridCeil(beat);
    e.hold = null;
    e.endAt = null;
  };

  const scheduleEvent = (ev: TimelineEvent, time: number) => {
    const o = opts.current;
    const bus = engine.current.bus ?? undefined;
    if (ev.tied) return;
    const durSec = ev.sustainBeats * spb();
    ev.midiNotes.forEach((m) => audioEngine.playNote(m, durSec, o.instrument, time, 0.25, bus));
    if (ev.chord) {
      audioEngine.playChord(ev.chord, o.instrument, Math.min(1.4, durSec * 2), 0.08, time, bus);
    }
  };

  const pump = useCallback(() => {
    const e = engine.current;
    if (!e.playing) return;
    const o = opts.current;
    const ctx = audioEngine.getContext();
    const now = ctx.currentTime;

    // End of song reached
    if (e.endAt !== null && now >= e.endAt) {
      e.playing = false;
      silence();
      e.segments = [];
      pausedBeat.current = 0;
      satisfied.current.clear();
      setIsPlaying(false);
      setCurrentBeatState(0);
      return;
    }

    // Wait Mode: freeze on the pending note once the clock reaches it
    if (e.hold && now >= e.hold.ctxTime - EPS && !e.waiting) {
      e.waiting = e.hold.event;
      pausedBeat.current = e.hold.event.startBeat;
      setWaitingEventId(e.hold.event.id);
      setCurrentBeatState(e.hold.event.startBeat);
    }
    if (e.waiting || e.hold) return;

    const step = spb();
    const loopOn = o.loop.enabled && o.loop.endBeat > o.loop.startBeat;

    // Loop enabled while already past its end: jump back right away
    if (loopOn && e.cursorBeat >= o.loop.endBeat - EPS && beatAt(now) >= o.loop.endBeat - EPS) {
      satisfied.current.clear();
      anchor(o.loop.startBeat, now + 0.02);
    }

    const horizon = now + LOOKAHEAD_SEC;
    for (let guard = 0; guard < 8; guard++) {
      const seg = e.segments[e.segments.length - 1];
      const timeOf = (b: number) => seg.ctxTime + (b - seg.beat) * step;
      const limit = loopOn && e.cursorBeat < o.loop.endBeat - EPS ? o.loop.endBeat : o.totalBeats;
      const horizonBeat = seg.beat + (horizon - seg.ctxTime) / step;
      let target = Math.min(horizonBeat, limit);

      const tl = o.timeline;
      while (e.nextIdx < tl.length && tl[e.nextIdx].startBeat < target - EPS) {
        const ev = tl[e.nextIdx];
        if (ev.startBeat < e.cursorBeat - EPS) {
          e.nextIdx++;
          continue;
        }
        if (o.waitActive && needsUser(ev) && !satisfied.current.has(ev.id)) {
          e.hold = { event: ev, ctxTime: timeOf(ev.startBeat) };
          target = ev.startBeat;
          break;
        }
        scheduleEvent(ev, timeOf(ev.startBeat));
        e.nextIdx++;
      }

      while (e.nextClickBeat < target - EPS) {
        if (o.metronomeOn) {
          const barPos = e.nextClickBeat % o.meter.beatsPerBar;
          const accent = barPos < EPS || o.meter.beatsPerBar - barPos < EPS;
          audioEngine.playMetronomeClick(accent, timeOf(e.nextClickBeat), e.bus ?? undefined);
        }
        e.nextClickBeat += o.meter.clickBeats;
      }

      e.cursorBeat = Math.max(e.cursorBeat, target);
      if (e.hold) break;

      if (horizonBeat >= limit - EPS) {
        const jumpTime = timeOf(limit);
        if (loopOn && limit === o.loop.endBeat) {
          satisfied.current.clear();
          e.segments.push({ ctxTime: jumpTime, beat: o.loop.startBeat });
          if (e.segments.length > 4) e.segments.splice(0, e.segments.length - 4);
          e.cursorBeat = o.loop.startBeat;
          e.nextIdx = firstIndexAtOrAfter(tl, o.loop.startBeat);
          e.nextClickBeat = gridCeil(o.loop.startBeat);
          continue;
        }
        e.endAt = jumpTime;
      }
      break;
    }
  }, []);

  // UI clock: follows the audio clock every frame
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const frame = () => {
      const e = engine.current;
      if (e.playing && !e.waiting) {
        const now = audioEngine.getContext().currentTime;
        const remaining =
          now < e.countInUntil ? Math.ceil((e.countInUntil - now) / e.countInClickSec - EPS) : 0;
        setCountInRemaining(remaining);
        const beat = Math.min(opts.current.totalBeats, beatAt(now));
        pausedBeat.current = beat;
        setCurrentBeatState(beat);
      }
      pump();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const stopTicker = createTicker(pump);
    return () => {
      cancelAnimationFrame(raf);
      stopTicker();
    };
  }, [isPlaying, pump]);

  // Tempo / wait-mode / timeline changes while playing: re-anchor at the current position
  const { bpm, waitActive, timeline } = options;
  const prevKey = useRef({ bpm, waitActive, timeline });
  useEffect(() => {
    const prev = prevKey.current;
    prevKey.current = { bpm, waitActive, timeline };
    const e = engine.current;
    if (!e.playing) {
      if (!waitActive) {
        satisfied.current.clear();
        e.waiting = null;
        setWaitingEventId(null);
      }
      return;
    }
    if (prev.bpm === bpm && prev.waitActive === waitActive && prev.timeline === timeline) return;
    const now = audioEngine.getContext().currentTime;
    // Use the beat computed with the previous tempo
    const beat = e.waiting ? e.waiting.startBeat : pausedBeat.current;
    if (!waitActive) {
      satisfied.current.clear();
      e.waiting = null;
      setWaitingEventId(null);
    }
    anchor(beat, now + 0.01);
  }, [bpm, waitActive, timeline]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      engine.current.playing = false;
      silence();
    },
    []
  );

  const play = useCallback(() => {
    const o = opts.current;
    const e = engine.current;
    if (e.playing) return;
    const ctx = audioEngine.getContext();
    const now = ctx.currentTime + 0.05;
    let start = pausedBeat.current >= o.totalBeats - EPS ? 0 : pausedBeat.current;
    if (o.loop.enabled && o.loop.endBeat > o.loop.startBeat && (start < o.loop.startBeat || start >= o.loop.endBeat)) {
      start = o.loop.startBeat;
    }

    let startTime = now;
    e.countInUntil = 0;
    anchor(start, now);
    if (o.countInOn && start < EPS) {
      const clickSec = o.meter.clickBeats * spb();
      const clicks = Math.max(1, Math.round(o.meter.beatsPerBar / o.meter.clickBeats));
      for (let k = 0; k < clicks; k++) {
        audioEngine.playMetronomeClick(k === 0, now + k * clickSec, e.bus ?? undefined);
      }
      startTime = now + clicks * clickSec;
      e.segments = [{ ctxTime: startTime, beat: start }];
      e.countInUntil = startTime;
      e.countInClickSec = clickSec;
      setCountInRemaining(clicks);
    }

    e.waiting = null;
    setWaitingEventId(null);
    e.playing = true;
    pausedBeat.current = start;
    setCurrentBeatState(start);
    setIsPlaying(true);
    pump();
  }, [pump]);

  const pause = useCallback(() => {
    const e = engine.current;
    if (!e.playing) return;
    if (!e.waiting) {
      const now = audioEngine.getContext().currentTime;
      pausedBeat.current = now < e.countInUntil ? pausedBeat.current : Math.min(opts.current.totalBeats, beatAt(now));
    }
    e.playing = false;
    e.waiting = null;
    e.hold = null;
    e.segments = [];
    e.countInUntil = 0;
    silence();
    setWaitingEventId(null);
    setCountInRemaining(0);
    setCurrentBeatState(pausedBeat.current);
    setIsPlaying(false);
  }, []);

  const seek = useCallback((beat: number) => {
    const o = opts.current;
    const target = Math.max(0, Math.min(o.totalBeats, beat));
    const e = engine.current;
    satisfied.current.clear();
    e.waiting = null;
    setWaitingEventId(null);
    pausedBeat.current = target;
    setCurrentBeatState(target);
    if (e.playing) {
      e.countInUntil = 0;
      setCountInRemaining(0);
      anchor(target, audioEngine.getContext().currentTime + 0.02);
      pump();
    }
  }, [pump]);

  const stop = useCallback(
    (resetBeat = 0) => {
      pause();
      satisfied.current.clear();
      pausedBeat.current = resetBeat;
      setCurrentBeatState(resetBeat);
    },
    [pause]
  );

  /** Wait Mode input (MIDI / mic / on-screen keys). Accepts any octave and any chord tone. */
  const notifyNotePlayed = useCallback((playedMidi: number) => {
    const e = engine.current;
    const ev = e.waiting;
    if (!ev || !e.playing) return;
    if (!ev.midiNotes.some((m) => ((m - playedMidi) % 12 + 12) % 12 === 0)) return;
    satisfied.current.add(ev.id);
    e.waiting = null;
    setWaitingEventId(null);
    anchor(ev.startBeat, audioEngine.getContext().currentTime + 0.01);
    pump();
  }, [pump]);

  return {
    isPlaying,
    currentBeat,
    countInRemaining,
    waitingEventId,
    play,
    pause,
    toggle: () => (engine.current.playing ? pause() : play()),
    stop,
    seek,
    notifyNotePlayed,
  };
}
