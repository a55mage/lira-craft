import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { Moon, Sun } from 'lucide-react';
import type { NotationSystem } from '../types/music';
import { formatAbcChordSymbols } from '../lib/musicTheory';

interface SheetMusicPanelProps {
  abcNotation: string;
  transposeSemitones: number;
  notation: NotationSystem;
  /** Index of the `.abcjs-note` element to highlight (written order), -1 for none. */
  activeNoteIndex: number;
  showNoteLabels: boolean;
  darkSheet?: boolean;
  onToggleDarkSheet?: () => void;
}

export function SheetMusicPanel({
  abcNotation,
  transposeSemitones,
  notation,
  activeNoteIndex,
  showNoteLabels,
  darkSheet = false,
  onToggleDarkSheet,
}: SheetMusicPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !abcNotation.trim()) return;

    // Transpose the source with abcjs itself (notes, key signature and chord symbols, with
    // key-aware spelling), then localize chord names. Using visualTranspose on top of a
    // manually transposed K: line would transpose the key and chords twice.
    let transposed = abcNotation;
    if (transposeSemitones !== 0) {
      try {
        const parsed = abcjs.parseOnly(abcNotation);
        transposed = abcjs.strTranspose(abcNotation, parsed, transposeSemitones);
      } catch {
        transposed = abcNotation;
      }
    }
    const preparedAbc = formatAbcChordSymbols(transposed, notation);

    abcjs.renderAbc(el, preparedAbc, {
      responsive: 'resize',
      add_classes: true,
      staffwidth: 780,
      paddingtop: 12,
      paddingbottom: 12,
      paddingleft: 10,
      paddingright: 10,
    });

    // Optional beginner helper: annotate note heads with pitch names if enabled
    if (showNoteLabels) {
      const noteEls = el.querySelectorAll('.abcjs-note');
      noteEls.forEach((n) => {
        n.setAttribute('data-beginner', 'true');
      });
    }
  }, [abcNotation, transposeSemitones, notation, showNoteLabels]);

  // Highlight currently playing note in the SVG staff
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prev = el.querySelectorAll('.abcjs-highlight');
    prev.forEach((node) => node.classList.remove('abcjs-highlight'));

    if (activeNoteIndex >= 0) {
      const notes = el.querySelectorAll('.abcjs-note');
      const target = notes[activeNoteIndex];
      if (target) {
        target.classList.add('abcjs-highlight');
      }
    }
  }, [activeNoteIndex]);

  if (!abcNotation.trim()) {
    return (
      <div
        className="rounded-2xl border p-6 text-center text-sm"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
      >
        Questa versione non include ancora uno spartito con pentagramma (ABC). Puoi aggiungerlo dall'Editor!
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl border p-4 overflow-x-auto print-sheet transition-colors ${darkSheet ? 'sheet-dark' : ''}`}
      style={{
        backgroundColor: 'var(--sheet-bg)',
        color: 'var(--sheet-ink)',
        borderColor: 'var(--border-color)',
      }}
    >
      {onToggleDarkSheet && (
        <button
          type="button"
          onClick={onToggleDarkSheet}
          aria-pressed={darkSheet}
          aria-label={darkSheet ? 'Spartito chiaro' : 'Spartito scuro'}
          title={darkSheet ? 'Passa allo spartito chiaro' : 'Spartito scuro (meno abbagliante di sera)'}
          className="no-print absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer opacity-70 hover:opacity-100 transition"
          style={{ borderColor: 'currentColor', color: 'inherit', backgroundColor: 'transparent' }}
        >
          {darkSheet ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{darkSheet ? 'Chiaro' : 'Scuro'}</span>
        </button>
      )}
      <div ref={containerRef} className="w-full min-w-[300px]" />
    </div>
  );
}
