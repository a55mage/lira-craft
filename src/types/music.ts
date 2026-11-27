export type Instrument = 'piano' | 'guitar' | 'ukulele';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type NotationSystem = 'alpha' | 'latin'; // C, D, E vs Do, Re, Mi

export interface TrackVersion {
  id: string;
  name: string; // e.g., "Principiante - Solo Accordi", "Originale", "Melodia Facile"
  instrument: Instrument;
  difficulty: Difficulty;
  capo: number;
  bpmOverride?: number;
  lyricsChords: string; // ChordPro format
  abcNotation: string; // ABC notation for classical staff + Simply Piano playback
  notes?: string; // Tips for beginners
  sourceUrl?: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  originalKey: string; // e.g., "C", "Am", "G"
  defaultBpm: number;
  timeSignature: string; // e.g., "4/4", "3/4"
  tags: string[];
  isFavorite: boolean;
  versions: TrackVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryExportFile {
  schemaVersion: 1;
  appName: 'Spartito';
  exportedAt: string;
  tracks: Track[];
}

export type ImportMode = 'replace' | 'partial' | 'merge';
export type ConflictResolution = 'merge_versions' | 'overwrite' | 'keep_both' | 'skip';

export interface ReaderModules {
  sheet: boolean;
  simplyPiano: boolean;
  lyricsChords: boolean;
  chordBar: boolean;
  noteLabels: boolean;
}

export interface UserPreferences {
  notation: NotationSystem;
  modules: ReaderModules;
  autoScrollSpeed: number;
  corsProxyUrl: string;
}
