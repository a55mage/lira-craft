import { formatChord, normalizeChordToAlpha, transposeChord } from './musicTheory';
import type { NotationSystem } from '../types/music';

export interface ChordToken {
  chord?: string; // Already transposed & formatted
  rawChord?: string; // Normalized Alpha + transposed (for diagrams/audio)
  text: string;
}

export interface ParsedLine {
  type: 'section' | 'lyric' | 'tab' | 'empty';
  sectionTitle?: string;
  rawText?: string;
  tokens: ChordToken[];
}

const VALID_CHORD_RE =
  /^(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?(?:m|min|maj|dim|aug|sus[24]?|add\d+|7|9|11|13|6|5|maj7|m7|m9|m6|7sus4|dim7)?(?:\/(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?)?$/i;

const SECTION_KEYWORDS =
  'Intro|Verse|Strofa|Pre-Chorus|Pre-Ritornello|Chorus|Ritornello|Refrain|Bridge|Ponte|Outro|Solo|Interlude|Interludio|Instrumental|Strumentale|Coda|Hook|Tema|Ending|Finale';

const PLAIN_SECTION_RE = new RegExp(`^((?:${SECTION_KEYWORDS})(?:\\s*\\d+|\\s*[A-Z]|\\s*\\([^)]*\\))?)\\s*:\\s*(.*)$`, 'i');
const STANDALONE_SECTION_RE = new RegExp(`^((?:${SECTION_KEYWORDS})(?:\\s*\\d+|\\s*[A-Z])?)$`, 'i');
const BRACKET_SECTION_RE = new RegExp(`^\\[((?:${SECTION_KEYWORDS})[^\\]]*?)\\]:?\\s*(.*)$`, 'i');
const TAB_LINE_RE = /^\s*[A-Ga-g][#b]?\s*\|[\s\-0-9hpx/\\~^()*b|]+$/;

/**
 * Repairs common malformed ChordPro artifacts on the fly so even already-saved tracks
 * render cleanly (e.g. nested brackets like [G[F]], UG [ch]/[tab] tags, boilerplate dividers).
 */
export function sanitizeChordProLine(line: string): string {
  let s = line
    .replace(/\[\/?tab\]/gi, '')
    .replace(/\[ch\]([^\[]+)\[\/ch\]/gi, '[$1]')
    .replace(/\u00A0/g, ' ');

  // Fix accidental nested brackets like [G[F]] -> [G] [F]
  let guard = 0;
  while (/\[([^\[\]]*)\[([^\[\]]+)\]([^\[\]]*)\]/.test(s) && guard < 6) {
    s = s.replace(/\[([^\[\]]*)\[([^\[\]]+)\]([^\[\]]*)\]/g, (_m, a, b, c) => {
      const parts = [a.trim(), b.trim(), c.trim()].filter(Boolean);
      return parts.map((p) => `[${p}]`).join(' ');
    });
    guard++;
  }

  return s;
}

function isChordLinePlain(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('[')) return false;
  const parts = trimmed.split(/\s+/).filter((p) => !/^(?:\|+|x\d+|\(\d+x\)|N\.C\.)$/i.test(p));
  if (parts.length === 0) return false;
  const valid = parts.filter((p) => VALID_CHORD_RE.test(p)).length;
  return valid / parts.length >= 0.75;
}

export function parseChordPro(
  input: string,
  transposeSemitones = 0,
  notation: NotationSystem = 'alpha'
): ParsedLine[] {
  if (!input.trim()) return [];

  const rawLines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result: ParsedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = sanitizeChordProLine(rawLines[i]).trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      // Avoid consecutive empty lines
      if (result.length > 0 && result[result.length - 1].type !== 'empty') {
        result.push({ type: 'empty', tokens: [] });
      }
      continue;
    }

    // Skip Ultimate Guitar / Ukulele-Tabs ASCII comment boilerplate lines
    if (/^#[-=]{5,}#$/.test(trimmed) || /^[-=_]{8,}$/.test(trimmed) || /^#This file is the author/i.test(trimmed) || /^#song\. You may only use/i.test(trimmed)) {
      continue;
    }

    // ASCII Tablature line (e.g. A|---2--3--2--|)
    if (TAB_LINE_RE.test(line)) {
      result.push({ type: 'tab', rawText: line, tokens: [] });
      continue;
    }

    // ChordPro {section: ...} directive
    const sectionMatch = trimmed.match(/^\{(?:section|comment|c|s|soc|sov):\s*([^}]+)\}$/i);
    if (sectionMatch) {
      result.push({ type: 'section', sectionTitle: sectionMatch[1].trim(), tokens: [] });
      continue;
    }

    // Bracket section header like [Verse 1] or [Intro:] [F] [Bb]
    const bracketSec = trimmed.match(BRACKET_SECTION_RE);
    if (bracketSec) {
      const secTitle = bracketSec[1].replace(/:$/, '').trim();
      result.push({ type: 'section', sectionTitle: secTitle, tokens: [] });
      const remainder = bracketSec[2]?.trim();
      if (remainder) {
        result.push(parseLyricLine(remainder, transposeSemitones, notation));
      }
      continue;
    }

    // Plain section header like "Verse:", "Chorus:", "Intro (x2): Am G F G"
    const plainSec = trimmed.match(PLAIN_SECTION_RE);
    if (plainSec) {
      result.push({ type: 'section', sectionTitle: plainSec[1].trim(), tokens: [] });
      const remainder = plainSec[2]?.trim();
      if (remainder) {
        if (isChordLinePlain(remainder)) {
          const bracketed = remainder
            .split(/\s+/)
            .map((p) => (VALID_CHORD_RE.test(p) ? `[${p}]` : p))
            .join('  ');
          result.push(parseLyricLine(bracketed, transposeSemitones, notation));
        } else {
          result.push(parseLyricLine(remainder, transposeSemitones, notation));
        }
      }
      continue;
    }

    // Standalone section word like "Chorus" or "Verse 1"
    const standaloneSec = trimmed.match(STANDALONE_SECTION_RE);
    if (standaloneSec) {
      result.push({ type: 'section', sectionTitle: standaloneSec[1].trim(), tokens: [] });
      continue;
    }

    // Unparsed plain chord line above lyrics (if an already-saved track wasn't converted)
    if (isChordLinePlain(line)) {
      const nextRaw = rawLines[i + 1];
      if (
        nextRaw !== undefined &&
        nextRaw.trim() &&
        !isChordLinePlain(nextRaw) &&
        !TAB_LINE_RE.test(nextRaw) &&
        !nextRaw.includes('[') &&
        !PLAIN_SECTION_RE.test(nextRaw.trim()) &&
        !BRACKET_SECTION_RE.test(nextRaw.trim())
      ) {
        const merged = mergeChordsAboveLyric(line, nextRaw);
        result.push(parseLyricLine(merged, transposeSemitones, notation));
        i++;
        continue;
      } else {
        const bracketed = trimmed
          .split(/\s+/)
          .map((p) => (VALID_CHORD_RE.test(p) ? `[${p}]` : p))
          .join('  ');
        result.push(parseLyricLine(bracketed, transposeSemitones, notation));
        continue;
      }
    }

    result.push(parseLyricLine(line, transposeSemitones, notation));
  }

  return result;
}

