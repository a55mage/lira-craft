import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Copy,
  Edit3,
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

interface LibraryViewProps {
  tracks: Track[];
  onOpenTrack: (trackId: string, versionId?: string) => void;
  onEditTrack: (track: Track) => void;
}

type SortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'artist_asc';
type ViewMode = 'compact_cards' | 'list';

const INSTRUMENT_BADGE: Record<Instrument, string> = {
  piano: '🎹 Piano',
  guitar: '🎸 Chitarra',
  ukulele: '🏝️ Ukulele',
};

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
  const [viewMode, setViewMode] = useState<ViewMode>('compact_cards');

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
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">
      {/* Compact Toolbar: Search, Filters, Sort, View Mode */}
      <div className="flex flex-col lg:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-secondary)' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca titolo, artista o tag..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value as Instrument | 'all')}
            aria-label="Filtra per strumento"
            className="px-2.5 py-2 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="all">Tutti gli strumenti</option>
            <option value="piano">🎹 Piano</option>
            <option value="guitar">🎸 Chitarra</option>
            <option value="ukulele">🏝️ Ukulele</option>
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as Difficulty | 'all')}
            aria-label="Filtra per difficoltà"
            className="px-2.5 py-2 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="all">Tutte le difficoltà</option>
            <option value="beginner">Principiante</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzato</option>
          </select>

          <div className="relative inline-flex items-center">
            <ArrowUpDown
              className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
              style={{ color: 'var(--text-secondary)' }}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Ordina brani"
              className="pl-8 pr-3 py-2 rounded-xl border text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-color)',
              }}
            >
              <option value="date_desc">Data aggiunta (Recenti)</option>
              <option value="date_asc">Data aggiunta (Meno recenti)</option>
              <option value="title_asc">Titolo (A–Z)</option>
              <option value="artist_asc">Artista (A–Z)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: onlyFavorites ? 'var(--accent-bg)' : 'var(--bg-surface)',
              borderColor: onlyFavorites ? 'var(--accent)' : 'var(--border-color)',
              color: onlyFavorites ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            <Heart className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
            Preferiti
          </button>

          {/* View Mode Toggle: Compact Cards vs List */}
          <div
            className="inline-flex rounded-xl p-0.5 border"
            style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
          >
            <button
              type="button"
              onClick={() => setViewMode('compact_cards')}
              aria-label="Visualizzazione card compatte"
              title="Card compatte"
              className="p-1.5 rounded-lg transition cursor-pointer"
              style={{
                backgroundColor: viewMode === 'compact_cards' ? 'var(--bg-surface)' : 'transparent',
                color: viewMode === 'compact_cards' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Visualizzazione lista"
              title="Lista"
              className="p-1.5 rounded-lg transition cursor-pointer"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--bg-surface)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results count when filtering */}
      {(query || instrumentFilter !== 'all' || difficultyFilter !== 'all' || onlyFavorites) && (
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Mostrati <strong>{filteredAndSorted.length}</strong> di {tracks.length} brani
        </div>
      )}

      {/* Empty state */}
      {filteredAndSorted.length === 0 ? (
        <div
          className="rounded-2xl border p-10 text-center space-y-3"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
        >
          <Music className="w-10 h-10 mx-auto opacity-40" />
          <div className="font-semibold">Nessun brano trovato</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Modifica i filtri, aggiungi un nuovo brano dalla barra in alto oppure ripristina i brani demo.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={restoreDemoTracks}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                borderColor: 'var(--border-color)',
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Ripristina Brani Demo
            </button>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div
          className="rounded-2xl border divide-y overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
        >
          {filteredAndSorted.map((track) => {
            const instruments = Array.from(new Set(track.versions.map((v) => v.instrument)));
            return (
              <div
                key={track.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:opacity-95 transition"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(track.id)}
                    aria-label={track.isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    className="p-1 rounded cursor-pointer shrink-0"
                    style={{ color: track.isFavorite ? '#a98467' : 'var(--text-muted)' }}
                  >
                    <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenTrack(track.id)}
                    className="text-left min-w-0 flex-1 group cursor-pointer"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-semibold text-sm truncate group-hover:underline">
                        {track.title}
                      </span>
                      <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
                        — {track.artist}
                      </span>
                    </div>
                    <div className="text-[11px] sm:hidden truncate" style={{ color: 'var(--text-secondary)' }}>
                      {track.artist}
                    </div>
                  </button>
                </div>

                {/* Metadata & quick versions */}
                <div className="hidden md:flex items-center gap-1.5 shrink-0 text-[11px]">
                  {instruments.map((inst) => (
                    <span
                      key={inst}
                      className="px-2 py-0.5 rounded-md font-medium"
                      style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
                    >
                      {INSTRUMENT_BADGE[inst]}
                    </span>
                  ))}
                  <span
                    className="px-2 py-0.5 rounded-md font-medium"
                    style={{ backgroundColor: 'var(--bg-surface-2)' }}
                  >
                    {track.originalKey} · {track.defaultBpm} BPM
                  </span>
                  <span className="px-2 py-0.5 rounded-md" style={{ color: 'var(--text-muted)' }}>
                    {track.versions.length} ver.
                  </span>
                </div>

                {/* Row Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenTrack(track.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Apri
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditTrack(track)}
                    title="Modifica"
                    aria-label="Modifica brano"
                    className="p-1.5 rounded-lg cursor-pointer hover:opacity-75"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(track)}
                    title="Duplica"
                    aria-label="Duplica brano"
                    className="p-1.5 rounded-lg cursor-pointer hover:opacity-75 hidden sm:inline-flex"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(track)}
                    title="Elimina"
                    aria-label="Elimina brano"
                    className="p-1.5 rounded-lg cursor-pointer hover:text-red-500"
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
        /* COMPACT CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredAndSorted.map((track) => {
            const instruments = Array.from(new Set(track.versions.map((v) => v.instrument)));
            return (
              <div
                key={track.id}
                className="rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition hover:shadow-sm"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenTrack(track.id)}
                      className="text-left group cursor-pointer min-w-0"
                    >
                      <h2 className="font-semibold text-sm leading-snug group-hover:underline truncate">
                        {track.title}
                      </h2>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {track.artist}
                      </p>
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

                  {/* Compact Meta Pills */}
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span
                      className="px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: 'var(--bg-surface-2)' }}
                    >
                      {track.originalKey} · {track.defaultBpm} BPM
                    </span>
                    {instruments.map((inst) => (
                      <span
                        key={inst}
                        className="px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                      >
                        {INSTRUMENT_BADGE[inst]}
                      </span>
                    ))}
                  </div>

                  {/* Compact Version Pills */}
                  <div className="flex flex-wrap gap-1">
                    {track.versions.slice(0, 3).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onOpenTrack(track.id, v.id)}
                        className="max-w-full truncate px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
                        title={`${v.name} (${DIFFICULTY_LABEL[v.difficulty]})`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Footer */}
                <div
                  className="flex items-center justify-between pt-2 border-t"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenTrack(track.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Apri
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onEditTrack(track)}
                      title="Modifica brano e versioni"
                      aria-label="Modifica brano"
                      className="p-1 rounded-lg cursor-pointer hover:opacity-75"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(track)}
                      title="Duplica brano"
                      aria-label="Duplica brano"
                      className="p-1 rounded-lg cursor-pointer hover:opacity-75"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(track)}
                      title="Elimina brano"
                      aria-label="Elimina brano"
                      className="p-1 rounded-lg cursor-pointer hover:text-red-500"
                      style={{ color: 'var(--text-secondary)' }}
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
