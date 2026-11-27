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
  ScrollText,
  SlidersHorizontal,
  Square,
  Timer,
} from 'lucide-react';
import { PitchDetector } from 'pitchy';
import type { NotationSystem, ReaderModules, Track } from '../types/music';
import { extractUniqueChords, parseChordPro, type ParsedLine } from '../lib/chordPro';
import { formatChord, keyPrefersFlats, suggestBestCapo, transposeKey } from '../lib/musicTheory';
import { audioEngine, buildTimelineFromChordPro, getAbcMeter, parseAbcToTimeline, parseMeter } from '../lib/audioEngine';
import { usePlayback } from '../hooks/usePlayback';
import { ChordDiagramCard } from './ChordDiagramCard';
import { SheetMusicPanel } from './SheetMusicPanel';
import { SimplyPianoPanel, type WaitModeSource } from './SimplyPianoPanel';
import { INSTRUMENT_NAME, InstrumentIcon, TrackCover } from './InstrumentIcon';

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

/** Metronome-style dots: one per pulse in the bar, the current one pulses on every beat. */
function BeatIndicator({
  active,
  currentBeat,
  beatsPerBar,
  clickBeats,
}: {
  active: boolean;
  currentBeat: number;
  beatsPerBar: number;
  clickBeats: number;
}) {
  const pulses = Math.max(1, Math.min(12, Math.round(beatsPerBar / clickBeats)));
  const posInBar = ((currentBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const current = Math.min(pulses - 1, Math.floor(posInBar / clickBeats + 1e-6));
  const pulseIdx = Math.floor(currentBeat / clickBeats + 1e-6);
  return (
    <div className="hidden sm:flex items-center gap-1 pl-1" aria-hidden="true">
      {Array.from({ length: pulses }, (_, i) => {
        const isCurrent = active && i === current;
        return (
          <span
            key={isCurrent ? `p${pulseIdx}` : `d${i}`}
            className={`rounded-full ${isCurrent ? 'beat-pulse' : ''}`}
            style={{
              width: i === 0 ? 8 : 6,
              height: i === 0 ? 8 : 6,
              backgroundColor: isCurrent ? 'var(--accent)' : 'var(--border-color)',
            }}
          />
        );
      })}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-medium cursor-pointer transition whitespace-nowrap"
      style={{
        backgroundColor: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderColor: active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border-color)',
      }}
    >
      {children}
    </button>
  );
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
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStartBar, setLoopStartBar] = useState(1);
  const [loopEndBar, setLoopEndBar] = useState(4);
  const [autoScroll, setAutoScroll] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [selectedChordPreview, setSelectedChordPreview] = useState<string | null>(null);
  const [lyricsFontSize, setLyricsFontSize] = useState(16);
  const [lyricsColumns, setLyricsColumns] = useState<1 | 2>(1);
  const [showOptions, setShowOptions] = useState(false);

  // Wait Mode state (USB MIDI / Microphone)
  const [waitMode, setWaitMode] = useState<WaitModeSource>('off');
  const [detectedLiveMidi, setDetectedLiveMidi] = useState<number | null>(null);
  const [waitModeStatus, setWaitModeStatus] = useState<string | null>(null);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  const baseBpm = version?.bpmOverride || track.defaultBpm || 100;
  const effectiveBpm = Math.max(30, Math.round((baseBpm * speedPct) / 100));

  // Spell transposed chords/keys consistently with the destination key (e.g. +1 from C -> Db, not C#)
  const targetKey = transposeKey(track.originalKey, transpose);
  const preferFlats = transpose === 0 ? undefined : keyPrefersFlats(targetKey);

  const abcMeter = version ? getAbcMeter(version.abcNotation) : null;
  const meterSource = abcMeter ?? track.timeSignature;
  const meter = useMemo(() => parseMeter(meterSource), [meterSource]);
  const beatsPerBar = meter.beatsPerBar;

  const timeline = useMemo(() => {
    if (!version) return [];
    const fromAbc = parseAbcToTimeline(version.abcNotation, transpose, preferFlats);
    if (fromAbc.length > 0) return fromAbc;
    return buildTimelineFromChordPro(version.lyricsChords, transpose, beatsPerBar, preferFlats);
  }, [version, transpose, preferFlats, beatsPerBar]);

  const totalBeats = useMemo(() => {
    if (timeline.length === 0) return 16;
    const last = timeline[timeline.length - 1];
    return Math.max(beatsPerBar, last.startBeat + last.durationBeats);
  }, [timeline, beatsPerBar]);

  const totalBars = Math.max(1, Math.ceil(totalBeats / beatsPerBar - 1e-6));

  const loopStartBeat = (loopStartBar - 1) * beatsPerBar;
  const loopEndBeat = Math.min(totalBeats, loopEndBar * beatsPerBar);

  const playback = usePlayback({
    timeline,
    totalBeats,
    bpm: effectiveBpm,
    meter,
    instrument: version?.instrument ?? 'piano',
    metronomeOn,
    countInOn,
    loop: { enabled: loopEnabled, startBeat: loopStartBeat, endBeat: loopEndBeat },
    waitActive: waitMode !== 'off',
  });
  const { isPlaying, currentBeat, countInRemaining, waitingEventId } = playback;
  const seekTo = playback.seek;

  const parsedLyrics = useMemo(() => {
    if (!version) return [];
    return parseChordPro(version.lyricsChords, transpose, notation, preferFlats);
  }, [version, transpose, notation, preferFlats]);

  const lyricSections = useMemo(() => groupLyricsBySection(parsedLyrics), [parsedLyrics]);

  // Index every lyric line and every chord occurrence sequentially so only the SINGLE
  // current line and SINGLE current chord occurrence highlight during playback.
  const lyricPlaybackIndex = useMemo(() => {
    let lineCount = 0;
    let chordCount = 0;
    const lineMeta = new Map<string, { lineIdx: number; chordIndices: Map<number, number> }>();
    const chordToLine = new Map<number, number>();

    lyricSections.forEach((sec, sIdx) => {
      sec.lines.forEach((line, lIdx) => {
        if (line.type !== 'lyric') return;
        const myLineIdx = lineCount++;
        const chordIndices = new Map<number, number>();
        line.tokens.forEach((tok, tIdx) => {
          if (tok.chord) {
            const myChordIdx = chordCount++;
            chordIndices.set(tIdx, myChordIdx);
            chordToLine.set(myChordIdx, myLineIdx);
          }
        });
        lineMeta.set(`${sIdx}-${lIdx}`, { lineIdx: myLineIdx, chordIndices });
      });
    });

    return { lineCount, chordCount, lineMeta, chordToLine };
  }, [lyricSections]);

  const isPlayerActive = isPlaying || currentBeat > 0;
  const playbackProgress = totalBeats > 0 ? Math.max(0, Math.min(0.9999, currentBeat / totalBeats)) : 0;

  const activeLyricChordIdx = useMemo(() => {
    if (!isPlayerActive || lyricPlaybackIndex.chordCount === 0) return -1;
    return Math.floor(playbackProgress * lyricPlaybackIndex.chordCount);
  }, [isPlayerActive, playbackProgress, lyricPlaybackIndex.chordCount]);

  const activeLyricLineIdx = useMemo(() => {
    if (!isPlayerActive || lyricPlaybackIndex.lineCount === 0) return -1;
    if (activeLyricChordIdx >= 0) {
      const fromChord = lyricPlaybackIndex.chordToLine.get(activeLyricChordIdx);
      if (fromChord !== undefined) return fromChord;
    }
    return Math.floor(playbackProgress * lyricPlaybackIndex.lineCount);
  }, [isPlayerActive, activeLyricChordIdx, playbackProgress, lyricPlaybackIndex]);

  const uniqueChords = useMemo(() => {
    if (!version) return [];
    return extractUniqueChords(version.lyricsChords, version.abcNotation, transpose, preferFlats);
  }, [version, transpose, preferFlats]);

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

  const notifyNotePlayed = playback.notifyNotePlayed;
  const handleUserNotePlayed = useCallback(
    (playedMidi: number) => {
      setDetectedLiveMidi(playedMidi);
      notifyNotePlayed(playedMidi);
    },
    [notifyNotePlayed]
  );

  // Wait Mode Input Listener: Web MIDI API or Microphone Pitch Detection
  useEffect(() => {
    if (waitMode === 'off') {
      setWaitModeStatus(null);
      setDetectedLiveMidi(null);
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

  // Auto-scroll for lyrics view
  useEffect(() => {
    if (!autoScroll || !isPlaying) return;
    const interval = window.setInterval(() => {
      window.scrollBy({ top: 1, behavior: 'auto' });
    }, Math.max(20, Math.round(5500 / effectiveBpm)));
    return () => window.clearInterval(interval);
  }, [autoScroll, isPlaying, effectiveBpm]);

  const handlePlayToggle = () => playback.toggle();

  const handleStop = () => playback.stop(loopEnabled ? loopStartBeat : 0);

  const toggleModule = (key: keyof ReaderModules) => {
    onChangeModules({ ...modules, [key]: !modules[key] });
  };

  const currentKeyDisplay = formatChord(targetKey, notation);

  if (!version) return null;

  return (
    <>
    <div className={`mx-auto px-4 pt-3 pb-36 sm:pb-24 space-y-3 ${performanceMode ? 'max-w-5xl' : 'max-w-7xl'}`}>
      {/* Track header */}
      <div className="flex items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              playback.pause();
              onBack();
            }}
            className="p-2 -ml-2 rounded-lg cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Torna alla libreria"
            title="Torna alla libreria"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <TrackCover
            coverArt={track.coverArt}
            title={track.title}
            instrument={version.instrument}
            size="md"
          />
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold truncate leading-tight">
              {track.title}
            </h1>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {track.artist} · <strong className="font-mono">{currentKeyDisplay}</strong> ·{' '}
              <span className="font-mono">{effectiveBpm} BPM</span> · {meterSource}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setPerformanceMode((p) => !p)}
            aria-pressed={performanceMode}
            aria-label="Modalità leggio"
            title="Modalità Leggio / Mani Libere"
            className="inline-flex items-center gap-1 p-2 sm:px-2 sm:py-1.5 rounded-lg font-medium cursor-pointer"
            style={{
              color: performanceMode ? 'var(--accent)' : 'var(--text-secondary)',
              backgroundColor: performanceMode ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            {performanceMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Leggio</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Stampa o salva in PDF"
            title="Stampa o salva in PDF"
            className="inline-flex items-center gap-1 p-2 sm:px-2 sm:py-1.5 rounded-lg font-medium cursor-pointer hover:opacity-75"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => onEditTrack(track)}
            aria-label="Modifica brano"
            title="Modifica brano"
            className="inline-flex items-center gap-1 p-2 sm:px-2 sm:py-1.5 rounded-lg font-medium cursor-pointer hover:opacity-75"
            style={{ color: 'var(--accent)' }}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Modifica</span>
          </button>
        </div>
      </div>

      {/* Control strip: version + visible modules, then practice tools (collapsible on mobile) */}
      {!performanceMode && (
        <div className="pb-2.5 border-b space-y-2 no-print" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <div className="relative min-w-0 max-w-full">
              <select
                value={version.id}
                onChange={(e) => {
                  handleStop();
                  setVersionId(e.target.value);
                }}
                aria-label="Seleziona versione brano"
                className="appearance-none max-w-[15rem] truncate pl-2.5 pr-7 py-1.5 rounded-lg border font-semibold cursor-pointer"
                style={{
                  color: 'var(--text-primary)',
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
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
            </div>

            <div role="group" aria-label="Moduli visibili" className="flex items-center gap-1">
              {(
                [
                  { key: 'sheet', label: 'Spartito', short: 'Spartito' },
                  { key: 'simplyPiano', label: 'Player guidato', short: 'Player' },
                  { key: 'lyricsChords', label: 'Testo e accordi', short: 'Testo' },
                  { key: 'chordBar', label: 'Accordi in alto', short: 'Accordi' },
                ] as const
              ).map((item) => (
                <ToggleChip
                  key={item.key}
                  active={modules[item.key]}
                  onClick={() => toggleModule(item.key)}
                  title={`Mostra/nascondi: ${item.label}`}
                >
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </ToggleChip>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              aria-expanded={showOptions}
              aria-controls="reader-practice-tools"
              className="md:hidden ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-medium cursor-pointer"
              style={{
                borderColor: 'var(--border-color)',
                color: showOptions ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: showOptions ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Opzioni
            </button>

            <div
              id="reader-practice-tools"
              className={`${showOptions ? 'flex' : 'hidden'} md:flex flex-wrap items-center gap-1 w-full md:w-auto md:ml-auto`}
            >
              <div role="group" aria-label="Strumenti di pratica" className="flex flex-wrap items-center gap-1">
                <ToggleChip active={metronomeOn} onClick={() => setMetronomeOn((v) => !v)} title="Metronomo">
                  <Timer className="w-3.5 h-3.5" /> Metronomo
                </ToggleChip>
                <ToggleChip
                  active={countInOn}
                  onClick={() => setCountInOn((v) => !v)}
                  title="Una battuta di conteggio prima di iniziare"
                >
                  <span className="font-mono">1·2·3·4</span>
                </ToggleChip>
                <ToggleChip active={loopEnabled} onClick={() => setLoopEnabled((v) => !v)} title="Ripeti un gruppo di battute">
                  <Repeat className="w-3.5 h-3.5" /> Loop
                </ToggleChip>
                {loopEnabled && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <input
                      type="number"
                      min={1}
                      max={totalBars}
                      value={loopStartBar}
                      onChange={(e) => setLoopStartBar(Math.max(1, Number(e.target.value)))}
                      aria-label="Battuta inizio loop"
                      className="w-11 px-1 py-1 rounded-lg border text-center"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type="number"
                      min={loopStartBar}
                      max={totalBars}
                      value={loopEndBar}
                      onChange={(e) => setLoopEndBar(Math.max(loopStartBar, Number(e.target.value)))}
                      aria-label="Battuta fine loop"
                      className="w-11 px-1 py-1 rounded-lg border text-center"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                    />
                  </span>
                )}
              </div>

              <span className="hidden md:block w-px h-5 mx-1.5" style={{ backgroundColor: 'var(--border-color)' }} />

              <div
                role="group"
                aria-label="Notazione"
                className="inline-flex items-center rounded-lg p-0.5 border"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
              >
                {(
                  [
                    { key: 'alpha', label: 'C·D·E' },
                    { key: 'latin', label: 'Do·Re·Mi' },
                  ] as const
                ).map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    aria-pressed={notation === n.key}
                    onClick={() => onChangeNotation(n.key)}
                    className="px-2 py-0.5 rounded-md font-medium cursor-pointer transition"
                    style={{
                      backgroundColor: notation === n.key ? 'var(--bg-surface)' : 'transparent',
                      color: notation === n.key ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(version.notes || (capoSuggestion && capoSuggestion.capo > 0)) && (
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 text-xs">
              {version.notes && (
                <div className="flex items-start gap-1.5 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--accent-warm)' }} />
                  <span className="line-clamp-2 sm:line-clamp-none">{version.notes}</span>
                </div>
              )}
              {capoSuggestion && capoSuggestion.capo > 0 && (
                <button
                  type="button"
                  onClick={() => setTranspose((t) => t - capoSuggestion.capo)}
                  className="inline-flex items-center gap-1 font-medium cursor-pointer hover:underline"
                  style={{ color: 'var(--accent)' }}
                  title="Applica trasposizione per usare il capotasto"
                >
                  <InstrumentIcon instrument={version.instrument} className="w-3.5 h-3.5" />
                  Capotasto tasto {capoSuggestion.capo} ({capoSuggestion.easyCount}/{capoSuggestion.total} accordi facili)
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
          onSeekBeat={seekTo}
          beatsPerBar={beatsPerBar}
        />
      )}

      {/* Module 3: Classical Sheet Music */}
      {modules.sheet && (
        <SheetMusicPanel
          abcNotation={version.abcNotation}
          transposeSemitones={transpose}
          notation={notation}
          activeNoteIndex={activeEvent?.noteIndex ?? -1}
          showNoteLabels={modules.noteLabels}
          darkSheet={modules.darkSheet}
          onToggleDarkSheet={() => toggleModule('darkSheet')}
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
                      if (line.type === 'tab') {
                        return (
                          <pre
                            key={idx}
                            className="font-mono text-xs leading-tight overflow-x-auto py-0.5 px-2 rounded"
                            style={{
                              backgroundColor: 'var(--bg-surface-2)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {line.rawText}
                          </pre>
                        );
                      }
                      const meta = lyricPlaybackIndex.lineMeta.get(`${sIdx}-${idx}`);
                      const isCurrentLine = meta !== undefined && meta.lineIdx === activeLyricLineIdx;
                      const chordFontPx = Math.max(13, Math.round(lyricsFontSize * 0.9));

                      // Instrumental / chord-only line: show it as a grid of bars instead of floating chords
                      const isChordOnly =
                        line.tokens.some((t) => t.chord) && line.tokens.every((t) => !t.text.trim());
                      if (isChordOnly) {
                        return (
                          <div
                            key={idx}
                            className="flex flex-wrap gap-1.5 mb-2 rounded-lg px-2 -mx-2 py-1 transition-colors duration-200"
                            style={{
                              backgroundColor: isCurrentLine
                                ? 'color-mix(in srgb, var(--accent-bg) 55%, transparent)'
                                : 'transparent',
                            }}
                          >
                            {line.tokens.map((tok, tIdx) => {
                              if (!tok.chord) return null;
                              const occ = meta?.chordIndices.get(tIdx);
                              const isCurrent = occ !== undefined && occ === activeLyricChordIdx;
                              return (
                                <button
                                  key={tIdx}
                                  type="button"
                                  onClick={() => {
                                    if (tok.rawChord) {
                                      audioEngine.playChord(tok.rawChord, version.instrument);
                                      setSelectedChordPreview(tok.rawChord);
                                    }
                                  }}
                                  className="min-w-[3.5rem] px-2.5 py-1.5 rounded-lg border font-bold text-center cursor-pointer transition"
                                  style={{
                                    fontSize: `${chordFontPx}px`,
                                    borderColor: isCurrent ? 'var(--accent)' : 'var(--border-color)',
                                    backgroundColor: isCurrent ? 'var(--accent)' : 'var(--bg-surface)',
                                    color: isCurrent ? 'var(--bg-surface)' : 'var(--chord-color)',
                                  }}
                                  title="Clicca per ascoltare l'accordo"
                                >
                                  {tok.chord}
                                </button>
                              );
                            })}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex flex-wrap items-end gap-y-1.5 leading-snug mb-2 rounded-lg px-2 -mx-2 py-0.5 transition-colors duration-200`}
                          style={{
                            backgroundColor: isCurrentLine
                              ? 'color-mix(in srgb, var(--accent-bg) 55%, transparent)'
                              : 'transparent',
                          }}
                        >
                          {line.tokens.map((tok, tIdx) => {
                            const chordOccIdx = meta?.chordIndices.get(tIdx);
                            const isCurrentChord =
                              chordOccIdx !== undefined && chordOccIdx === activeLyricChordIdx;
                            // Only pad a chord when it is wider than the syllable below it, so
                            // words are not pushed apart by a fixed margin.
                            const chordWider =
                              Boolean(tok.chord) && tok.text.trimEnd().length <= (tok.chord?.length ?? 0) + 1;
                            return (
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
                                    className={`font-bold leading-none mb-1 -ml-0.5 px-0.5 rounded-md cursor-pointer transition-colors duration-150 ${chordWider ? 'pr-2' : ''}`}
                                    style={{
                                      fontSize: `${chordFontPx}px`,
                                      backgroundColor: isCurrentChord ? 'var(--accent)' : 'transparent',
                                      color: isCurrentChord ? 'var(--bg-surface)' : 'var(--chord-color)',
                                      boxShadow: isCurrentChord ? '0 0 0 3px var(--accent)' : 'none',
                                    }}
                                    title="Clicca per ascoltare l'accordo"
                                  >
                                    {tok.chord}
                                  </button>
                                ) : (
                                  <span aria-hidden="true" style={{ height: `${chordFontPx + 4}px` }} />
                                )}
                                <span
                                  className={`whitespace-pre-wrap ${isCurrentLine ? 'font-medium' : ''}`}
                                >
                                  {tok.text || '\u00A0'}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>

          {/* Chord diagrams: sticky sidebar on large screens, horizontal strip below */}
          {uniqueChords.length > 0 && (
            <aside
              className="min-w-0 lg:sticky lg:top-16 lg:border-l lg:pl-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto no-print"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Diagrammi accordi"
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Accordi ({uniqueChords.length})
                </span>
                {uniqueChords.length > 3 && (
                  <span className="lg:hidden text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    scorri →
                  </span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
                {uniqueChords.map((chord) => (
                  <div key={chord} className="shrink-0 snap-start lg:shrink">
                    <ChordDiagramCard
                      chord={chord}
                      instrument={version.instrument}
                      notation={notation}
                      compact
                      isActive={activeChord === chord || selectedChordPreview === chord}
                      onSelect={() => setSelectedChordPreview(chord)}
                    />
                  </div>
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
            seekTo(ratio * totalBeats);
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

        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Transport + beat indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePlayToggle}
              aria-label={countInRemaining > 0 ? 'Annulla conteggio' : isPlaying ? 'Pausa' : 'Riproduci'}
              className={`inline-flex items-center justify-center gap-1.5 min-w-[5.5rem] px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition hover:opacity-90 ${countInRemaining > 0 ? 'count-in-pulse' : ''}`}
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-surface)' }}
            >
              {countInRemaining > 0 ? (
                <span className="font-mono">Conto {countInRemaining}</span>
              ) : isPlaying ? (
                <>
                  <Pause className="w-4 h-4" /> Pausa
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Play
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop"
              title="Stop (torna all'inizio)"
              className="p-2 rounded-xl border cursor-pointer"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              <Square className="w-4 h-4" />
            </button>
            <BeatIndicator
              active={isPlaying && countInRemaining === 0}
              currentBeat={currentBeat}
              beatsPerBar={beatsPerBar}
              clickBeats={meter.clickBeats}
            />
          </div>

          {/* Position */}
          <div className="flex items-center gap-2 flex-1 min-w-[120px] text-[11px]">
            <input
              type="range"
              min={0}
              max={totalBeats}
              step={0.5}
              value={Math.min(totalBeats, currentBeat)}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Posizione brano"
              className="flex-1"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="font-mono shrink-0" style={{ color: 'var(--text-secondary)' }} title="Battuta corrente / totale">
              {Math.min(totalBars, Math.floor(currentBeat / beatsPerBar + 1e-6) + 1)}/{totalBars}
            </span>
          </div>

          {/* Tempo, key, scroll */}
          <div
            className="flex items-center justify-between sm:justify-start gap-4 text-xs w-full sm:w-auto sm:pl-4 sm:border-l"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div role="group" aria-label="Velocità" className="flex items-center gap-1.5" title="Velocità di riproduzione">
              <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <input
                type="range"
                min={50}
                max={150}
                step={5}
                value={speedPct}
                onChange={(e) => setSpeedPct(Number(e.target.value))}
                onDoubleClick={() => setSpeedPct(100)}
                aria-label="Velocità di riproduzione"
                className="w-16 sm:w-20"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="font-mono text-[11px] font-semibold w-9">{speedPct}%</span>
            </div>

            <div role="group" aria-label="Tonalità" className="flex items-center gap-1" title="Trasposizione in semitoni">
              <Music2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              <button
                type="button"
                onClick={() => setTranspose((t) => t - 1)}
                aria-label="Abbassa tonalità di 1 semitono"
                title="Abbassa di un semitono"
                className="w-7 h-7 rounded-lg border font-bold cursor-pointer"
                style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              >
                −
              </button>
              <span
                className="w-7 text-center font-mono text-[11px] font-semibold"
                style={{ color: transpose !== 0 ? 'var(--accent)' : undefined }}
              >
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                type="button"
                onClick={() => setTranspose((t) => t + 1)}
                aria-label="Alza tonalità di 1 semitono"
                title="Alza di un semitono"
                className="w-7 h-7 rounded-lg border font-bold cursor-pointer"
                style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setTranspose(0)}
                title="Ripristina tonalità originale"
                aria-label="Ripristina tonalità originale"
                className={`p-1 rounded-lg cursor-pointer opacity-70 hover:opacity-100 ${transpose === 0 ? 'invisible' : ''}`}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <ToggleChip active={autoScroll} onClick={() => setAutoScroll((v) => !v)} title="Scorrimento automatico durante la riproduzione">
              <ScrollText className="w-3.5 h-3.5" /> Scroll
            </ToggleChip>
          </div>
        </div>
      </div>
    </>
  );
}
