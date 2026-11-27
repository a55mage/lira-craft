import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AArrowDown,
  AArrowUp,
  AlignJustify,
  ArrowLeft,
  ChevronDown,
  Columns2,
  Edit3,
  Eye,
  Gauge,
  Lightbulb,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Printer,
  Repeat,
  RotateCcw,
  Square,
  Timer,
} from 'lucide-react';
import { PitchDetector } from 'pitchy';
import type { NotationSystem, ReaderModules, Track } from '../types/music';
import { extractUniqueChords, parseChordPro, type ParsedLine } from '../lib/chordPro';
import { formatChord, suggestBestCapo, transposeChord } from '../lib/musicTheory';
import { audioEngine, buildTimelineFromChordPro, parseAbcToTimeline } from '../lib/audioEngine';
import { ChordDiagramCard } from './ChordDiagramCard';
import { SheetMusicPanel } from './SheetMusicPanel';
import { SimplyPianoPanel, type WaitModeSource } from './SimplyPianoPanel';
import { INSTRUMENT_NAME, InstrumentIcon, InstrumentMonogram } from './InstrumentIcon';

interface LyricSectionGroup {
  title?: string;
  kind: 'chorus' | 'verse' | 'other';
  lines: ParsedLine[];
}

function classifySection(title?: string): 'chorus' | 'verse' | 'other' {
  if (!title) return 'other';
  const t = title.toLowerCase();
  if (/chorus|ritornello|refrain|hook/.test(t)) return 'chorus';
  if (/verse|strofa|tema/.test(t)) return 'verse';
  return 'other';
}

