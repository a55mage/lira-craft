import { Volume2 } from 'lucide-react';
import type { Instrument, NotationSystem } from '../types/music';
import { getFrettedDiagram, STRING_LABELS } from '../lib/chordDiagrams';
import { formatChord, getChordMidiNotes } from '../lib/musicTheory';
import { audioEngine } from '../lib/audioEngine';

interface ChordDiagramCardProps {
  chord: string; // Canonical Alpha chord (already transposed)
  instrument: Instrument;
  notation: NotationSystem;
  compact?: boolean;
  isActive?: boolean;
  onSelect?: () => void;
}

export function ChordDiagramCard({
  chord,
  instrument,
  notation,
  compact = false,
  isActive = false,
  onSelect,
}: ChordDiagramCardProps) {
  const displayLabel = formatChord(chord, notation);

  const handlePlay = () => {
    audioEngine.playChord(chord, instrument);
    onSelect?.();
  };

  if (instrument === 'piano') {
    const midis = getChordMidiNotes(chord, 4);
    const activePitchClasses = new Set(midis.map((m) => m % 12));
    const whiteKeys = [0, 2, 4, 5, 7, 9, 11];
    const blackKeys: { pc: number; leftIndex: number }[] = [
      { pc: 1, leftIndex: 0 },
      { pc: 3, leftIndex: 1 },
      { pc: 6, leftIndex: 3 },
      { pc: 8, leftIndex: 4 },
      { pc: 10, leftIndex: 5 },
    ];

    return (
      <button
        type="button"
        onClick={handlePlay}
        className="group rounded-xl border p-2.5 flex flex-col items-center gap-2 transition cursor-pointer hover:shadow-sm"
        style={{
          backgroundColor: isActive ? 'var(--accent-bg)' : 'var(--bg-surface)',
          borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
          minWidth: compact ? '106px' : '136px',
        }}
        title={`Ascolta accordo ${displayLabel}`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>
            {displayLabel}
          </span>
          <Volume2 className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </div>
        <svg viewBox="0 0 140 54" className="w-full h-12">
          {whiteKeys.map((pc, i) => {
            const lit = activePitchClasses.has(pc);
            return (
              <rect
                key={pc}
                x={i * 20 + 1}
                y={1}
                width={18}
                height={52}
                rx={2}
                fill={lit ? '#adc178' : '#ffffff'}
                stroke="#a98467"
                strokeWidth={1}
              />
            );
          })}
          {blackKeys.map(({ pc, leftIndex }) => {
            const lit = activePitchClasses.has(pc);
            return (
              <rect
                key={pc}
                x={leftIndex * 20 + 13}
                y={1}
                width={13}
                height={32}
                rx={2}
                fill={lit ? '#adc178' : '#3b3029'}
                stroke="#3b3029"
                strokeWidth={0.8}
              />
            );
          })}
        </svg>
      </button>
    );
  }

  const diagram = getFrettedDiagram(chord, instrument);
  const strings = STRING_LABELS[instrument];
  const stringCount = strings.length;
  const maxFret = diagram ? Math.max(...diagram.frets.filter((f) => f > 0), 4) : 4;
  const baseFret = maxFret > 4 ? Math.min(...(diagram?.frets.filter((f) => f > 0) ?? [1])) : 1;
  const width = stringCount === 6 ? 110 : 86;
  const xStep = 16;
  const xStart = 14;
  const yStart = 20;
  const fretHeight = 14;

  return (
    <button
      type="button"
      onClick={handlePlay}
      className="group rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition cursor-pointer hover:shadow-sm"
      style={{
        backgroundColor: isActive ? 'var(--accent-bg)' : 'var(--bg-surface)',
        borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
        minWidth: compact ? '96px' : '124px',
      }}
      title={diagram?.easyNote ? `${displayLabel} — ${diagram.easyNote}` : `Ascolta ${displayLabel}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>
          {displayLabel}
        </span>
        <Volume2 className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
      </div>

      {diagram ? (
        <svg viewBox={`0 0 ${width} 86`} className="w-24 h-20">
          {/* Base fret indicator */}
          {baseFret > 1 && (
            <text x={2} y={yStart + 11} fontSize="8" fill="currentColor" opacity="0.7">
              {baseFret}fr
            </text>
          )}
          {/* Nut or top fret */}
          <line
            x1={xStart}
            y1={yStart}
            x2={xStart + (stringCount - 1) * xStep}
            y2={yStart}
            stroke="currentColor"
            strokeWidth={baseFret === 1 ? 3 : 1}
          />
          {/* Fret lines */}
          {[1, 2, 3, 4].map((f) => (
            <line
              key={f}
              x1={xStart}
              y1={yStart + f * fretHeight}
              x2={xStart + (stringCount - 1) * xStep}
              y2={yStart + f * fretHeight}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth={1}
            />
          ))}
          {/* Strings */}
          {strings.map((label, sIdx) => {
            const x = xStart + sIdx * xStep;
            const fret = diagram.frets[sIdx] ?? -1;
            return (
              <g key={sIdx}>
                <line
                  x1={x}
                  y1={yStart}
                  x2={x}
                  y2={yStart + 4 * fretHeight}
                  stroke="currentColor"
                  strokeOpacity="0.45"
                  strokeWidth={1}
                />
                {fret === -1 && (
                  <text x={x} y={yStart - 6} textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="bold">
                    ×
                  </text>
                )}
                {fret === 0 && (
                  <circle cx={x} cy={yStart - 9} r={3.2} fill="none" stroke="currentColor" strokeWidth={1.2} />
                )}
                {fret > 0 && (
                  <circle
                    cx={x}
                    cy={yStart + (fret - baseFret + 0.5) * fretHeight}
                    r={5}
                    fill="#a98467"
                  />
                )}
                <text x={x} y={84} textAnchor="middle" fontSize="7.5" fill="currentColor" opacity="0.6">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="text-[11px] py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
          Ascolta accordo
        </div>
      )}

      {!compact && diagram?.easyNote && (
        <div className="text-[10px] text-center leading-tight px-1" style={{ color: 'var(--text-secondary)' }}>
          {diagram.easyNote}
        </div>
      )}
    </button>
  );
}
