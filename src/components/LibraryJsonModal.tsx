import { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileJson,
  GitMerge,
  Globe,
  RefreshCw,
  Square,
  Upload,
} from 'lucide-react';
import type { ConflictResolution, ImportMode, Track } from '../types/music';
import {
  analyzeMerge,
  applyLibraryImport,
  downloadLibraryJson,
  parseLibraryJson,
  type ImportSummary,
} from '../lib/libraryJson';
import { ModalDialog } from './ModalDialog';

interface LibraryJsonModalProps {
  open: boolean;
  onClose: () => void;
  existingTracks: Track[];
}

export function LibraryJsonModal({ open, onClose, existingTracks }: LibraryJsonModalProps) {
  const [tab, setTab] = useState<'export' | 'import'>('import');

  // Export state
  const [exportSelectedIds, setExportSelectedIds] = useState<string[]>(() =>
    existingTracks.map((t) => t.id)
  );

  // Import state
  const [incomingTracks, setIncomingTracks] = useState<Track[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [defaultResolution, setDefaultResolution] = useState<ConflictResolution>('merge_versions');
  const [perTrackResolution, setPerTrackResolution] = useState<Record<string, ConflictResolution>>({});
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string[]>>({});
  const [backupBeforeReplace, setBackupBeforeReplace] = useState(true);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const mergeAnalysis = useMemo(() => {
    if (!incomingTracks) return [];
    return analyzeMerge(incomingTracks, existingTracks);
  }, [incomingTracks, existingTracks]);

  const conflictCount = useMemo(
    () => mergeAnalysis.filter((m) => m.existing).length,
    [mergeAnalysis]
  );

  const handleLoadJsonText = (text: string) => {
    try {
      const parsed = parseLibraryJson(text);
      setIncomingTracks(parsed);
      setImportError(null);
      setSummary(null);
      // Pre-select all tracks and versions for partial mode
      const initialSelection: Record<string, string[]> = {};
      for (const t of parsed) {
        initialSelection[t.id] = t.versions.map((v) => v.id);
      }
      setSelectedVersions(initialSelection);
      setPerTrackResolution({});
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Errore nel parsing del file JSON.');
      setIncomingTracks(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleLoadJsonText(text);
    e.target.value = '';
  };

  const handleFetchUrl = async () => {
    if (!remoteUrl.trim()) return;
    setLoadingUrl(true);
    setImportError(null);
    try {
      const res = await fetch(remoteUrl.trim());
      if (!res.ok) throw new Error(`Errore HTTP ${res.status}`);
      const text = await res.text();
      handleLoadJsonText(text);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? `Impossibile scaricare l'URL (verifica che supporti CORS, es. GitHub raw/Gist): ${err.message}`
          : 'Errore nel caricamento da URL.'
      );
    } finally {
      setLoadingUrl(false);
    }
  };

  const togglePartialVersion = (trackId: string, versionId: string) => {
    setSelectedVersions((prev) => {
      const current = prev[trackId] ?? [];
      const exists = current.includes(versionId);
      return {
        ...prev,
        [trackId]: exists ? current.filter((id) => id !== versionId) : [...current, versionId],
      };
    });
  };

  const togglePartialTrackAll = (track: Track) => {
    setSelectedVersions((prev) => {
      const current = prev[track.id] ?? [];
      const allSelected = current.length === track.versions.length;
      return {
        ...prev,
        [track.id]: allSelected ? [] : track.versions.map((v) => v.id),
      };
    });
  };

  const handleConfirmImport = async () => {
    if (!incomingTracks) return;
    if (importMode === 'replace' && backupBeforeReplace && existingTracks.length > 0) {
      downloadLibraryJson(existingTracks, 'spartito-backup-pre-replace');
    }

    const result = await applyLibraryImport({
      mode: importMode,
      incomingTracks,
      selectedVersionIdsByTrack: importMode === 'partial' ? selectedVersions : undefined,
      conflictResolutions: perTrackResolution,
      defaultResolution,
    });
    setSummary(result);
  };

  const toggleExportTrack = (id: string) => {
    setExportSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExportAll = () => {
    downloadLibraryJson(existingTracks, 'spartito-libreria-completa');
  };

  const handleExportSelected = () => {
    const picked = existingTracks.filter((t) => exportSelectedIds.includes(t.id));
    if (picked.length === 0) return;
    downloadLibraryJson(picked, 'spartito-raccolta');
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Libreria JSON — Esporta, Importa & Merge"
      subtitle="Salva la tua libreria in locale o unisci brani e versioni da altre librerie JSON (100% client-side)"
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setTab('import')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition cursor-pointer"
          style={{
            backgroundColor: tab === 'import' ? 'var(--accent)' : 'var(--bg-surface-2)',
            color: tab === 'import' ? '#ffffff' : 'var(--text-primary)',
          }}
        >
          <Upload className="w-4 h-4" />
          Importa / Merge JSON
        </button>
        <button
          type="button"
          onClick={() => {
            setExportSelectedIds(existingTracks.map((t) => t.id));
            setTab('export');
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition cursor-pointer"
          style={{
            backgroundColor: tab === 'export' ? 'var(--accent)' : 'var(--bg-surface-2)',
            color: tab === 'export' ? '#ffffff' : 'var(--text-primary)',
          }}
        >
          <Download className="w-4 h-4" />
          Esporta JSON ({existingTracks.length})
        </button>
      </div>

      {tab === 'export' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportAll}
              disabled={existingTracks.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <FileJson className="w-4 h-4" />
              Esporta Tutta la Libreria ({existingTracks.length})
            </button>
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={exportSelectedIds.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50 border"
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Download className="w-4 h-4" />
              Esporta Selezionati ({exportSelectedIds.length})
            </button>
          </div>

          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>Seleziona i brani per un export parziale/condivisibile:</span>
            <div className="flex gap-3">
              <button
                type="button"
                className="underline cursor-pointer"
                onClick={() => setExportSelectedIds(existingTracks.map((t) => t.id))}
              >
                Tutti
              </button>
              <button
                type="button"
                className="underline cursor-pointer"
                onClick={() => setExportSelectedIds([])}
              >
                Nessuno
              </button>
            </div>
          </div>

          <div
            className="divide-y rounded-xl border max-h-64 overflow-y-auto"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {existingTracks.map((track) => {
              const checked = exportSelectedIds.includes(track.id);
              return (
                <label
                  key={track.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:opacity-90"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExportTrack(track.id)}
                    className="rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{track.title}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {track.artist} · {track.versions.length} versioni
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* File upload & remote raw URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer text-center transition hover:opacity-85"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
            >
              <FileJson className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium">Scegli file .json</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Libreria completa o raccolta
              </span>
              <input type="file" accept=".json,application/json" onChange={handleFileChange} className="hidden" />
            </label>

            <div
              className="flex flex-col justify-between gap-2 p-4 rounded-xl border"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Carica da URL JSON (es. GitHub Raw)
              </div>
              <input
                type="url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../library.json"
                className="w-full px-3 py-1.5 rounded-lg text-xs border"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-color)',
                }}
              />
              <button
                type="button"
                onClick={handleFetchUrl}
                disabled={loadingUrl || !remoteUrl.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {loadingUrl ? 'Caricamento...' : 'Scarica e analizza'}
              </button>
            </div>
          </div>

          {importError && (
            <div className="p-3 rounded-xl text-xs bg-red-500/10 text-red-500 border border-red-500/30">
              {importError}
            </div>
          )}

          {summary && (
            <div className="p-4 rounded-xl text-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 space-y-1">
              <div className="font-semibold">Importazione completata!</div>
              <div className="text-xs">
                Brani aggiunti: <strong>{summary.addedTracks}</strong> · Aggiornati/Uniti:{' '}
                <strong>{summary.updatedTracks}</strong> · Nuove versioni unite:{' '}
                <strong>{summary.mergedVersions}</strong> · Saltati: <strong>{summary.skippedTracks}</strong>
              </div>
            </div>
          )}

          {incomingTracks && (
            <div className="space-y-4 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  Trovati {incomingTracks.length} brani nel file
                  {conflictCount > 0 && (
                    <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      {conflictCount} già presenti in libreria
                    </span>
                  )}
                </div>
              </div>

              {/* 3 Import Modes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'merge',
                      label: 'Merge Librerie',
                      desc: 'Aggiunge nuovi brani e unisce le versioni',
                      icon: GitMerge,
                    },
                    {
                      id: 'partial',
                      label: 'Import Parziale',
                      desc: 'Scegli singoli brani e singole versioni',
                      icon: CheckSquare,
                    },
                    {
                      id: 'replace',
                      label: 'Import Completo',
                      desc: 'Sostituisce tutta la libreria locale',
                      icon: RefreshCw,
                    },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = importMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setImportMode(m.id)}
                      className="text-left p-3 rounded-xl border transition cursor-pointer"
                      style={{
                        borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                        backgroundColor: active ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        {m.label}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {m.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {importMode === 'replace' && (
                <label className="flex items-center gap-2 text-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupBeforeReplace}
                    onChange={(e) => setBackupBeforeReplace(e.target.checked)}
                  />
                  <span>
                    Scarica automaticamente un backup JSON della libreria attuale ({existingTracks.length} brani) prima di sostituire tutto.
                  </span>
                </label>
              )}

              {(importMode === 'merge' || importMode === 'partial') && conflictCount > 0 && (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl text-xs"
                  style={{ backgroundColor: 'var(--bg-surface-2)' }}
                >
                  <span className="font-medium">Regola predefinita per brani già esistenti:</span>
                  <select
                    value={defaultResolution}
                    onChange={(e) => setDefaultResolution(e.target.value as ConflictResolution)}
                    className="px-2.5 py-1.5 rounded-lg border text-xs"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <option value="merge_versions">Unisci solo nuove versioni (Consigliato)</option>
                    <option value="overwrite">Sovrascrivi brano locale</option>
                    <option value="keep_both">Mantieni entrambi (Duplica)</option>
                    <option value="skip">Salta brani già esistenti</option>
                  </select>
                </div>
              )}

              {/* Preview list for Merge / Partial */}
              {importMode !== 'replace' && (
                <div
                  className="divide-y rounded-xl border max-h-60 overflow-y-auto"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  {mergeAnalysis.map(({ incoming, existing }) => {
                    const pickedVers = selectedVersions[incoming.id] ?? [];
                    const allPicked = pickedVers.length === incoming.versions.length;
                    return (
                      <div key={incoming.id} className="p-3 space-y-2" style={{ borderColor: 'var(--border-color)' }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            {importMode === 'partial' && (
                              <button
                                type="button"
                                onClick={() => togglePartialTrackAll(incoming)}
                                className="mt-0.5 cursor-pointer"
                                aria-label="Seleziona tutte le versioni"
                              >
                                {allPicked ? (
                                  <CheckSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                                ) : (
                                  <Square className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                                )}
                              </button>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {incoming.title}
                                {existing ? (
                                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                    Esistente
                                  </span>
                                ) : (
                                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                    Nuovo
                                  </span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {incoming.artist} · {incoming.versions.length} versioni
                              </div>
                            </div>
                          </div>

                          {existing && (
                            <select
                              value={perTrackResolution[incoming.id] ?? defaultResolution}
                              onChange={(e) =>
                                setPerTrackResolution((prev) => ({
                                  ...prev,
                                  [incoming.id]: e.target.value as ConflictResolution,
                                }))
                              }
                              className="px-2 py-1 rounded-lg border text-xs shrink-0"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--border-color)',
                              }}
                            >
                              <option value="merge_versions">Unisci versioni</option>
                              <option value="overwrite">Sovrascrivi</option>
                              <option value="keep_both">Duplica</option>
                              <option value="skip">Salta</option>
                            </select>
                          )}
                        </div>

                        {importMode === 'partial' && (
                          <div className="pl-6 flex flex-wrap gap-2">
                            {incoming.versions.map((v) => {
                              const checked = pickedVers.includes(v.id);
                              return (
                                <label
                                  key={v.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border cursor-pointer"
                                  style={{
                                    borderColor: checked ? 'var(--accent)' : 'var(--border-color)',
                                    backgroundColor: checked ? 'var(--accent-bg)' : 'var(--bg-surface-2)',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePartialVersion(incoming.id, v.id)}
                                  />
                                  <span>{v.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIncomingTracks(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-surface-2)' }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {importMode === 'replace'
                    ? 'Sostituisci Libreria'
                    : importMode === 'partial'
                    ? 'Importa Selezionati'
                    : 'Esegui Merge'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
