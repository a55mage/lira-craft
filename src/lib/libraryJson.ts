import type {
  ConflictResolution,
  ImportMode,
  LibraryExportFile,
  Track,
  TrackVersion,
} from '../types/music';
import { db } from '../db/database';

export function buildExportPayload(tracks: Track[]): LibraryExportFile {
  return {
    schemaVersion: 1,
    appName: 'Lira Craft',
    exportedAt: new Date().toISOString(),
    tracks,
  };
}

export function downloadLibraryJson(tracks: Track[], filenamePrefix = 'lira-craft-library'): void {
  const payload = buildExportPayload(tracks);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseLibraryJson(rawText: string): Track[] {
  const parsed = JSON.parse(rawText);
  let tracks: unknown[] = [];

  if (Array.isArray(parsed)) {
    tracks = parsed;
  } else if (parsed && Array.isArray(parsed.tracks)) {
    tracks = parsed.tracks;
  } else {
    throw new Error('Formato JSON non valido: manca l\'array "tracks".');
  }

  return tracks.map((item, idx) => normalizeTrack(item, idx));
}

function normalizeTrack(raw: unknown, idx: number): Track {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Brano #${idx + 1} non valido.`);
  }
  const obj = raw as Record<string, unknown>;
  const now = new Date().toISOString();
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id : crypto.randomUUID();
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : `Brano senza titolo ${idx + 1}`;
  const artist = typeof obj.artist === 'string' ? obj.artist.trim() : 'Sconosciuto';

  const rawVersions = Array.isArray(obj.versions) ? obj.versions : [];
  const versions: TrackVersion[] = rawVersions.map((v, vIdx) => {
    const vo = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const inst = vo.instrument === 'piano' || vo.instrument === 'guitar' || vo.instrument === 'ukulele'
      ? vo.instrument
      : 'guitar';
    const diff = vo.difficulty === 'beginner' || vo.difficulty === 'intermediate' || vo.difficulty === 'advanced'
      ? vo.difficulty
      : 'beginner';
    return {
      id: typeof vo.id === 'string' && vo.id.trim() ? vo.id : crypto.randomUUID(),
      name: typeof vo.name === 'string' && vo.name.trim() ? vo.name.trim() : `Versione ${vIdx + 1}`,
      instrument: inst,
      difficulty: diff,
      capo: typeof vo.capo === 'number' && Number.isFinite(vo.capo) ? vo.capo : 0,
      bpmOverride: typeof vo.bpmOverride === 'number' ? vo.bpmOverride : undefined,
      lyricsChords: typeof vo.lyricsChords === 'string' ? vo.lyricsChords : '',
      abcNotation: typeof vo.abcNotation === 'string' ? vo.abcNotation : '',
      notes: typeof vo.notes === 'string' ? vo.notes : undefined,
      sourceUrl: typeof vo.sourceUrl === 'string' ? vo.sourceUrl : undefined,
      updatedAt: typeof vo.updatedAt === 'string' ? vo.updatedAt : now,
    };
  });

  if (versions.length === 0) {
    versions.push({
      id: crypto.randomUUID(),
      name: 'Principiante',
      instrument: 'guitar',
      difficulty: 'beginner',
      capo: 0,
      lyricsChords: '',
      abcNotation: '',
      updatedAt: now,
    });
  }

  return {
    id,
    title,
    artist,
    originalKey: typeof obj.originalKey === 'string' && obj.originalKey.trim() ? obj.originalKey.trim() : 'C',
    defaultBpm: typeof obj.defaultBpm === 'number' && obj.defaultBpm > 20 ? obj.defaultBpm : 100,
    timeSignature: typeof obj.timeSignature === 'string' && obj.timeSignature.trim() ? obj.timeSignature.trim() : '4/4',
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : [],
    isFavorite: Boolean(obj.isFavorite),
    versions,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : now,
  };
}

export interface MergeAnalysisItem {
  incoming: Track;
  existing?: Track;
  matchedBy?: 'id' | 'title_artist';
}

