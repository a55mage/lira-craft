import { useEffect, useMemo } from 'react';
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
}

const PIANO_START_MIDI = 57; // A3
const PIANO_END_MIDI = 84;   // C6
const BLACK_KEY_PCS = new Set([1, 3, 6, 8, 10]);

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
      (ev) => ev.startBeat + ev.durationBeats >= currentBeat - 0.5 && ev.startBeat <= currentBeat + WINDOW_BEATS
    );
  }, [events, currentBeat]);

  const whiteKeys = useMemo(() => {
    const list: number[] = [];
    for (let m = PIANO_START_MIDI; m <= PIANO_END_MIDI; m++) {
      if (!BLACK_KEY_PCS.has(m % 12)) list.push(m);
    }
    return list;
  }, []);

  const frettedDiagram = useMemo(() => {
    if (instrument === 'piano' || !activeChord) return null;
    return getFrettedDiagram(activeChord, instrument);
  }, [instrument, activeChord]);

  const currentLine = currentLyricIndex >= 0 ? lyricLines[currentLyricIndex] : null;
  const nextLine = currentLyricIndex >= 0 ? lyricLines[currentLyricIndex + 1] ?? null : null;

  // Keep MIDI availability hint clean
  const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  useEffect(() => {
    // no-op placeholder to keep hook order stable
  }, []);

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
            Battuta {Math.floor(currentBeat / 4) + 1} / {Math.max(1, Math.ceil(totalBeats / 4))}
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
          <div className="flex flex-wrap items-end justify-center gap-x-1 gap-y-1 text-sm font-semibold">
            {currentLine.tokens.map((tok, i) => (
              <span key={i} className="inline-flex flex-col items-center">
                {tok.chord && (
                  <span
                    className="text-[11px] font-extrabold px-1.5 py-0.2 rounded mb-0.5"
                    style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                  >
                    {tok.chord}
                  </span>
                )}
                <span>{tok.text}</span>
              </span>
            ))}
          </div>
          {nextLine && (
            <div className="text-xs truncate opacity-60" style={{ color: 'var(--text-secondary)' }}>
              Prossima: {nextLine.tokens.map((t) => (t.chord ? `[${t.chord}] ` : '') + t.text).join('')}
            </div>
          )}
        </div>
      )}

      {/* Scrolling Note Highway */}
      <div
        className="relative h-32 overflow-hidden select-none cursor-pointer"
        style={{ backgroundColor: 'var(--bg-page)' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const targetBeat = Math.max(0, Math.min(totalBeats, currentBeat + (ratio - 0.18) * WINDOW_BEATS));
          onSeekBeat(targetBeat);
        }}
        title="Clicca sulla barra per saltare a una battuta"
      >
        {[20, 40, 60, 80, 100].map((top) => (
          <div
            key={top}
            className="absolute inset-x-0 border-t opacity-20"
            style={{ top: `${top}%`, borderColor: 'var(--text-secondary)' }}
          />
        ))}

        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 z-20"
          style={{
            left: '18%',
            backgroundColor: '#a98467',
            boxShadow: '0 0 10px rgba(169, 132, 103, 0.85)',
          }}
        >
          <div className="w-3 h-3 -ml-[5px] -mt-0.5 rounded-full" style={{ backgroundColor: '#a98467' }} />
        </div>

        {visibleEvents.map((ev) => {
          const leftPct = 18 + ((ev.startBeat - currentBeat) / WINDOW_BEATS) * 82;
          const widthPct = Math.max(4, (ev.durationBeats / WINDOW_BEATS) * 82 - 0.8);
          const isNow = currentBeat >= ev.startBeat && currentBeat < ev.startBeat + ev.durationBeats;
          const mainMidi = ev.midiNotes[0] ?? 60;
          const clampedMidi = Math.max(55, Math.min(84, mainMidi));
          const topPct = 76 - ((clampedMidi - 55) / 29) * 58;
          const noteLabel = midiToNoteName(mainMidi, notation).replace(/\d+$/, '');

          return (
            <div
              key={ev.id}
              className="absolute flex items-center justify-center rounded-lg px-2 font-bold text-xs shadow-sm transition-colors"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: `${topPct}%`,
                height: '26px',
                backgroundColor: isNow ? '#adc178' : '#6c584cd9',
                color: isNow ? '#3b3029' : '#f0ead2',
                transform: isNow ? 'scale(1.06)' : 'scale(1)',
                zIndex: isNow ? 15 : 10,
              }}
            >
              {ev.chord && (
                <span
                  className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold whitespace-nowrap"
                  style={{ backgroundColor: '#dde5b6', color: '#3b3029', border: '1px solid #adc178' }}
                >
                  {formatChord(ev.chord, notation)}
                </span>
              )}
              <span className="truncate">{noteLabel}</span>
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
            className="relative flex h-28 select-none overflow-x-auto rounded-lg border"
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
                <div key={midi} className="relative flex-1 min-w-[26px] h-full">
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
