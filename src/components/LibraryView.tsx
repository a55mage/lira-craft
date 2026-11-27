import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Copy,
  Edit3,
  Grid2x2,
  Heart,
  LayoutGrid,
  List,
  Music,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import type { Difficulty, Instrument, Track } from '../types/music';
import { deleteTrack, restoreDemoTracks, saveTrack, toggleFavorite } from '../db/database';
import { INSTRUMENT_NAME, TrackCover } from './InstrumentIcon';

interface LibraryViewProps {
  tracks: Track[];
  onOpenTrack: (trackId: string, versionId?: string) => void;
  onEditTrack: (track: Track) => void;
}

type SortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'artist_asc';
type ViewMode = 'minimal_cards' | 'compact_cards' | 'list';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};

export function LibraryView({ tracks, onOpenTrack, onEditTrack }: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState<Instrument | 'all'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'all'>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('minimal_cards');

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tracks.filter((t) => {
      if (onlyFavorites && !t.isFavorite) return false;
      if (instrumentFilter !== 'all' && !t.versions.some((v) => v.instrument === instrumentFilter)) {
        return false;
      }
      if (difficultyFilter !== 'all' && !t.versions.some((v) => v.difficulty === difficultyFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'date_desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'date_asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'artist_asc') {
        return a.artist.localeCompare(b.artist, 'it') || a.title.localeCompare(b.title, 'it');
      }
      return a.title.localeCompare(b.title, 'it');
    });
  }, [tracks, query, instrumentFilter, difficultyFilter, onlyFavorites, sortBy]);

  const handleDuplicate = async (track: Track) => {
    const now = new Date().toISOString();
    await saveTrack({
      ...track,
      id: crypto.randomUUID(),
      title: `${track.title} (Copia)`,
      versions: track.versions.map((v) => ({ ...v, id: crypto.randomUUID(), updatedAt: now })),
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleDelete = async (track: Track) => {
    if (!window.confirm(`Vuoi eliminare "${track.title}" e tutte le sue ${track.versions.length} versioni?`)) {
      return;
    }
    await deleteTrack(track.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-3 space-y-3 animate-fade-up">
      {/* Compact Flat Toolbar */}
      <div
        className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 pb-2.5 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="relative flex-1">
          <Search
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca titolo, artista o tag..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-sm transition focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value as Instrument | 'all')}
            aria-label="Filtra per strumento"
            className="px-2 py-1.5 rounded-lg bg-transparent font-medium cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <option value="all">Tutti gli strumenti</option>
            <option value="piano">Piano</option>
            <option value="guitar">Chitarra</option>
            <option value="ukulele">Ukulele</option>
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as Difficulty | 'all')}
            aria-label="Filtra per difficoltà"
            className="px-2 py-1.5 rounded-lg bg-transparent font-medium cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <option value="all">Difficoltà: tutte</option>
            <option value="beginner">Principiante</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzato</option>
          </select>

          <div className="relative inline-flex items-center">
            <ArrowUpDown
              className="w-3.5 h-3.5 absolute left-1.5 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Ordina brani"
              className="pl-6 pr-2 py-1.5 rounded-lg bg-transparent font-medium cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <option value="date_desc">Recenti</option>
              <option value="date_asc">Meno recenti</option>
              <option value="title_asc">Titolo A–Z</option>
              <option value="artist_asc">Artista A–Z</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg font-medium cursor-pointer transition"
            style={{
              color: onlyFavorites ? 'var(--accent)' : 'var(--text-secondary)',
              backgroundColor: onlyFavorites ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            <Heart className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
            Preferiti
          </button>

          {/* View Mode Icons */}
          <div className="inline-flex items-center gap-0.5 pl-2 border-l" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setViewMode('minimal_cards')}
              aria-label="Card essenziali"
              title="Card essenziali"
              className="p-1.5 rounded-lg cursor-pointer"
              style={{
                color: viewMode === 'minimal_cards' ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: viewMode === 'minimal_cards' ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <Grid2x2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact_cards')}
              aria-label="Card con dettagli"
              title="Card con dettagli"
              className="p-1.5 rounded-lg cursor-pointer"
              style={{
                color: viewMode === 'compact_cards' ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: viewMode === 'compact_cards' ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Lista"
              title="Lista"
              className="p-1.5 rounded-lg cursor-pointer"
              style={{
                color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: viewMode === 'list' ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {(query || instrumentFilter !== 'all' || difficultyFilter !== 'all' || onlyFavorites) && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Mostrati <strong>{filteredAndSorted.length}</strong> di {tracks.length} brani
        </div>
      )}

      {/* Empty state */}
      {filteredAndSorted.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <Music className="w-9 h-9 mx-auto opacity-35" />
          <div className="font-display font-semibold text-base">Nessun brano trovato</div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Modifica i filtri o ripristina i brani demo.
          </p>
          <button
            type="button"
            onClick={restoreDemoTracks}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--bg-surface-2)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ripristina Brani Demo
          </button>
        </div>
      ) : viewMode === 'minimal_cards' ? (
        /* ULTRA-COMPACT MINIMAL CARDS */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filteredAndSorted.map((track) => {
            const primaryInst = track.versions[0]?.instrument ?? 'ukulele';
            return (
              <div
                key={track.id}
                className="rounded-xl border p-2 flex items-center gap-2.5 music-paper transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <button
                  type="button"
                  onClick={() => onOpenTrack(track.id)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                >
                  <TrackCover
                    coverArt={track.coverArt}
                    title={track.title}
                    instrument={primaryInst}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display font-semibold text-sm leading-tight truncate group-hover:underline">
                      {track.title}
                    </h2>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {track.artist}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(track.id)}
                  aria-label={track.isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                  className="p-1 rounded cursor-pointer shrink-0"
                  style={{ color: track.isFavorite ? '#a98467' : 'var(--text-muted)' }}
                >
                  <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'list' ? (
        /* CLEAN FLAT LIST VIEW (No nested pills) */
        <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
          {filteredAndSorted.map((track) => {
            const primaryInst = track.versions[0]?.instrument ?? 'ukulele';
            const instruments = Array.from(new Set(track.versions.map((v) => INSTRUMENT_NAME[v.instrument]))).join(', ');
            return (
              <div
                key={track.id}
                className="flex items-center justify-between gap-3 py-2 px-1 transition hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <TrackCover
                    coverArt={track.coverArt}
                    title={track.title}
                    instrument={primaryInst}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenTrack(track.id)}
                    className="text-left min-w-0 flex-1 group cursor-pointer"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-display font-semibold text-sm truncate group-hover:underline">
                        {track.title}
                      </span>
                      <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
                        {track.artist}
                      </span>
                    </div>
                    <div className="text-[11px] sm:hidden truncate" style={{ color: 'var(--text-secondary)' }}>
                      {track.artist}
                    </div>
                  </button>
                </div>

                <div className="hidden md:flex items-center gap-3 shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>{instruments}</span>
                  <span className="font-mono">{track.originalKey} · {track.defaultBpm}</span>
                  <span>{track.versions.length} ver.</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(track.id)}
                    aria-label="Preferito"
                    className="p-1.5 cursor-pointer"
                    style={{ color: track.isFavorite ? '#a98467' : 'var(--text-muted)' }}
                  >
                    <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditTrack(track)}
                    title="Modifica"
                    aria-label="Modifica brano"
                    className="p-1.5 cursor-pointer hover:opacity-75"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(track)}
                    title="Duplica"
                    aria-label="Duplica brano"
                    className="p-1.5 cursor-pointer hover:opacity-75 hidden sm:inline-flex"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(track)}
                    title="Elimina"
                    aria-label="Elimina brano"
                    className="p-1.5 cursor-pointer hover:text-red-500"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* COMPACT CARDS WITH DETAILS (Clean text hierarchy, zero nested pills) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredAndSorted.map((track) => {
            const primaryInst = track.versions[0]?.instrument ?? 'ukulele';
            const instruments = Array.from(new Set(track.versions.map((v) => INSTRUMENT_NAME[v.instrument]))).join(' · ');
            return (
              <div
                key={track.id}
                className="rounded-xl border p-3 flex flex-col justify-between gap-2 transition-colors music-paper"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2.5">
                    <TrackCover
                      coverArt={track.coverArt}
                      title={track.title}
                      instrument={primaryInst}
                      size="md"
                    />
                    <button
                      type="button"
                      onClick={() => onOpenTrack(track.id)}
                      className="text-left group cursor-pointer min-w-0 flex-1"
                    >
                      <h2 className="font-display font-semibold text-sm leading-snug group-hover:underline truncate">
                        {track.title}
                      </h2>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {track.artist}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(track.id)}
                      aria-label="Preferito"
                      className="p-0.5 cursor-pointer shrink-0"
                      style={{ color: track.isFavorite ? '#a98467' : 'var(--text-muted)' }}
                    >
                      <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Clean plain-text metadata */}
                  <div className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-mono">{track.originalKey}</span>
                    <span>·</span>
                    <span className="font-mono">{track.defaultBpm} BPM</span>
                    <span>·</span>
                    <span className="truncate">{instruments}</span>
                  </div>

                  {/* Clean inline version links */}
                  {track.versions.length > 1 && (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
                      {track.versions.slice(0, 3).map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => onOpenTrack(track.id, v.id)}
                          className="truncate max-w-full cursor-pointer hover:underline"
                          style={{ color: 'var(--accent)' }}
                          title={`${v.name} (${DIFFICULTY_LABEL[v.difficulty]})`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="flex items-center justify-between pt-1.5 border-t text-xs"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenTrack(track.id)}
                    className="font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    Apri spartito
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTrack(track)}
                      title="Modifica"
                      aria-label="Modifica brano"
                      className="p-1 cursor-pointer hover:opacity-75"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(track)}
                      title="Duplica"
                      aria-label="Duplica brano"
                      className="p-1 cursor-pointer hover:opacity-75"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(track)}
                      title="Elimina"
                      aria-label="Elimina brano"
                      className="p-1 cursor-pointer hover:text-red-500"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
