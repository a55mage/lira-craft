import Dexie, { type EntityTable } from 'dexie';
import type { Track } from '../types/music';
import { DEMO_TRACKS } from './seedData';
import { applyLibraryImport } from '../lib/libraryJson';

class SpartitoDatabase extends Dexie {
  tracks!: EntityTable<Track, 'id'>;

  constructor() {
    super('SpartitoDB');
    this.version(1).stores({
      tracks: 'id, title, artist, isFavorite, updatedAt, *tags',
    });
  }
}

export const db = new SpartitoDatabase();

const SEED_FLAG = 'spartito_seeded_v2';
const BOOKMARKS_SEED_FLAG = 'spartito_ukulele_bm_v5';
const SIMPLY_PIANO_SEED_FLAG = 'spartito_simply_piano_v2';

export async function ensureSeeded(): Promise<void> {
  const count = await db.tracks.count();
  if (count === 0 && !localStorage.getItem(SEED_FLAG)) {
    await db.tracks.bulkPut(DEMO_TRACKS);
    localStorage.setItem(SEED_FLAG, '1');
  } else if (!localStorage.getItem(SEED_FLAG)) {
    for (const demo of DEMO_TRACKS) {
      const existing = await db.tracks.get(demo.id);
      if (!existing) {
        await db.tracks.put(demo);
      }
    }
    localStorage.setItem(SEED_FLAG, '1');
  }

  if (!localStorage.getItem(BOOKMARKS_SEED_FLAG)) {
    try {
      const res = await fetch('./ukulele-bookmarks-library.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
          await db.tracks.bulkPut(data.tracks);
        }
      }
      localStorage.setItem(BOOKMARKS_SEED_FLAG, '1');
    } catch {
      // Ignore if optional bundle is unavailable
    }
  }

  if (!localStorage.getItem(SIMPLY_PIANO_SEED_FLAG)) {
    try {
      const res = await fetch('./piano-simply-library.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
          await applyLibraryImport({
            mode: 'merge',
            incomingTracks: data.tracks,
            defaultResolution: 'merge_versions',
          });
          // Also refresh defaultBpm on already-present Simply Piano tracks
          for (const t of data.tracks as Track[]) {
            const existing = await db.tracks.get(t.id);
            if (existing && t.defaultBpm) {
              await db.tracks.update(t.id, { defaultBpm: t.defaultBpm });
            }
          }
        }
      }
      localStorage.setItem(SIMPLY_PIANO_SEED_FLAG, '1');
    } catch {
      // Ignore if optional bundle is unavailable
    }
  }
}

export async function restoreDemoTracks(): Promise<void> {
  await db.tracks.bulkPut(DEMO_TRACKS);
  localStorage.setItem(SEED_FLAG, '1');
}

export async function saveTrack(track: Track): Promise<void> {
  await db.tracks.put({
    ...track,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await db.tracks.delete(id);
}

export async function toggleFavorite(id: string): Promise<void> {
  const track = await db.tracks.get(id);
  if (!track) return;
  await db.tracks.update(id, {
    isFavorite: !track.isFavorite,
    updatedAt: new Date().toISOString(),
  });
}
