import { Midi } from '@tonejs/midi';
import JSZip from 'jszip';
import { normalizeChordToAlpha } from './musicTheory';
import { mergeChordsAboveLyric, sanitizeChordProLine } from './chordPro';

const CHORD_TOKEN_RE =
  /^(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?(?:m|min|maj|dim|aug|sus[24]?|add\d+|7|9|11|13|6|5|maj7|m7|m9)?(?:\/(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?)?$/i;

function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return false;
  const validCount = parts.filter((p) => CHORD_TOKEN_RE.test(p)).length;
  return validCount / parts.length >= 0.7;
}

export interface SmartImportResult {
  title?: string;
  artist?: string;
  key?: string;
  bpm?: number;
  lyricsChords: string;
  abcNotation: string;
}

/**
 * Smart Paste converter: converts text copied from Ultimate Guitar, UkuTabs, Accordiespartiti,
 * or ChordPro files into clean ChordPro + a simple chord-progression ABC staff.
 */
export function parseSmartText(rawText: string): SmartImportResult {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let title: string | undefined;
  let artist: string | undefined;
  let key: string | undefined;
  let bpm: number | undefined;

  // Check if already ChordPro
  const hasInlineChords = /\[[A-Ga-g][#b]?[^\]]*\]/.test(rawText);
  const outLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Extract ChordPro directives if present
    const titleDir = trimmed.match(/^\{(?:title|t):\s*([^}]+)\}$/i);
    if (titleDir) {
      title = titleDir[1].trim();
      continue;
    }
    const artistDir = trimmed.match(/^\{(?:artist|subtitle|st):\s*([^}]+)\}$/i);
    if (artistDir) {
      artist = artistDir[1].trim();
      continue;
    }
    const keyDir = trimmed.match(/^\{key:\s*([^}]+)\}$/i);
    if (keyDir) {
      key = normalizeChordToAlpha(keyDir[1].trim());
      continue;
    }
    const tempoDir = trimmed.match(/^\{(?:tempo|bpm):\s*(\d+)\}$/i);
    if (tempoDir) {
      bpm = Number(tempoDir[1]);
      continue;
    }

    // Section headers like [Verse 1], [Ritornello], Verse:, Chorus:
    const bracketSec = trimmed.match(/^\[((?:Intro|Verse|Strofa|Chorus|Ritornello|Bridge|Ponte|Outro|Solo|Pre-Chorus)[^\]]*?)\]:?$/i);
    if (bracketSec) {
      outLines.push(`{section: ${bracketSec[1].trim()}}`);
      continue;
    }
    const plainSec = trimmed.match(/^((?:Intro|Verse|Strofa|Chorus|Ritornello|Bridge|Ponte|Outro|Solo|Pre-Chorus)(?:\s*\d+)?)\s*:\s*$/i);
    if (plainSec) {
      outLines.push(`{section: ${plainSec[1].trim()}}`);
      continue;
    }

    if (hasInlineChords) {
      outLines.push(
        sanitizeChordProLine(line).replace(/\[([^\]]+)\]/g, (_m, c) =>
          CHORD_TOKEN_RE.test(c.trim()) ? `[${normalizeChordToAlpha(c)}]` : `[${c}]`
        )
      );
      continue;
    }

    // Chords-above-lyrics format (Ultimate Guitar / UkuTabs style)
    if (isChordLine(line)) {
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && nextLine.trim() && !isChordLine(nextLine)) {
        outLines.push(mergeChordsAboveLyric(line, nextLine));
        i++; // skip consumed lyric line
      } else {
        // Standalone chord progression line (e.g. Intro)
        const chords = trimmed
          .split(/\s+/)
          .map((c) => (CHORD_TOKEN_RE.test(c) ? `[${normalizeChordToAlpha(c)}]` : c))
          .join('  ');
        outLines.push(chords);
      }
      continue;
    }

    outLines.push(line);
  }

  const lyricsChords = outLines.join('\n').trim();
  const abcNotation = generateBasicAbcFromChords(lyricsChords, title || 'Brano Importato', key || 'C', bpm || 100);

  return { title, artist, key, bpm, lyricsChords, abcNotation };
}

function generateBasicAbcFromChords(lyricsChords: string, title: string, key: string, bpm: number): string {
  const chords: string[] = [];
  for (const m of lyricsChords.matchAll(/\[([^\]]+)\]/g)) {
    const c = m[1];
    if (/^[A-G][#b]?/.test(c)) {
      chords.push(c);
    }
  }
  if (chords.length === 0) return '';

  const bars = chords.slice(0, 32).map((c) => `"${c}"C4`);
  const lines: string[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    lines.push(bars.slice(i, i + 4).join(' | ') + ' |');
  }

  return `X:1\nT:${title}\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:${key}\n${lines.join('\n')}]`;
}

