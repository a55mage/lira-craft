import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileJson, Mic, Moon, Music, Plus, Sparkles, Sun } from 'lucide-react';
import { db, ensureSeeded } from './db/database';
import type { NotationSystem, ReaderModules, Track } from './types/music';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { LibraryJsonModal } from './components/LibraryJsonModal';
import { TrackEditorModal } from './components/TrackEditorModal';
import { ExternalImportModal } from './components/ExternalImportModal';
import { TunerModal } from './components/TunerModal';

const PREFS_KEY = 'spartito_prefs_v1';

const DEFAULT_MODULES: ReaderModules = {
  sheet: true,
  simplyPiano: true,
  lyricsChords: true,
  chordBar: false,
  noteLabels: true,
};

function getInitialColorScheme(): 'light' | 'dark' | null {
  try {
    const val = localStorage.getItem('color-scheme');
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

export default function App() {
  const tracks = useLiveQuery(() => db.tracks.toArray(), []) ?? [];

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | undefined>(undefined);

  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [editorState, setEditorState] = useState<{ open: boolean; track: Track | null }>({
    open: false,
    track: null,
  });

  // Preferences (notation + modular panels)
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

  // Two-state color-scheme override synced with <meta name="color-scheme"> and storage events
  const [schemeOverride, setSchemeOverride] = useState<'light' | 'dark' | null>(getInitialColorScheme);

  useEffect(() => {
    void ensureSeeded();
  }, []);

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
    const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentlyDark = schemeOverride ? schemeOverride === 'dark' : systemIsDark;
    const target: 'light' | 'dark' = currentlyDark ? 'light' : 'dark';
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

  const activeTrack = activeTrackId ? tracks.find((t) => t.id === activeTrackId) ?? null : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Global Top Navbar */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md no-print"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTrackId(null)}
              className="flex items-center gap-2 font-bold text-base tracking-tight cursor-pointer shrink-0"
            >
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <Music className="w-4 h-4" />
              </span>
              <span>Spartito</span>
            </button>

            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              title="Numero totale di brani in libreria"
            >
              {tracks.length} {tracks.length === 1 ? 'brano' : 'brani'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setEditorState({ open: true, track: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer transition hover:opacity-90 shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
              title="Crea un nuovo brano"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Nuovo Brano</span>
            </button>

            <button
              type="button"
              onClick={() => setImporterOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer hover:opacity-85 shrink-0"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              title="Importa spartito da sito o file"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-warm)' }} />
              <span className="hidden lg:inline">Importa</span>
            </button>

            <button
              type="button"
              onClick={() => setJsonModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer hover:opacity-85 shrink-0"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              title="Esporta, importa o fai merge della libreria JSON"
            >
              <FileJson className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="hidden lg:inline">JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setTunerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer hover:opacity-85 shrink-0"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
              title="Apri accordatore"
            >
              <Mic className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="hidden sm:inline">Accordatore</span>
            </button>

            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label="Cambia tema chiaro/scuro"
              title="Cambia tema chiaro/scuro"
              className="p-2 rounded-xl border cursor-pointer hover:opacity-85 shrink-0"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              {schemeOverride === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {activeTrack ? (
          <ReaderView
            key={activeTrack.id}
            track={activeTrack}
            initialVersionId={activeVersionId}
            notation={notation}
            onChangeNotation={setNotation}
            modules={modules}
            onChangeModules={setModules}
            onBack={() => setActiveTrackId(null)}
            onEditTrack={(track) => setEditorState({ open: true, track })}
          />
        ) : (
          <LibraryView
            tracks={tracks}
            onOpenTrack={(id, vId) => {
              setActiveTrackId(id);
              setActiveVersionId(vId);
            }}
            onEditTrack={(track) => setEditorState({ open: true, track })}
          />
        )}
      </main>

      {/* Modals */}
      <LibraryJsonModal
        open={jsonModalOpen}
        onClose={() => setJsonModalOpen(false)}
        existingTracks={tracks}
      />

      {editorState.open && (
        <TrackEditorModal
          open={editorState.open}
          initialTrack={editorState.track}
          onClose={() => setEditorState({ open: false, track: null })}
          onSaved={(saved) => {
            setActiveTrackId(saved.id);
            setActiveVersionId(saved.versions[0]?.id);
          }}
        />
      )}

      <ExternalImportModal
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImported={(imported) => {
          setActiveTrackId(imported.id);
          setActiveVersionId(imported.versions[0]?.id);
        }}
      />

      <TunerModal open={tunerOpen} onClose={() => setTunerOpen(false)} notation={notation} />
    </div>
  );
}