function groupLyricsBySection(lines: ParsedLine[]): LyricSectionGroup[] {
  const groups: LyricSectionGroup[] = [];
  let current: LyricSectionGroup = { kind: 'other', lines: [] };

  for (const line of lines) {
    if (line.type === 'section') {
      if (current.lines.length > 0 || current.title) {
        groups.push(current);
      }
      current = {
        title: line.sectionTitle,
        kind: classifySection(line.sectionTitle),
        lines: [],
      };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.title) {
    groups.push(current);
  }
  return groups;
}

interface ReaderViewProps {
  track: Track;
  initialVersionId?: string;
  notation: NotationSystem;
  onChangeNotation: (n: NotationSystem) => void;
  modules: ReaderModules;
  onChangeModules: (m: ReaderModules) => void;
  onBack: () => void;
  onEditTrack: (track: Track) => void;
}

export function ReaderView({
  track,
  initialVersionId,
  notation,
  onChangeNotation,
  modules,
  onChangeModules,
  onBack,
  onEditTrack,
}: ReaderViewProps) {
  const [versionId, setVersionId] = useState(initialVersionId || track.versions[0]?.id);
  const version = useMemo(
    () => track.versions.find((v) => v.id === versionId) ?? track.versions[0],
    [track.versions, versionId]
  );

  const [transpose, setTranspose] = useState(0);
  const [speedPct, setSpeedPct] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStartBar, setLoopStartBar] = useState(1);
  const [loopEndBar, setLoopEndBar] = useState(4);
  const [autoScroll, setAutoScroll] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [selectedChordPreview, setSelectedChordPreview] = useState<string | null>(null);
  const [lyricsFontSize, setLyricsFontSize] = useState(16);
  const [lyricsColumns, setLyricsColumns] = useState<1 | 2>(1);

  // Wait Mode state (USB MIDI / Microphone)
  const [waitMode, setWaitMode] = useState<WaitModeSource>('off');
  const [waitingEventId, setWaitingEventId] = useState<number | null>(null);
  const [detectedLiveMidi, setDetectedLiveMidi] = useState<number | null>(null);
  const [waitModeStatus, setWaitModeStatus] = useState<string | null>(null);

  const satisfiedEventIdsRef = useRef<Set<number>>(new Set());
  const waitingEventRef = useRef<{ id: number; midi: number } | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  const baseBpm = version?.bpmOverride || track.defaultBpm || 100;
  const effectiveBpm = Math.max(30, Math.round((baseBpm * speedPct) / 100));

  const timeline = useMemo(() => {
    if (!version) return [];
    const fromAbc = parseAbcToTimeline(version.abcNotation, transpose);
    if (fromAbc.length > 0) return fromAbc;
    return buildTimelineFromChordPro(version.lyricsChords, transpose);
  }, [version, transpose]);

  const totalBeats = useMemo(() => {
    if (timeline.length === 0) return 16;
    const last = timeline[timeline.length - 1];
    return Math.max(4, last.startBeat + last.durationBeats);
  }, [timeline]);

  const totalBars = Math.max(1, Math.ceil(totalBeats / 4));

  const parsedLyrics = useMemo(() => {
    if (!version) return [];
    return parseChordPro(version.lyricsChords, transpose, notation);
  }, [version, transpose, notation]);

  const lyricSections = useMemo(() => groupLyricsBySection(parsedLyrics), [parsedLyrics]);

  const uniqueChords = useMemo(() => {
    if (!version) return [];
    return extractUniqueChords(version.lyricsChords, version.abcNotation, transpose);
  }, [version, transpose]);

  const capoSuggestion = useMemo(() => {
    if (!version || version.instrument === 'piano') return null;
    return suggestBestCapo(uniqueChords);
  }, [version, uniqueChords]);

  const activeEventIndex = useMemo(() => {
    return timeline.findIndex(
      (ev) => currentBeat >= ev.startBeat && currentBeat < ev.startBeat + ev.durationBeats
    );
  }, [timeline, currentBeat]);

  const activeEvent = activeEventIndex >= 0 ? timeline[activeEventIndex] : null;

  const activeChord = useMemo(() => {
    let last: string | null = null;
    for (const ev of timeline) {
      if (ev.startBeat <= currentBeat && ev.chord) {
        last = ev.chord;
      }
      if (ev.startBeat > currentBeat) break;
    }
    return last ?? uniqueChords[0] ?? null;
  }, [timeline, currentBeat, uniqueChords]);

  const waitingForMidi = useMemo(() => {
    if (waitingEventId === null) return null;
    const ev = timeline.find((e) => e.id === waitingEventId);
    return ev?.midiNotes[0] ?? null;
  }, [timeline, waitingEventId]);

  useEffect(() => {
    if (waitingEventId !== null && waitingForMidi !== null) {
      waitingEventRef.current = { id: waitingEventId, midi: waitingForMidi };
    } else {
      waitingEventRef.current = null;
    }
  }, [waitingEventId, waitingForMidi]);

  const handleUserNotePlayed = useCallback((playedMidi: number) => {
    setDetectedLiveMidi(playedMidi);
    const waiting = waitingEventRef.current;
    if (!waiting) return;
    // Match by pitch class so beginners can play in any octave
    if (playedMidi % 12 === waiting.midi % 12) {
      satisfiedEventIdsRef.current.add(waiting.id);
      waitingEventRef.current = null;
      setWaitingEventId(null);
    }
  }, []);

  // Wait Mode Input Listener: Web MIDI API or Microphone Pitch Detection
  useEffect(() => {
    if (waitMode === 'off') {
      setWaitModeStatus(null);
      setDetectedLiveMidi(null);
      setWaitingEventId(null);
      satisfiedEventIdsRef.current.clear();
      return;
    }

    let cancelled = false;

    if (waitMode === 'midi') {
      if (!('requestMIDIAccess' in navigator)) {
        setWaitModeStatus('Web MIDI non supportato in questo browser.');
        return;
      }
      let midiAccess: MIDIAccess | null = null;
      const onMidiMessage = (event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data || data.length < 3) return;
        const [status, note, velocity] = data;
        if ((status & 0xf0) === 0x90 && velocity > 0) {
          handleUserNotePlayed(note);
        }
      };

      void navigator
        .requestMIDIAccess()
        .then((access) => {
          if (cancelled) return;
          midiAccess = access;
          const inputs = Array.from(access.inputs.values());
          inputs.forEach((input) => {
            input.onmidimessage = onMidiMessage;
          });
          setWaitModeStatus(
            inputs.length > 0
              ? `MIDI connesso (${inputs.map((i) => i.name).join(', ')})`
              : 'Nessuna tastiera MIDI USB rilevata (puoi anche cliccare i tasti sullo schermo)'
          );
        })
        .catch(() => {
          if (!cancelled) setWaitModeStatus('Accesso MIDI negato dal browser.');
        });

      return () => {
        cancelled = true;
        if (midiAccess) {
          Array.from(midiAccess.inputs.values()).forEach((input) => {
            input.onmidimessage = null;
          });
        }
      };
    }

    if (waitMode === 'mic') {
      let stream: MediaStream | null = null;
      let rafId = 0;

      void navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          const ctx = audioEngine.getContext();
          const source = ctx.createMediaStreamSource(s);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);

          const detector = PitchDetector.forFloat32Array(analyser.fftSize);
          const buf = new Float32Array(detector.inputLength);
          setWaitModeStatus('Microfono attivo — suona la nota richiesta per avanzare');

          const listen = () => {
            if (cancelled) return;
            analyser.getFloatTimeDomainData(buf);
            const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
            if (clarity > 0.85 && pitch > 70 && pitch < 1200) {
              const nearestMidi = Math.round(69 + 12 * Math.log2(pitch / 440));
              handleUserNotePlayed(nearestMidi);
            }
            rafId = requestAnimationFrame(listen);
          };
          rafId = requestAnimationFrame(listen);
        })
        .catch(() => {
          if (!cancelled) setWaitModeStatus('Permesso microfono negato.');
        });

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        stream?.getTracks().forEach((t) => t.stop());
      };
    }
  }, [waitMode, handleUserNotePlayed]);

  // Playback loop
  const lastTriggeredEventId = useRef<number>(-1);
  const lastMetronomeBeat = useRef<number>(-1);

  useEffect(() => {
    if (!isPlaying || !version) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dtSec = (now - lastTime) / 1000;
      lastTime = now;

      // In Wait Mode, pause time advancement while waiting for user input on the current note
      if (waitMode !== 'off' && waitingEventRef.current !== null) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const deltaBeats = dtSec * (effectiveBpm / 60);

      setCurrentBeat((prev) => {
        let next = prev + deltaBeats;
        const loopStartBeat = (loopStartBar - 1) * 4;
        const loopEndBeat = Math.min(totalBeats, loopEndBar * 4);

        if (loopEnabled && loopEndBeat > loopStartBeat && next >= loopEndBeat) {
          next = loopStartBeat;
          lastTriggeredEventId.current = -1;
          lastMetronomeBeat.current = -1;
          satisfiedEventIdsRef.current.clear();
        } else if (next >= totalBeats) {
          setIsPlaying(false);
          lastTriggeredEventId.current = -1;
          satisfiedEventIdsRef.current.clear();
          return 0;
        }

        if (metronomeOn) {
          const wholeBeat = Math.floor(next);
          if (wholeBeat !== lastMetronomeBeat.current) {
            lastMetronomeBeat.current = wholeBeat;
            audioEngine.playMetronomeClick(wholeBeat % 4 === 0);
          }
        }

        const ev = timeline.find((e) => next >= e.startBeat && next < e.startBeat + e.durationBeats);
        if (ev && ev.id !== lastTriggeredEventId.current) {
          // If Wait Mode is active and this note hasn't been played yet, hold right on it
          if (waitMode !== 'off' && !satisfiedEventIdsRef.current.has(ev.id)) {
            const targetMidi = ev.midiNotes[0] ?? 60;
            waitingEventRef.current = { id: ev.id, midi: targetMidi };
            setWaitingEventId(ev.id);
            return ev.startBeat;
          }

          lastTriggeredEventId.current = ev.id;
          const durSec = (ev.durationBeats * 60) / effectiveBpm;
          ev.midiNotes.forEach((m) => audioEngine.playNote(m, durSec, version.instrument));
          if (ev.chord) {
            audioEngine.playChord(ev.chord, version.instrument, Math.min(1.4, durSec * 2), 0.08);
          }
        }

        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, effectiveBpm, totalBeats, timeline, version, metronomeOn, loopEnabled, loopStartBar, loopEndBar, waitMode]);

  // Auto-scroll for lyrics view
  useEffect(() => {
    if (!autoScroll || !isPlaying) return;
    const interval = window.setInterval(() => {
      window.scrollBy({ top: 1, behavior: 'auto' });
    }, Math.max(20, Math.round(5500 / effectiveBpm)));
    return () => window.clearInterval(interval);
  }, [autoScroll, isPlaying, effectiveBpm]);

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    audioEngine.getContext();
    if (countInOn && currentBeat === 0) {
      let step = 4;
      setCountInRemaining(step);
      audioEngine.playMetronomeClick(true);
      const beatMs = (60 / effectiveBpm) * 1000;
      const timer = window.setInterval(() => {
        step--;
        if (step <= 0) {
          window.clearInterval(timer);
          setCountInRemaining(0);
          lastTriggeredEventId.current = -1;
          lastMetronomeBeat.current = -1;
          setIsPlaying(true);
        } else {
          setCountInRemaining(step);
          audioEngine.playMetronomeClick(false);
        }
      }, beatMs);
    } else {
      lastTriggeredEventId.current = -1;
      lastMetronomeBeat.current = -1;
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentBeat(loopEnabled ? (loopStartBar - 1) * 4 : 0);
    setWaitingEventId(null);
    waitingEventRef.current = null;
    satisfiedEventIdsRef.current.clear();
    lastTriggeredEventId.current = -1;
    lastMetronomeBeat.current = -1;
  };

  const toggleModule = (key: keyof ReaderModules) => {
    onChangeModules({ ...modules, [key]: !modules[key] });
  };

  const currentKeyDisplay = formatChord(transposeChord(track.originalKey, transpose), notation);

  if (!version) return null;

  return (
    <>
    <div className={`mx-auto px-4 pt-5 pb-24 space-y-4 animate-fade-up ${performanceMode ? 'max-w-5xl' : 'max-w-7xl'}`}>
      {/* Top Header & Version Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onBack();
            }}
            className="p-2 rounded-xl border cursor-pointer hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            aria-label="Torna alla libreria"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <InstrumentMonogram instrument={version.instrument} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold truncate leading-tight">
              {track.title}
            </h1>
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {track.artist} · Tonalità <strong className="font-mono">{currentKeyDisplay}</strong> ·{' '}
              <span className="font-mono">{effectiveBpm} BPM</span> · {track.timeSignature}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={version.id}
              onChange={(e) => {
                handleStop();
                setVersionId(e.target.value);
              }}
              aria-label="Seleziona versione brano"
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-color)',
              }}
            >
              {track.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {INSTRUMENT_NAME[v.instrument]} — {v.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
          </div>

          <button
            type="button"
            onClick={() => setPerformanceMode((p) => !p)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: performanceMode ? 'var(--accent-bg)' : 'var(--bg-surface)',
              borderColor: performanceMode ? 'var(--accent)' : 'var(--border-color)',
            }}
            title="Modalità Leggio / Mani Libere"
          >
            {performanceMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            Leggio
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            title="Stampa o salva in PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            PDF
          </button>

          <button
            type="button"
            onClick={() => onEditTrack(track)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Modifica
          </button>
        </div>
      </div>

      {/* Modular Control Strip */}
      {!performanceMode && (
        <div
          className="rounded-2xl border p-3.5 space-y-3 no-print"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium mr-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Eye className="w-3.5 h-3.5" /> Moduli:
              </span>
              {(
                [
                  { key: 'sheet', label: 'Spartito Classico' },
                  { key: 'simplyPiano', label: 'Player Simply Piano' },
                  { key: 'lyricsChords', label: 'Lyrics + Accordi' },
                  { key: 'chordBar', label: 'Barra Accordi in alto' },
                ] as const
              ).map((item) => {
                const active = modules[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleModule(item.key)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent)' : 'var(--bg-surface-2)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                      color: active ? '#ffffff' : 'var(--text-primary)',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Metronome, Count-in, Loop */}
              <button
                type="button"
                onClick={() => setMetronomeOn((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: metronomeOn ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                  borderColor: metronomeOn ? 'var(--accent)' : 'var(--border-color)',
                  color: metronomeOn ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                <Timer className="w-3.5 h-3.5" /> Metronomo
              </button>

              <button
                type="button"
                onClick={() => setCountInOn((v) => !v)}
                className="px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: countInOn ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                  borderColor: countInOn ? 'var(--accent)' : 'var(--border-color)',
                  color: countInOn ? 'var(--accent)' : 'var(--text-primary)',
                }}
                title="4 battiti di conteggio prima di iniziare"
              >
                1-2-3-4
              </button>

              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setLoopEnabled((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-medium cursor-pointer"
                  style={{
                    backgroundColor: loopEnabled ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                    borderColor: loopEnabled ? 'var(--accent)' : 'var(--border-color)',
                    color: loopEnabled ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  <Repeat className="w-3.5 h-3.5" /> Loop
                </button>
                {loopEnabled && (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={totalBars}
                      value={loopStartBar}
                      onChange={(e) => setLoopStartBar(Math.max(1, Number(e.target.value)))}
                      aria-label="Battuta inizio loop"
                      className="w-11 px-1 py-0.5 rounded border text-center"
                      style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      min={loopStartBar}
                      max={totalBars}
                      value={loopEndBar}
                      onChange={(e) => setLoopEndBar(Math.max(loopStartBar, Number(e.target.value)))}
                      aria-label="Battuta fine loop"
                      className="w-11 px-1 py-0.5 rounded border text-center"
                      style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
                    />
                  </>
                )}
              </div>

              {/* Notation Toggle: ABC vs Do-Re-Mi */}
              <div
                className="inline-flex rounded-xl p-0.5 border text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              >
                <button
                  type="button"
                  onClick={() => onChangeNotation('alpha')}
                  className="px-2.5 py-1 rounded-lg transition cursor-pointer"
                  style={{
                    backgroundColor: notation === 'alpha' ? 'var(--bg-surface)' : 'transparent',
                    color: notation === 'alpha' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  C · D · E
                </button>
                <button
                  type="button"
                  onClick={() => onChangeNotation('latin')}
                  className="px-2.5 py-1 rounded-lg transition cursor-pointer"
                  style={{
                    backgroundColor: notation === 'latin' ? 'var(--bg-surface)' : 'transparent',
                    color: notation === 'latin' ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  Do · Re · Mi
                </button>
              </div>
            </div>
          </div>

          {/* Beginner tip & Capo calculator */}
          {(version.notes || (capoSuggestion && capoSuggestion.capo > 0)) && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {version.notes && (
                <div className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <Lightbulb className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-warm)' }} />
                  <span>
                    <strong>Consiglio studio:</strong> {version.notes}
                  </span>
                </div>
              )}
              {capoSuggestion && capoSuggestion.capo > 0 && (
                <button
                  type="button"
                  onClick={() => setTranspose((t) => t - capoSuggestion.capo)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium cursor-pointer border"
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--accent)',
                  }}
                  title="Applica trasposizione per usare il capotasto"
                >
                  <InstrumentIcon instrument={version.instrument} className="w-3.5 h-3.5" />
                  Capotasto consigliato: tasto {capoSuggestion.capo} ({capoSuggestion.easyCount}/{capoSuggestion.total} accordi facili)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Optional Top Chord Diagrams Bar */}
      {modules.chordBar && uniqueChords.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {uniqueChords.map((chord) => (
            <ChordDiagramCard
              key={chord}
              chord={chord}
              instrument={version.instrument}
              notation={notation}
              compact
              isActive={activeChord === chord || selectedChordPreview === chord}
              onSelect={() => setSelectedChordPreview(chord)}
            />
          ))}
        </div>
      )}

      {/* Module 2: Simply Piano Interactive Player (with Lyrics + Wait Mode MIDI/Mic) */}
      {modules.simplyPiano && (
        <SimplyPianoPanel
          events={timeline}
          currentBeat={currentBeat}
          totalBeats={totalBeats}
          instrument={version.instrument}
          notation={notation}
          activeEvent={activeEvent}
          activeChord={activeChord}
          parsedLyrics={parsedLyrics}
          waitMode={waitMode}
          onChangeWaitMode={setWaitMode}
          waitingForMidi={waitingForMidi}
          detectedLiveMidi={detectedLiveMidi}
          waitModeStatus={waitModeStatus}
          onUserNotePlayed={handleUserNotePlayed}
          onSeekBeat={(beat) => {
            setCurrentBeat(beat);
            setWaitingEventId(null);
            waitingEventRef.current = null;
            satisfiedEventIdsRef.current.clear();
            lastTriggeredEventId.current = -1;
          }}
        />
      )}

      {/* Module 3: Classical Sheet Music */}
      {modules.sheet && (
        <SheetMusicPanel
          abcNotation={version.abcNotation}
          transposeSemitones={transpose}
          notation={notation}
          activeEventIndex={activeEventIndex}
          showNoteLabels={modules.noteLabels}
        />
      )}

      {/* Module 4: Lyrics + Chords (1 or 2 columns + Font Zoom + Sticky Right Chord Diagrams) */}
      {modules.lyricsChords && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_272px] gap-4 items-start">
          {/* Lyrics Column */}
          <div
            ref={lyricsContainerRef}
            className="rounded-2xl border p-5 sm:p-6 space-y-4 print-sheet music-paper"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 no-print"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <h2 className="text-sm font-semibold">Testo & Accordi</h2>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1-Column / 2-Column Layout Switch */}
                <div
                  className="inline-flex items-center rounded-xl p-0.5 border text-xs"
                  style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
                >
                  <button
                    type="button"
                    onClick={() => setLyricsColumns(1)}
                    aria-label="1 colonna"
                    title="Layout a 1 colonna"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition"
                    style={{
                      backgroundColor: lyricsColumns === 1 ? 'var(--bg-surface)' : 'transparent',
                      color: lyricsColumns === 1 ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <AlignJustify className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">1 col</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLyricsColumns(2)}
                    aria-label="2 colonne"
                    title="Layout a 2 colonne (stile leggio)"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition"
                    style={{
                      backgroundColor: lyricsColumns === 2 ? 'var(--bg-surface)' : 'transparent',
                      color: lyricsColumns === 2 ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">2 col</span>
                  </button>
                </div>

                {/* Font Size Controls */}
                <div
                  className="inline-flex items-center gap-1 rounded-xl border px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
                >
                  <button
                    type="button"
                    onClick={() => setLyricsFontSize((s) => Math.max(12, s - 2))}
                    aria-label="Rimpicciolisci testo"
                    title="Rimpicciolisci font"
                    className="p-1 rounded-lg cursor-pointer hover:opacity-75"
                  >
                    <AArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLyricsFontSize(16)}
                    title="Ripristina dimensione font"
                    className="px-1.5 font-mono text-[11px] font-semibold cursor-pointer"
                  >
                    {lyricsFontSize}px
                  </button>
                  <button
                    type="button"
                    onClick={() => setLyricsFontSize((s) => Math.min(28, s + 2))}
                    aria-label="Ingrandisci testo"
                    title="Ingrandisci font"
                    className="p-1 rounded-lg cursor-pointer hover:opacity-75"
                  >
                    <AArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`leading-relaxed ${lyricsColumns === 2 ? 'md:columns-2 md:gap-8' : 'space-y-4'}`}
              style={{ fontSize: `${performanceMode ? Math.max(lyricsFontSize, 20) : lyricsFontSize}px` }}
            >
              {lyricSections.map((section, sIdx) => {
                const borderColor =
                  section.kind === 'chorus'
                    ? '#adc178'
                    : section.kind === 'verse'
                    ? '#a98467'
                    : 'var(--border-color)';
                const isChorus = section.kind === 'chorus';

                return (
                  <section
                    key={sIdx}
                    className={`rounded-r-xl pl-3.5 py-1.5 mb-4 break-inside-avoid ${isChorus ? 'pr-3' : ''}`}
                    style={{
                      borderLeft: `${isChorus ? '4px' : '2.5px'} solid ${borderColor}`,
                      backgroundColor: isChorus
                        ? 'color-mix(in srgb, var(--accent-bg) 42%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {section.title && (
                      <div
                        className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-2"
                        style={{
                          backgroundColor: isChorus ? '#adc178' : 'var(--bg-surface-2)',
                          color: isChorus ? '#3b3029' : 'var(--text-secondary)',
                        }}
                      >
                        {section.title}
                      </div>
                    )}

                    {section.lines.map((line, idx) => {
                      if (line.type === 'empty') {
                        return <div key={idx} className="h-2" />;
                      }
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap items-end gap-y-1.5 leading-snug mb-2"
                        >
                          {line.tokens.map((tok, tIdx) => (
                            <span key={tIdx} className="inline-flex flex-col items-start">
                              {tok.chord ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (tok.rawChord) {
                                      audioEngine.playChord(tok.rawChord, version.instrument);
                                      setSelectedChordPreview(tok.rawChord);
                                    }
                                  }}
                                  className="font-extrabold px-1.5 py-0.5 rounded mb-0.5 mr-1 cursor-pointer transition hover:scale-105"
                                  style={{
                                    fontSize: `${Math.max(11, Math.round(lyricsFontSize * 0.78))}px`,
                                    backgroundColor:
                                      tok.rawChord === activeChord ? 'var(--accent)' : 'var(--accent-bg)',
                                    color: tok.rawChord === activeChord ? '#ffffff' : 'var(--accent)',
                                  }}
                                  title="Clicca per ascoltare l'accordo"
                                >
                                  {tok.chord}
                                </button>
                              ) : (
                                <span className="h-5" />
                              )}
                              <span className="whitespace-pre-wrap">{tok.text || '\u00A0'}</span>
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>

          {/* Sticky Right Chord Diagrams Sidebar */}
          {uniqueChords.length > 0 && (
            <aside
              className="lg:sticky lg:top-20 rounded-2xl border p-3.5 space-y-3 max-h-[calc(100vh-8rem)] overflow-y-auto no-print"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Accordi ({uniqueChords.length})
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Clicca per ascoltare
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
                {uniqueChords.map((chord) => (
                  <ChordDiagramCard
                    key={chord}
                    chord={chord}
                    instrument={version.instrument}
                    notation={notation}
                    compact
                    isActive={activeChord === chord || selectedChordPreview === chord}
                    onSelect={() => setSelectedChordPreview(chord)}
                  />
                ))}
              </div>
            </aside>
          )}
        </div>
      )}

      </div>

      {/* Full-Width Docked Bottom Player Bar (outside animated container so fixed sticks to viewport) */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-md no-print"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 96%, transparent)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 -6px 24px -8px rgba(59, 48, 41, 0.14)',
        }}
      >
        {/* Top edge interactive progress bar */}
        <div
          className="relative h-1.5 w-full cursor-pointer group"
          style={{ backgroundColor: 'var(--bg-surface-2)' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setCurrentBeat(ratio * totalBeats);
            setWaitingEventId(null);
            waitingEventRef.current = null;
            satisfiedEventIdsRef.current.clear();
            lastTriggeredEventId.current = -1;
          }}
          title="Clicca per spostarti nel brano"
        >
          <div
            className="h-full transition-[width] duration-75"
            style={{
              width: `${totalBeats > 0 ? Math.min(100, (currentBeat / totalBeats) * 100) : 0}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          {/* Transport */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePlayToggle}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {countInRemaining > 0 ? (
                <>Conto: {countInRemaining}</>
              ) : isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pausa
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Play
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop"
              className="p-1.5 rounded-xl border cursor-pointer"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <span className="hidden md:inline text-xs font-medium truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
              {track.title}
            </span>
          </div>

          {/* Progress Scrubber */}
          <div className="flex items-center gap-2 flex-1 min-w-[130px] max-w-sm text-[11px]">
            <input
              type="range"
              min={0}
              max={totalBeats}
              step={0.5}
              value={Math.min(totalBeats, currentBeat)}
              onChange={(e) => {
                setCurrentBeat(Number(e.target.value));
                setWaitingEventId(null);
                waitingEventRef.current = null;
                satisfiedEventIdsRef.current.clear();
                lastTriggeredEventId.current = -1;
              }}
              aria-label="Posizione brano"
              className="flex-1"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {Math.floor(currentBeat / 4) + 1}/{totalBars}
            </span>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-1.5 text-xs">
            <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            <input
              type="range"
              min={50}
              max={150}
              step={5}
              value={speedPct}
              onChange={(e) => setSpeedPct(Number(e.target.value))}
              aria-label="Velocità di riproduzione"
              className="w-16 sm:w-20"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="font-mono text-[11px] font-semibold w-9">{speedPct}%</span>
          </div>

          {/* Transpose */}
          <div className="flex items-center gap-1 text-xs">
            <Music2 className="w-3.5 h-3.5 hidden sm:block" style={{ color: 'var(--text-secondary)' }} />
            <button
              type="button"
              onClick={() => setTranspose((t) => t - 1)}
              aria-label="Abbassa tonalità di 1 semitono"
              className="w-6 h-6 rounded-lg border font-bold cursor-pointer"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              -
            </button>
            <span className="w-7 text-center font-mono text-[11px] font-semibold">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button
              type="button"
              onClick={() => setTranspose((t) => t + 1)}
              aria-label="Alza tonalità di 1 semitono"
              className="w-6 h-6 rounded-lg border font-bold cursor-pointer"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              +
            </button>
            {transpose !== 0 && (
              <button
                type="button"
                onClick={() => setTranspose(0)}
                title="Ripristina tonalità originale"
                className="p-1 rounded-lg cursor-pointer opacity-70 hover:opacity-100"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Auto-scroll */}
          <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="hidden sm:inline">Auto-scroll</span>
          </label>
        </div>
      </div>
    </>
  );
}