function midiNumberToAbcPitch(midi: number): string {
  const names = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  let note = names[pitchClass];
  if (octave <= 4) {
    const commas = ','.repeat(4 - octave);
    return `${note}${commas}`;
  } else {
    note = note.toLowerCase();
    const apostrophes = "'".repeat(octave - 5);
    return `${note}${apostrophes}`;
  }
}

/**
 * Import standard MIDI (.mid) file client-side and convert melody to ABC notation.
 */
export async function importMidiFile(file: File): Promise<SmartImportResult> {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  const title = midi.name || file.name.replace(/\.(mid|midi)$/i, '');
  const bpm = Math.round(midi.header.tempos[0]?.bpm || 100);

  // Pick track with the most notes
  const mainTrack = [...midi.tracks].sort((a, b) => b.notes.length - a.notes.length)[0];
  if (!mainTrack || mainTrack.notes.length === 0) {
    throw new Error('Nessuna nota trovata nel file MIDI.');
  }

  const secondsPerQuarter = 60 / bpm;
  const notes = mainTrack.notes.slice(0, 128);
  const abcNotes: string[] = [];
  let beatsInBar = 0;

  for (const n of notes) {
    const pitch = midiNumberToAbcPitch(n.midi);
    const quarters = Math.max(0.5, Math.round((n.duration / secondsPerQuarter) * 2) / 2);
    const durSuffix = quarters === 1 ? '' : quarters === 0.5 ? '/2' : quarters === 2 ? '2' : quarters >= 4 ? '4' : '';
    abcNotes.push(`${pitch}${durSuffix}`);
    beatsInBar += Math.min(quarters, 4);
    if (beatsInBar >= 4) {
      abcNotes.push('|');
      beatsInBar = 0;
    }
  }

  const abcNotation = `X:1\nT:${title}\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:C\n${abcNotes.join(' ')} |]`;
  return {
    title,
    bpm,
    key: 'C',
    lyricsChords: `{section: Importato da MIDI}\n[C]Usa la vista Spartito o Simply Piano per suonare la melodia importata.`,
    abcNotation,
  };
}

/**
 * Import MusicXML (.xml or compressed .mxl) client-side into ABC notation.
 */
export async function importMusicXmlFile(file: File): Promise<SmartImportResult> {
  let xmlText = '';
  if (file.name.toLowerCase().endsWith('.mxl')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xmlEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.endsWith('.xml') && !f.name.includes('META-INF')
    );
    if (!xmlEntry) throw new Error('Archivio .mxl non contiene un file MusicXML valido.');
    xmlText = await xmlEntry.async('text');
  } else {
    xmlText = await file.text();
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const title =
    doc.querySelector('work-title')?.textContent?.trim() ||
    doc.querySelector('movement-title')?.textContent?.trim() ||
    file.name.replace(/\.(xml|musicxml|mxl)$/i, '');

  const measures = Array.from(doc.querySelectorAll('part measure')).slice(0, 32);
  const barStrings: string[] = [];

  for (const measure of measures) {
    const tokens: string[] = [];
    const harmony = measure.querySelector('harmony root-step')?.textContent?.trim();
    if (harmony) {
      const kind = measure.querySelector('harmony kind')?.textContent?.trim();
      const minor = kind === 'minor' ? 'm' : '';
      tokens.push(`"${harmony}${minor}"`);
    }
    const notes = Array.from(measure.querySelectorAll('note'));
    for (const noteEl of notes) {
      if (noteEl.querySelector('chord')) continue; // skip simultaneous chord tones for simple melody
      if (noteEl.querySelector('rest')) {
        tokens.push('z');
        continue;
      }
      const step = noteEl.querySelector('pitch step')?.textContent?.trim();
      const octave = Number(noteEl.querySelector('pitch octave')?.textContent || 4);
      const alter = Number(noteEl.querySelector('pitch alter')?.textContent || 0);
      if (!step) continue;

      const acc = alter === 1 ? '^' : alter === -1 ? '_' : '';
      let pitch = octave <= 4 ? `${acc}${step}${','.repeat(4 - octave)}` : `${acc}${step.toLowerCase()}${"'".repeat(octave - 5)}`;
      const type = noteEl.querySelector('type')?.textContent?.trim();
      if (type === 'eighth') pitch += '/2';
      else if (type === 'half') pitch += '2';
      else if (type === 'whole') pitch += '4';
      tokens.push(pitch);
    }
    if (tokens.length > 0) {
      barStrings.push(tokens.join(' '));
    }
  }

  if (barStrings.length === 0) {
    throw new Error('Nessuna battuta trovata nel file MusicXML.');
  }

  const lines: string[] = [];
  for (let i = 0; i < barStrings.length; i += 4) {
    lines.push(barStrings.slice(i, i + 4).join(' | ') + ' |');
  }

  const abcNotation = `X:1\nT:${title}\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n${lines.join('\n')}]`;
  return {
    title,
    bpm: 100,
    key: 'C',
    lyricsChords: `{section: Importato da MusicXML}\n[C]Spartito importato con successo.`,
    abcNotation,
  };
}
