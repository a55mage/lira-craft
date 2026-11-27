import { formatChord, normalizeChordToAlpha, transposeChord } from './musicTheory';
import type { NotationSystem } from '../types/music';

export interface ChordToken {
  chord?: string; // Already transposed & formatted
  rawChord?: string; // Normalized Alpha + transposed (for diagrams/audio)
  text: string;
}

export interface ParsedLine {
  type: 'section' | 'lyric' | 'empty';
  sectionTitle?: string;
  tokens: ChordToken[];
}

export function parseChordPro(
  input: string,
  transposeSemitones = 0,
  notation: NotationSystem = 'alpha'
): ParsedLine[] {
  if (!input.trim()) return [];

  return input.split('\n').map((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      return { type: 'empty', tokens: [] };
    }

    const sectionMatch = line.trim().match(/^\{(?:section|comment|c|s|soc|sov):\s*([^}]+)\}$/i);
    if (sectionMatch) {
      return { type: 'section', sectionTitle: sectionMatch[1].trim(), tokens: [] };
    }

    // Also detect plain [Verse] / [Ritornello] headers on their own line
    const bracketHeader = line.trim().match(/^\[(Intro|Verse|Strofa|Chorus|Ritornello|Bridge|Ponte|Outro|Solo|Pre-Chorus)[^\]]*\]$/i);
    if (bracketHeader) {
      return { type: 'section', sectionTitle: bracketHeader[0].slice(1, -1), tokens: [] };
    }

    const tokens: ChordToken[] = [];
    const regex = /\[([^\]]+)\]([^\[]*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ text: line.slice(lastIndex, match.index) });
      }
      const raw = transposeChord(normalizeChordToAlpha(match[1]), transposeSemitones);
      tokens.push({
        rawChord: raw,
        chord: formatChord(raw, notation),
        text: match[2],
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      tokens.push({ text: line.slice(lastIndex) });
    }

    return { type: 'lyric', tokens };
  });
}

export function extractUniqueChords(lyricsChords: string, abcNotation: string, transposeSemitones = 0): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const normalized = transposeChord(normalizeChordToAlpha(raw), transposeSemitones);
    if (!normalized || seen.has(normalized)) return;
    // Filter out section names mistakenly placed in brackets
    if (/^(intro|verse|strofa|chorus|ritornello|bridge|ponte|outro|solo)/i.test(normalized)) return;
    if (!/^[A-G][#b]?/.test(normalized)) return;
    seen.add(normalized);
    found.push(normalized);
  };

  for (const m of lyricsChords.matchAll(/\[([^\]]+)\]/g)) {
    add(m[1]);
  }
  for (const m of abcNotation.matchAll(/"([^"]+)"/g)) {
    add(m[1]);
  }

  return found;
}
