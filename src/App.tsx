import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileJson, Mic, Moon, Music, Plus, Sparkles, Sun } from 'lucide-react';
import { db, ensureSeeded } from './db/database';
import type { NotationSystem, ReaderModules, Track } from './types/music';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { TrackEditorPage } from './components/TrackEditorPage';
import { LibraryJsonModal } from './components/LibraryJsonModal';
import { ExternalImportModal } from './components/ExternalImportModal';
import { TunerModal } from './components/TunerModal';

const PREFS_KEY = 'spartito_prefs_v1';

const DEFAULT_MODULES: ReaderModules = {
  sheet: true,
  simplyPiano: true,
  lyricsChords: true,
  chordBar: false,
  noteLabels: true,
  darkSheet: false,
};

function getInitialColorScheme(): 'light' | 'dark' | null {
  try {
    const val = localStorage.getItem('color-scheme');
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

type PageView =
  | { kind: 'library' }
  | { kind: 'reader'; trackId: string; versionId?: string }
  | { kind: 'editor'; track: Track | null; returnToTrackId?: string };

export default function App() {
  const tracks = useLiveQuery(() => db.tracks.toArray(), []) ?? [];

  const [page, setPage] = useState<PageView>({ kind: 'library' });
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);

  const [notation, setNotation] = useState<NotationSystem>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return saved.notation === 'latin' ? 'latin' : 'alpha';
    } catch {
      return 'alpha';
    }
  });

  const [modules, setModules] = useState<ReaderModules>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return { ...DEFAULT_MODULES, ...(saved.modules || {}) };
    } catch {
      return DEFAULT_MODULES;
    }
  });

  const [schemeOverride, setSchemeOverride] = useState<'light' | 'dark' | null>(getInitialColorScheme);
  const [systemIsDark, setSystemIsDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const isDark = schemeOverride ? schemeOverride === 'dark' : systemIsDark;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    void ensureSeeded();
  }, []);

  // Every view change starts at the top (otherwise the reader opens scrolled to wherever the
  // library list was).
  const pageKey =
    page.kind === 'library' ? 'library' : page.kind === 'reader' ? `reader:${page.trackId}` : `editor:${page.track?.id ?? 'new'}`;
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ notation, modules }));
    } catch {
      // ignore storage errors
    }
  }, [notation, modules]);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = schemeOverride ?? 'light dark';
    }
  }, [schemeOverride]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') {
        setSchemeOverride(e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleColorScheme = () => {
    const target: 'light' | 'dark' = isDark ? 'light' : 'dark';
    const matchesSystem = (target === 'dark') === systemIsDark;

    try {
      if (matchesSystem) {
        localStorage.removeItem('color-scheme');
        setSchemeOverride(null);
      } else {
        localStorage.setItem('color-scheme', target);
        setSchemeOverride(target);
      }
    } catch {
      setSchemeOverride(target);
    }
  };

  const activeTrack =
    page.kind === 'reader' ? tracks.find((t) => t.id === page.trackId) ?? null : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Compact, Flat Top Navbar */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md no-print"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setPage({ kind: 'library' })}
              className="flex items-center gap-2 font-bold tracking-tight cursor-pointer shrink-0"
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <Music className="w-3.5 h-3.5" />
              </span>
              <span className="font-display text-base sm:text-lg tracking-tight">Lira Craft</span>
            </button>

            <span className="hidden sm:inline text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
              {tracks.length} {tracks.length === 1 ? 'brano' : 'brani'}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setPage({ kind: 'editor', track: null })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer transition hover:opacity-90 shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
              title="Crea un nuovo brano"
              aria-label="Nuovo brano"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Nuovo Brano</span>
            </button>

            <button
              type="button"
              onClick={() => setImporterOpen(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-75 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              title="Importa spartito da sito o file"
              aria-label="Importa spartito"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-warm)' }} />
              <span className="hidden md:inline">Importa</span>
            </button>

            <button
              type="button"
              onClick={() => setJsonModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-75 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              title="Backup: esporta, importa o unisci la libreria (JSON)"
              aria-label="Backup libreria"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Backup</span>
            </button>

            <button
              type="button"
              onClick={() => setTunerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-75 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              title="Apri accordatore"
              aria-label="Accordatore"
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Accordatore</span>
            </button>

            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label="Cambia tema chiaro/scuro"
              title="Cambia tema chiaro/scuro"
              className="p-1.5 rounded-lg cursor-pointer hover:opacity-75 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {isDark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main key={pageKey} className="flex-1 view-enter">
        {page.kind === 'editor' ? (
          <TrackEditorPage
            key={page.track?.id ?? 'new'}
            initialTrack={page.track}
            notation={notation}
            onCancel={() =>
              page.returnToTrackId
                ? setPage({ kind: 'reader', trackId: page.returnToTrackId })
                : setPage({ kind: 'library' })
            }
            onSaved={(saved) =>
              setPage({ kind: 'reader', trackId: saved.id, versionId: saved.versions[0]?.id })
            }
            onDeleted={() => setPage({ kind: 'library' })}
          />
        ) : page.kind === 'reader' && activeTrack ? (
          <ReaderView
            key={activeTrack.id}
            track={activeTrack}
            initialVersionId={page.versionId}
            notation={notation}
            onChangeNotation={setNotation}
            modules={modules}
            onChangeModules={setModules}
            onBack={() => setPage({ kind: 'library' })}
            onEditTrack={(track) =>
              setPage({ kind: 'editor', track, returnToTrackId: track.id })
            }
          />
        ) : (
          <LibraryView
            tracks={tracks}
            onOpenTrack={(id, vId) => setPage({ kind: 'reader', trackId: id, versionId: vId })}
            onEditTrack={(track) => setPage({ kind: 'editor', track })}
          />
        )}
      </main>

      {/* Utility Modals */}
      <LibraryJsonModal
        open={jsonModalOpen}
        onClose={() => setJsonModalOpen(false)}
        existingTracks={tracks}
      />

      <ExternalImportModal
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImported={(imported) =>
          setPage({ kind: 'reader', trackId: imported.id, versionId: imported.versions[0]?.id })
        }
      />

      <TunerModal open={tunerOpen} onClose={() => setTunerOpen(false)} notation={notation} />
    </div>
  );
}
