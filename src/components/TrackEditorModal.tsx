import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { Difficulty, Instrument, Track, TrackVersion } from '../types/music';
import { saveTrack } from '../db/database';
import { ModalDialog } from './ModalDialog';

interface TrackEditorModalProps {
  open: boolean;
  onClose: () => void;
  initialTrack?: Track | null;
  onSaved?: (track: Track) => void;
}

function createEmptyVersion(index = 1): TrackVersion {
  return {
    id: crypto.randomUUID(),
    name: index === 1 ? 'Principiante' : `Versione ${index}`,
    instrument: 'guitar',
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

const QUICK_CHORDS = ['C', 'G', 'Am', 'F', 'D', 'Em', 'A', 'E', 'Dm', 'G7'];

export function TrackEditorModal({ open, onClose, initialTrack, onSaved }: TrackEditorModalProps) {
  const [draft, setDraft] = useState<Track>(() =>
    initialTrack ? structuredClone(initialTrack) : createEmptyTrack()
  );
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [tagsText, setTagsText] = useState(() => (initialTrack?.tags ?? []).join(', '));

  const currentVersion = draft.versions[activeVersionIdx] ?? draft.versions[0];

  const updateVersion = (patch: Partial<TrackVersion>) => {
    setDraft((prev) => ({
      ...prev,
      versions: prev.versions.map((v, idx) =>
        idx === activeVersionIdx ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v
      ),
    }));
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
    onSaved?.(cleaned);
    onClose();
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialTrack ? `Modifica: ${initialTrack.title}` : 'Crea Nuovo Brano'}
      subtitle="Gestisci i dettagli del brano e aggiungi più versioni per difficoltà o strumento"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* Track Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Titolo *</label>
            <input
              type="text"
              required
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Es. Let It Be"
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Artista</label>
            <input
              type="text"
              value={draft.artist}
              onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
              placeholder="Es. The Beatles"
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Tonalità</label>
            <input
              type="text"
              value={draft.originalKey}
              onChange={(e) => setDraft({ ...draft, originalKey: e.target.value })}
              placeholder="C, Am, G..."
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">BPM</label>
            <input
              type="number"
              min={30}
              max={240}
              value={draft.defaultBpm}
              onChange={(e) => setDraft({ ...draft, defaultBpm: Number(e.target.value) || 100 })}
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tempo</label>
            <select
              value={draft.timeSignature}
              onChange={(e) => setDraft({ ...draft, timeSignature: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
              <option value="2/4">2/4</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tag (virgola)</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="Pop, Facile"
              className="w-full px-3 py-2 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
          </div>
        </div>

        {/* Version Tabs */}
        <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Versioni della Traccia ({draft.versions.length})
            </span>
            <button
              type="button"
              onClick={addVersion}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi Versione
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {draft.versions.map((v, idx) => (
              <div
                key={v.id}
                className="inline-flex items-center rounded-xl border overflow-hidden text-xs"
                style={{
                  borderColor: idx === activeVersionIdx ? 'var(--accent)' : 'var(--border-color)',
                  backgroundColor: idx === activeVersionIdx ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveVersionIdx(idx)}
                  className="px-3 py-1.5 font-medium cursor-pointer"
                >
                  {v.name || `Versione ${idx + 1}`}
                </button>
                {draft.versions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVersion(idx)}
                    aria-label="Rimuovi versione"
                    className="pr-2 pl-1 py-1.5 opacity-60 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {currentVersion && (
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Nome Versione</label>
                  <input
                    type="text"
                    value={currentVersion.name}
                    onChange={(e) => updateVersion({ name: e.target.value })}
                    placeholder="Es. Principiante Ukulele"
                    className="w-full px-3 py-1.5 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Strumento</label>
                  <select
                    value={currentVersion.instrument}
                    onChange={(e) => updateVersion({ instrument: e.target.value as Instrument })}
                    className="w-full px-3 py-1.5 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  >
                    <option value="piano">🎹 Piano</option>
                    <option value="guitar">🎸 Chitarra</option>
                    <option value="ukulele">🏝️ Ukulele</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Difficoltà</label>
                  <select
                    value={currentVersion.difficulty}
                    onChange={(e) => updateVersion({ difficulty: e.target.value as Difficulty })}
                    className="w-full px-3 py-1.5 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  >
                    <option value="beginner">Principiante</option>
                    <option value="intermediate">Intermedio</option>
                    <option value="advanced">Avanzato</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Consiglio per principianti (opzionale)</label>
                <input
                  type="text"
                  value={currentVersion.notes ?? ''}
                  onChange={(e) => updateVersion({ notes: e.target.value })}
                  placeholder="Es. Ritmica Giù-Giù-Su-Su-Giù-Su"
                  className="w-full px-3 py-1.5 rounded-lg border text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-medium">Testo & Accordi (ChordPro)</label>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_CHORDS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          updateVersion({
                            lyricsChords: `${currentVersion.lyricsChords}${currentVersion.lyricsChords.endsWith(' ') ? '' : ' '}[${c}]`,
                          })
                        }
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer"
                        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                      >
                        +{c}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={currentVersion.lyricsChords}
                  onChange={(e) => updateVersion({ lyricsChords: e.target.value })}
                  className="w-full p-3 rounded-lg border font-mono text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Spartito Classico & Player (Notazione ABC)
                </label>
                <textarea
                  rows={5}
                  value={currentVersion.abcNotation}
                  onChange={(e) => updateVersion({ abcNotation: e.target.value })}
                  className="w-full p-3 rounded-lg border font-mono text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--bg-surface-2)' }}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Save className="w-4 h-4" />
            Salva Brano
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
