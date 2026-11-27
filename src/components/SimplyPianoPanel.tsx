import { useMemo } from 'react';
import { Mic, Piano, Radio } from 'lucide-react';
import type { Instrument, NotationSystem } from '../types/music';
import type { TimelineEvent } from '../lib/audioEngine';
import type { ParsedLine } from '../lib/chordPro';
import { audioEngine } from '../lib/audioEngine';
import { formatChord, midiToNoteName } from '../lib/musicTheory';
import { getFrettedDiagram, STRING_LABELS } from '../lib/chordDiagrams';

export type WaitModeSource = 'off' | 'mic' | 'midi';

interface SimplyPianoPanelProps {
  events: TimelineEvent[];
  currentBeat: number;
  totalBeats: number;
  instrument: Instrument;
  notation: NotationSystem;
  activeEvent: TimelineEvent | null;
  activeChord: string | null;
  parsedLyrics: ParsedLine[];
  waitMode: WaitModeSource;
  onChangeWaitMode: (mode: WaitModeSource) => void;
  waitingForMidi: number | null;
  detectedLiveMidi: number | null;
  waitModeStatus: string | null;
  onUserNotePlayed: (midi: number) => void;
  onSeekBeat: (beat: number) => void;
  beatsPerBar?: number;
}

const BLACK_KEY_PCS = new Set([1, 3, 6, 8, 10]);
const MIN_SPAN = 17; // at least an octave and a half of keys
const CHORD_LANE_PX = 22;

/** Keyboard range fitted to the song's notes (white-key aligned, at least 1.5 octaves). */
function computeKeyRange(events: TimelineEvent[]): { start: number; end: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const ev of events) {
    for (const m of ev.midiNotes) {
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 57;
    hi = 84;
  }
  lo -= 2;
  hi += 2;
  while (hi - lo < MIN_SPAN) {
    lo -= 1;
    if (hi - lo < MIN_SPAN) hi += 1;
  }
  lo = Math.max(21, lo);
  hi = Math.min(108, hi);
  while (BLACK_KEY_PCS.has(((lo % 12) + 12) % 12)) lo--;
  while (BLACK_KEY_PCS.has(((hi % 12) + 12) % 12)) hi++;
  return { start: lo, end: hi };
}