function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function analyzeMerge(incomingTracks: Track[], existingTracks: Track[]): MergeAnalysisItem[] {
  const byId = new Map(existingTracks.map((t) => [t.id, t]));
  const bySignature = new Map(
    existingTracks.map((t) => [`${normalizeKey(t.title)}::${normalizeKey(t.artist)}`, t])
  );

  return incomingTracks.map((incoming) => {
    const idMatch = byId.get(incoming.id);
    if (idMatch) {
      return { incoming, existing: idMatch, matchedBy: 'id' };
    }
    const sigMatch = bySignature.get(`${normalizeKey(incoming.title)}::${normalizeKey(incoming.artist)}`);
    if (sigMatch) {
      return { incoming, existing: sigMatch, matchedBy: 'title_artist' };
    }
    return { incoming };
  });
}

export interface ApplyImportOptions {
  mode: ImportMode;
  incomingTracks: Track[];
  /** For 'partial': map of trackId -> set of selected versionIds */
  selectedVersionIdsByTrack?: Record<string, string[]>;
  /** For 'merge': resolution per incoming trackId (or default fallback) */
  conflictResolutions?: Record<string, ConflictResolution>;
  defaultResolution?: ConflictResolution;
}

export interface ImportSummary {
  addedTracks: number;
  updatedTracks: number;
  mergedVersions: number;
  skippedTracks: number;
}

export async function applyLibraryImport(options: ApplyImportOptions): Promise<ImportSummary> {
  const { mode, incomingTracks, selectedVersionIdsByTrack, conflictResolutions, defaultResolution = 'merge_versions' } = options;
  const existingTracks = await db.tracks.toArray();
  const summary: ImportSummary = {
    addedTracks: 0,
    updatedTracks: 0,
    mergedVersions: 0,
    skippedTracks: 0,
  };

  if (mode === 'replace') {
    await db.transaction('rw', db.tracks, async () => {
      await db.tracks.clear();
      await db.tracks.bulkPut(incomingTracks);
    });
    summary.addedTracks = incomingTracks.length;
    return summary;
  }

  // Filter incoming tracks/versions if partial mode
  const filteredIncoming: Track[] =
    mode === 'partial' && selectedVersionIdsByTrack
      ? incomingTracks
          .map((track) => {
            const pickedIds = selectedVersionIdsByTrack[track.id];
            if (!pickedIds || pickedIds.length === 0) return null;
            const pickedVersions = track.versions.filter((v) => pickedIds.includes(v.id));
            if (pickedVersions.length === 0) return null;
            return { ...track, versions: pickedVersions };
          })
          .filter((t): t is Track => t !== null)
      : incomingTracks;

  const analysis = analyzeMerge(filteredIncoming, existingTracks);
  const toPut: Track[] = [];

  for (const item of analysis) {
    if (!item.existing) {
      toPut.push(item.incoming);
      summary.addedTracks++;
      continue;
    }

    const resolution = conflictResolutions?.[item.incoming.id] ?? defaultResolution;

    if (resolution === 'skip') {
      summary.skippedTracks++;
      continue;
    }

    if (resolution === 'overwrite') {
      toPut.push({
        ...item.incoming,
        id: item.existing.id,
        updatedAt: new Date().toISOString(),
      });
      summary.updatedTracks++;
      continue;
    }

    if (resolution === 'keep_both') {
      toPut.push({
        ...item.incoming,
        id: crypto.randomUUID(),
        title: `${item.incoming.title} (Importato)`,
        versions: item.incoming.versions.map((v) => ({ ...v, id: crypto.randomUUID() })),
        updatedAt: new Date().toISOString(),
      });
      summary.addedTracks++;
      continue;
    }

    // merge_versions: keep existing track and add any new versions not already present
    const existingVersionIds = new Set(item.existing.versions.map((v) => v.id));
    const existingVersionNames = new Set(
      item.existing.versions.map((v) => `${v.instrument}::${normalizeKey(v.name)}`)
    );
    const mergedVersionsList = [...item.existing.versions];
    let addedCount = 0;

    for (const v of item.incoming.versions) {
      const sig = `${v.instrument}::${normalizeKey(v.name)}`;
      if (!existingVersionIds.has(v.id) && !existingVersionNames.has(sig)) {
        mergedVersionsList.push(v);
        addedCount++;
      }
    }

    const mergedTags = Array.from(new Set([...item.existing.tags, ...item.incoming.tags]));
    toPut.push({
      ...item.existing,
      tags: mergedTags,
      versions: mergedVersionsList,
      updatedAt: new Date().toISOString(),
    });
    summary.updatedTracks++;
    summary.mergedVersions += addedCount;
  }

  if (toPut.length > 0) {
    await db.tracks.bulkPut(toPut);
  }

  return summary;
}
