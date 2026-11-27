import { useState } from 'react';
import { ClipboardPaste, FileMusic, Globe, Sparkles } from 'lucide-react';
import type { Instrument, Track } from '../types/music';
import { importMidiFile, importMusicXmlFile, parseSmartText } from '../lib/importers';
import { saveTrack } from '../db/database';
import { ModalDialog } from './ModalDialog';

interface ExternalImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (track: Track) => void;
}

export function ExternalImportModal({ open, onClose, onImported }: ExternalImportModalProps) {
  const [tab, setTab] = useState<'paste' | 'file' | 'url'>('paste');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [rawText, setRawText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAndSave = async (
    result: ReturnType<typeof parseSmartText>,
    sourceUrl?: string
  ) => {
    const now = new Date().toISOString();
    const track: Track = {
      id: crypto.randomUUID(),
      title: title.trim() || result.title || 'Brano Importato',
      artist: artist.trim() || result.artist || 'Sconosciuto',
      originalKey: result.key || 'C',
      defaultBpm: result.bpm || 100,
      timeSignature: '4/4',
      tags: ['Importato'],
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
      versions: [
        {
          id: crypto.randomUUID(),
          name: 'Versione Importata',
          instrument,
          difficulty: 'beginner',
          capo: 0,
          lyricsChords: result.lyricsChords,
          abcNotation: result.abcNotation,
          sourceUrl,
          updatedAt: now,
        },
      ],
    };
    await saveTrack(track);
    onImported(track);
    onClose();
  };

  const handleSmartPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    setError(null);
    const parsed = parseSmartText(rawText);
    await createAndSave(parsed);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
        const res = await importMidiFile(file);
        await createAndSave(res);
      } else if (lower.endsWith('.xml') || lower.endsWith('.musicxml') || lower.endsWith('.mxl')) {
        const res = await importMusicXmlFile(file);
        await createAndSave(res);
      } else if (lower.endsWith('.abc')) {
        const abcText = await file.text();
        const tMatch = abcText.match(/^T:\s*(.+)$/m);
        await createAndSave({
          title: tMatch?.[1]?.trim() || file.name.replace(/\.abc$/i, ''),
          abcNotation: abcText,
          lyricsChords: '{section: Spartito ABC}\nUsa la vista Spartito Classico o Simply Piano.',
        });
      } else {
        const text = await file.text();
        const res = parseSmartText(text);
        await createAndSave({ ...res, title: res.title || file.name.replace(/\.[^.]+$/, '') });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante l\'importazione del file.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(urlInput.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Strip HTML tags if it's a web page
      const plain = /<html|<body|<pre/i.test(text)
        ? new DOMParser().parseFromString(text, 'text/html').body.innerText
        : text;
      const parsed = parseSmartText(plain);
      await createAndSave(parsed, urlInput.trim());
    } catch (err) {
      setError(
        `Il sito di destinazione blocca le richieste dirette dal browser (CORS su GitHub Pages). Copia il testo/accordi dalla pagina e usa la scheda "Smart Paste" qui accanto! (${err instanceof Error ? err.message : ''})`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Importa Spartito da Siti o File"
      subtitle="Supporta Copia-Incolla da Ultimate Guitar/UkuTabs, file MusicXML, MIDI, ChordPro, ABC e link diretti"
    >
      <div className="space-y-4">
        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'paste', label: 'Smart Paste', icon: ClipboardPaste },
              { id: 'file', label: 'File (.xml/.mid)', icon: FileMusic },
              { id: 'url', label: 'Da URL', icon: Globe },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer transition"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-surface-2)',
                  color: active ? '#ffffff' : 'var(--text-primary)',
                }}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Common fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo (opzionale)"
            className="px-3 py-2 rounded-xl border text-xs"
            style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
          />
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artista (opzionale)"
            className="px-3 py-2 rounded-xl border text-xs"
            style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
          />
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
            aria-label="Strumento principale"
            className="px-3 py-2 rounded-xl border text-xs"
            style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
          >
            <option value="guitar">🎸 Chitarra</option>
            <option value="ukulele">🏝️ Ukulele</option>
            <option value="piano">🎹 Piano</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            {error}
          </div>
        )}

        {tab === 'paste' && (
          <form onSubmit={handleSmartPasteSubmit} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Copia testo e accordi da qualsiasi sito (Ultimate Guitar, UkuTabs, Accordiespartiti, ecc.) e incollali qui sotto: gli accordi sopra le righe (sia <code>C/G/Am</code> che <code>Do/Sol/Lam</code>) vengono convertiti automaticamente!
            </p>
            <textarea
              rows={8}
              required
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Esempio:\n[Strofa]\nC                G\nNel blu dipinto di blu\nAm              F\nfelice di stare lassù...`}
              className="w-full p-3 rounded-xl border font-mono text-xs"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <Sparkles className="w-4 h-4" />
                Converti e Importa
              </button>
            </div>
          </form>
        )}

        {tab === 'file' && (
          <label
            className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed cursor-pointer text-center"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
          >
            <FileMusic className="w-8 h-8" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold">
              {loading ? 'Elaborazione file...' : 'Seleziona un file musicale'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Formati supportati: <code>.xml</code>, <code>.mxl</code> (MusicXML), <code>.mid</code> (MIDI),{' '}
              <code>.cho</code>/<code>.pro</code> (ChordPro), <code>.abc</code>, <code>.txt</code>
            </span>
            <input
              type="file"
              accept=".xml,.musicxml,.mxl,.mid,.midi,.cho,.pro,.abc,.txt"
              onChange={handleFileImport}
              className="hidden"
            />
          </label>
        )}

        {tab === 'url' && (
          <form onSubmit={handleUrlImport} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Inserisci un link diretto a un file ChordPro/testo/ABC pubblico (es. GitHub Raw o Gist). Se un sito blocca CORS, usa la scheda Smart Paste.
            </p>
            <input
              type="url"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../song.cho"
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
              style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {loading ? 'Scaricamento...' : 'Importa da URL'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalDialog>
  );
}
