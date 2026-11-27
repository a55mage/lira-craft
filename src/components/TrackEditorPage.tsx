import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  ImagePlus,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Difficulty, Instrument, NotationSystem, Track, TrackVersion } from '../types/music';
import { deleteTrack, saveTrack } from '../db/database';
import { parseChordPro } from '../lib/chordPro';
import { TrackCover } from './InstrumentIcon';

interface TrackEditorPageProps {
  initialTrack: Track | null;
  notation: NotationSystem;
  onCancel: () => void;
  onSaved: (track: Track) => void;
  onDeleted?: () => void;
}

function createEmptyVersion(index = 1): TrackVersion {
  return {
    id: crypto.randomUUID(),
    name: index === 1 ? 'Principiante' : `Versione ${index}`,
    instrument: 'ukulele',
    difficulty: 'beginner',
    capo: 0,
    lyricsChords: `{section: Strofa}\n[C]Inserisci qui il testo [G]con gli accordi\n[Am]tra parentesi [F]quadre`,
    abcNotation: `X:1\nT:Nuovo Spartito\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n"C"C E G c | "G"B G D B, | "Am"A, C E A | "F"F4 |]`,
    notes: '',
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyTrack(): Track {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '',
    artist: '',
    originalKey: 'C',
    defaultBpm: 100,
    timeSignature: '4/4',
    tags: [],
    isFavorite: false,
    versions: [createEmptyVersion(1)],
    createdAt: now,
    updatedAt: now,
  };
}

const QUICK_SECTIONS = ['Intro', 'Strofa', 'Ritornello', 'Bridge', 'Outro'];
const QUICK_CHORDS = ['C', 'G', 'Am', 'F', 'D', 'Em', 'A', 'E', 'Dm', 'Bb', 'G7', 'C7', 'Am7', 'Em7'];
const QUICK_ABC_TOKENS = [
  { label: 'Do (C)', value: 'C ' },
  { label: 'Re (D)', value: 'D ' },
  { label: 'Mi (E)', value: 'E ' },
  { label: 'Fa (F)', value: 'F ' },
  { label: 'Sol (G)', value: 'G ' },
  { label: 'La (A)', value: 'A ' },
  { label: 'Si (B)', value: 'B ' },
  { label: 'Do↑ (c)', value: 'c ' },
  { label: 'Diesis (^)', value: '^' },
  { label: 'Bemolle (_)', value: '_' },
  { label: 'Croma (/2)', value: '/2 ' },
  { label: 'Minima (2)', value: '2 ' },
  { label: 'Semibreve (4)', value: '4 ' },
  { label: 'Pausa (z)', value: 'z ' },
  { label: 'Battuta (|)', value: ' | ' },
  { label: 'Ritornello (|:)', value: ' |: ' },
  { label: 'Fine (|])', value: ' |]' },
  { label: 'Accordo ("C")', value: '"C"' },
];

async function resizeImageToBase64(imgSource: string | File): Promise<string> {
  const url = typeof imgSource === 'string' ? imgSource : URL.createObjectURL(imgSource);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Impossibile caricare l\'immagine'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 88;
    canvas.height = 88;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    // Center-crop square
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 88, 88);
    return canvas.toDataURL('image/jpeg', 0.68);
  } finally {
    if (typeof imgSource !== 'string') URL.revokeObjectURL(url);
  }
}