export function mergeChordsAboveLyric(chordLine: string, lyricLine: string): string {
  const matches: { index: number; chord: string }[] = [];
  for (const m of chordLine.matchAll(/\S+/g)) {
    if (m.index !== undefined && VALID_CHORD_RE.test(m[0])) {
      matches.push({ index: m.index, chord: normalizeChordToAlpha(m[0]) });
    }
  }
  if (matches.length === 0) return lyricLine;

  // Separate in-range chords and trailing chords so trailing chords never nest inside each other!
  const inRange = matches.filter((m) => m.index < lyricLine.length);
  const trailing = matches.filter((m) => m.index >= lyricLine.length);

  let merged = lyricLine;
  for (let k = inRange.length - 1; k >= 0; k--) {
    const { index, chord } = inRange[k];
    merged = `${merged.slice(0, index)}[${chord}]${merged.slice(index)}`;
  }

  if (trailing.length > 0) {
    merged = `${merged} ${trailing.map((t) => `[${t.chord}]`).join(' ')}`;
  }

  return merged;
}

function parseLyricLine(
  line: string,
  transposeSemitones: number,
  notation: NotationSystem
): ParsedLine {
  const tokens: ChordToken[] = [];
  const regex = /\[([^\]]+)\]([^\[]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index) });
    }
    const bracketContent = match[1].trim();
    const trailingText = match[2];

    if (VALID_CHORD_RE.test(bracketContent)) {
      const raw = transposeChord(normalizeChordToAlpha(bracketContent), transposeSemitones);
      tokens.push({
        rawChord: raw,
        chord: formatChord(raw, notation),
        text: trailingText,
      });
    } else {
      // Non-chord bracket like [x2] or [N.C.] — keep as plain text
      tokens.push({ text: `[${bracketContent}]${trailingText}` });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex) });
  }

  return { type: 'lyric', tokens };
}

export function extractUniqueChords(lyricsChords: string, abcNotation: string, transposeSemitones = 0): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const cleaned = raw.trim();
    if (!VALID_CHORD_RE.test(cleaned)) return;
    const normalized = transposeChord(normalizeChordToAlpha(cleaned), transposeSemitones);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    found.push(normalized);
  };

  const sanitized = lyricsChords
    .split('\n')
    .map(sanitizeChordProLine)
    .join('\n');

  for (const m of sanitized.matchAll(/\[([^\]]+)\]/g)) {
    add(m[1]);
  }
  for (const m of abcNotation.matchAll(/"([^"]+)"/g)) {
    add(m[1]);
  }

  return found;
}