export function SimplyPianoPanel({
  events,
  currentBeat,
  totalBeats,
  instrument,
  notation,
  activeEvent,
  activeChord,
  parsedLyrics,
  waitMode,
  onChangeWaitMode,
  waitingForMidi,
  detectedLiveMidi,
  waitModeStatus,
  onUserNotePlayed,
  onSeekBeat,
  beatsPerBar = 4,
}: SimplyPianoPanelProps) {
  const activeMidis = useMemo(() => new Set(activeEvent?.midiNotes ?? []), [activeEvent]);

  const lyricLines = useMemo(() => {
    return parsedLyrics.filter(
      (line) =>
        line.type === 'lyric' &&
        line.tokens.some((t) => t.text.trim().length > 0 || Boolean(t.chord))
    );
  }, [parsedLyrics]);

  const currentLyricIndex = useMemo(() => {
    if (lyricLines.length === 0 || totalBeats <= 0) return -1;
    const progress = Math.max(0, Math.min(0.9999, currentBeat / totalBeats));
    return Math.floor(progress * lyricLines.length);
  }, [lyricLines.length, currentBeat, totalBeats]);

  const WINDOW_BEATS = 8;
  const visibleEvents = useMemo(() => {
    return events.filter(
      (ev) =>
        ev.midiNotes.length > 0 &&
        ev.startBeat + ev.durationBeats >= currentBeat - 0.5 &&
        ev.startBeat <= currentBeat + WINDOW_BEATS
    );
  }, [events, currentBeat]);

  const keyRange = useMemo(() => computeKeyRange(events), [events]);
  const PIANO_END_MIDI = keyRange.end;
  const whiteKeys = useMemo(() => {
    const list: number[] = [];
    for (let m = keyRange.start; m <= keyRange.end; m++) {
      if (!BLACK_KEY_PCS.has(m % 12)) list.push(m);
    }
    return list;
  }, [keyRange]);

  // Bar and beat grid lines visible in the note highway window
  const gridLines = useMemo(() => {
    const lines: { beat: number; isBar: boolean; bar: number }[] = [];
    const from = Math.floor(currentBeat - 2);
    for (let b = Math.max(0, from); b <= currentBeat + WINDOW_BEATS; b += 1) {
      const barPos = b / beatsPerBar;
      const isBar = Math.abs(barPos - Math.round(barPos)) < 1e-6;
      lines.push({ beat: b, isBar, bar: Math.round(barPos) + 1 });
    }
    return lines;
  }, [currentBeat, beatsPerBar]);

  const chordMarkers = useMemo(
    () =>
      events.filter(
        (ev) => ev.chord && ev.startBeat <= currentBeat + WINDOW_BEATS && ev.startBeat >= currentBeat - WINDOW_BEATS
      ),
    [events, currentBeat]
  );

  const frettedDiagram = useMemo(() => {
    if (instrument === 'piano' || !activeChord) return null;
    return getFrettedDiagram(activeChord, instrument);
  }, [instrument, activeChord]);

  const currentLine = currentLyricIndex >= 0 ? lyricLines[currentLyricIndex] : null;
  const nextLine = currentLyricIndex >= 0 ? lyricLines[currentLyricIndex + 1] ?? null : null;

  // Keep MIDI availability hint clean
  const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header bar with Wait Mode selector */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b text-xs"
        style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: '#adc178' }}
          />
          <span>Player Guidato (Simply Piano)</span>

          {/* Wait Mode Controls (Off / Mic / USB MIDI) */}
          <div
            className="inline-flex items-center rounded-lg p-0.5 border ml-1"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            title="Wait Mode: lo spartito attende che tu suoni la nota giusta prima di avanzare"
          >
            <button
              type="button"
              onClick={() => onChangeWaitMode('off')}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer transition"
              style={{
                backgroundColor: waitMode === 'off' ? 'var(--accent)' : 'transparent',
                color: waitMode === 'off' ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => onChangeWaitMode(waitMode === 'mic' ? 'off' : 'mic')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer transition"
              style={{
                backgroundColor: waitMode === 'mic' ? 'var(--accent)' : 'transparent',
                color: waitMode === 'mic' ? '#ffffff' : 'var(--text-secondary)',
              }}
              title="Attendi la nota ascoltando dal microfono"
            >
              <Mic className="w-3 h-3" />
              Wait Mic
            </button>
            <button
              type="button"
              onClick={() => onChangeWaitMode(waitMode === 'midi' ? 'off' : 'midi')}
              disabled={!midiSupported}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer transition disabled:opacity-40"
              style={{
                backgroundColor: waitMode === 'midi' ? 'var(--accent)' : 'transparent',
                color: waitMode === 'midi' ? '#ffffff' : 'var(--text-secondary)',
              }}
              title={
                midiSupported
                  ? 'Attendi la nota dalla tastiera USB MIDI'
                  : 'Web MIDI non supportato da questo browser (usa Chrome/Edge)'
              }
            >
              <Piano className="w-3 h-3" />
              Wait MIDI
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeChord && (
            <span
              className="px-2.5 py-0.5 rounded-full font-bold text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Accordo: {formatChord(activeChord, notation)}
            </span>
          )}
          <span style={{ color: 'var(--text-secondary)' }}>
            Battuta {Math.floor(currentBeat / beatsPerBar + 1e-6) + 1} / {Math.max(1, Math.ceil(totalBeats / beatsPerBar - 1e-6))}
          </span>
        </div>
      </div>

      {/* Wait Mode Live Status Strip */}
      {waitMode !== 'off' && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b text-xs"
          style={{ backgroundColor: 'var(--accent-bg)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2 font-medium">
            <Radio className="w-3.5 h-3.5 animate-pulse" style={{ color: 'var(--accent)' }} />
            <span>
              {waitingForMidi !== null ? (
                <>
                  In attesa della nota:{' '}
                  <strong className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>
                    {midiToNoteName(waitingForMidi, notation)}
                  </strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    (suona sul tuo strumento o clicca il tasto evidenziato)
                  </span>
                </>
              ) : (
                waitModeStatus || 'Wait Mode attivo — premi Riproduci per iniziare'
              )}
            </span>
          </div>
          {detectedLiveMidi !== null && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent)' }}
            >
              Rilevato: {midiToNoteName(detectedLiveMidi, notation)}
            </span>
          )}
        </div>
      )}

      {/* Live Lyrics Strip inside Guided Player */}
      {currentLine && (
        <div
          className="px-4 py-2.5 border-b text-center space-y-1"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
        >
          {currentLine.tokens.every((t) => !t.text.trim()) ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {currentLine.tokens
                .filter((t) => t.chord)
                .map((tok, i) => (
                  <span
                    key={i}
                    className="min-w-[3rem] px-2.5 py-1 rounded-lg border text-sm font-bold"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--chord-color)', backgroundColor: 'var(--bg-surface-2)' }}
                  >
                    {tok.chord}
                  </span>
                ))}
            </div>
          ) : (
          <div className="flex flex-wrap items-end justify-center gap-x-1 gap-y-1 text-sm font-semibold">
            {currentLine.tokens.map((tok, i) => (
              <span key={i} className="inline-flex flex-col items-center">
                {tok.chord && (
                  <span
                    className="text-xs font-bold px-1.5 py-px rounded-md mb-0.5"
                    style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--chord-color)' }}
                  >
                    {tok.chord}
                  </span>
                )}
                <span>{tok.text}</span>
              </span>
            ))}
          </div>
          )}
          {nextLine && (
            <div className="text-xs truncate opacity-60" style={{ color: 'var(--text-secondary)' }}>
              Prossima: {nextLine.tokens.map((t) => (t.chord ? `[${t.chord}] ` : '') + t.text).join('')}
            </div>
          )}
        </div>
      )}

      {/* Scrolling Note Highway */}
      <div
        className="relative h-40 overflow-hidden select-none cursor-pointer"
        style={{ backgroundColor: 'var(--bg-page)' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const targetBeat = Math.max(0, Math.min(totalBeats, currentBeat + ((ratio - 0.18) / 0.82) * WINDOW_BEATS));
          onSeekBeat(targetBeat);
        }}
        title="Clicca per saltare a quel punto del brano"
      >
        {/* Chord lane */}
        <div
          className="absolute inset-x-0 top-0 border-b"
          style={{ height: CHORD_LANE_PX, borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
        />

        {/* Beat / bar grid */}
        {gridLines.map((g) => {
          const leftPct = 18 + ((g.beat - currentBeat) / WINDOW_BEATS) * 82;
          if (leftPct < -2 || leftPct > 102) return null;
          return (
            <div
              key={g.beat}
              className="absolute bottom-0"
              style={{
                left: `${leftPct}%`,
                top: CHORD_LANE_PX,
                width: g.isBar ? 2 : 1,
                backgroundColor: 'var(--text-secondary)',
                opacity: g.isBar ? 0.35 : 0.1,
              }}
            >
              {g.isBar && (
                <span
                  className="absolute bottom-1 left-1 text-[9px] font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {g.bar}
                </span>
              )}
            </div>
          );
        })}

        {/* Chords (accompaniment) on their own lane */}
        {chordMarkers.map((ev) => {
          const leftPct = 18 + ((ev.startBeat - currentBeat) / WINDOW_BEATS) * 82;
          const isNow = activeChord === ev.chord && currentBeat >= ev.startBeat && currentBeat < ev.startBeat + Math.max(ev.durationBeats, 1);
          return (
            <span
              key={`c${ev.id}`}
              className="absolute px-1.5 rounded text-[10px] font-extrabold whitespace-nowrap leading-[18px]"
              style={{
                left: `${leftPct}%`,
                top: 2,
                backgroundColor: isNow ? 'var(--accent-warm)' : 'var(--bg-surface)',
                color: isNow ? 'var(--bg-surface)' : 'var(--accent-warm)',
                border: '1px solid var(--accent-warm)',
                zIndex: 12,
              }}
            >
              {formatChord(ev.chord!, notation)}
            </span>
          );
        })}

        {/* Playhead line */}
        <div
          className="absolute bottom-0 w-0.5 z-20"
          style={{
            left: '18%',
            top: CHORD_LANE_PX,
            backgroundColor: '#a98467',
            boxShadow: '0 0 10px rgba(169, 132, 103, 0.85)',
          }}
        >
          <div className="w-3 h-3 -ml-[5px] -mt-1.5 rounded-full" style={{ backgroundColor: '#a98467' }} />
        </div>

        {visibleEvents.map((ev) => {
          const leftPct = 18 + ((ev.startBeat - currentBeat) / WINDOW_BEATS) * 82;
          const rawWidth = (ev.durationBeats / WINDOW_BEATS) * 82;
          const tieHead = !ev.tied && ev.sustainBeats > ev.durationBeats + 1e-6;
          // Tied notes join into one continuous bar: no gap and no inner rounded corners
          const widthPct = ev.tied || tieHead ? rawWidth + 0.2 : Math.max(3, rawWidth - 0.8);
          const isNow = currentBeat >= ev.startBeat && currentBeat < ev.startBeat + ev.durationBeats;
          const mainMidi = ev.midiNotes[ev.midiNotes.length - 1] ?? 60;
          const span = Math.max(1, keyRange.end - keyRange.start);
          const clampedMidi = Math.max(keyRange.start, Math.min(keyRange.end, mainMidi));
          const topPct = 80 - ((clampedMidi - keyRange.start) / span) * 58;
          const noteLabel = midiToNoteName(mainMidi, notation).replace(/\d+$/, '');
          const isChordNotes = ev.midiNotes.length > 1;

          return (
            <div
              key={ev.id}
              className="absolute flex items-center justify-center px-2 font-bold text-xs shadow-sm transition-colors"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: `${topPct}%`,
                height: '24px',
                borderRadius: ev.tied
                  ? tieHead
                    ? '0'
                    : '0 var(--radius-lg) var(--radius-lg) 0'
                  : tieHead
                  ? 'var(--radius-lg) 0 0 var(--radius-lg)'
                  : 'var(--radius-lg)',
                backgroundColor: isNow ? '#adc178' : ev.tied ? '#6c584cb0' : '#6c584cd9',
                color: isNow ? '#3b3029' : '#f0ead2',
                zIndex: isNow ? 15 : 10,
                outline: isChordNotes ? '2px solid #dde5b6' : 'none',
                outlineOffset: -2,
              }}
              title={isChordNotes ? ev.midiNotes.map((m) => midiToNoteName(m, notation)).join(' + ') : undefined}
            >
              {!ev.tied && (
                <span className="truncate">
                  {noteLabel}
                  {isChordNotes ? ` +${ev.midiNotes.length - 1}` : ''}
                </span>
              )}
            </div>
          );
        })}

        {events.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            Nessun evento musicale disponibile per questa versione.
          </div>
        )}
      </div>

      {/* Live Interactive Instrument at Bottom */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
        {instrument === 'piano' ? (
          <div
            className="relative flex h-28 sm:h-32 select-none overflow-x-auto rounded-lg border"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {whiteKeys.map((midi) => {
              const isTarget = waitingForMidi !== null && midi % 12 === waitingForMidi % 12;
              const isLit = activeMidis.has(midi) || isTarget;
              const isUserPressed = detectedLiveMidi !== null && midi === detectedLiveMidi;
              const label = midiToNoteName(midi, notation).replace(/\d+$/, '');
              const hasBlackRight = BLACK_KEY_PCS.has((midi + 1) % 12) && midi + 1 <= PIANO_END_MIDI;
              const blackMidi = midi + 1;
              const isBlackLit =
                activeMidis.has(blackMidi) ||
                (waitingForMidi !== null && blackMidi % 12 === waitingForMidi % 12);

              return (
                <div key={midi} className="relative flex-1 min-w-[24px] sm:min-w-[30px] h-full">
                  <button
                    type="button"
                    onClick={() => {
                      audioEngine.playNote(midi, 0.7, 'piano');
                      onUserNotePlayed(midi);
                    }}
                    className={`w-full h-full border-r flex items-end justify-center pb-1.5 text-[10px] font-semibold transition-all duration-100 cursor-pointer ${isLit ? 'key-glow' : ''}`}
                    style={{
                      borderColor: '#d8cfaf',
                      backgroundColor: isUserPressed ? '#a98467' : isLit ? '#adc178' : '#faf7ec',
                      color: isUserPressed ? '#ffffff' : isLit ? '#3b3029' : '#6c584c',
                    }}
                  >
                    {label}
                  </button>
                  {hasBlackRight && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        audioEngine.playNote(blackMidi, 0.7, 'piano');
                        onUserNotePlayed(blackMidi);
                      }}
                      aria-label={midiToNoteName(blackMidi, notation)}
                      className="absolute top-0 -right-[32%] w-[64%] h-[60%] z-10 rounded-b-md border transition cursor-pointer"
                      style={{
                        borderColor: '#3b3029',
                        backgroundColor: isBlackLit ? '#adc178' : '#3b3029',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                Manico {instrument === 'guitar' ? 'Chitarra (E-A-D-G-B-e)' : 'Ukulele (G-C-E-A)'}
              </span>
              {activeChord && (
                <button
                  type="button"
                  onClick={() => audioEngine.playChord(activeChord, instrument)}
                  className="text-xs font-semibold underline cursor-pointer"
                  style={{ color: 'var(--accent)' }}
                >
                  Ascolta {formatChord(activeChord, notation)}
                </button>
              )}
            </div>
            <div
              className="overflow-x-auto rounded-xl p-3"
              style={{ backgroundColor: '#3b3029', color: '#f0ead2' }}
            >
              <div className="min-w-[360px] space-y-1.5">
                {[...STRING_LABELS[instrument]].reverse().map((strLabel, revIdx) => {
                  const realIdx = STRING_LABELS[instrument].length - 1 - revIdx;
                  const activeFret = frettedDiagram?.frets[realIdx];
                  return (
                    <div key={`${strLabel}-${revIdx}`} className="flex items-center gap-2">
                      <span className="w-5 text-xs font-mono font-bold" style={{ color: '#dde5b6' }}>
                        {strLabel}
                      </span>
                      <div className="flex-1 grid grid-cols-6 border-l-4" style={{ borderColor: '#f0ead2' }}>
                        {[1, 2, 3, 4, 5, 6].map((fret) => {
                          const isPressed = activeFret === fret;
                          return (
                            <div
                              key={fret}
                              className="relative h-5 border-r flex items-center justify-center"
                              style={{ borderColor: 'rgba(221, 229, 182, 0.3)' }}
                            >
                              <div
                                className="absolute inset-x-0 h-[1.5px]"
                                style={{ backgroundColor: 'rgba(240, 234, 210, 0.45)' }}
                              />
                              {isPressed && (
                                <span
                                  className="relative z-10 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shadow"
                                  style={{ backgroundColor: '#adc178', color: '#3b3029' }}
                                >
                                  {fret}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <span className="w-6 text-[11px] font-mono text-right">
                        {activeFret === 0 ? 'O' : activeFret === -1 ? '×' : activeFret ?? ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