export function TrackEditorPage({
  initialTrack,
  notation,
  onCancel,
  onSaved,
  onDeleted,
}: TrackEditorPageProps) {
  const [draft, setDraft] = useState<Track>(() =>
    initialTrack ? structuredClone(initialTrack) : createEmptyTrack()
  );
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [tagsText, setTagsText] = useState(() => (initialTrack?.tags ?? []).join(', '));
  const [showPreview, setShowPreview] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverMsg, setCoverMsg] = useState<string | null>(null);

  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const abcRef = useRef<HTMLTextAreaElement>(null);

  const currentVersion = draft.versions[activeVersionIdx] ?? draft.versions[0];

  const previewLines = useMemo(() => {
    if (!showPreview || !currentVersion) return [];
    return parseChordPro(currentVersion.lyricsChords, 0, notation);
  }, [showPreview, currentVersion, notation]);

  const updateVersion = (patch: Partial<TrackVersion>) => {
    setDraft((prev) => ({
      ...prev,
      versions: prev.versions.map((v, idx) =>
        idx === activeVersionIdx ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v
      ),
    }));
  };

  const insertAtCursor = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    field: 'lyricsChords' | 'abcNotation',
    snippet: string
  ) => {
    const el = ref.current;
    const currentText = currentVersion[field];
    if (!el) {
      updateVersion({ [field]: currentText + snippet });
      return;
    }
    const start = el.selectionStart ?? currentText.length;
    const end = el.selectionEnd ?? currentText.length;
    const next = currentText.slice(0, start) + snippet + currentText.slice(end);
    updateVersion({ [field]: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const addVersion = () => {
    const next = createEmptyVersion(draft.versions.length + 1);
    setDraft((prev) => ({ ...prev, versions: [...prev.versions, next] }));
    setActiveVersionIdx(draft.versions.length);
  };

  const removeVersion = (idx: number) => {
    if (draft.versions.length <= 1) return;
    setDraft((prev) => ({
      ...prev,
      versions: prev.versions.filter((_, i) => i !== idx),
    }));
    setActiveVersionIdx((prev) => Math.max(0, prev - 1));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverLoading(true);
    setCoverMsg(null);
    try {
      const b64 = await resizeImageToBase64(file);
      setDraft((prev) => ({ ...prev, coverArt: b64 }));
    } catch {
      setCoverMsg('Impossibile leggere il file immagine.');
    } finally {
      setCoverLoading(false);
      e.target.value = '';
    }
  };

  const handleAutoFetchCover = async () => {
    if (!draft.title.trim()) {
      setCoverMsg('Inserisci prima il titolo del brano.');
      return;
    }
    setCoverLoading(true);
    setCoverMsg(null);
    try {
      const q = `${draft.title} ${draft.artist}`.trim();
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`
      );
      const data = await res.json();
      const artUrl = data?.results?.[0]?.artworkUrl100;
      if (!artUrl) {
        setCoverMsg('Nessuna copertina trovata per questo brano.');
        return;
      }
      const b64 = await resizeImageToBase64(artUrl);
      setDraft((prev) => ({ ...prev, coverArt: b64 }));
    } catch {
      setCoverMsg('Errore nel recupero della copertina (puoi caricarne una dal dispositivo).');
    } finally {
      setCoverLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: Track = {
      ...draft,
      title: draft.title.trim() || 'Brano senza titolo',
      artist: draft.artist.trim() || 'Sconosciuto',
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
    await saveTrack(cleaned);
    onSaved(cleaned);
  };

  const handleDelete = async () => {
    if (!initialTrack) return;
    if (!window.confirm(`Vuoi eliminare "${initialTrack.title}"?`)) return;
    await deleteTrack(initialTrack.id);
    onDeleted?.();
  };

  const tabTemplate =
    currentVersion?.instrument === 'guitar'
      ? '\ne|----------------|\nB|----------------|\nG|----------------|\nD|----------------|\nA|----------------|\nE|----------------|\n'
      : '\nA|----------------|\nE|----------------|\nC|----------------|\nG|----------------|\n';

  return (
    <form onSubmit={handleSave} className="max-w-6xl mx-auto px-4 py-4 space-y-5 animate-fade-up">
      {/* Top Action Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Indietro"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl font-bold truncate">
            {initialTrack ? `Modifica: ${draft.title || initialTrack.title}` : 'Nuovo Brano'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {initialTrack && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:text-red-500"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Trash2 className="w-4 h-4" />
              Elimina
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer transition hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Save className="w-4 h-4" />
            Salva Brano
          </button>
        </div>
      </div>

      {/* Metadata + Album Cover Row */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
        {/* Cover Art Picker */}
        <div className="flex md:flex-col items-center gap-3">
          <TrackCover
            coverArt={draft.coverArt}
            title={draft.title || 'Nuovo'}
            instrument={currentVersion?.instrument ?? 'ukulele'}
            size="lg"
          />
          <div className="flex flex-wrap md:flex-col gap-1.5 text-xs">
            <label
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer font-medium hover:opacity-80"
              style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Carica foto
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleAutoFetchCover}
              disabled={coverLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer font-medium hover:opacity-80 disabled:opacity-50"
              style={{ color: 'var(--accent)' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {coverLoading ? 'Ricerca...' : 'Cerca auto'}
            </button>
            {draft.coverArt && (
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, coverArt: undefined }))}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] cursor-pointer hover:text-red-500"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3" /> Rimuovi
              </button>
            )}
          </div>
          {coverMsg && <p className="text-[11px] max-w-[140px] text-center" style={{ color: 'var(--text-muted)' }}>{coverMsg}</p>}
        </div>

        {/* Track Fields */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Titolo *
              </label>
              <input
                type="text"
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Es. Let It Be"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Artista
              </label>
              <input
                type="text"
                value={draft.artist}
                onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
                placeholder="Es. The Beatles"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Tonalità
              </label>
              <input
                type="text"
                value={draft.originalKey}
                onChange={(e) => setDraft({ ...draft, originalKey: e.target.value })}
                placeholder="C, Am, G..."
                className="w-full px-3 py-1.5 rounded-xl border text-sm font-mono"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                BPM
              </label>
              <input
                type="number"
                min={30}
                max={240}
                value={draft.defaultBpm}
                onChange={(e) => setDraft({ ...draft, defaultBpm: Number(e.target.value) || 100 })}
                className="w-full px-3 py-1.5 rounded-xl border text-sm font-mono"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Tempo
              </label>
              <select
                value={draft.timeSignature}
                onChange={(e) => setDraft({ ...draft, timeSignature: e.target.value })}
                className="w-full px-3 py-1.5 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              >
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
                <option value="2/4">2/4</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Tag (virgola)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Pop, Facile"
                className="w-full px-3 py-1.5 rounded-xl border text-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Version Selector Strip (Clean underline tabs, no nested cards) */}
      <div className="space-y-4 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {draft.versions.map((v, idx) => {
              const active = idx === activeVersionIdx;
              return (
                <div
                  key={v.id}
                  className="inline-flex items-center gap-1 border-b-2 transition"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveVersionIdx(idx)}
                    className="px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  >
                    {v.name || `Versione ${idx + 1}`}
                  </button>
                  {draft.versions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVersion(idx)}
                      aria-label="Rimuovi versione"
                      className="pr-1.5 opacity-60 hover:text-red-500 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addVersion}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold cursor-pointer hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Nuova versione
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            style={{ color: showPreview ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? 'Nascondi anteprima' : 'Anteprima live'}
          </button>
        </div>

        {currentVersion && (
          <div className="space-y-4">
            {/* Version metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Nome Versione
                </label>
                <input
                  type="text"
                  value={currentVersion.name}
                  onChange={(e) => updateVersion({ name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border text-sm"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Strumento
                </label>
                <select
                  value={currentVersion.instrument}
                  onChange={(e) => updateVersion({ instrument: e.target.value as Instrument })}
                  className="w-full px-3 py-1.5 rounded-xl border text-sm"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                >
                  <option value="piano">Piano</option>
                  <option value="guitar">Chitarra</option>
                  <option value="ukulele">Ukulele</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Difficoltà
                </label>
                <select
                  value={currentVersion.difficulty}
                  onChange={(e) => updateVersion({ difficulty: e.target.value as Difficulty })}
                  className="w-full px-3 py-1.5 rounded-xl border text-sm"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                >
                  <option value="beginner">Principiante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzato</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Nota di studio (opzionale)
                </label>
                <input
                  type="text"
                  value={currentVersion.notes ?? ''}
                  onChange={(e) => updateVersion({ notes: e.target.value })}
                  placeholder="Es. Ritmica Giù-Giù-Su..."
                  className="w-full px-3 py-1.5 rounded-xl border text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                />
              </div>
            </div>

            {/* Editors Grid (Lyrics+Chords & ABC) */}
            <div className={`grid gap-5 ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-4">
                {/* Lyrics + Chords Editor with Quick Insert Bar */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                      Testo & Accordi (ChordPro)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {QUICK_SECTIONS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => insertAtCursor(lyricsRef, 'lyricsChords', `\n{section: ${sec}}\n`)}
                          className="px-1.5 py-0.5 rounded font-medium cursor-pointer hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          +{sec}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => insertAtCursor(lyricsRef, 'lyricsChords', tabTemplate)}
                        className="px-1.5 py-0.5 rounded font-medium cursor-pointer hover:underline"
                        style={{ color: 'var(--accent-warm)' }}
                      >
                        +Tab
                      </button>
                    </div>
                  </div>

                  {/* Quick Chords Bar */}
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-[11px] mr-1" style={{ color: 'var(--text-muted)' }}>
                      Accordi:
                    </span>
                    {QUICK_CHORDS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => insertAtCursor(lyricsRef, 'lyricsChords', `[${c}]`)}
                        className="px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] cursor-pointer transition hover:opacity-80"
                        style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  <textarea
                    ref={lyricsRef}
                    rows={12}
                    value={currentVersion.lyricsChords}
                    onChange={(e) => updateVersion({ lyricsChords: e.target.value })}
                    className="w-full p-3.5 rounded-xl border font-mono text-xs leading-relaxed"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  />
                </div>

                {/* ABC Sheet Music Editor with Quick Insert Bar */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Spartito Classico & Player (Notazione ABC)
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_ABC_TOKENS.map((tok) => (
                      <button
                        key={tok.label}
                        type="button"
                        onClick={() => insertAtCursor(abcRef, 'abcNotation', tok.value)}
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                      >
                        {tok.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={abcRef}
                    rows={7}
                    value={currentVersion.abcNotation}
                    onChange={(e) => updateVersion({ abcNotation: e.target.value })}
                    className="w-full p-3.5 rounded-xl border font-mono text-xs leading-relaxed"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Optional Live Preview Panel */}
              {showPreview && (
                <div
                  className="rounded-xl border p-4 music-paper space-y-2 max-h-[680px] overflow-y-auto"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider pb-2 border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                    Anteprima Testo & Accordi
                  </div>
                  {previewLines.map((line, i) => {
                    if (line.type === 'empty') return <div key={i} className="h-2" />;
                    if (line.type === 'section') {
                      return (
                        <div key={i} className="text-xs font-bold uppercase tracking-wider pt-2" style={{ color: 'var(--accent)' }}>
                          {line.sectionTitle}
                        </div>
                      );
                    }
                    if (line.type === 'tab') {
                      return (
                        <pre key={i} className="font-mono text-xs overflow-x-auto">
                          {line.rawText}
                        </pre>
                      );
                    }
                    return (
                      <div key={i} className="flex flex-wrap items-end leading-snug text-sm">
                        {line.tokens.map((tok, j) => (
                          <span key={j} className="inline-flex flex-col items-start">
                            {tok.chord ? (
                              <span className="text-xs font-extrabold mr-1" style={{ color: 'var(--accent)' }}>
                                {tok.chord}
                              </span>
                            ) : (
                              <span className="h-4" />
                            )}
                            <span className="whitespace-pre-wrap">{tok.text || '\u00A0'}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
