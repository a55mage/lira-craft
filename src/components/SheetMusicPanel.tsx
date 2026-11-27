import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { NotationSystem } from '../types/music';
import { transposeAbcChordsAndKey } from '../lib/musicTheory';

interface SheetMusicPanelProps {
  abcNotation: string;
  transposeSemitones: number;
  notation: NotationSystem;
  activeEventIndex: number;
  showNoteLabels: boolean;
}

export function SheetMusicPanel({
  abcNotation,
  transposeSemitones,
  notation,
  activeEventIndex,
  showNoteLabels,
}: SheetMusicPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !abcNotation.trim()) return;

    const preparedAbc = transposeAbcChordsAndKey(abcNotation, transposeSemitones, notation);

    abcjs.renderAbc(el, preparedAbc, {
      responsive: 'resize',
      visualTranspose: transposeSemitones,
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

    if (activeEventIndex >= 0) {
      const notes = el.querySelectorAll('.abcjs-note');
      const target = notes[activeEventIndex];
      if (target) {
        target.classList.add('abcjs-highlight');
      }
    }
  }, [activeEventIndex]);

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
      className="rounded-2xl border p-4 overflow-x-auto print-sheet"
      style={{
        backgroundColor: 'var(--sheet-bg)',
        color: 'var(--sheet-ink)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div ref={containerRef} className="w-full min-w-[300px]" />
    </div>
  );
}
